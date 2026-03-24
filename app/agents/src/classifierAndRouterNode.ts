/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLASSIFIER AND ROUTER NODE (Merged)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Single LLM call that performs both:
 * 1. Query rewriting (resolve references, make standalone)
 * 2. Intent routing (chat vs search vs mixed)
 * 
 * Input budget: ≤1700 tokens (system ~100, chat context ≤1500, query ~100)
 * Output: ~110 tokens { route, rewrittenQuery, isClarificationNeeded, ... }
 */

import { AgentStateType } from "./agentState";
import { createContextLogger } from "./utils/logger";
import { invokeRoleLlm } from "./llm/routing";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SafeJsonParser } from "./utils/parser";
import { z } from "zod";
import {
  CLASSIFIER_BUDGETS,
  truncateToTokenBudget,
} from "./config/tokenBudgets";

// ── Output Schema ────────────────────────────────────────

const ClassifierRouterOutputSchema = z.object({
  /** Fully resolved, standalone search query */
  rewrittenQuery: z.string(),
  /** Routing decision */
  route: z.enum(["chat", "search", "mixed"]),
  /** Whether clarification is needed */
  isClarificationNeeded: z.boolean(),
  /** Clarification question if needed */
  clarificationQuestion: z.string().nullish(),
  /** Direct response if route is "chat" */
  conversationResponse: z.string().nullish(),
});

export type ClassifierRouterOutput = z.infer<typeof ClassifierRouterOutputSchema>;

// ── Prompt ───────────────────────────────────────────────

const classifierRouterPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a classifier and query rewriter for a personal memory search engine.

Your tasks:
1. **Rewrite** the user's query into a standalone, search-ready query
2. **Route** to the appropriate handler

ROUTING RULES:
- "chat": Query can be answered from conversation context alone (e.g., "explain what you said", "what did we discuss")
- "search": Query needs data retrieval from user's screen history
- "mixed": References prior chat AND needs new data (e.g., "find more about that app you mentioned")

IMPORTANT ROUTING OVERRIDES:
- If the user asks about their own activities, memories, apps, tabs, files, timelines, or what they were doing, route to "search" (or "mixed" if both chat + retrieval are needed).
- Treat follow-up questions about prior memory results as "search" when verification against stored screen history may be needed.
- Use "chat" only for pure conversational/meta requests that do not require any data lookup.

REWRITING RULES:
- Resolve pronouns: "it", "that", "this", "they" → actual entities
- Resolve time: "yesterday", "last week" → use current date context
- Resolve references: "the file", "that tab" → actual names from context
- Make the query standalone and explicit
- Do NOT answer the question, only rewrite it

OUTPUT FORMAT (JSON only):
{{
  "rewrittenQuery": "fully resolved standalone query",
  "route": "chat" | "search" | "mixed",
  "isClarificationNeeded": boolean,
  "clarificationQuestion": "short question if needed",
  "conversationResponse": "direct answer if route=chat"
}}

Current date: {currentDate}`,
  ],
  [
    "human",
    `Chat context:
{chatContext}

User's message:
{userQuery}

