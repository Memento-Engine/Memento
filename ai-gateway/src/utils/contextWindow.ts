import type { ChatMessage } from "../types.js";

/**
 * Model context window limits (in tokens)
 * These are approximate sizes - actual limits may vary
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI models
  "openai/gpt-4o": 128_000,
  "openai/gpt-4o-mini": 128_000,
  "openai/gpt-4-turbo": 128_000,
  "openai/gpt-4": 8_192,
  "openai/gpt-3.5-turbo": 16_385,
  
  // Anthropic models
  "anthropic/claude-3-opus": 200_000,
  "anthropic/claude-3-sonnet": 200_000,
  "anthropic/claude-3-haiku": 200_000,
  "anthropic/claude-3.5-sonnet": 200_000,
  
  // Gemini models
  "google/gemini-pro": 32_000,
  "google/gemini-1.5-pro": 1_000_000,
  "google/gemini-1.5-flash": 1_000_000,
  
  // Default fallback
  "default": 8_192,
};

/**
 * Shrinking strategies for context window management
 */
export type ShrinkStrategy = 
  | "truncate_oldest"      // Remove oldest messages first
  | "truncate_middle"      // Keep system + recent, remove middle
  | "summarize_old"        // Summarize older messages (requires LLM call)
  | "sliding_window";      // Keep only the most recent N messages

export interface ContextWindowOptions {
  /** Maximum tokens for the context (if not specified, uses model limit) */
  maxTokens?: number;
  /** Shrinking strategy to use */
  strategy?: ShrinkStrategy;
  /** Reserve tokens for the response */
  reserveForResponse?: number;
  /** Minimum messages to keep (always keep at least system + 1 user message) */
  minMessages?: number;
  /** Model name for looking up context limits */
  model?: string;
}

export interface ShrinkResult {
  messages: ChatMessage[];
  originalTokens: number;
  shrunkTokens: number;
  messagesRemoved: number;
  strategy: ShrinkStrategy;
}

/**
 * Estimate token count for a message
 * This is a rough approximation - for accurate counts, use tiktoken
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  // Add overhead for message structure
  return Math.ceil(text.length / 4) + 4;
}

/**
 * Estimate total tokens for a conversation
 */
export function estimateConversationTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content) + 4; // +4 for role tokens
  }, 3); // +3 for conversation structure
}

/**
 * Get context window limit for a model
 */
export function getContextLimit(model?: string): number {
  if (!model) return MODEL_CONTEXT_LIMITS.default;
  
  // Check exact match first
  if (MODEL_CONTEXT_LIMITS[model]) {
    return MODEL_CONTEXT_LIMITS[model];
  }
  
  // Check partial matches
  const lowerModel = model.toLowerCase();
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (lowerModel.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerModel)) {
      return limit;
    }
  }
  
  return MODEL_CONTEXT_LIMITS.default;
}

/**
 * Shrink context window to fit within token limits
 * Uses various strategies to reduce message count while preserving context quality
 */
export function shrinkContextWindow(
  messages: ChatMessage[],
  options: ContextWindowOptions = {}
): ShrinkResult {
  const {
    strategy = "truncate_oldest",
    reserveForResponse = 2048,
    minMessages = 2,
    model,
  } = options;
  
  const maxTokens = options.maxTokens || getContextLimit(model) - reserveForResponse;
  const originalTokens = estimateConversationTokens(messages);
  
  // If already within limits, return as-is
  if (originalTokens <= maxTokens) {
    return {
      messages,
      originalTokens,
      shrunkTokens: originalTokens,
      messagesRemoved: 0,
      strategy,
    };
  }
  
  let shrunkMessages: ChatMessage[];
  
  switch (strategy) {
    case "truncate_oldest":
      shrunkMessages = truncateOldest(messages, maxTokens, minMessages);
      break;
    case "truncate_middle":
      shrunkMessages = truncateMiddle(messages, maxTokens, minMessages);
      break;
    case "sliding_window":
      shrunkMessages = slidingWindow(messages, maxTokens, minMessages);
      break;
    default:
      shrunkMessages = truncateOldest(messages, maxTokens, minMessages);
  }
  
  return {
    messages: shrunkMessages,
    originalTokens,
    shrunkTokens: estimateConversationTokens(shrunkMessages),
    messagesRemoved: messages.length - shrunkMessages.length,
    strategy,
  };
}

/**
 * Truncate oldest messages first (keeps system prompt and recent messages)
 */
