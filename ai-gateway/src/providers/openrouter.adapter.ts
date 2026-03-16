import type { ChatMessage } from "../types.js";
import type { LlmProviderAdapter, ProviderChatRequest, ProviderChatResult, StreamChunkCallback } from "./provider.js";

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
    } catch (error) {
      // Wrap AbortError (timeout) with a descriptive message so callers/fallbacks can identify it
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `OpenRouter chat request timed out after ${request.timeoutMs}ms for model ${request.model}`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatStream(
    request: ProviderChatRequest,
    onChunk: StreamChunkCallback
  ): Promise<ProviderChatResult> {
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
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter stream request failed (${response.status}): ${errorBody}`);
      }


      if (!response.body) {
        throw new Error("OpenRouter stream response has no body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let model = request.model;
      let promptTokens = 0;
      let completionTokens = 0;

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              fullContent += delta;
              onChunk(delta);
            }

            // Capture model and usage if present
            if (json?.model) model = json.model;
            if (json?.usage) {
              promptTokens = json.usage.prompt_tokens ?? promptTokens;
              completionTokens = json.usage.completion_tokens ?? completionTokens;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      return {
        model,
        content: fullContent,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      // Wrap AbortError (timeout) with a descriptive message so callers can identify it
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `OpenRouter stream request timed out after ${request.timeoutMs}ms for model ${request.model}`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
