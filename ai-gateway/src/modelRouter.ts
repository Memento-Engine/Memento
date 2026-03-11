import { randomUUID } from "crypto";
import type { GatewayConfig } from "./config.js";
import { selectRoleModelConfig } from "./config.js";
import type { ChatRequest, ChatResponse, ProviderName } from "./types.js";
import type { LlmProviderAdapter, ProviderChatResult, StreamChunkCallback } from "./providers/provider.js";

type ProviderRegistry = Map<ProviderName, LlmProviderAdapter>;

type Candidate = {
  provider: ProviderName;
  model: string;
  timeoutMs: number;
};

function inferProviderFromModel(model: string): ProviderName {
  const lowered = model.toLowerCase();

  if (lowered.startsWith("openai/")) return "openrouter";
  if (lowered.startsWith("anthropic/")) return "openrouter";
  if (lowered.startsWith("mistralai/")) return "openrouter";
  if (lowered.startsWith("deepseek/")) return "openrouter";
  if (lowered.startsWith("google/")) return "openrouter";

  return "openrouter";
}

function buildCandidates(config: GatewayConfig, request: ChatRequest): Candidate[] {
  if (request.model && request.model.trim()) {
    const model = request.model.trim();
    const provider = inferProviderFromModel(model);
    const providerConfig = config.providers.find((p) => p.name === provider);

    if (!providerConfig) {
      throw new Error(`Provider ${provider} is not configured`);
    }

    return [{ provider, model, timeoutMs: providerConfig.timeoutMs }];
  }

  const roleConfig = selectRoleModelConfig(config, request.role);
  const models = [roleConfig.defaultModel, ...roleConfig.fallbackModels];

  return models.map((model) => {
    const provider = inferProviderFromModel(model);
    const providerConfig = config.providers.find((p) => p.name === provider);
    if (!providerConfig) {
      throw new Error(`Provider ${provider} is not configured`);
    }

    return {
      provider,
      model,
      timeoutMs: providerConfig.timeoutMs,
    };
  });
}

export class ModelRouter {
  constructor(
    private readonly config: GatewayConfig,
    private readonly providers: ProviderRegistry,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const candidates = buildCandidates(this.config, request);
    let lastError: unknown;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const adapter = this.providers.get(candidate.provider);

      if (!adapter) {
        throw new Error(`No adapter available for provider ${candidate.provider}`);
      }

      try {
        const result: ProviderChatResult = await adapter.chat({
          model: candidate.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          timeoutMs: candidate.timeoutMs,
        });

        return {
          id: randomUUID(),
          model: result.model,
          content: result.content,
          usage: result.usage,
          fallback_used: index > 0,
          attempts: index + 1,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`All model candidates failed: ${String(lastError)}`);
  }

  async chatStream(request: ChatRequest, onChunk: StreamChunkCallback): Promise<ChatResponse> {
    const candidates = buildCandidates(this.config, request);
    let lastError: unknown;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const adapter = this.providers.get(candidate.provider);

      if (!adapter) {
        throw new Error(`No adapter available for provider ${candidate.provider}`);
      }

      // Check if adapter supports streaming
      if (!adapter.chatStream) {
        throw new Error(`Provider ${candidate.provider} does not support streaming`);
      }

      try {
        const result: ProviderChatResult = await adapter.chatStream(
          {
            model: candidate.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            timeoutMs: candidate.timeoutMs,
          },
          onChunk
        );

        return {
          id: randomUUID(),
          model: result.model,
          content: result.content,
          usage: result.usage,
          fallback_used: index > 0,
          attempts: index + 1,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`All model candidates failed: ${String(lastError)}`);
  }
}
