import type { ChatMessage } from "../types.js";
import type { LlmProviderAdapter, ProviderChatRequest, ProviderChatResult } from "./provider.js";

type OpenRouterAdapterOptions = {
  baseUrl: string;
  apiKey: string;
};

function mapMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export class OpenRouterAdapter implements LlmProviderAdapter {
  readonly name = "openrouter" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: OpenRouterAdapterOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
  }

  async chat(request: ProviderChatRequest): Promise<ProviderChatResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: mapMessages(request.messages),
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter request failed (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as any;
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== "string") {
        throw new Error("OpenRouter response missing choices[0].message.content");
      }

      return {
        model: data?.model ?? request.model,
        content,
        usage: {
          prompt_tokens: data?.usage?.prompt_tokens ?? 0,
          completion_tokens: data?.usage?.completion_tokens ?? 0,
          total_tokens: data?.usage?.total_tokens ?? 0,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
