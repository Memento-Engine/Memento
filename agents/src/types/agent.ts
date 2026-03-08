/**
 * Core agent types and interfaces.
 */

export interface AgentRequest {
  goal: string;
}

export interface AgentResponse<T = any> {
  success: boolean;
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata?: {
    requestId: string;
    duration: number;
    timestamp: string;
  };
}

export interface ExecutionMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
}

export interface WorkflowContext {
  requestId: string;
  goal: string;
  startTime: number;
}
