import { getConfig } from "../config/config";
import { AgentError, ErrorCode, RateLimitError } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";

export type LlmRole =
  | "clarifyAndRewriter"
  | "router"
  | "planner"
  | "executor"
  | "query_builder"
  | "final";

// Roles that require premium credits (more reasoning power)
const PREMIUM_ROLES: Set<LlmRole> = new Set(["planner", "executor", "final"]);

// Roles that use smaller/free models (lightweight tasks)
const FREE_ROLES: Set<LlmRole> = new Set([
  "clarifyAndRewriter",
  "router",
  "query_builder",
]);

/**
 * Check if a role should use premium credits
 */
export function shouldUsePremiumCredits(role: LlmRole): boolean {
  return PREMIUM_ROLES.has(role);
}

type SpanAttributes = Record<string, string | number | boolean | undefined>;

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

/**
 * Auth headers to forward to AI gateway for credit tracking
 */
export type AuthHeaders = {
  authorization?: string;
  deviceId?: string;
};

type InvokeRoleParams = {
  role: LlmRole;
  prompt: any;
  requestId: string;
  spanName: string;
  spanAttributes?: SpanAttributes;
  authHeaders?: AuthHeaders;
};

type InvokeStreamingParams = InvokeRoleParams & {
  onChunk: (chunk: string) => void;
};

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// The actual data inside the gateway response
type GatewayResponseData = {
  id?: string;
  content: string;
  attempts?: number;
  fallback_used?: boolean;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  metadata?: {
    tier?: string;
    creditsUsed?: number;
    creditsRemaining?: number;
    contextShrinkApplied?: boolean;
  };
};

// Wrapped gateway response format
type GatewayResponse = {
  success: boolean;
  data?: GatewayResponseData;
  error?: {
    code: number;
    message: string;
    type?: "daily_tokens" | "requests_per_minute" | "no_credits";
    tier?: string;
    retryAfterMs?: number;
  };
};

type GatewayErrorResponse = {
  success: false;
  error: {
    code: number;
    message: string;
    type?: "daily_tokens" | "requests_per_minute" | "no_credits";
    tier?: string;
    retryAfterMs?: number;
  };
};

/**
 * Parse gateway error response and throw appropriate error
 */
