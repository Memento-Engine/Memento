import { getConfig } from "../config/config";
import { AgentError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";

export type LlmRole =
  | "clarifyAndRewriter"
  
  | "router"
  | "planner"
  | "executor"
  | "query_builder"
  | "final";

type SpanAttributes = Record<string, string | number | boolean | undefined>;

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

type InvokeStreamingParams = InvokeRoleParams & {
  onChunk: (chunk: string) => void;
};

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GatewayResponse = {
  model?: string;
  content: string;
  attempts?: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

function mapRole(type: string): "system" | "user" | "assistant" {
  if (type === "system") return "system";
  if (type === "human") return "user";
  return "assistant";
}

async function toGatewayMessages(prompt: any): Promise<GatewayMessage[]> {
  if (Array.isArray(prompt)) {
    return prompt
      .filter((item) => item && typeof item.content === "string")
      .map((item) => ({
        role: mapRole(
          typeof item.getType === "function" ? item.getType() : "assistant",
        ),
        content: item.content,
      }));
  }

  if (prompt && typeof prompt.toChatMessages === "function") {
    const messages = await prompt.toChatMessages();
    return messages
      .filter((item: any) => item && typeof item.content === "string")
      .map((item: any) => ({
        role: mapRole(
          typeof item.getType === "function" ? item.getType() : "assistant",
        ),
        content: item.content,
      }));
  }

  if (prompt && typeof prompt.content === "string") {
    return [{ role: "user", content: prompt.content }];
  }

  return [{ role: "user", content: String(prompt ?? "") }];
}

function extractTokenUsage(response: any): TokenUsage {
  const usage =
    response?.usage ??
    response?.response_metadata?.tokenUsage ??
    response?.usage_metadata;
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

export function truncateToApproxTokens(
  input: string,
  maxTokens: number,
): string {
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
}: InvokeRoleParams): Promise<{
  response: any;
  modelName: string;
  retryCount: number;
}> {
  const config = await getConfig();
  const messages = await toGatewayMessages(prompt);

  const callMetrics: SpanAttributes = {
    ...spanAttributes,
    request_id: requestId,
    model_name: "ai-gateway",
    retry_count: 0,
    error_type: "none",
    prompt_tokens: undefined,
    completion_tokens: undefined,
  };

  try {
    const response = await runWithSpan(spanName, callMetrics, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.aiGateway.timeoutMs,
      );

      try {
        const gatewayResponse = await fetch(
          `${config.aiGateway.baseUrl}/v1/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages,
              temperature: 0,
              max_tokens: 65536,
              user_id: config.aiGateway.userId,
              role,
            }),
            signal: controller.signal,
          },
        );

        if (!gatewayResponse.ok) {
          const body = await gatewayResponse.text();
          throw new Error(
            `ai-gateway request failed (${gatewayResponse.status}): ${body}`,
          );
        }

        const result = (await gatewayResponse.json()) as GatewayResponse;
        const usage = extractTokenUsage(result);

        console.log("ai-gateway response", {
          model: result.model,
          content: result.content,
          attempts: result.attempts,
          usage,
        });
        return result;
      } finally {
        clearTimeout(timeout);
      }
    });

    return {
      response: {
        content: response.content,
      },
      modelName: response.model ?? "ai-gateway",
      retryCount: Math.max(0, (response.attempts ?? 1) - 1),
    };
  } catch (error) {
    console.error("ai-gateway invocation failed", error);

    // if  ()

    throw new AgentError(
      "ai-gateway invocation failed",
      isTimeoutError(error)
        ? ErrorCode.TIMEOUT_ERROR
        : ErrorCode.INTERNAL_ERROR,
      {
        role,
        cause: error,
      },
      isTimeoutError(error) ? 504 : 502,
    );
  }
}

/**
 * Invoke AI gateway with streaming for final answer generation.
 * Streams text chunks via the onChunk callback as they arrive.
 */
export async function invokeRoleLlmStreaming({
  role,
  prompt,
  requestId,
  spanName,
  spanAttributes = {},
  onChunk,
}: InvokeStreamingParams): Promise<{
  response: any;
  modelName: string;
  retryCount: number;
}> {
  const config = await getConfig();
  const messages = await toGatewayMessages(prompt);

  const callMetrics: SpanAttributes = {
    ...spanAttributes,
    request_id: requestId,
    model_name: "ai-gateway",
    retry_count: 0,
    error_type: "none",
    streaming: true,
  };

  try {
    return await runWithSpan(spanName, callMetrics, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.aiGateway.timeoutMs,
      );

      try {
        const gatewayResponse = await fetch(
          `${config.aiGateway.baseUrl}/v1/chat/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages,
              temperature: 0,
              max_tokens: 65536,
              user_id: config.aiGateway.userId,
              role,
            }),
            signal: controller.signal,
          },
        );

        if (!gatewayResponse.ok) {
          const body = await gatewayResponse.text();
          throw new Error(
            `ai-gateway streaming request failed (${gatewayResponse.status}): ${body}`,
          );
        }

        if (!gatewayResponse.body) {
          throw new Error("ai-gateway streaming response has no body");
        }

        const reader = gatewayResponse.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullContent = "";
        let modelName = "ai-gateway";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));

              if (json.chunk) {
                fullContent += json.chunk;
                onChunk(json.chunk);
              }

              if (json.done) {
                modelName = json.model ?? modelName;
              }

              if (json.error) {
                throw new Error(json.error);
              }
            } catch (parseError) {
              // Skip malformed JSON lines
              if (
                parseError instanceof Error &&
                parseError.message !== "Unexpected end of JSON input"
              ) {
                console.warn("Failed to parse SSE line:", trimmed, parseError);
              }
            }
          }
        }

        console.log("ai-gateway streaming response complete", {
          model: modelName,
          contentLength: fullContent.length,
        });

        return {
          response: {
            content: fullContent,
          },
          modelName,
          retryCount: 0,
        };
      } finally {
        clearTimeout(timeout);
      }
    });
  } catch (error) {
    console.error("ai-gateway streaming invocation failed", error);

    throw new AgentError(
      "ai-gateway streaming invocation failed",
      isTimeoutError(error)
        ? ErrorCode.TIMEOUT_ERROR
        : ErrorCode.INTERNAL_ERROR,
      {
        role,
        cause: error,
      },
      isTimeoutError(error) ? 504 : 502,
    );
  }
}
