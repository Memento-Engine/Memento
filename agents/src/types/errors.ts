/**
 * Custom error types for the agent system.
 * Provides structured error handling with context and metadata.
 */

export enum ErrorCode {
  // Configuration errors
  CONFIG_INVALID = "CONFIG_INVALID",
  CONFIG_MISSING = "CONFIG_MISSING",

  // Validation errors
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INPUT_INVALID = "INPUT_INVALID",
  OUTPUT_INVALID = "OUTPUT_INVALID",

  // Planner errors
  PLANNER_FAILED = "PLANNER_FAILED",
  PLAN_VALIDATION_FAILED = "PLAN_VALIDATION_FAILED",
  PLAN_CYCLE_DETECTED = "PLAN_CYCLE_DETECTED",
  PLAN_INVALID_REFERENCE = "PLAN_INVALID_REFERENCE",

  // Executor errors
  EXECUTOR_FAILED = "EXECUTOR_FAILED",
  STEP_EXECUTION_FAILED = "STEP_EXECUTION_FAILED",
  DEPENDENCY_NOT_RESOLVED = "DEPENDENCY_NOT_RESOLVED",
  STEP_TIMEOUT = "STEP_TIMEOUT",
  TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",

  // Tool errors
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  TOOL_NOT_REGISTERED = "TOOL_NOT_REGISTERED",
  TOOL_INVALID_INPUT = "TOOL_INVALID_INPUT",

  // LLM errors
  LLM_INVALID_OUTPUT = "LLM_INVALID_OUTPUT",
  LLM_PARSING_FAILED = "LLM_PARSING_FAILED",

  // Network/External errors
  BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",

  // Internal errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Context information for errors.
 */
export interface ErrorContext {
  requestId?: string;
  stepId?: string;
  tool?: string;
  cause?: Error | unknown;
  [key: string]: any;
}

/**
 * Base agent error class.
 */
export class AgentError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly statusCode: number;

  constructor(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {},
    statusCode = 500,
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.context = context;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AgentError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Validation error - user input failed validation.
 */
export class ValidationError extends AgentError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.VALIDATION_FAILED, context, 400);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Planner error - planning phase failed.
 */
export class PlannerError extends AgentError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.PLANNER_FAILED, context, 500);
    this.name = "PlannerError";
    Object.setPrototypeOf(this, PlannerError.prototype);
  }
}

/**
 * Executor error - execution phase failed.
 */
export class ExecutorError extends AgentError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.EXECUTOR_FAILED, context, 500);
    this.name = "ExecutorError";
    Object.setPrototypeOf(this, ExecutorError.prototype);
  }
}

/**
 * Tool error - tool execution failed.
 */
export class ToolError extends AgentError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.TOOL_EXECUTION_FAILED, context, 500);
    this.name = "ToolError";
    Object.setPrototypeOf(this, ToolError.prototype);
  }
}

/**
 * Timeout error - operation exceeded time limit.
 */
export class TimeoutError extends AgentError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.TIMEOUT_ERROR, context, 504);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Rate limit error - API quota or rate limit exceeded.
 */
export class RateLimitError extends AgentError {
  readonly tier: string;
  readonly type: "daily_tokens" | "requests_per_minute" | "no_credits";
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    context: ErrorContext & {
      tier?: string;
      type?: "daily_tokens" | "requests_per_minute" | "no_credits";
      retryAfterMs?: number;
    } = {}
  ) {
    super(message, ErrorCode.RATE_LIMIT_ERROR, context, 429);
    this.name = "RateLimitError";
    this.tier = context.tier || "free";
    this.type = context.type || "daily_tokens";
    this.retryAfterMs = context.retryAfterMs;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      tier: this.tier,
      type: this.type,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * Check if error is an AgentError.
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Convert unknown error to AgentError.
 */
export function toAgentError(
  error: unknown,
  code: ErrorCode = ErrorCode.INTERNAL_ERROR,
  context: ErrorContext = {},
): AgentError {
  if (isAgentError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new AgentError(message, code, { ...context, cause }, 500);
}
