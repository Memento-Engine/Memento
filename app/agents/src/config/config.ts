import { z } from "zod";

/**
 * Development mode detection.
 * - In bundled builds (esbuild): __DEV__ is replaced at compile-time with false
 * - In tsx watch mode: Falls back to MEMENTO_DEV environment variable
 * 
 * This approach avoids process.env usage in bundled production code.
 */
declare const __DEV__: boolean | undefined;

export function isDevelopmentMode(): boolean {
  // Check compile-time constant first (set by esbuild --define)
  if (typeof __DEV__ === "boolean") {
    return __DEV__;
  }
  // Fallback for tsx watch mode - only checked during development
  return process.env.MEMENTO_DEV === "true";
}

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().int().min(1000).max(65535),
    host: z.string(),
    environment: z.enum(["development", "production"]).default("development"),
  }),
  aiGateway: z.object({
    baseUrl: z.string().url(),
    timeoutMs: z.number().int().min(1000).default(30000),
    userId: z.string().min(1).default("agents-service"),
  }),
  backend: z.object({
    timeout: z.number().int().min(1000).default(30000),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    format: z.enum(["pretty", "json"]).default("pretty"),
  }),
  agent: z.object({
    maxPlanRetries: z.number().int().min(1).default(2),
    stepTimeoutMs: z.number().int().min(1000).default(20000),
    maxLlmCalls: z.number().int().min(1).default(12),
    maxRuntimeMs: z.number().int().min(1000).default(30000),
    previewLength: z.number().int().min(50).default(150),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;


export async function loadConfig(): Promise<Config> {
  const devMode = isDevelopmentMode();

  const config = {
    server: {
      port: 4173,
      host: "127.0.0.1",
      environment: devMode ? "development" : "production",
    },
    aiGateway: {
      baseUrl: devMode ? "http://127.0.0.1:4180" : "https://trymemento.in",
      timeoutMs: 30000,
      userId: "agents-service",
    },
    backend: {
      timeout: 30000,
    },
    logging: {
      level: devMode ? "debug" : "info",
      format: devMode ? "pretty" : "json",
    },
    agent: {
      maxPlanRetries: 2,
      stepTimeoutMs: 20000,
      maxLlmCalls: 12,
      maxRuntimeMs: 30000,
      previewLength: 150,
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

let cachedConfig: Config | null = null;

export async function getConfig(): Promise<Config> {
  if (!cachedConfig) {
    cachedConfig = await loadConfig();
  }
  return cachedConfig;
}