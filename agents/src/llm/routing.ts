import { ChatOpenAI } from "@langchain/openai";
import { getConfig } from "../config/config";
import { AgentError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";

export type LlmRole = "planner" | "executor" | "final";

type SpanAttributes = Record<string, string | number | boolean | undefined>;

type ModelCandidate = {
  model: string;
  timeoutMs: number;
};

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

type InvokeRoleParams = {
  role: LlmRole;
  prompt: any;
  requestId: string;
  spanName: string;
  spanAttributes?: SpanAttributes;
};

const llmCache = new Map<string, ChatOpenAI>();

function getCachedLlm(
  model: string,
  timeoutMs: number,
  maxTokens: number,
  baseUrl: string,
  apiKey: string,
  temperature: number,
): ChatOpenAI {
  const cacheKey = `${model}:${timeoutMs}:${maxTokens}`;
  const cached = llmCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const llm = new ChatOpenAI({
    model,
    temperature,
    apiKey,
    maxTokens,
    configuration: {
      baseURL: baseUrl,
    },
    timeout: timeoutMs,
  });

  llmCache.set(cacheKey, llm);
  return llm;
}

function getCandidates(role: LlmRole, config: Awaited<ReturnType<typeof getConfig>>): {
  candidates: ModelCandidate[];
  maxOutputTokens: number;
} {
  if (role === "planner") {
    return {
      candidates: [
        { model: config.llm.plannerModel, timeoutMs: config.llm.plannerTimeoutMs },
        { model: config.llm.plannerFallbackModel, timeoutMs: config.llm.plannerTimeoutMs },
      ],
      maxOutputTokens: config.llm.plannerMaxOutputTokens,
    };
  }

  if (role === "executor") {
    return {
      candidates: [
        {
          model: config.llm.executorPrimaryModel,
          timeoutMs: config.llm.executorPrimaryTimeoutMs,
        },
        {
          model: config.llm.executorFallbackModel1,
          timeoutMs: config.llm.executorFallbackTimeoutMs1,
        },
        {
          model: config.llm.executorFallbackModel2,
          timeoutMs: config.llm.executorFallbackTimeoutMs2,
        },
      ],
      maxOutputTokens: config.llm.executorMaxOutputTokens,
    };
  }

  return {
    candidates: [
      { model: config.llm.finalModel, timeoutMs: config.llm.finalTimeoutMs },
      { model: config.llm.finalFallbackModel, timeoutMs: config.llm.finalTimeoutMs },
    ],
    maxOutputTokens: config.llm.finalMaxOutputTokens,
  };
}

function extractTokenUsage(response: any): TokenUsage {
  const usage = response?.response_metadata?.tokenUsage ?? response?.usage_metadata;
  if (!usage || typeof usage !== "object") {
    return {};
  }

  return {
    promptTokens: usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens,
    completionTokens:
      usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens,
  };
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof AgentError && error.code === ErrorCode.TIMEOUT_ERROR) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ETIMEDOUT/i.test(message);
}

export function truncateToApproxTokens(input: string, maxTokens: number): string {
  const approxCharsPerToken = 4;
  const maxChars = Math.max(0, maxTokens * approxCharsPerToken);
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}...`;
}

export async function invokeRoleLlm({
  role,
  prompt,
  requestId,
  spanName,
  spanAttributes = {},
}: InvokeRoleParams): Promise<{ response: any; modelName: string; retryCount: number }> {
  const config = await getConfig();
  const { candidates, maxOutputTokens } = getCandidates(role, config);

  let lastError: unknown;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const llm = getCachedLlm(
      candidate.model,
      candidate.timeoutMs,
      maxOutputTokens,
      config.llm.baseUrl,
      config.llm.apiKey,
      config.llm.temperature,
    );

    const callMetrics: SpanAttributes = {
      ...spanAttributes,
      request_id: requestId,
      model_name: candidate.model,
      retry_count: index,
      error_type: "none",
      prompt_tokens: undefined,
      completion_tokens: undefined,
    };

    try {
      const response = await runWithSpan(spanName, callMetrics, async () => {
        try {
          const result = await llm.invoke(prompt);
          const usage = extractTokenUsage(result);
          callMetrics.prompt_tokens = usage.promptTokens;
          callMetrics.completion_tokens = usage.completionTokens;
          return result;
        } catch (error) {
          callMetrics.error_type = isTimeoutError(error) ? "timeout" : "error";
          throw error;
        }
      });

      return {
        response,
        modelName: candidate.model,
        retryCount: index,
      };
    } catch (error) {
      lastError = error;

      if (!isTimeoutError(error)) {
        throw error;
      }
    }
  }

  throw new AgentError(
    "All model candidates timed out",
    ErrorCode.TIMEOUT_ERROR,
    {
      role,
      candidates: candidates.map((c) => c.model),
      cause: lastError,
    },
    504,
  );
}