function handleGatewayError(status: number, body: string, role: LlmRole): never {
  let parsed: GatewayErrorResponse | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not JSON, use raw body
  }

  // Handle rate limit errors (429)
  if (status === 429 && parsed?.error) {
    const { message, type, tier, retryAfterMs } = parsed.error;
    throw new RateLimitError(message, {
      role,
      type: type || "daily_tokens",
      tier: tier || "free",
      retryAfterMs,
    });
  }

  // Handle other errors
  const message = parsed?.error?.message || body || `Gateway error (${status})`;
  throw new AgentError(
    message,
    status === 401 ? ErrorCode.NETWORK_ERROR : ErrorCode.INTERNAL_ERROR,
    { role, statusCode: status },
    status
  );
}

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
    promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens,
    completionTokens:
      usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens,
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
  authHeaders = {},
}: InvokeRoleParams): Promise<{
  response: any;
  modelName: string;
  retryCount: number;
}> {
  const config = await getConfig();
  const messages = await toGatewayMessages(prompt);
  const usePremiumCredits = shouldUsePremiumCredits(role);

  const callMetrics: SpanAttributes = {
    ...spanAttributes,
    request_id: requestId,
    model_name: "ai-gateway",
    retry_count: 0,
    error_type: "none",
    prompt_tokens: undefined,
    completion_tokens: undefined,
    use_premium_credits: usePremiumCredits,
  };

  try {
    const response = await runWithSpan(spanName, callMetrics, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.aiGateway.timeoutMs,
      );

      try {
        // Build headers with auth info
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authHeaders.authorization) {
          headers["Authorization"] = authHeaders.authorization;
        }
        if (authHeaders.deviceId) {
          headers["X-Device-ID"] = authHeaders.deviceId;
        }

        const gatewayResponse = await fetch(
          `${config.aiGateway.baseUrl}/v1/chat`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages,
              temperature: 0,
              max_tokens: 65536,
              user_id: config.aiGateway.userId,
              role,
              use_premium_credits: usePremiumCredits,
            }),
            signal: controller.signal,
          },
        );


        if (!gatewayResponse.ok) {
          const body = await gatewayResponse.text();
          handleGatewayError(gatewayResponse.status, body, role);
        }

        const result = (await gatewayResponse.json()) as GatewayResponse;
        
        // Handle wrapped response format
        if (!result.success || !result.data) {
          throw new AgentError(
            result.error?.message || "Gateway returned unsuccessful response",
            ErrorCode.INTERNAL_ERROR,
            { role, response: result },
            500
          );
        }
        
        const responseData = result.data;
        const usage = extractTokenUsage(responseData);

        console.log("ai-gateway response", {
          contentLength: responseData.content?.length,
          attempts: responseData.attempts,
          usage,
          usePremiumCredits,
          metadata: responseData.metadata,
        });
        return responseData;
      } finally {
        clearTimeout(timeout);
      }
    });

    return {
      response: {
        content: response.content,
      },
      modelName: "ai-gateway", // Model abstracted away
      retryCount: Math.max(0, (response.attempts ?? 1) - 1),
    };
  } catch (error) {
    console.error("ai-gateway invocation failed", error);

    // Re-throw rate limit errors as-is for proper handling upstream
    if (error instanceof RateLimitError) {
      throw error;
    }

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
  authHeaders = {},
}: InvokeStreamingParams): Promise<{
  response: any;
  modelName: string;
  retryCount: number;
}> {
  const config = await getConfig();
  const messages = await toGatewayMessages(prompt);
  const usePremiumCredits = shouldUsePremiumCredits(role);

  const callMetrics: SpanAttributes = {
    ...spanAttributes,
    request_id: requestId,
    model_name: "ai-gateway",
    retry_count: 0,
    error_type: "none",
    streaming: true,
    use_premium_credits: usePremiumCredits,
  };

  try {
    return await runWithSpan(spanName, callMetrics, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.aiGateway.timeoutMs,
      );

      try {
        // Build headers with auth info
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authHeaders.authorization) {
          headers["Authorization"] = authHeaders.authorization;
        }
        if (authHeaders.deviceId) {
          headers["X-Device-ID"] = authHeaders.deviceId;
        }

        const gatewayResponse = await fetch(
          `${config.aiGateway.baseUrl}/v1/chat/stream`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages,
              temperature: 0,
              max_tokens: 65536,
              user_id: config.aiGateway.userId,
              role,
              use_premium_credits: usePremiumCredits,
            }),
            signal: controller.signal,
          },
        );

        if (!gatewayResponse.ok) {
          const body = await gatewayResponse.text();
          handleGatewayError(gatewayResponse.status, body, role);
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

              // Handle chunk messages (simple format)
              if (json.chunk) {
                fullContent += json.chunk;
                onChunk(json.chunk);
              }

              // Handle wrapped done message: { success: true, data: { done: true, ... } }
              if (json.success && json.data?.done) {
                // Done message received, extract any metadata if needed
                console.log("Streaming complete", { metadata: json.data.metadata });
              }

              // Handle legacy done format
              if (json.done && !json.success) {
                modelName = json.model ?? modelName;
              }

              // Handle error in wrapped format
              if (json.success === false && json.error) {
                throw new Error(json.error.message || "Gateway streaming error");
              }

              // Handle legacy error format
              if (json.error && !json.success) {
                throw new Error(typeof json.error === 'string' ? json.error : json.error.message);
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
          contentLength: fullContent.length,
        });

        return {
          response: {
            content: fullContent,
          },
          modelName: "ai-gateway", // Model abstracted away
          retryCount: 0,
        };
      } finally {
        clearTimeout(timeout);
      }
    });
  } catch (error) {
    console.error("ai-gateway streaming invocation failed", error);

    // Re-throw rate limit errors as-is for proper handling upstream
    if (error instanceof RateLimitError) {
      throw error;
    }

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
