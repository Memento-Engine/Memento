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
