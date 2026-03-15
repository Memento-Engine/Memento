export type ProviderName = "openrouter" | "openai" | "anthropic" | "gemini";

export type ChatRole = "system" | "user" | "assistant";

export type GatewayRole =
  | "clarifyAndRewriter"
  | "router"
  | "planner"
  | "executor"
  | "query_builder"
  | "final";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  temperature: number;
  max_tokens: number;
  user_id: string;
  role?: GatewayRole;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatResponse = {
  id: string;
  model: string;
  content: string;
  usage: TokenUsage;
  fallback_used: boolean;
  attempts: number;
};

export type UsageRecord = {
  user_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  timestamp: number;
};

import { StatusCodes } from "http-status-codes";

// Unified Responses for entire gateway can be used for better error handling and extensibility in the future
export type GatewayResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: StatusCodes;
    message: string;
  };
};

// ------------- Shared Types Between Frontend and Backend --------------
import { z } from "zod";

export const deviceMetaDataSchema = z.object({
  os: z.string(),
  machineHostName: z.string(),
  appVersion: z.string(),
});
export const registerDeviceSchema = z.object({
  deviceMetaData: deviceMetaDataSchema,
  deviceId: z.string().min(1),
  timestamp: z.string().min(1),
  signature: z.string().min(1),
});


export const registerDeviceResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});



export type UserTier  = "free" | "premium";
export type UserRole = "anonymous" | "logged";



export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceSchema>;
export type DeviceMetaData = z.infer<typeof deviceMetaDataSchema>;