export type ProviderName = "openrouter" | "openai" | "anthropic" | "gemini";

export type ChatRole = "system" | "user" | "assistant";

export type GatewayRole =
  | "clarifyAndRewriter"
  | "router"
  | "planner"
  | "executor"
  | "query_builder"
  | "final";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  temperature: number;
  max_tokens: number;
  user_id: string;
  role?: GatewayRole;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatResponse = {
  id: string;
  model: string;
  content: string;
  usage: TokenUsage;
  fallback_used: boolean;
  attempts: number;
};

export type UsageRecord = {
  user_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  timestamp: number;
};
