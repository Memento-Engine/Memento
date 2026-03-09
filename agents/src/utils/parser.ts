import { z } from "zod";
import { AgentError, ErrorCode } from "../types/errors";
import { getLogger } from "./logger";

/**
 * Safe JSON parser that handles multiple content formats.
 * Validates and normalizes input before parsing.
 */
export class SafeJsonParser {
  /**
   * Parse LLM response content to JSON.
   * Handles both string and array formats from different LLM providers.
   */
  static async parseContent(content: unknown): Promise<any> {
    const logger = await getLogger();

    if (content === null || content === undefined) {
      throw new AgentError(
        "LLM returned empty content",
        ErrorCode.LLM_INVALID_OUTPUT,
        { contentType: typeof content },
      );
    }

    let text: string;

    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      // Handle array format from some LLM providers
      text = content
        .map((item: any) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "text" in item) {
            return item.text ?? "";
          }
          return "";
        })
        .join("");

      if (!text) {
        throw new AgentError(
          "LLM returned empty array content",
          ErrorCode.LLM_INVALID_OUTPUT,
          { contentType: "array", length: content.length },
        );
      }
    } else {
      throw new AgentError(
        `Unsupported LLM response format: ${typeof content}`,
        ErrorCode.LLM_INVALID_OUTPUT,
        { contentType: typeof content, content: String(content).slice(0, 100) },
      );
    }

    // Remove markdown code fences
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    if (!cleaned) {
      throw new AgentError(
        "LLM response content is empty after cleaning",
        ErrorCode.LLM_INVALID_OUTPUT,
        { originalLength: text.length },
      );
    }

    try {
      return JSON.parse(cleaned);
    } catch (parseError) {
      console.log("ParsedError", parseError);

      logger.warn("Failed to parse LLM JSON");

      throw new AgentError(
        "Failed to parse LLM response as JSON",
        ErrorCode.LLM_PARSING_FAILED,
        {
          content: cleaned.slice(0, 100),
          cause: parseError,
        },
      );
    }
  }

  /**
   * Parse and validate content against a schema.
   */
  static async parseAndValidate<T>(content: unknown, schema: z.ZodSchema<T>): Promise<T> {
    const parsed = await this.parseContent(content);

    try {
      return schema.parse(parsed);
    } catch (validationError) {
      const logger = await getLogger();
      logger.warn("Schema validation failed for LLM output");

      const message =
        validationError instanceof z.ZodError
          ? validationError.issues
              .map((e: any) => `${e.path.join(".")}: ${e.message}`)
              .join("; ")
          : String(validationError);

      throw new AgentError(
        `LLM output validation failed: ${message}`,
        ErrorCode.LLM_PARSING_FAILED,
        { validationError },
      );
    }
  }
}

/**
 * Error handler utilities.
 */
export class ErrorHandler {
  /**
   * Convert unknown error to AgentError with context.
   */
  static toAgentError(
    error: unknown,
    code: ErrorCode,
    context?: Record<string, any>,
  ): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new AgentError(
      message,
      code,
      {
        ...context,
        cause,
      },
      500,
    );
  }

  /**
   * Get safe error message for user response.
   */
  static getSafeMessage(error: unknown): string {
    if (error instanceof AgentError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "An unexpected error occurred";
  }
}

/**
 * Timeout wrapper for promises.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage = "Operation timed out",
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new AgentError(
              timeoutMessage,
              ErrorCode.TIMEOUT_ERROR,
              {
                timeout: ms,
              },
              504,
            ),
          ),
        ms,
      ),
    ),
  ]);
}

/**
 * Retry wrapper for promises with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  },
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}
