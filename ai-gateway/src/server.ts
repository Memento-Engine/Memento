import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { loadConfig, selectRoleModelConfig } from "@/config.ts";
import { ModelRouter } from "@/modelRouter.ts";
import { OpenRouterAdapter } from "@/providers/openrouter.adapter.ts";
import type { LlmProviderAdapter } from "@/providers/provider.ts";
import { RateLimiter, RateLimitError } from "@/rateLimiter.ts";
import type { ChatRequest, ProviderName, UserRole, GatewayResponse } from "@/types.ts";
import { UsageTracker } from "@/usageTracker.ts";
import unAuthorizedRouter from "@/routes/unAuthorized.ts";
import authRouter from "@/routes/auth.ts";
import { errorHandler } from "@/utils/errorHandler.ts";
import { validateUserRequest } from "@/middlewares/auth.ts";
import { RequestContext } from "@/types/request-context.ts";
import {
  shrinkContextWindow,
  estimateConversationTokens,
  needsShrinking,
  getContextStats
} from "@/utils/contextWindow.ts";
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
} from "@memento/shared/errors.ts";
import { runMigrations } from "@/db/migrate.ts";
import { logger, childLogger } from "@/utils/logger.ts";
import { httpLogger } from "@/middlewares/httpLogger.ts";

const log = childLogger("server");

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

const webSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
};

