/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHAT CONTEXT MANAGER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Builds a bounded chat context from unbounded raw history.
 * Implements the sliding window with summarization from the architecture spec.
 * 
 * Context structure (max 1500 tokens):
 *   summary     ≤ 300 tokens   (compressed older history)
 *   pair[-2]    ≤ 600 tokens   (second most recent exchange)
 *   pair[-1]    ≤ 600 tokens   (most recent exchange)
 * 
 * Summarization fires when raw pairs exceed threshold (~1200 tokens).
 */

import { AgentStateType } from "./agentState";
import { createContextLogger } from "./utils/logger";
import { invokeRoleLlm } from "./llm/routing";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  CHAT_CONTEXT_BUDGETS,
  estimateTokens,
  truncateToTokenBudget,
} from "./config/tokenBudgets";
import axios from "axios";
import { getDaemonBaseUrl } from "./config/daemon";
import {
  logChatHistoryStart,
  logSummarizationTriggered,
  logFormattedChatContext,
} from "./utils/tokenTracker";

// ── Types ────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContextWindow {
  /** Compressed summary of older messages (may be empty if no old messages) */
  summary: string;
  /** Two most recent user+assistant exchanges */
  recentPairs: ChatMessage[];
  /** Total estimated tokens */
  totalTokens: number;
  /** Whether summarization was performed this call */
  summarizationPerformed: boolean;
}

interface ChatSummaryRecord {
  summary: string;
  lastSummarizedMessageId: number;
  tokenCount: number;
}

// ── Summarizer Prompt ────────────────────────────────────

const summarizerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a conversation summarizer. Compress the chat history into a brief summary that preserves:
- Key topics discussed
- Important facts mentioned
- User's search queries and what was found
- Any unresolved questions

Keep under 300 tokens. Be concise. Do not add commentary.`,
  ],
  [
    "human",
    `Existing summary (may be empty):
{existingSummary}

New messages to incorporate:
{newMessages}

Produce an updated summary:`,
  ],
]);

// ── Daemon API Helpers ───────────────────────────────────

async function getChatSummaryUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/chat/summary`;
}

