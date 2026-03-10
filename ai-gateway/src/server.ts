import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { ModelRouter } from "./modelRouter.js";
import { OpenRouterAdapter } from "./providers/openrouter.adapter.js";
import type { LlmProviderAdapter } from "./providers/provider.js";
import { RateLimiter } from "./rateLimiter.js";
import type { ChatRequest, ProviderName } from "./types.js";
import { UsageTracker } from "./usageTracker.js";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(65_536).optional(),
  user_id: z.string().min(1),
  role: z.enum(["router", "planner", "executor", "query_builder", "final"]).optional(),
});

function buildProviderRegistry(
  config: ReturnType<typeof loadConfig>
): Map<ProviderName, LlmProviderAdapter> {
  const registry = new Map<ProviderName, LlmProviderAdapter>();

  for (const provider of config.providers) {
    if (provider.name === "openrouter") {
      registry.set(
        "openrouter",
        new OpenRouterAdapter({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        })
      );
    }
  }

  return registry;
}

async function startServer(): Promise<void> {
  const config = loadConfig();
  const usageTracker = new UsageTracker();
  const rateLimiter = new RateLimiter(config, usageTracker);
  const providerRegistry = buildProviderRegistry(config);
  const modelRouter = new ModelRouter(config, providerRegistry);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "ai-gateway" });
  });

  app.post("/v1/chat", async (req: Request, res: Response) => {
    try {
      const parsed = chatSchema.parse(req.body);

      console.log("Received chat request", {
        req: parsed.messages.map((m) => ({ role: m.role, contentLength: m.content.length })),
        sysRole : parsed.role
        });

      const roleDefaults = parsed.role ? config.roles[parsed.role] : undefined;
      const resolvedMaxTokens = roleDefaults
        ? Math.min(parsed.max_tokens ?? roleDefaults.maxOutputTokens, roleDefaults.maxOutputTokens)
        : (parsed.max_tokens ?? config.defaults.maxTokens);

      const chatRequest: ChatRequest = {
        messages: parsed.messages,
        model: parsed.model,
        temperature: parsed.temperature ?? config.defaults.temperature,
        max_tokens: resolvedMaxTokens,
        user_id: parsed.user_id,
        role: parsed.role,
      };

      //   const estimatedTokens = Math.max(chatRequest.max_tokens, 256);
      //   rateLimiter.enforce(chatRequest.user_id, estimatedTokens);

      const response = await modelRouter.chat(chatRequest);

      usageTracker.track({
        user_id: chatRequest.user_id,
        model: response.model,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        timestamp: Date.now(),
      });

      res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown gateway error";
      const status = /Rate limit exceeded|Token limit exceeded/.test(message) ? 429 : 400;
      res.status(status).json({
        error: {
          message,
        },
      });
    }
  });

  app.listen(config.server.port, config.server.host, () => {
    console.log(`ai-gateway listening on http://${config.server.host}:${config.server.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start ai-gateway", error);
  process.exit(1);
});
