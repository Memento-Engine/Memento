/**
 * Core agent types and interfaces.
 */

export type { AgentRequest, AgentResponse } from "../../../shared/types/agent";

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