async function loadChatSummary(sessionId: string): Promise<ChatSummaryRecord | null> {
  try {
    const response = await axios.get<{
      success: boolean;
      data?: ChatSummaryRecord;
    }>(await getChatSummaryUrl(), {
      params: { session_id: sessionId },
      timeout: 5000,
    });
    
    if (response.data?.success && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveChatSummary(
  sessionId: string,
  summary: string,
  lastMessageId: number,
  tokenCount: number,
): Promise<void> {
  try {
    await axios.post(
      await getChatSummaryUrl(),
      {
        session_id: sessionId,
        summary,
        last_summarized_message_id: lastMessageId,
        token_count: tokenCount,
      },
      { timeout: 5000 },
    );
  } catch {
    // Non-critical, continue without persisting
  }
}

// ── Core Logic ───────────────────────────────────────────

/**
 * Group messages into user+assistant pairs.
 * Returns pairs in chronological order (oldest first).
 */
function groupIntoPairs(messages: ChatMessage[]): ChatMessage[][] {
  const pairs: ChatMessage[][] = [];
  let currentPair: ChatMessage[] = [];
  
  for (const msg of messages) {
    currentPair.push(msg);
    if (msg.role === "assistant") {
      pairs.push(currentPair);
      currentPair = [];
    }
  }
  
  // Handle incomplete pair (user message without response)
  if (currentPair.length > 0) {
    pairs.push(currentPair);
  }
  
  return pairs;
}

/**
 * Truncate a message pair to fit within token budget.
 */
function truncatePair(pair: ChatMessage[], maxTokens: number): ChatMessage[] {
  const totalTokens = pair.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  
  if (totalTokens <= maxTokens) {
    return pair;
  }
  
  // Proportionally truncate each message
  const ratio = maxTokens / totalTokens;
  return pair.map(m => ({
    role: m.role,
    content: truncateToTokenBudget(m.content, Math.floor(estimateTokens(m.content) * ratio)),
  }));
}

/**
 * Build chat context window with bounded tokens.
 */
export async function buildChatContextWindow(
  messages: ChatMessage[],
  existingSummary: string,
  requestId: string,
  authHeaders?: { authorization?: string; deviceId?: string },
): Promise<ChatContextWindow> {
  const logger = await createContextLogger(requestId, { step: "chatContextManager" });
  const budgets = CHAT_CONTEXT_BUDGETS;
  
  // Log raw chat history at query start
  const userGoal = messages.length > 0 && messages[messages.length - 1].role === "user" 
    ? messages[messages.length - 1].content 
    : "(no user goal)";
  await logChatHistoryStart(requestId, userGoal, messages);
  
  if (messages.length === 0) {
    return {
      summary: existingSummary,
      recentPairs: [],
      totalTokens: estimateTokens(existingSummary),
      summarizationPerformed: false,
    };
  }
  
  const pairs = groupIntoPairs(messages);
  
  // Take last N pairs for the window
  const recentPairCount = budgets.recentPairsCount;
  const recentPairs = pairs.slice(-recentPairCount);
  const olderPairs = pairs.slice(0, -recentPairCount);
  
  // Truncate recent pairs to budget
  const truncatedRecentPairs: ChatMessage[] = [];
  for (const pair of recentPairs) {
    const truncated = truncatePair(pair, budgets.pairMaxTokens);
    truncatedRecentPairs.push(...truncated);
  }
  
  const recentTokens = truncatedRecentPairs.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );
  
  // Calculate tokens from older pairs that need summarizing
  const olderTokens = olderPairs.reduce(
    (sum, pair) => sum + pair.reduce((s, m) => s + estimateTokens(m.content), 0),
    0,
  );
  
  let finalSummary = existingSummary;
  let summarizationPerformed = false;
  
  // Trigger summarization if older messages exceed threshold
  const tokenThresholdExceeded = olderTokens > budgets.summarizationTriggerTokens;
  const combinedThresholdExceeded = olderPairs.length > 0 && estimateTokens(existingSummary) + olderTokens > budgets.summaryMaxTokens * 2;
  const shouldSummarize = tokenThresholdExceeded || combinedThresholdExceeded;
  
  if (shouldSummarize) {
    const triggerReason = tokenThresholdExceeded 
      ? `Older tokens (${olderTokens}) exceeded threshold (${budgets.summarizationTriggerTokens})`
      : `Combined tokens (${estimateTokens(existingSummary)} + ${olderTokens} = ${estimateTokens(existingSummary) + olderTokens}) exceeded limit (${budgets.summaryMaxTokens * 2})`;
    
    try {
      // Flatten older pairs for summarization
      const olderMessages = olderPairs.flat();
      const messagesText = olderMessages
        .map(m => `${m.role}: ${m.content}`)
        .join("\n");
      
      const prompt = await summarizerPrompt.invoke({
        existingSummary: existingSummary || "(no prior summary)",
        newMessages: truncateToTokenBudget(messagesText, 1000),
      });
      
      const result = await invokeRoleLlm({
        role: "summarizer",
        prompt,
        requestId,
        spanName: "chatContextManager.summarize",
        authHeaders,
      });
      
      const newSummary = truncateToTokenBudget(
        result.response.content?.toString() || existingSummary,
        budgets.summaryMaxTokens,
      );
      
      // Log summarization trigger with full details
      await logSummarizationTriggered(
        requestId,
        triggerReason,
        olderTokens,
        estimateTokens(newSummary),
        existingSummary,
        newSummary,
      );
      
      finalSummary = newSummary;
      summarizationPerformed = true;
      
      logger.info("Chat history summarized", {
        oldTokens: olderTokens,
        newSummaryTokens: estimateTokens(finalSummary),
      });
    } catch (error) {
      logger.warn("Summarization failed, using existing summary", { error });
      // Keep existing summary on failure
    }
  }
  
  // Truncate summary if still too long
  finalSummary = truncateToTokenBudget(finalSummary, budgets.summaryMaxTokens);
  
  const totalTokens = estimateTokens(finalSummary) + recentTokens;
  
  const contextWindow = {
    summary: finalSummary,
    recentPairs: truncatedRecentPairs,
    totalTokens,
    summarizationPerformed,
  };
  
  // Log the final formatted chat context
  const formattedContext = formatChatContext(contextWindow);
  await logFormattedChatContext(
    requestId,
    formattedContext,
    totalTokens,
    summarizationPerformed,
  );
  
  return contextWindow;
}

/**
 * Format chat context window for LLM prompt.
 */
export function formatChatContext(context: ChatContextWindow): string {
  const parts: string[] = [];
  
  if (context.summary) {
    parts.push(`[Summary of earlier conversation]\n${context.summary}`);
  }
  
  if (context.recentPairs.length > 0) {
    parts.push(
      "[Recent exchanges]\n" +
      context.recentPairs.map(m => `${m.role}: ${m.content}`).join("\n"),
    );
  }
  
  return parts.join("\n\n") || "(no prior conversation)";
}

// ── Graph Node ───────────────────────────────────────────

/**
 * Chat Context Manager node for the agent graph.
 * Transforms raw chatHistory into bounded chatContext.
 */
export async function chatContextManagerNode(
  state: AgentStateType,
): Promise<Partial<AgentStateType>> {
  const logger = await createContextLogger(state.requestId, {
    node: "chatContextManager",
  });
  
  logger.info("Building chat context window", {
    rawMessageCount: state.chatHistory?.length ?? 0,
  });
  
  const messages: ChatMessage[] = (state.chatHistory ?? []).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  
  // Load existing summary if we have a session
  let existingSummary = "";
  // Note: sessionId tracking would need to be added to state if needed
  // For now, we build context from what we have
  
  const contextWindow = await buildChatContextWindow(
    messages,
    existingSummary,
    state.requestId,
    state.authHeaders,
  );
  
  const formattedContext = formatChatContext(contextWindow);
  
  logger.info("Chat context built", {
    summaryTokens: estimateTokens(contextWindow.summary),
    recentPairTokens: contextWindow.totalTokens - estimateTokens(contextWindow.summary),
    totalTokens: contextWindow.totalTokens,
    summarizationPerformed: contextWindow.summarizationPerformed,
  });
  
  return {
    chatContext: formattedContext,
    chatContextTokens: contextWindow.totalTokens,
  };
}
