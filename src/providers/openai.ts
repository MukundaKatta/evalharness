/**
 * OpenAI provider: chat completions with tool use.
 */

import type { LLMProvider, ProviderOptions, ProviderResponse } from "../runner";

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  maxRetries?: number;
  defaultMaxTokens?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIRequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

interface OpenAIChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

interface OpenAIResponseBody {
  id: string;
  object: string;
  model: string;
  choices: OpenAIChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly config: Required<OpenAIConfig>;
  private tools: ToolDefinition[] = [];

  constructor(config: OpenAIConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? "gpt-4o",
      baseUrl: config.baseUrl ?? "https://api.openai.com",
      organization: config.organization ?? "",
      maxRetries: config.maxRetries ?? 2,
      defaultMaxTokens: config.defaultMaxTokens ?? 1024,
    };
  }

  registerTools(tools: ToolDefinition[]): void {
    this.tools = tools;
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<ProviderResponse> {
    const messages: ChatMessage[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    return this.chatCompletion(messages, options);
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ProviderOptions
  ): Promise<ProviderResponse> {
    const startTime = Date.now();

    const body: OpenAIRequestBody = {
      model: this.config.model,
      messages,
      max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens,
      temperature: options?.temperature ?? 0,
    };

    if (options?.stopSequences?.length) {
      body.stop = options.stopSequences;
    }

    if (this.tools.length > 0) {
      body.tools = this.tools;
      body.tool_choice = "auto";
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        };
        if (this.config.organization) {
          headers["OpenAI-Organization"] = this.config.organization;
        }

        const response = await fetch(
          `${this.config.baseUrl}/v1/chat/completions`,
          { method: "POST", headers, body: JSON.stringify(body) }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 429 || response.status >= 500) {
            lastError = new Error(`OpenAI API ${response.status}: ${errorBody}`);
            await this.sleep(1000 * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`OpenAI API ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as OpenAIResponseBody;
        const choice = data.choices[0];

        // Handle tool calls
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          return {
            text: JSON.stringify({
              type: "tool_use",
              tool_calls: choice.message.tool_calls.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
              })),
            }),
            tokenUsage: {
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
              total: data.usage.total_tokens,
            },
            latencyMs: Date.now() - startTime,
            model: data.model,
          };
        }

        return {
          text: choice.message.content ?? "",
          tokenUsage: {
            prompt: data.usage.prompt_tokens,
            completion: data.usage.completion_tokens,
            total: data.usage.total_tokens,
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

    throw lastError ?? new Error("OpenAI API call failed");
  }

  /**
   * Execute a tool call loop: call LLM, if tool calls returned, resolve and re-call.
   */
  async completeWithToolLoop(
    prompt: string,
    toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>>,
    options?: ProviderOptions & { maxToolRounds?: number }
  ): Promise<ProviderResponse> {
    const maxRounds = options?.maxToolRounds ?? 5;
    const messages: ChatMessage[] = [];
    if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
    messages.push({ role: "user", content: prompt });

    let totalLatency = 0;
    let totalTokens = { prompt: 0, completion: 0, total: 0 };

    for (let round = 0; round < maxRounds; round++) {
      const response = await this.chatCompletion(messages, options);
      totalLatency += response.latencyMs;
      if (response.tokenUsage) {
        totalTokens.prompt += response.tokenUsage.prompt;
        totalTokens.completion += response.tokenUsage.completion;
        totalTokens.total += response.tokenUsage.total;
      }

      // Check if the response contains tool calls
      let toolUse: { type: string; tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };
      try {
        toolUse = JSON.parse(response.text);
      } catch {
        // Not a tool call response, return as final
        return { ...response, latencyMs: totalLatency, tokenUsage: totalTokens };
      }

      if (toolUse.type !== "tool_use") {
        return { ...response, latencyMs: totalLatency, tokenUsage: totalTokens };
      }

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: toolUse.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Execute each tool and add results
      for (const toolCall of toolUse.tool_calls) {
        const handler = toolHandlers[toolCall.name];
        const result = handler
          ? await handler(toolCall.arguments)
          : `Error: Unknown tool '${toolCall.name}'`;
        messages.push({ role: "tool", content: result, tool_call_id: toolCall.id });
      }
    }

    throw new Error(`Tool loop exceeded ${maxRounds} rounds`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
