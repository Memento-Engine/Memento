import dotenv from "dotenv";
import { z } from "zod";
import type { GatewayRole, ProviderName } from "./types.js";
import path from "path/win32";
import fs from "fs";
dotenv.config({
  path: path.resolve(process.cwd(), "../.env"),
});
const providerSchema = z.object({
  name: z.enum(["openrouter", "openai", "anthropic", "gemini"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  timeoutMs: z.number().int().min(1000).default(30000),
});

const roleConfigSchema = z.object({
  defaultModel: z.string().min(1),
  fallbackModels: z.array(z.string().min(1)).default([]),
  maxOutputTokens: z.number().int().min(64),
});

const configSchema = z.object({
  server: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().min(1000).max(65535).default(4180),
  }),
  defaults: z.object({
    provider: z.enum(["openrouter", "openai", "anthropic", "gemini"]).default("openrouter"),
    temperature: z.number().min(0).max(2).default(0),
    model: z.string().default("openai/gpt-4o-mini"),
    maxTokens: z.number().int().min(64).default(65536),
  }),
  providers: z.array(providerSchema),
  roles: z.object({
    router: roleConfigSchema,
    planner: roleConfigSchema,
    executor: roleConfigSchema,
    query_builder: roleConfigSchema,
    final: roleConfigSchema,
    clarifyAndRewriter : roleConfigSchema
  }),
  limits: z.object({
    free: z.object({
      requestsPerMinute: z.number().int().min(1).default(20),
      dailyTokenLimit: z.number().int().min(1).default(40000),
    }),
    pro: z.object({
      requestsPerMinute: z.number().int().min(1).default(120),
      dailyTokenLimit: z.number().int().min(1).default(300000),
    }),
    proUsers: z.array(z.string().min(1)).default([]),
  }),
});

export type GatewayConfig = z.infer<typeof configSchema>;

function normalizeProvider(name: ProviderName): string {
  return name.toUpperCase();
}

function resolveProviderApiKey(providerName: ProviderName, upper: string): string | undefined {
  const scopedKey = process.env[`AI_GATEWAY_${upper}_API_KEY`];
  if (scopedKey && scopedKey.trim()) {
    return scopedKey;
  }

  if (providerName === "openrouter") {
    const legacyOpenRouter = process.env.OPENROUTER_API_KEY;
    if (legacyOpenRouter && legacyOpenRouter.trim()) {
      return legacyOpenRouter;
    }
  }

  return undefined;
}

function resolveProviderBaseUrl(providerName: ProviderName, upper: string): string | undefined {
  const scopedBaseUrl = process.env[`AI_GATEWAY_${upper}_BASE_URL`];
  if (scopedBaseUrl && scopedBaseUrl.trim()) {
    return scopedBaseUrl;
  }

  if (providerName === "openrouter") {
    return process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  }

  return undefined;
}

