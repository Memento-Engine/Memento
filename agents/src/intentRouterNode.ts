import { UnknownKeysParam } from "zod/v3";
import { AgentStateType } from "./agentState";
import { invokeRoleLlm } from "./llm/routing";
import { ContextLogger, createContextLogger, logger } from "./utils/logger";
import { intentRouterPrompt } from "./prompts/intentRouterPrompt";
import { SafeJsonParser } from "./utils/parser";
import { intentRouterSchema } from "./types/agent";

export async function intentRouterNode(
  state: AgentStateType,
): Promise<AgentStateType> {
  try {
    const logger = await createContextLogger(state.requestId, {
      node: "intentRouter",
      goal: state.goal,
    });

    const prompt = await intentRouterPrompt.invoke({
      query: state.rewrittenQuery,
    });

    const llmResult = await invokeRoleLlm({
      role: "router",
      prompt,
      requestId: state.requestId,
      spanName: "agent.node.intent_router.llm",
      spanAttributes: { node: "intent_router" },
    });

    const parsedContent = await SafeJsonParser.parseContent(
      llmResult.response.content,
    );
    const parsedData = intentRouterSchema.safeParse(parsedContent);

    if (!parsedData.success) {
      logger.error("Failed to parse intent router response");
      throw new Error("Failed to parse intent router response");
    }

    logger.info("Intent router classified query", {
      isConversation: parsedData.data.isConversation,
      isNeedPlanning: parsedData.data.isNeedPlanning,
      conversationResponse: parsedData.data.conversationResponse,
    });

    return {
      ...state,
      isConversation: parsedData.data.isConversation,
      isNeedPlanning: parsedData.data.isNeedPlanning,
      conversationResponse: parsedData.data.conversationResponse,
    };
  } catch (err: unknown) {
    logger.error("Intent router failed, defaulting to non-conversation route", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
