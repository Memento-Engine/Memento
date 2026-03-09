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

export interface LlmProviderAdapter {
  readonly name: ProviderName;
  chat(request: ProviderChatRequest): Promise<ProviderChatResult>;
}