export function loadConfig(): GatewayConfig {
  const defaultProvider = (process.env.AI_GATEWAY_DEFAULT_PROVIDER ?? "openrouter") as ProviderName;

  const providers = (["openrouter", "openai", "anthropic", "gemini"] as ProviderName[])
    .map((providerName) => {
      const upper = normalizeProvider(providerName);
      const apiKey = resolveProviderApiKey(providerName, upper);
      const baseUrl = resolveProviderBaseUrl(providerName, upper);

      if (!apiKey || !baseUrl) {
        return null;
      }

      return {
        name: providerName,
        apiKey,
        baseUrl,
        timeoutMs: parseInt(process.env[`AI_GATEWAY_${upper}_TIMEOUT_MS`] ?? "30000", 10),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const config = {
    server: {
      host: process.env.AI_GATEWAY_HOST ?? "127.0.0.1",
      port: parseInt(process.env.AI_GATEWAY_PORT ?? "4180", 10),
    },
    defaults: {
      provider: defaultProvider,
      temperature: parseFloat(process.env.AI_GATEWAY_DEFAULT_TEMPERATURE ?? "0"),
      model: process.env.AI_GATEWAY_DEFAULT_MODEL ?? "openai/gpt-4o-mini",
      maxTokens: parseInt(process.env.AI_GATEWAY_DEFAULT_MAX_TOKENS ?? "65536", 10),
    },
    providers,
    roles: {
      router: {
        defaultModel: process.env.AI_GATEWAY_ROUTER_MODEL ?? "openai/gpt-4o-mini",
        fallbackModels: (process.env.AI_GATEWAY_ROUTER_FALLBACKS ?? "anthropic/claude-3-haiku")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_ROUTER_MAX_OUTPUT_TOKENS ?? "4096", 10),
      },
      planner: {
        defaultModel: process.env.AI_GATEWAY_PLANNER_MODEL ?? "openai/gpt-4o-mini",
        fallbackModels: (process.env.AI_GATEWAY_PLANNER_FALLBACKS ?? "anthropic/claude-3-haiku")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_PLANNER_MAX_OUTPUT_TOKENS ?? "65536", 10),
      },
      executor: {
        defaultModel: process.env.AI_GATEWAY_EXECUTOR_MODEL ?? "deepseek/deepseek-chat",
        fallbackModels: (process.env.AI_GATEWAY_EXECUTOR_FALLBACKS ?? "mistralai/mistral-large,openai/gpt-4o-mini")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_EXECUTOR_MAX_OUTPUT_TOKENS ?? "65536", 10),
      },
       clarifyAndRewriter: {
        defaultModel: process.env.AI_GATEWAY_EXECUTOR_MODEL ?? "deepseek/deepseek-chat",
        fallbackModels: (process.env.AI_GATEWAY_EXECUTOR_FALLBACKS ?? "mistralai/mistral-large,openai/gpt-4o-mini")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_EXECUTOR_MAX_OUTPUT_TOKENS ?? "65536", 10),
      },
      query_builder: {
        defaultModel: process.env.AI_GATEWAY_QUERY_BUILDER_MODEL ?? "deepseek/deepseek-chat",
        fallbackModels: (process.env.AI_GATEWAY_QUERY_BUILDER_FALLBACKS ?? "openai/gpt-4o-mini")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_QUERY_BUILDER_MAX_OUTPUT_TOKENS ?? "4096", 10),
      },
      final: {
        defaultModel: process.env.AI_GATEWAY_FINAL_MODEL ?? "openai/gpt-4o-mini",
        fallbackModels: (process.env.AI_GATEWAY_FINAL_FALLBACKS ?? "anthropic/claude-3-haiku")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxOutputTokens: parseInt(process.env.AI_GATEWAY_FINAL_MAX_OUTPUT_TOKENS ?? "65536", 10),
      },
    },
    limits: {
      free: {
        requestsPerMinute: parseInt(process.env.AI_GATEWAY_FREE_RPM ?? "20", 10),
        dailyTokenLimit: parseInt(process.env.AI_GATEWAY_FREE_DAILY_TOKENS ?? "40000", 10),
      },
      pro: {
        requestsPerMinute: parseInt(process.env.AI_GATEWAY_PRO_RPM ?? "120", 10),
        dailyTokenLimit: parseInt(process.env.AI_GATEWAY_PRO_DAILY_TOKENS ?? "300000", 10),
      },
      proUsers: (process.env.AI_GATEWAY_PRO_USERS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  };


  const parsed = configSchema.parse(config);

  if (parsed.providers.length === 0) {
    throw new Error(
      "No provider credentials configured for ai-gateway. Set OPENROUTER_API_KEY or AI_GATEWAY_OPENROUTER_API_KEY (optional AI_GATEWAY_OPENROUTER_BASE_URL).",
    );
  }

  return parsed;
}

export function selectRoleModelConfig(config: GatewayConfig, role?: GatewayRole): {
  defaultModel: string;
  fallbackModels: string[];
  maxOutputTokens: number;
} {
  if (!role) {
    return {
      defaultModel: config.defaults.model,
      fallbackModels: [],
      maxOutputTokens: config.defaults.maxTokens,
    };
  }

  return config.roles[role];
}
