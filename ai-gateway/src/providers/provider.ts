import type { ChatMessage, ProviderName, TokenUsage } from "../types.js";

export type ProviderChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  timeoutMs: number;
};

export type ProviderChatResult = {
  model: string;
  content: string;
  usage: TokenUsage;
};

export type StreamChunkCallback = (chunk: string) => void;

export interface LlmProviderAdapter {
  readonly name: ProviderName;
  chat(request: ProviderChatRequest): Promise<ProviderChatResult>;
  chatStream?(
    request: ProviderChatRequest,
    onChunk: StreamChunkCallback
  ): Promise<ProviderChatResult>;
}
