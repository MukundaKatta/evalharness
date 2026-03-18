/**
 * TestRunner: load test suite from YAML config, execute against LLM providers, collect results.
 */

import { AssertionEngine, AssertionResult } from "./assertions";
import { parseConfig, TestSuiteConfig, TestCase } from "./config";

export interface LLMProvider {
  name: string;
  complete(prompt: string, options?: ProviderOptions): Promise<ProviderResponse>;
}

export interface ProviderOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface ProviderResponse {
  text: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  latencyMs: number;
  model: string;
}

export interface TestResult {
  testId: string;
  testName: string;
  provider: string;
  prompt: string;
  response: string;
  assertions: AssertionResult[];
  passed: boolean;
  latencyMs: number;
  error?: string;
  timestamp: Date;
}

export interface SuiteResult {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  results: TestResult[];
  durationMs: number;
  startedAt: Date;
  finishedAt: Date;
}

export class TestRunner {
  private providers = new Map<string, LLMProvider>();
  private assertionEngine = new AssertionEngine();
  private concurrency: number;
  private retries: number;
  private timeoutMs: number;

  constructor(options: { concurrency?: number; retries?: number; timeoutMs?: number } = {}) {
    this.concurrency = options.concurrency ?? 5;
    this.retries = options.retries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  async runSuite(config: TestSuiteConfig): Promise<SuiteResult> {
    const startedAt = new Date();
    const results: TestResult[] = [];
    const targetProviders = config.providers ?? [...this.providers.keys()];

    // Create test execution queue
    const tasks: Array<{ testCase: TestCase; providerName: string }> = [];
    for (const testCase of config.tests) {
      for (const providerName of targetProviders) {
        tasks.push({ testCase, providerName });
      }
    }

    // Execute with concurrency control
    const batches = this.chunk(tasks, this.concurrency);
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(({ testCase, providerName }) =>
          this.executeTest(testCase, providerName)
        )
      );
      results.push(...batchResults);
    }

    const finishedAt = new Date();
    const passed = results.filter((r) => r.passed).length;
    const errors = results.filter((r) => r.error !== undefined).length;

    return {
      suiteName: config.name,
      totalTests: results.length,
      passed,
      failed: results.length - passed - errors,
      errors,
      results,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt,
      finishedAt,
    };
  }

  async runFromYaml(yamlContent: string): Promise<SuiteResult> {
    const config = parseConfig(yamlContent);
    return this.runSuite(config);
  }

  private async executeTest(testCase: TestCase, providerName: string): Promise<TestResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return this.errorResult(testCase, providerName, `Provider '${providerName}' not registered`);
    }

    // Build prompt with variable interpolation
    let prompt = testCase.prompt;
    if (testCase.variables) {
      for (const [key, value] of Object.entries(testCase.variables)) {
        prompt = prompt.replace(`{{${key}}}`, String(value));
      }
    }

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.withTimeout(
          provider.complete(prompt, {
            temperature: testCase.temperature ?? 0,
            maxTokens: testCase.maxTokens ?? 1024,
            systemPrompt: testCase.systemPrompt,
          }),
          this.timeoutMs
        );

        // Run assertions
        const assertionResults = await this.runAssertions(
          testCase,
          response.text
        );

        const allPassed = assertionResults.every((a) => a.passed);

        return {
          testId: testCase.id,
          testName: testCase.name,
          provider: providerName,
          prompt,
          response: response.text,
          assertions: assertionResults,
          passed: allPassed,
          latencyMs: response.latencyMs,
          timestamp: new Date(),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < this.retries) {
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    return this.errorResult(testCase, providerName, lastError ?? "Unknown error");
  }

  private async runAssertions(testCase: TestCase, response: string): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];
    for (const assertion of testCase.assertions) {
      const result = await this.assertionEngine.evaluate(assertion, response);
      results.push(result);
    }
    return results;
  }

  private errorResult(testCase: TestCase, provider: string, error: string): TestResult {
    return {
      testId: testCase.id,
      testName: testCase.name,
      provider,
      prompt: testCase.prompt,
      response: "",
      assertions: [],
      passed: false,
      latencyMs: 0,
      error,
      timestamp: new Date(),
    };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise
        .then((val) => { clearTimeout(timer); resolve(val); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
