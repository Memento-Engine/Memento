import dotenv from "dotenv";
import { z } from "zod";
import type { GatewayRole, ProviderName } from "@/types.ts";
import { Router } from "express";
dotenv.config();

// ============ TOKEN QUOTA CONFIGURATION ============
// Daily token quota for logged-in users (100% = this many tokens)
// Easily adjustable based on cost monitoring
export const DAILY_TOKEN_QUOTA = {
  // Logged-in users get this quota per day
  logged: parseInt(process.env.AI_GATEWAY_LOGGED_DAILY_QUOTA ?? "50000", 10),
  // Anonymous users get a smaller quota
  anonymous: parseInt(process.env.AI_GATEWAY_ANONYMOUS_DAILY_QUOTA ?? "10000", 10),
} as const;

// Roles that count towards quota (expensive models)
export const QUOTA_COUNTED_ROLES = new Set(["planner", "executor", "final"]);

// Roles that are free (cheap/free models)
export const QUOTA_FREE_ROLES = new Set(["summarizer", "classifierAndRouter", "clarifyAndRewriter", "router", "query_builder"]);
const providerSchema = z.object({
  name: z.enum(["openrouter", "openai", "anthropic", "gemini"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  timeoutMs: z.number().int().min(1000).default(30000),
});

const modelSelectionSchema = z.object({
  defaultModel: z.string().min(1),
  fallbackModels: z.array(z.string().min(1)).default([]),
  maxOutputTokens: z.number().int().min(64),
});

const roleConfigSchema = z.object({
  free: modelSelectionSchema,
  premium: modelSelectionSchema,
});

const limitsSchema = z.object({
  free: z.object({
    requestsPerMinute: z.number().int().min(1).default(20),
    dailyTokenLimit: z.number().int().min(1).default(40000),
  }),
  premium: z.object({
    requestsPerMinute: z.number().int().min(1).default(120),
    dailyTokenLimit: z.number().int().min(1).default(300000),
  }),
});

const configSchema = z.object({
  env: z.enum(["development", "production"]).default("development"),
  db: z.object({
    url: z.string().url(),
  }),
  server: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().min(1000).max(65535).default(4180),
  }),
  defaults: z.object({
    provider: z
      .enum(["openrouter", "openai", "anthropic", "gemini"])
      .default("openrouter"),
    temperature: z.number().min(0).max(2).default(0),
    model: z.string().default("google/gemini-2.0-flash-001"),
    maxTokens: z.number().int().min(64).default(65536),
  }),
  webSearch: z.object({
    apiKey: z.string().min(1).optional(),
    baseUrl: z.string().url().default("https://api.tavily.com"),
    maxResults: z.number().int().min(1).max(10).default(5),
    timeoutMs: z.number().int().min(1000).default(15000),
  }),
  providers: z.array(providerSchema),
  roles: z.object({
    summarizer: roleConfigSchema,
    classifierAndRouter: roleConfigSchema,
    router: roleConfigSchema,
    planner: roleConfigSchema,
    executor: roleConfigSchema,
    query_builder: roleConfigSchema,
    final: roleConfigSchema,
    clarifyAndRewriter: roleConfigSchema,
  }),
  limits: z.object({
    free: z.object({
      requestsPerMinute: z.number().int().min(1).default(20),
      dailyTokenLimit: z.number().int().min(1).default(40000),
    }),
    premium: z.object({
      requestsPerMinute: z.number().int().min(1).default(120),
      dailyTokenLimit: z.number().int().min(1).default(300000),
    }),
  }),
});

export type GatewayConfig = z.infer<typeof configSchema>;
export type RoleModelConfig = z.infer<typeof roleConfigSchema>["free"] | z.infer<typeof roleConfigSchema>["premium"];

function normalizeProvider(name: ProviderName): string {
  return name.toUpperCase();
}

