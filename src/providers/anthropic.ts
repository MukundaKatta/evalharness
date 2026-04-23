/**
 * Anthropic provider: real SDK call pattern with messages API.
 */

import type { LLMProvider, ProviderOptions, ProviderResponse } from "../runner.js";

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  defaultMaxTokens?: number;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; source?: unknown }>;
}

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

interface AnthropicResponseBody {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly config: Required<AnthropicConfig>;

  constructor(config: AnthropicConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? "claude-sonnet-4-20250514",
      baseUrl: config.baseUrl ?? "https://api.anthropic.com",
      maxRetries: config.maxRetries ?? 2,
      defaultMaxTokens: config.defaultMaxTokens ?? 1024,
    };
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<ProviderResponse> {
    const startTime = Date.now();

    const messages: AnthropicMessage[] = [{ role: "user", content: prompt }];

    const body: AnthropicRequestBody = {
      model: this.config.model,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens,
      messages,
      temperature: options?.temperature ?? 0,
      stream: false,
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.stopSequences?.length) {
      body.stop_sequences = options.stopSequences;
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 429 || response.status >= 500) {
            // Retryable error
            lastError = new Error(`Anthropic API ${response.status}: ${errorBody}`);
            await this.sleep(1000 * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`Anthropic API ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as AnthropicResponseBody;
        const text = data.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

        return {
          text,
          tokenUsage: {
            prompt: data.usage.input_tokens,
            completion: data.usage.output_tokens,
            total: data.usage.input_tokens + data.usage.output_tokens,
          },
          latencyMs: Date.now() - startTime,
          model: data.model,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error("Anthropic API call failed");
  }

  /**
   * Multi-turn conversation support.
   */
  async completeMultiTurn(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: ProviderOptions
  ): Promise<ProviderResponse> {
    const startTime = Date.now();

    const body: AnthropicRequestBody = {
      model: this.config.model,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0,
      stream: false,
    };

    if (options?.systemPrompt) body.system = options.systemPrompt;

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as AnthropicResponseBody;
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

    return {
      text,
      tokenUsage: {
        prompt: data.usage.input_tokens,
        completion: data.usage.output_tokens,
        total: data.usage.input_tokens + data.usage.output_tokens,
      },
      latencyMs: Date.now() - startTime,
      model: data.model,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
