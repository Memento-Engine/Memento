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
    apiKey: z.string().default("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"),
    baseUrl: z.string().url(),
    temperature: z.number().min(0).max(2).default(0),
    timeout: z.number().int().min(11000).default(300000),
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
    maxPlanRetries: z.number().int().min(1).default(3),
    maxStepRetries: z.number().int().min(1).default(2),
    stepTimeoutMs: z.number().int().min(1000).default(60000),
    maxReplanAttempts: z.number().int().min(1).default(3),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate configuration from environment variables.
 * Throws if required configuration is missing or invalid.
 */
export function loadConfig(): Config {
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
    },
    backend: {
      searchToolUrl:
        process.env.SEARCH_TOOL_URL ??
        "http://localhost:9090/api/v1/search_tool",
      timeout: parseInt(process.env.BACKEND_TIMEOUT ?? "30000", 10),
    },
    logging: {
      level: process.env.LOG_LEVEL ?? "info",
      format: process.env.LOG_FORMAT ?? "pretty",
    },
    agent: {
      maxPlanRetries: parseInt(process.env.MAX_PLAN_RETRIES ?? "3", 10),
      maxStepRetries: parseInt(process.env.MAX_STEP_RETRIES ?? "2", 10),
      stepTimeoutMs: parseInt(process.env.STEP_TIMEOUT_MS ?? "60000", 10),
      maxReplanAttempts: parseInt(process.env.MAX_REPLAN_ATTEMPTS ?? "3", 10),
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

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