function resolveProviderApiKey(
  providerName: ProviderName,
  upper: string,
): string | undefined {
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

function resolveProviderBaseUrl(
  providerName: ProviderName,
  upper: string,
): string | undefined {
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
  const defaultProvider = (process.env.AI_GATEWAY_DEFAULT_PROVIDER ??
    "openrouter") as ProviderName;

  const providers = (
    ["openrouter", "openai", "anthropic", "gemini"] as ProviderName[]
  )
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
        timeoutMs: parseInt(
          process.env[`AI_GATEWAY_${upper}_TIMEOUT_MS`] ?? "120000",
          10,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const config: GatewayConfig = {
    db: {
      url:
        process.env.NODE_ENV === "production"
          ? process.env.NEON_DATABASE_URL!
          : process.env.DATABASE_URL!,
    },
    env: (process.env.NODE_ENV === "production" ? "production" : "development"),
    server: {
      host: process.env.AI_GATEWAY_HOST ?? "127.0.0.1",
      port: parseInt(process.env.AI_GATEWAY_PORT ?? "4180", 10),
    },
    defaults: {
      provider: defaultProvider,
      temperature: parseFloat(
        process.env.AI_GATEWAY_DEFAULT_TEMPERATURE ?? "0",
      ),
      model: process.env.AI_GATEWAY_DEFAULT_MODEL ?? "google/gemini-2.0-flash-001",
      maxTokens: parseInt(
        process.env.AI_GATEWAY_DEFAULT_MAX_TOKENS ?? "65536",
        10,
      ),
    },
    webSearch: {
      apiKey:
        process.env.AI_GATEWAY_TAVILY_API_KEY ??
        process.env.TAVILY_API_KEY ??
        undefined,
      baseUrl: process.env.AI_GATEWAY_TAVILY_BASE_URL ?? "https://api.tavily.com",
      maxResults: parseInt(process.env.AI_GATEWAY_TAVILY_MAX_RESULTS ?? "5", 10),
      timeoutMs: parseInt(process.env.AI_GATEWAY_TAVILY_TIMEOUT_MS ?? "15000", 10),
    },
    providers,
    roles: {
      summarizer: {
        free: {
          defaultModel: process.env.AI_GATEWAY_SUMMARIZER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['mistralai/mistral-small-3.1-24b-instruct:free', 'deepseek/deepseek-chat'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_SUMMARIZER_MAX_OUTPUT_TOKENS_FREE ?? "1024", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_SUMMARIZER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_SUMMARIZER_MAX_OUTPUT_TOKENS_PREMIUM ?? "1024", 10),
        }
      },
      classifierAndRouter: {
        free: {
          defaultModel: process.env.AI_GATEWAY_CLASSIFIER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['mistralai/mistral-small-3.1-24b-instruct:free', 'deepseek/deepseek-chat'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_CLASSIFIER_MAX_OUTPUT_TOKENS_FREE ?? "512", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_CLASSIFIER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_CLASSIFIER_MAX_OUTPUT_TOKENS_PREMIUM ?? "512", 10),
        }
      },
      router: {
        free: {
          defaultModel: process.env.AI_GATEWAY_ROUTER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['mistralai/mistral-small-3.1-24b-instruct:free', 'deepseek/deepseek-chat'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_ROUTER_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_ROUTER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_ROUTER_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },
      planner: {
        free: {
          defaultModel: process.env.AI_GATEWAY_PLANNER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['deepseek/deepseek-chat', 'mistralai/mistral-small-3.1-24b-instruct:free'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_PLANNER_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_PLANNER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_PLANNER_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },

      executor: {
        free: {
          defaultModel: process.env.AI_GATEWAY_EXECUTOR_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['deepseek/deepseek-chat', 'mistralai/mistral-small-3.1-24b-instruct:free'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_EXECUTOR_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_EXECUTOR_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_EXECUTOR_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },
      clarifyAndRewriter: {
        free: {
          defaultModel: process.env.AI_GATEWAY_CLARIFY_AND_REWRITER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['mistralai/mistral-small-3.1-24b-instruct:free', 'deepseek/deepseek-chat'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_CLARIFY_AND_REWRITER_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_CLARIFY_AND_REWRITER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_CLARIFY_AND_REWRITER_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },
      query_builder: {
        free: {
          defaultModel: process.env.AI_GATEWAY_QUERY_BUILDER_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['mistralai/mistral-small-3.1-24b-instruct:free', 'deepseek/deepseek-chat'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_QUERY_BUILDER_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_QUERY_BUILDER_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_QUERY_BUILDER_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },
      final: {
        free: {
          defaultModel: process.env.AI_GATEWAY_FINAL_MODEL_FREE ?? "google/gemini-2.0-flash-001",
          fallbackModels: ['deepseek/deepseek-chat', 'mistralai/mistral-small-3.1-24b-instruct:free'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_FINAL_MAX_OUTPUT_TOKENS_FREE ?? "65536", 10),
        },
        premium: {
          defaultModel: process.env.AI_GATEWAY_FINAL_MODEL_PREMIUM ?? "anthropic/claude-3.5-sonnet",
          fallbackModels: ['openai/gpt-4o', 'google/gemini-2.0-flash-001'],
          maxOutputTokens: parseInt(process.env.AI_GATEWAY_FINAL_MAX_OUTPUT_TOKENS_PREMIUM ?? "65536", 10),
        }
      },
    },
    limits: {
      free: {
        requestsPerMinute: parseInt(
          process.env.AI_GATEWAY_FREE_RPM ?? "30",
          10,
        ),
        dailyTokenLimit: parseInt(
          process.env.AI_GATEWAY_FREE_DAILY_TOKENS ?? "5000000",
          10,
        ),
      },
      premium: {
        requestsPerMinute: parseInt(
          process.env.AI_GATEWAY_PREMIUM_RPM ?? "120",
          10,
        ),
        dailyTokenLimit: parseInt(
          process.env.AI_GATEWAY_PREMIUM_DAILY_TOKENS ?? "2000000",
          10,
        ),
      },
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

export function selectRoleModelConfig(
  config: GatewayConfig,
  role?: GatewayRole,
  access: "free" | "premium" = "free"
) : RoleModelConfig {
  if (!role) {
    return {
      defaultModel: config.defaults.model,
      fallbackModels: [],
      maxOutputTokens: config.defaults.maxTokens,
    };
  }

  return config.roles[role][access];
}