function truncateOldest(
  messages: ChatMessage[],
  maxTokens: number,
  minMessages: number
): ChatMessage[] {
  if (messages.length <= minMessages) {
    return messages;
  }
  
  // Always keep system message if present
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  // Start with system messages
  const result = [...systemMessages];
  let currentTokens = estimateConversationTokens(result);
  
  // Add messages from newest to oldest
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const message = nonSystemMessages[i];
    const messageTokens = estimateTokens(message.content) + 4;
    
    if (currentTokens + messageTokens <= maxTokens) {
      result.splice(systemMessages.length, 0, message);
      currentTokens += messageTokens;
    } else if (result.length >= minMessages) {
      break;
    }
  }
  
  return result;
}

/**
 * Truncate middle messages (keeps system, first user message, and recent messages)
 */
function truncateMiddle(
  messages: ChatMessage[],
  maxTokens: number,
  minMessages: number
): ChatMessage[] {
  if (messages.length <= minMessages) {
    return messages;
  }
  
  // Keep system messages
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  if (nonSystemMessages.length === 0) {
    return systemMessages;
  }
  
  // Calculate budget
  const systemTokens = estimateConversationTokens(systemMessages);
  const remainingBudget = maxTokens - systemTokens;
  
  // Reserve ~30% for the first message, 70% for recent
  const firstMessageBudget = Math.floor(remainingBudget * 0.3);
  const recentBudget = remainingBudget - firstMessageBudget;
  
  const result = [...systemMessages];
  
  // Add first user message (possibly truncated)
  const firstMessage = nonSystemMessages[0];
  const firstTokens = estimateTokens(firstMessage.content) + 4;
  
  if (firstTokens <= firstMessageBudget) {
    result.push(firstMessage);
  } else {
    // Truncate first message content
    const truncatedContent = truncateText(
      firstMessage.content,
      (firstMessageBudget - 4) * 4 // Convert tokens back to chars
    );
    result.push({ ...firstMessage, content: truncatedContent });
  }
  
  // Add recent messages
  let recentTokens = 0;
  const recentMessages: ChatMessage[] = [];
  
  for (let i = nonSystemMessages.length - 1; i >= 1; i--) {
    const message = nonSystemMessages[i];
    const messageTokens = estimateTokens(message.content) + 4;
    
    if (recentTokens + messageTokens <= recentBudget) {
      recentMessages.unshift(message);
      recentTokens += messageTokens;
    } else {
      break;
    }
  }
  
  // Add indicator that messages were removed
  if (recentMessages.length < nonSystemMessages.length - 1) {
    const removedCount = nonSystemMessages.length - 1 - recentMessages.length;
    result.push({
      role: "system",
      content: `[${removedCount} earlier messages removed for context management]`,
    });
  }
  
  result.push(...recentMessages);
  
  return result;
}

/**
 * Sliding window - keeps only the most recent N messages that fit
 */
function slidingWindow(
  messages: ChatMessage[],
  maxTokens: number,
  minMessages: number
): ChatMessage[] {
  // Always keep system messages
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  const result = [...systemMessages];
  let currentTokens = estimateConversationTokens(result);
  
  // Add messages from newest to oldest
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const message = nonSystemMessages[i];
    const messageTokens = estimateTokens(message.content) + 4;
    
    if (currentTokens + messageTokens <= maxTokens) {
      result.splice(systemMessages.length, 0, message);
      currentTokens += messageTokens;
    } else if (result.length >= minMessages) {
      break;
    }
  }
  
  return result;
}

/**
 * Truncate text to approximately N characters
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  
  // Find a good break point (end of sentence or word)
  const truncated = text.slice(0, maxChars);
  const lastSentence = truncated.lastIndexOf(". ");
  const lastSpace = truncated.lastIndexOf(" ");
  
  let breakPoint = maxChars;
  if (lastSentence > maxChars * 0.7) {
    breakPoint = lastSentence + 1;
  } else if (lastSpace > maxChars * 0.8) {
    breakPoint = lastSpace;
  }
  
  return text.slice(0, breakPoint) + "...";
}

/**
 * Check if context window needs shrinking
 */
export function needsShrinking(
  messages: ChatMessage[],
  model?: string,
  reserveForResponse: number = 2048
): boolean {
  const maxTokens = getContextLimit(model) - reserveForResponse;
  const currentTokens = estimateConversationTokens(messages);
  return currentTokens > maxTokens;
}

/**
 * Get usage statistics for context window
 */
export function getContextStats(messages: ChatMessage[], model?: string) {
  const limit = getContextLimit(model);
  const used = estimateConversationTokens(messages);
  
  return {
    limit,
    used,
    available: limit - used,
    usagePercent: Math.round((used / limit) * 100),
    messageCount: messages.length,
  };
}
