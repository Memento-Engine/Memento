export interface ToolContext {
  requestId: string;
  stepId: string;
  attemptNumber: number;
  timeout: number;
}

export interface ToolResultError {
  code?: string;
  message: string;
  stage?: string;
  details?: string;
}

export type ToolResultErrorLike = string | ToolResultError;

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: ToolResultErrorLike;
  metadata?: Record<string, any>;
}