Classify and rewrite:`,
  ],
]);

// ── Node Implementation ──────────────────────────────────

export async function classifierAndRouterNode(
  state: AgentStateType,
): Promise<Partial<AgentStateType>> {
  const logger = await createContextLogger(state.requestId, {
    node: "classifierAndRouter",
    goal: state.goal,
  });
  
  logger.info("Starting classifier and router");
  
  const currentDate = new Date().toLocaleDateString("en-CA");
  const budgets = CLASSIFIER_BUDGETS;
  
  // Use chatContext from Chat Context Manager, or fallback to raw history
  const chatContext = state.chatContext ?? 
    ((state.chatHistory ?? [])
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n") ||
    "(no prior conversation)");
  
  // Truncate if needed
  const truncatedContext = truncateToTokenBudget(chatContext, budgets.chatContextMaxTokens);
  const truncatedQuery = truncateToTokenBudget(state.goal, budgets.queryMaxTokens);
  
  try {
    logger.debug("Invoking classifier/router", {
      chatContextLength: truncatedContext.length,
      queryLength: truncatedQuery.length,
      hasGoal: !!state.goal,
    });
    
    const prompt = await classifierRouterPrompt.invoke({
      currentDate,
      chatContext: truncatedContext,
      userQuery: truncatedQuery,
    });
    
    const llmResult = await invokeRoleLlm({
      role: "classifierAndRouter",
      prompt,
      requestId: state.requestId,
      spanName: "classifierAndRouter.llm",
      authHeaders: state.authHeaders,
    });
    
    if (!llmResult?.response?.content) {
      throw new Error("LLM returned empty response");
    }
    
    const parsed = await SafeJsonParser.parseContent(llmResult.response.content);
    const result = ClassifierRouterOutputSchema.safeParse(parsed);
    
    if (!result.success) {
      logger.warn("Failed to parse classifier output, defaulting to search", {
        errors: result.error.issues,
      });
      return {
        rewrittenQuery: state.goal,
        route: "search",
        isClarificationNeeded: false,
        isConversation: false,
        isNeedPlanning: false,
      };
    }
    
    const output = result.data;

    // Safety: avoid generic conversational fallback when model selects chat without a direct answer.
    // In that case, force search so the user still gets a grounded response from memory data.
    const hasConversationResponse =
      typeof output.conversationResponse === "string" &&
      output.conversationResponse.trim().length > 0;
    const normalizedGoal = (state.goal ?? "").toLowerCase();
    const looksLikePersonalMemoryQuery = [
      "memory",
      "memories",
      "activity",
      "activities",
      "what was i",
      "what did i",
      "my apps",
      "my files",
      "my tabs",
      "timeline",
      "stitch",
      "vs code",
      "gpt",
    ].some((term) => normalizedGoal.includes(term));

    if (output.route === "chat" && !hasConversationResponse) {
      logger.info("Classifier override: routing to clarification", {
        reason: "chat route without conversationResponse",
      });

      return {
        rewrittenQuery: output.rewrittenQuery || state.goal,
        route: "chat",
        isClarificationNeeded: true,
        clarificationQuestion: "Do you want me to explain the previous answer in simpler words, or search your activity history for more details?",
        conversationResponse: undefined,
        isConversation: false,
        isNeedPlanning: false,
      };
    }

    if (output.route === "chat" && looksLikePersonalMemoryQuery) {
      logger.info("Classifier override: routing to search", {
        reason: "personal memory query should be grounded in search",
      });

      return {
        rewrittenQuery: output.rewrittenQuery || state.goal,
        route: "search",
        isClarificationNeeded: false,
        clarificationQuestion: undefined,
        conversationResponse: undefined,
        isConversation: false,
        isNeedPlanning: false,
      };
    }
    
    logger.info("Classification complete", {
      route: output.route,
      isClarificationNeeded: output.isClarificationNeeded,
      rewrittenQueryLength: output.rewrittenQuery.length,
    });
    
    // Filter out null values - convert null to undefined for state compatibility
    const clarificationQuestion = output.clarificationQuestion ?? undefined;
    const conversationResponse = output.conversationResponse ?? undefined;
    
    // Map to state fields
    return {
      rewrittenQuery: output.rewrittenQuery,
      route: output.route,
      isClarificationNeeded: output.isClarificationNeeded,
      clarificationQuestion,
      conversationResponse,
      // Backwards compatibility
      isConversation: output.route === "chat",
      isNeedPlanning: output.route !== "chat",
    };
  } catch (error) {
    logger.error("Classifier and router failed", error);
    
    // Fallback: treat as search request
    return {
      rewrittenQuery: state.goal,
      route: "search",
      isClarificationNeeded: false,
      isConversation: false,
      isNeedPlanning: false,
    };
  }
}
