import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { loadConfig, selectRoleModelConfig } from "./config.js";
import { ModelRouter } from "./modelRouter.js";
import { OpenRouterAdapter } from "./providers/openrouter.adapter.js";
import type { LlmProviderAdapter } from "./providers/provider.js";
import { RateLimiter, RateLimitError } from "./rateLimiter.js";
import type { ChatRequest, ProviderName, UserRole, GatewayResponse } from "./types.js";
import { UsageTracker, CREDIT_COSTS } from "./usageTracker.js";
import unAuthorizedRouter from "./routes/unAuthorized.js";
import { errorHandler } from "./utils/errorHandler.js";
import { validateUserRequest } from "./middlewares/auth.ts";
import { RequestContext } from "./types/request-context.ts";
import { 
  shrinkContextWindow, 
  estimateConversationTokens, 
  needsShrinking,
  getContextStats 
} from "./utils/contextWindow.js";
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
} from "@memento/shared/errors.ts";

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
  role: z
    .enum([
      "clarifyAndRewriter",
      "router",
      "planner",
      "executor",
      "query_builder",
      "final",
    ])
    .optional(),
  // New fields for premium model selection
  use_premium_model: z.boolean().optional(),
});

function buildProviderRegistry(
  config: ReturnType<typeof loadConfig>,
): Map<ProviderName, LlmProviderAdapter> {
  const registry = new Map<ProviderName, LlmProviderAdapter>();

  for (const provider of config.providers) {
    if (provider.name === "openrouter") {
      registry.set(
        "openrouter",
        new OpenRouterAdapter({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        }),
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
    const response: GatewayResponse<{ ok: boolean; service: string }> = {
      success: true,
      data: { ok: true, service: "memento-ai-gateway" },
    };
    res.json(response);
  });

  app.use(unAuthorizedRouter);

  app.post("/v1/chat", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      const parsed = chatSchema.parse(req.body);
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;
      const usePremiumModel = parsed.use_premium_model && req.availablePremiumCredits > 0;

      console.log("Received chat request", {
        req: parsed.messages.map((m) => ({
          role: m.role,
          contentLength: m.content.length,
        })),
        sysRole: parsed.role,
        userRole,
        availableCredits: req.availablePremiumCredits,
        usePremiumModel,
      });

      // Select model config based on tier (premium if using premium model, else free)
      const accessTier = usePremiumModel ? "premium" : "free";
      const roleDefaults = parsed.role ? config.roles[parsed.role] : undefined;
      const subRole = roleDefaults?.[accessTier] ?? roleDefaults?.free;
      
      const resolvedMaxTokens = subRole
        ? Math.min(
            parsed.max_tokens ?? subRole.maxOutputTokens,
            subRole.maxOutputTokens,
          )
        : (parsed.max_tokens ?? config.defaults.maxTokens);

      // Estimate tokens for rate limiting
      const estimatedTokens = estimateConversationTokens(parsed.messages) + resolvedMaxTokens;

      // Check rate limits
      const rateLimitResult = await rateLimiter.checkRateLimit({
        deviceId,
        userId,
        userRole,
        estimatedTokens,
        isPremiumRequest: usePremiumModel,
      });

      if (!rateLimitResult.allowed) {
        const errResponse: GatewayResponse<null> = {
          success: false,
          error: {
            code: StatusCodes.TOO_MANY_REQUESTS,
            message: rateLimitResult.reason || "Rate limit exceeded",
          },
        };
        return res.status(StatusCodes.TOO_MANY_REQUESTS).json(errResponse);
      }

      // Apply context window shrinking if needed
      const model = subRole?.defaultModel ?? config.defaults.model;
      let processedMessages = parsed.messages;
      let contextShrinkApplied = false;

      if (needsShrinking(parsed.messages, model, resolvedMaxTokens)) {
        const shrinkResult = shrinkContextWindow(parsed.messages, {
          model,
          reserveForResponse: resolvedMaxTokens,
          strategy: "truncate_middle",
        });
        processedMessages = shrinkResult.messages;
        contextShrinkApplied = true;

        console.log("Context window shrunk", {
          originalTokens: shrinkResult.originalTokens,
          shrunkTokens: shrinkResult.shrunkTokens,
          messagesRemoved: shrinkResult.messagesRemoved,
          strategy: shrinkResult.strategy,
        });
      }

      const chatRequest: ChatRequest = {
        messages: processedMessages,
        model: parsed.model,
        temperature: parsed.temperature ?? config.defaults.temperature,
        max_tokens: resolvedMaxTokens,
        user_id: parsed.user_id,
        role: parsed.role,
      };

      const response = await modelRouter.chat(chatRequest);

      // Track usage with enhanced tracking
      const creditsCost = usePremiumModel ? CREDIT_COSTS.premium : 0;
      await usageTracker.trackUsage({
        deviceId,
        userId,
        userRole,
        model: response.model,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        role: parsed.role,
        fallbackUsed: response.fallback_used,
        isPremiumRequest: usePremiumModel,
        creditsCost,
        contextWindowSize: estimateConversationTokens(processedMessages),
      });

      // Include usage metadata in response
      const chatResponse: GatewayResponse<typeof response & { metadata: object }> = {
        success: true,
        data: {
          ...response,
          metadata: {
            tier: rateLimitResult.tier,
            creditsUsed: creditsCost,
            creditsRemaining: (rateLimitResult.remainingCredits ?? 0) - creditsCost,
            contextShrinkApplied,
          },
        },
      };
      res.status(StatusCodes.OK).json(chatResponse);
    } catch (error) {
      // Let the error handler deal with properly formatted errors
      if (error instanceof RateLimitError) {
        throw new ForbiddenError(error.message);
      }
      if (error instanceof z.ZodError) {
        throw new BadRequestError(error.issues.map((e) => e.message).join(", "));
      }
      throw error;
    }
  });

  // Streaming chat endpoint for final answer
  app.post("/v1/chat/stream", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      const parsed = chatSchema.parse(req.body);
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;
      const usePremiumModel = parsed.use_premium_model && req.availablePremiumCredits > 0;

      console.log("Received streaming chat request", {
        req: parsed.messages.map((m) => ({
          role: m.role,
          contentLength: m.content.length,
        })),
        sysRole: parsed.role,
        userRole,
        usePremiumModel,
      });

      // Select model config based on tier
      const accessTier = usePremiumModel ? "premium" : "free";
      const roleDefaults = parsed.role ? config.roles[parsed.role] : undefined;
      const subRole = roleDefaults?.[accessTier] ?? roleDefaults?.free;
      
      const resolvedMaxTokens = subRole
        ? Math.min(
            parsed.max_tokens ?? subRole.maxOutputTokens,
            subRole.maxOutputTokens,
          )
        : (parsed.max_tokens ?? config.defaults.maxTokens);

      // Estimate tokens for rate limiting
      const estimatedTokens = estimateConversationTokens(parsed.messages) + resolvedMaxTokens;

      // Check rate limits
      const rateLimitResult = await rateLimiter.checkRateLimit({
        deviceId,
        userId,
        userRole,
        estimatedTokens,
        isPremiumRequest: usePremiumModel,
      });

      if (!rateLimitResult.allowed) {
        const errResponse: GatewayResponse<null> = {
          success: false,
          error: {
            code: StatusCodes.TOO_MANY_REQUESTS,
            message: rateLimitResult.reason || "Rate limit exceeded",
          },
        };
        return res.status(StatusCodes.TOO_MANY_REQUESTS).json(errResponse);
      }

      // Apply context window shrinking if needed
      const model = subRole?.defaultModel ?? config.defaults.model;
      let processedMessages = parsed.messages;
      let contextShrinkApplied = false;

      if (needsShrinking(parsed.messages, model, resolvedMaxTokens)) {
        const shrinkResult = shrinkContextWindow(parsed.messages, {
          model,
          reserveForResponse: resolvedMaxTokens,
          strategy: "truncate_middle",
        });
        processedMessages = shrinkResult.messages;
        contextShrinkApplied = true;
      }

      const chatRequest: ChatRequest = {
        messages: processedMessages,
        model: parsed.model,
        temperature: parsed.temperature ?? config.defaults.temperature,
        max_tokens: resolvedMaxTokens,
        user_id: parsed.user_id,
        role: parsed.role,
      };

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const response = await modelRouter.chatStream(
        chatRequest,
        (chunk: string) => {
          // Send each chunk as SSE data
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        },
      );

      // Track usage with enhanced tracking
      const creditsCost = usePremiumModel ? CREDIT_COSTS.premium : 0;
      await usageTracker.trackUsage({
        deviceId,
        userId,
        userRole,
        model: response.model,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        role: parsed.role,
        fallbackUsed: response.fallback_used,
        isPremiumRequest: usePremiumModel,
        creditsCost,
        contextWindowSize: estimateConversationTokens(processedMessages),
      });

      // Send final completion event with metadata (GatewayResponse format for SSE)
      const donePayload: GatewayResponse<{
        done: boolean;
        usage: typeof response.usage;
        model: string;
        metadata: object;
      }> = {
        success: true,
        data: {
          done: true,
          usage: response.usage,
          model: response.model,
          metadata: {
            tier: rateLimitResult.tier,
            creditsUsed: creditsCost,
            creditsRemaining: (rateLimitResult.remainingCredits ?? 0) - creditsCost,
            contextShrinkApplied,
          },
        },
      };
      res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
      res.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown gateway error";
      const errorPayload: GatewayResponse<null> = {
        success: false,
        error: {
          code: StatusCodes.INTERNAL_SERVER_ERROR,
          message,
        },
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      res.end();
    }
  });

  // Get usage stats and credits for the current user/device
  app.get("/v1/usage", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;

      const stats = await usageTracker.getUsageStats(deviceId, userId);
      const tier = rateLimiter.resolveTier(userRole, stats.availableCredits > 0);
      const limits = config.limits[tier as keyof typeof config.limits];

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          user: req.user ? {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
          } : null,
          deviceId,
          userRole,
          tier,
          credits: {
            total: userRole === "logged" ? 5 : 3, // LOGGED_IN_PREMIUM_CREDITS : ANONYMOUS_PREMIUM_CREDITS
            used: stats.usedCredits,
            available: stats.availableCredits,
          },
          usage: {
            daily: {
              requests: stats.dailyRequests,
              tokens: stats.dailyTokens,
              limit: limits.dailyTokenLimit,
            },
            minute: {
              requests: stats.minuteRequests,
              limit: limits.requestsPerMinute,
            },
          },
        },
      });
    } catch (error) {
      // Let error handler deal with it
      throw new InternalServerError(
        error instanceof Error ? error.message : "Failed to get usage stats"
      );
    }
  });

  app.use(errorHandler);

  app.listen(config.server.port, config.server.host, () => {
    console.log(
      `menento-ai-gateway listening on http://${config.server.host}:${config.server.port}`,
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start ai-gateway", error);
  process.exit(1);
});
