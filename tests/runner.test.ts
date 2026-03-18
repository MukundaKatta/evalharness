/**
 * Tests for TestRunner.
 */

import { TestRunner, LLMProvider, ProviderResponse } from "../src/runner";
import { parseConfig, TestSuiteConfig } from "../src/config";

// Mock provider for testing
class MockProvider implements LLMProvider {
  name: string;
  private responses: Map<string, string>;
  private defaultResponse: string;
  callCount = 0;

  constructor(name: string, responses: Record<string, string> = {}, defaultResponse = "Mock response") {
    this.name = name;
    this.responses = new Map(Object.entries(responses));
    this.defaultResponse = defaultResponse;
  }

  async complete(prompt: string): Promise<ProviderResponse> {
    this.callCount++;
    const text = this.responses.get(prompt) ?? this.defaultResponse;
    return { text, latencyMs: 10, model: "mock-model" };
  }
}

class FailingProvider implements LLMProvider {
  name = "failing";
  async complete(): Promise<ProviderResponse> {
    throw new Error("Provider failure");
  }
}

describe("TestRunner", () => {
  let runner: TestRunner;
  let mockProvider: MockProvider;

  beforeEach(() => {
    runner = new TestRunner({ retries: 0, timeoutMs: 5000 });
    mockProvider = new MockProvider("mock", {}, "The answer is 42");
    runner.registerProvider(mockProvider);
  });

  test("runs a simple test suite and returns results", async () => {
    const config: TestSuiteConfig = {
      name: "Basic Suite",
      tests: [
        {
          id: "test-1",
          name: "Basic Test",
          prompt: "What is the answer?",
          assertions: [{ type: "containsText", value: "42" }],
        },
      ],
    };

    const result = await runner.runSuite(config);
    expect(result.suiteName).toBe("Basic Suite");
    expect(result.totalTests).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].passed).toBe(true);
  });

  test("handles multiple providers", async () => {
    const provider2 = new MockProvider("mock2", {}, "Different response");
    runner.registerProvider(provider2);

    const config: TestSuiteConfig = {
      name: "Multi-provider",
      providers: ["mock", "mock2"],
      tests: [
        {
          id: "test-1",
          name: "Test",
          prompt: "Hello",
          assertions: [{ type: "containsText", value: "42" }],
        },
      ],
    };

    const result = await runner.runSuite(config);
    expect(result.totalTests).toBe(2);
    // mock passes (contains 42), mock2 fails
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("handles provider errors", async () => {
    runner.registerProvider(new FailingProvider());

    const config: TestSuiteConfig = {
      name: "Error Suite",
      providers: ["failing"],
      tests: [
        {
          id: "test-1",
          name: "Will Fail",
          prompt: "test",
          assertions: [{ type: "containsText", value: "anything" }],
        },
      ],
    };

    const result = await runner.runSuite(config);
    expect(result.errors).toBe(1);
    expect(result.results[0].error).toBeDefined();
  });

  test("handles unknown provider gracefully", async () => {
    const config: TestSuiteConfig = {
      name: "Unknown Provider",
      providers: ["nonexistent"],
      tests: [{ id: "t1", name: "Test", prompt: "hello", assertions: [] }],
    };

    const result = await runner.runSuite(config);
    expect(result.results[0].error).toContain("not registered");
  });

  test("interpolates variables in prompts", async () => {
    const config: TestSuiteConfig = {
      name: "Variable Suite",
      tests: [
        {
          id: "t1",
          name: "Var Test",
          prompt: "What is {{num1}} + {{num2}}?",
          variables: { num1: "2", num2: "3" },
          assertions: [],
        },
      ],
    };

    const result = await runner.runSuite(config);
    expect(result.results[0].prompt).toBe("What is 2 + 3?");
  });

  test("reports correct timing", async () => {
    const config: TestSuiteConfig = {
      name: "Timing",
      tests: [{ id: "t1", name: "T", prompt: "p", assertions: [] }],
    };

    const result = await runner.runSuite(config);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.results[0].latencyMs).toBe(10);
  });
});

describe("parseConfig", () => {
  test("parses a simple YAML config", () => {
    const yaml = `name: My Suite
tests:
  - id: t1
    name: First Test
    prompt: Hello world
    assertions:
      - type: containsText
        value: hello`;

    const config = parseConfig(yaml);
    expect(config.name).toBe("My Suite");
    expect(config.tests.length).toBe(1);
    expect(config.tests[0].id).toBe("t1");
    expect(config.tests[0].assertions[0].type).toBe("containsText");
  });
});
