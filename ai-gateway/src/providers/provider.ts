import type { ChatMessage, ProviderName } from "../types.js";

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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
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