type TavilySearchResponse = {
  results?: TavilySearchResult[];
  query?: string;
  response_time?: number;
};

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
  // Run database migrations first
  try {
    await runMigrations();
  } catch (error) {
    log.error({ error }, "Failed to run migrations, continuing with existing schema");
    // Don't exit - the schema might already exist from previous runs
  }

  const config = loadConfig();
  const usageTracker = new UsageTracker();
  const rateLimiter = new RateLimiter(config, usageTracker);
  const providerRegistry = buildProviderRegistry(config);
  const modelRouter = new ModelRouter(config, providerRegistry);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(httpLogger);

  app.get("/health", (_req: Request, res: Response) => {
    const response: GatewayResponse<{ ok: boolean; service: string }> = {
      success: true,
      data: { ok: true, service: "memento-ai-gateway" },
    };
    res.json(response);
  });

  // Public routes (no auth required)
  app.use(unAuthorizedRouter);
  app.use(authRouter);

  app.post("/v1/chat", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      console.log("Request body", req.body);
      const parsed = chatSchema.parse(req.body);
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;
      const usePremiumModel = req.availablePremiumCredits > 0;

      log.info({
        messages: parsed.messages.map((m) => ({
          role: m.role,
          contentLength: m.content.length,
        })),
        sysRole: parsed.role,
        userRole,
        availableCredits: req.availablePremiumCredits,
        usePremiumModel,
      }, "Received chat request");

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

      // Check rate limits (only RPM limiting now, quota exhaustion falls back to free models)
      const rateLimitResult = await rateLimiter.checkRateLimit({
        deviceId,
        userId,
        userRole,
        estimatedTokens,
      });

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.retryAfterMs) {
          res.setHeader("Retry-After", Math.ceil(rateLimitResult.retryAfterMs / 1000));
        }

        const errResponse: GatewayResponse<null> = {
          success: false,
          error: {
            code: StatusCodes.TOO_MANY_REQUESTS,
            message: rateLimitResult.reason || "Rate limit exceeded",
            type: "requests_per_minute",
            tier: rateLimitResult.tier,
            retryAfterMs: rateLimitResult.retryAfterMs,
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

        log.info({
          originalTokens: shrinkResult.originalTokens,
          shrunkTokens: shrinkResult.shrunkTokens,
          messagesRemoved: shrinkResult.messagesRemoved,
          strategy: shrinkResult.strategy,
        }, "Context window shrunk");
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

      // Track usage - tokens are counted based on role (expensive roles count towards quota)
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
        contextWindowSize: estimateConversationTokens(processedMessages),
      });

      // Include usage metadata in response (hide model from agents for abstraction)
      const { model: _usedModel, ...responseWithoutModel } = response;
      const chatResponse: GatewayResponse<typeof responseWithoutModel & { metadata: object }> = {
        success: true,
        data: {
          ...responseWithoutModel,
          metadata: {
            tier: rateLimitResult.tier,
            quota: rateLimitResult.quota ?? null,
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

  app.post("/v1/search", validateUserRequest, async (req: RequestContext, res: Response) => {
    const parsed = webSearchSchema.parse(req.body);

    if (!config.webSearch.apiKey) {
      const errResponse: GatewayResponse<null> = {
        success: false,
        error: {
          code: StatusCodes.SERVICE_UNAVAILABLE,
          message: "Web search is not configured. Set TAVILY_API_KEY or AI_GATEWAY_TAVILY_API_KEY.",
        },
      };
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json(errResponse);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.webSearch.timeoutMs);

    try {
      const tavilyResponse = await fetch(`${config.webSearch.baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: config.webSearch.apiKey,
          query: parsed.query,
          max_results: Math.min(parsed.limit ?? config.webSearch.maxResults, config.webSearch.maxResults),
          search_depth: "advanced",
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          topic: "general",
        }),
        signal: controller.signal,
      });

      if (!tavilyResponse.ok) {
        const body = await tavilyResponse.text();
        throw new Error(`Tavily search failed (${tavilyResponse.status}): ${body}`);
      }

      const payload = (await tavilyResponse.json()) as TavilySearchResponse;
      const results = Array.isArray(payload.results)
        ? payload.results
            .filter((result) => typeof result.url === "string" && result.url.length > 0)
            .map((result) => ({
              title: result.title ?? result.url ?? "Untitled result",
              url: result.url as string,
              snippet: result.content ?? "",
              score: result.score,
              publishedAt: result.published_date,
            }))
        : [];

      log.info({
        query: parsed.query,
        resultCount: results.length,
        userRole: req.userRole,
      }, "Completed web search request");

      const response: GatewayResponse<{
        query: string;
        results: Array<{
          title: string;
          url: string;
          snippet: string;
          score?: number;
          publishedAt?: string;
        }>;
        metadata: {
          resultCount: number;
          responseTimeMs?: number;
        };
      }> = {
        success: true,
        data: {
          query: payload.query ?? parsed.query,
          results,
          metadata: {
            resultCount: results.length,
            responseTimeMs: payload.response_time,
          },
        },
      };

      return res.status(StatusCodes.OK).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web search failed";
      log.error({ error, query: parsed.query }, "Web search request failed");
      const errResponse: GatewayResponse<null> = {
        success: false,
        error: {
          code: StatusCodes.BAD_GATEWAY,
          message,
        },
      };
      return res.status(StatusCodes.BAD_GATEWAY).json(errResponse);
    } finally {
      clearTimeout(timeout);
    }
  });

  // Streaming chat endpoint for final answer
  app.post("/v1/chat/stream", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      const parsed = chatSchema.parse(req.body);
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;
      const usePremiumModel = req.availablePremiumCredits > 0;

      log.info({
        messages: parsed.messages.map((m) => ({
          role: m.role,
          contentLength: m.content.length,
        })),
        sysRole: parsed.role,
        userRole,
        usePremiumModel,
      }, "Received streaming chat request");

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

      // Check rate limits (only RPM limiting now, quota exhaustion falls back to free models)
      const rateLimitResult = await rateLimiter.checkRateLimit({
        deviceId,
        userId,
        userRole,
        estimatedTokens,
      });

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.retryAfterMs) {
          res.setHeader("Retry-After", Math.ceil(rateLimitResult.retryAfterMs / 1000));
        }

        const errResponse: GatewayResponse<null> = {
          success: false,
          error: {
            code: StatusCodes.TOO_MANY_REQUESTS,
            message: rateLimitResult.reason || "Rate limit exceeded",
            type: "requests_per_minute",
            tier: rateLimitResult.tier,
            retryAfterMs: rateLimitResult.retryAfterMs,
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

      // Track usage - tokens are counted based on role (expensive roles count towards quota)
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
        contextWindowSize: estimateConversationTokens(processedMessages),
      });

      // Send final completion event with metadata (hide model from agents for abstraction)
      const donePayload: GatewayResponse<{
        done: boolean;
        usage: typeof response.usage;
        metadata: object;
      }> = {
        success: true,
        data: {
          done: true,
          usage: response.usage,
          metadata: {
            tier: rateLimitResult.tier,
            quota: rateLimitResult.quota ?? null,
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

  // Get usage stats and quota for the current user/device
  app.get("/v1/usage", validateUserRequest, async (req: RequestContext, res: Response) => {
    try {
      const deviceId = req.deviceId;
      const userId = req.user?.id;
      const userRole = req.userRole as UserRole;

      const stats = await usageTracker.getUsageStats(deviceId, userId);
      
      // Get quota info for logged-in users
      let quota = null;
      if (userId && userRole === "logged") {
        quota = await usageTracker.getQuotaInfo(userId, userRole);
      }

      const tier = rateLimiter.resolveTier(userRole, quota?.tokensRemaining ?? 0);
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
          // New quota-based system (percentage display)
          quota: quota ? {
            dailyQuota: quota.dailyQuota,
            tokensUsed: quota.tokensUsed,
            tokensRemaining: quota.tokensRemaining,
            percentRemaining: quota.percentRemaining,
            canMakeRequest: quota.canMakeRequest,
            resetInMs: quota.resetInMs,
          } : null,
          usage: {
            daily: {
              requests: stats.dailyRequests,
              tokens: stats.dailyTokens,
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
    log.info(`memento-ai-gateway listening on http://${config.server.host}:${config.server.port}`);
  });
}

startServer().catch((error) => {
  log.fatal({ error }, "Failed to start ai-gateway");
  process.exit(1);
});
