import { AgentStateType } from "./agentState";
import { createContextLogger } from "./utils/logger";
import { invokeRoleLlm } from "./llm/routing";
import { clarifyAndRewritePrompt } from "./prompts/clarifyAndRewritePrompt";
import { SafeJsonParser } from "./utils/parser";
import { clarifyAndRewriteSchema } from "./types/agent";

export async function clarifyAndRewrittenNode(
  state: AgentStateType,
): Promise<AgentStateType> {
  const logger = await createContextLogger(state.requestId, {
    node: "clarifyAndRewrite",
    goal: state.goal,
  });

  logger.info("Starting clarification and query rewriting node.");
  const MAX_TRIES = 1;
  const currentDate = new Date().toLocaleDateString("en-CA");

  const prompt = await clarifyAndRewritePrompt.invoke({
    userQuery: state.goal,
    currentDate,
    conversation: (state.chatHistory ?? [])
      .slice(-10)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n") || "(no prior conversation)",
  });

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const llmResult = await invokeRoleLlm({
        role: "clarifyAndRewriter",
        prompt,
        requestId: state.requestId,
        spanName: "clarifyAndRewriteNode",
        authHeaders: state.authHeaders,
      });

      logger.info("Result", { llmResult });

      const parsedContent = await SafeJsonParser.parseContent(
        llmResult.response.content,
      );

      const parsedData = clarifyAndRewriteSchema.safeParse(parsedContent);

      if (!parsedData.success) {
        logger.warn("Clarify And Rewrite Parsing was failed. Retrying...");
        continue;
      }

      return {
        ...state,
        isClarificationNeeded: parsedData.data.isClarificationNeeded,
        clarificationQuestion: parsedData.data.clarificationQuestion,
        rewrittenQuery: parsedData.data.rewrittenQuery,
      };
    } catch (err: unknown) {
      logger.error("Clarifier And Rewriter failed: Retrying..", err);

      continue;
    }
  }

  //   Have to terminate the agent if the clarify and rewrite node fails, as the downstream search nodes depend on the rewritten query to function correctly. Returning the original state without a rewritten query would likely lead to poor performance in the search nodes, as they may not be able to understand or process the user's intent effectively. By terminating here, we can avoid unnecessary processing and provide a clearer signal that something went wrong in this critical step.
  logger.error("Clarifier And Rewriter failed.");
  return state;
}
