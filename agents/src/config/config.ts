import { z } from "zod";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

/**
 * Configuration schema for the agent system.
 * Validates all required and optional environment variables.
 */
const ConfigSchema = z.object({
  // Server configuration
  server: z.object({
    port: z.number().int().min(1000).max(65535),
    host: z.string(),
    environment: z.enum(["development", "production"]).default("development"),
  }),

  // AI gateway configuration
  aiGateway: z.object({
    baseUrl: z.string().url(),
    timeoutMs: z.number().int().min(1000).default(30000),
    userId: z.string().min(1).default("agents-service"),
  }),

  // Backend service configuration
  backend: z.object({
    searchToolUrl: z.string().url(),
    timeout: z.number().int().min(1000).default(30000),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("debug"),
    format: z.enum(["pretty", "json"]).default("pretty"),
  }),

  // Agent execution configuration
  agent: z.object({
    maxPlanRetries: z.number().int().min(1).default(2),
    maxStepRetries: z.number().int().min(1).default(1),
    stepTimeoutMs: z.number().int().min(1000).default(20000),
    maxReplanAttempts: z.number().int().min(1).default(2),
    maxReasoningSteps: z.number().int().min(1).default(3),
    maxLlmCalls: z.number().int().min(1).default(6),
    maxSteps: z.number().int().min(1).default(4),
    maxRuntimeMs: z.number().int().min(1000).default(15000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

import fs from "fs/promises";
import path from "path";

export async function readDaemonPort(): Promise<number> {
  const filePath = path.join(process.env.LOCALAPPDATA || "", "memento", "memento-daemon.port");

  const content = await fs.readFile(filePath, "utf-8");
  const port = parseInt(content.trim(), 10);

  if (Number.isNaN(port)) {
    throw new Error("Invalid port in memento-daemon.port");
  }

  return port;
}

/**
 * Load and validate configuration from environment variables.
 * Throws if required configuration is missing or invalid.
 */
export async function loadConfig(): Promise<Config> {
  const daemonPort = await readDaemonPort();
  console.log("Daemon port", daemonPort);
  const config = {
    server: {
      port: parseInt(process.env.SERVER_PORT ?? "4173", 10),
      host: process.env.SERVER_HOST ?? "127.0.0.1",
      environment: process.env.NODE_ENV ?? "development",
    },
    aiGateway: {
      baseUrl: process.env.AI_GATEWAY_URL ?? "http://127.0.0.1:4180",
      timeoutMs: parseInt(process.env.AI_GATEWAY_TIMEOUT_MS ?? "30000", 10),
      userId: process.env.AI_GATEWAY_USER_ID ?? "agents-service",
    },
    backend: {
      searchToolUrl:
        process.env.SEARCH_TOOL_URL ?? `http://localhost:${daemonPort}/api/v1/search_tool`,
      timeout: parseInt(process.env.BACKEND_TIMEOUT ?? "30000", 10),
    },
    logging: {
      level: process.env.LOG_LEVEL ?? "debug",
      format: process.env.LOG_FORMAT ?? "pretty",
    },
    agent: {
      maxPlanRetries: parseInt(process.env.MAX_PLAN_RETRIES ?? "3", 10),
      maxStepRetries: parseInt(process.env.MAX_STEP_RETRIES ?? "2", 10),
      stepTimeoutMs: parseInt(process.env.STEP_TIMEOUT_MS ?? "60000", 10),
      maxReplanAttempts: parseInt(process.env.MAX_REPLAN_ATTEMPTS ?? "3", 10),
      maxReasoningSteps: parseInt(process.env.MAX_REASONING_STEPS ?? "3", 10),
      maxLlmCalls: parseInt(process.env.MAX_LLM_CALLS ?? "6", 10),
      maxSteps: parseInt(process.env.MAX_STEPS ?? "4", 10),
      maxRuntimeMs: parseInt(process.env.MAX_RUNTIME_MS ?? "15000", 10),
    },
  };

  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Configuration validation failed:\n${messages}`);
    }
    throw error;
  }
}

// Load and export singleton instance
let cachedConfig: Config | null = null;

export async function getConfig(): Promise<Config> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }
  return cachedConfig;
}
