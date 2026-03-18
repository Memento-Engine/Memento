import { z } from "zod";

/**
 * Development mode detection.
 * - In bundled builds (esbuild): __DEV__ is replaced at compile-time with false
 * - In tsx watch mode: Falls back to MEMENTO_DEV environment variable
 * 
 * This approach avoids process.env usage in bundled production code.
 */
declare const __DEV__: boolean | undefined;

function isDevelopmentMode(): boolean {
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
    searchToolUrl: z.string().url(),
    searchResultsByChunkIdsUrl: z.string().url(),
    timeout: z.number().int().min(1000).default(30000),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    format: z.enum(["pretty", "json"]).default("pretty"),
  }),
  agent: z.object({
    maxPlanRetries: z.number().int().min(1).default(2),
    maxStepRetries: z.number().int().min(1).default(1),
    stepTimeoutMs: z.number().int().min(1000).default(20000),
    maxReplanAttempts: z.number().int().min(1).default(2),
    maxReasoningSteps: z.number().int().min(1).default(3),
    maxLlmCalls: z.number().int().min(1).default(6),
    maxSteps: z.number().int().min(1).default(4),
    maxRuntimeMs: z.number().int().min(1000).default(15000),
    useReActExecutor: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

import fs from "fs/promises";
import path from "path";
import os from "os";

function getLocalDataDir(): string {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".local", "share");
}

export async function readDaemonPort(): Promise<number> {
  const filePath = path.join(getLocalDataDir(), "memento", "memento-daemon.port");
  const content = await fs.readFile(filePath, "utf-8");
  const port = parseInt(content.trim(), 10);
  if (Number.isNaN(port)) {
    throw new Error("Invalid port in memento-daemon.port");
  }
  return port;
}

export async function loadConfig(): Promise<Config> {
  const daemonPort = await readDaemonPort();
  const devMode = isDevelopmentMode();

  const config = {
    server: {
      port: 4173,
      host: "127.0.0.1",
      environment: devMode ? "development" : "production",
    },
    aiGateway: {
      baseUrl: "http://127.0.0.1:4180",
      timeoutMs: 30000,
      userId: "agents-service",
    },
    backend: {
      searchToolUrl: `http://localhost:${daemonPort}/api/v1/search_tool`,
      searchResultsByChunkIdsUrl: `http://localhost:${daemonPort}/api/v1/search_results_by_chunk_ids`,
      timeout: 30000,
    },
    logging: {
      level: devMode ? "debug" : "info",
      format: devMode ? "pretty" : "json",
    },
    agent: {
      maxPlanRetries: 2,
      maxStepRetries: 1,
      stepTimeoutMs: 20000,
      maxReplanAttempts: 2,
      maxReasoningSteps: 3,
      maxLlmCalls: 6,
      maxSteps: 4,
      maxRuntimeMs: 15000,
      useReActExecutor: true,
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