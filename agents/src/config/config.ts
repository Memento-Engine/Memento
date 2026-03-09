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

  // LLM configuration
  llm: z.object({
    provider: z.string().default("openrouter"),
    model: z.string(),
    apiKey: z
      .string()
      .default("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"),
    baseUrl: z.string().url(),
    temperature: z.number().min(0).max(2).default(0),
    timeout: z.number().int().min(1000).default(30000),
    plannerModel: z.string().default("openai/gpt-4o-mini"),
    plannerFallbackModel: z.string().default("anthropic/claude-3-haiku"),
    plannerTimeoutMs: z.number().int().min(1000).default(7000),
    plannerMaxInputTokens: z.number().int().min(256).default(2500),
    plannerMaxOutputTokens: z.number().int().min(64).default(900),

    executorPrimaryModel: z.string().default("deepseek/deepseek-chat"),
    executorFallbackModel1: z.string().default("mistralai/mistral-large"),
    executorFallbackModel2: z.string().default("openai/gpt-4o-mini"),
    executorPrimaryTimeoutMs: z.number().int().min(1000).default(10000),
    executorFallbackTimeoutMs1: z.number().int().min(1000).default(8000),
    executorFallbackTimeoutMs2: z.number().int().min(1000).default(6000),
    executorMaxOutputTokens: z.number().int().min(64).default(600),

    finalModel: z.string().default("openai/gpt-4o-mini"),
    finalFallbackModel: z.string().default("anthropic/claude-3-haiku"),
    finalTimeoutMs: z.number().int().min(1000).default(7000),
    finalMaxOutputTokens: z.number().int().min(64).default(900),
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
  const daemonPort = await readDaemonPort().catch(() => {
    return 55941;
  });
  const config = {
    server: {
      port: parseInt(process.env.SERVER_PORT ?? "4173", 10),
      host: process.env.SERVER_HOST ?? "127.0.0.1",
      environment: process.env.NODE_ENV ?? "development",
    },
    llm: {
      provider: process.env.LLM_PROVIDER ?? "openrouter",
      model: process.env.LLM_MODEL ?? "deepseek/deepseek-chat",
      apiKey:
        process.env.OPENROUTER_API_KEY ??
        "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",
      baseUrl: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1",
      temperature: parseFloat(process.env.LLM_TEMPERATURE ?? "0"),
      timeout: parseInt(process.env.LLM_TIMEOUT ?? "30000", 10),
      plannerModel: process.env.LLM_PLANNER_MODEL ?? "gpt-4o-mini",
      plannerFallbackModel: process.env.LLM_PLANNER_FALLBACK_MODEL ?? "anthropic/claude-3-haiku",
      plannerTimeoutMs: parseInt(process.env.LLM_PLANNER_TIMEOUT_MS ?? "8000", 10),
      plannerMaxInputTokens: parseInt(process.env.LLM_PLANNER_MAX_INPUT_TOKENS ?? "2000", 10),
      plannerMaxOutputTokens: parseInt(process.env.LLM_PLANNER_MAX_OUTPUT_TOKENS ?? "900", 10),
      executorPrimaryModel: process.env.LLM_EXECUTOR_PRIMARY_MODEL ?? "deepseek/deepseek-chat",
      executorFallbackModel1:
        process.env.LLM_EXECUTOR_FALLBACK_MODEL_1 ?? "mistralai/mistral-large",
      executorFallbackModel2: process.env.LLM_EXECUTOR_FALLBACK_MODEL_2 ?? "gpt-4o-mini",
      executorPrimaryTimeoutMs: parseInt(
        process.env.LLM_EXECUTOR_PRIMARY_TIMEOUT_MS ?? "10000",
        10
      ),
      executorFallbackTimeoutMs1: parseInt(
        process.env.LLM_EXECUTOR_FALLBACK_TIMEOUT_MS_1 ?? "8000",
        10
      ),
      executorFallbackTimeoutMs2: parseInt(
        process.env.LLM_EXECUTOR_FALLBACK_TIMEOUT_MS_2 ?? "5000",
        10
      ),
      executorMaxOutputTokens: parseInt(process.env.LLM_EXECUTOR_MAX_OUTPUT_TOKENS ?? "500", 10),
      finalModel: process.env.LLM_FINAL_MODEL ?? "gpt-4o-mini",
      finalFallbackModel: process.env.LLM_FINAL_FALLBACK_MODEL ?? "anthropic/claude-3-haiku",
      finalTimeoutMs: parseInt(process.env.LLM_FINAL_TIMEOUT_MS ?? "8000", 10),
      finalMaxOutputTokens: parseInt(process.env.LLM_FINAL_MAX_OUTPUT_TOKENS ?? "800", 10),
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
