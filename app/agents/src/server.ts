import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import os from "os";
import { getMementoSharedDir } from "@shared/config/mementoPaths";

import { graph } from "./agent";
import { getConfig, loadConfig } from "./config/config";
import {
  initializeLogger,
  getHttpLogger,
  createContextLogger,
} from "./utils/logger";
import { initializeToolRegistry } from "./tools/registry";
import { AgentRequest, AgentResponse } from "./types/agent";
import { isAgentError, ErrorCode, RateLimitError } from "./types/errors";
import {
  getEventQueue,
  initializeEventQueue,
  cleanupEventQueue,
} from "./utils/eventQueue";
import {
  initializeTelemetry,
  registerTelemetryShutdownHooks,
} from "./telemetry/setup";
import {
  initializeSentry,
  captureAgentException,
  shutdownSentry,
} from "./telemetry/sentry";
import { runWithSpan } from "./telemetry/tracing";
import { formatLocalTimestamp } from "./utils/time";
import { saveMessage, buildSourcesFromStepResults, getSessionMessages } from "./tools/chatPersistence";
import { logCacheStatsSummary } from "./utils/cache";
import net from "net";

declare const __DEV__: boolean | undefined;

type InvokableGraph = {
  invoke(input: unknown): Promise<unknown>;
};

// Preferred port range for agent server (4170-4177)
const PREFERRED_AGENT_PORT = 4170;
const AGENT_PORT_RANGE_START = 4170;
const AGENT_PORT_RANGE_END = 4177;
const PORT_FILE_REFRESH_INTERVAL_MS = 30000; // 30 seconds

// Request validation schema
const AgentRequestSchema = z.object({
  goal: z
    .string()
    .min(1, "Goal cannot be empty")
    .max(5000, "Goal exceeds maximum length")
    .trim(),
  mode: z.enum(["search", "accurateSearch"]).optional().default("search"),
  sessionId: z.string().optional(),
  chatHistory: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
});

/**
 * Get the shared memento directory path (cross-platform).
 * Windows: %PROGRAMDATA%\memento (shared with Windows Service)
 * macOS/Linux: Same as getMementoSharedDir from shared config
 */
function getSharedMementoDir(): string {
  // Use the shared config which handles Windows Service path correctly
  // isDevelopmentMode() is compile-time constant set by esbuild
  const isProduction = typeof __DEV__ === "boolean" ? !__DEV__ : process.env.MEMENTO_DEV !== "true";
  return getMementoSharedDir(isProduction);
}

/**
 * Write the server port to a file for the frontend to read.
 */
async function writePortFile(port: number, logger: any): Promise<void> {
  const maxRetries = 8;
  let backoff = 1000;
  const maxBackoff = 64000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const portPath = path.join(getSharedMementoDir(), "ports");
      const filePath = path.join(portPath, "memento-agents.port");

      fs.mkdirSync(portPath, { recursive: true });
      fs.writeFileSync(filePath, port.toString());

      logger.info(`Successfully wrote port ${port} to ${filePath}`);
      return;
    } catch (error) {
      if (attempt >= maxRetries) {
        logger.error(`Max retries reached. Fatal error writing port file: ${error}`);
        return;
      }

      logger.warn(`Attempt ${attempt} failed: ${error}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, maxBackoff);
    }
  }
}

/**
 * Check if a port is available for binding.
 */
function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * Try to find an available port in the preferred range.
 * Returns the preferred port if available, otherwise tries fallbacks, then 0 for OS-assigned.
 */
async function findPreferredPort(host: string, logger: any): Promise<number> {
  // Try preferred port first
  if (await isPortAvailable(PREFERRED_AGENT_PORT, host)) {
    logger.info(`Using preferred port ${PREFERRED_AGENT_PORT}`);
    return PREFERRED_AGENT_PORT;
  }

  // Try ports in range
  for (let port = AGENT_PORT_RANGE_START; port <= AGENT_PORT_RANGE_END; port++) {
    if (port === PREFERRED_AGENT_PORT) continue; // Already tried
    if (await isPortAvailable(port, host)) {
      logger.info(`Using fallback port ${port} (preferred ${PREFERRED_AGENT_PORT} was taken)`);
      return port;
    }
  }

  // All preferred ports taken, use OS-assigned
  logger.warn(`All preferred ports (${AGENT_PORT_RANGE_START}-${AGENT_PORT_RANGE_END}) taken, using OS-assigned port`);
  return 0;
}

/**
 * Start periodic port file refresh to recover from accidental deletion.
 */
function startPortFileRefresh(port: number, logger: any): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const portPath = path.join(getSharedMementoDir(), "ports");
      const filePath = path.join(portPath, "memento-agents.port");
      fs.mkdirSync(portPath, { recursive: true });
      fs.writeFileSync(filePath, port.toString());
    } catch (error) {
      logger.warn(`Failed to refresh port file: ${error}`);
    }
  }, PORT_FILE_REFRESH_INTERVAL_MS);
}

/**
 * Initialize and start the agent server.
 */
async function startServer() {
  try {
    await initializeSentry();
    await initializeTelemetry();
    registerTelemetryShutdownHooks();

    // Load and validate configuration
    const config = await loadConfig();


    // Initialize logging
    const logger = await initializeLogger();
    logger.info("Logger initialized");
    logger.info(
      {
        environment: config.server.environment,
        host: config.server.host,
        port: config.server.port,
      },
      "Configuration loaded",
    );

    // Initialize tools
    const toolRegistry = await initializeToolRegistry();
    logger.info(
      "Tool registry initialized with tools: " +
      toolRegistry
        .list()
        .map((t) => t.name)
        .join(", "),
    );

    // Create Express app
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: "1mb" }));
    app.use(await getHttpLogger());

    // Request ID middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = uuidv4();
      (req as any).requestId = requestId;
      res.setHeader("X-Request-ID", requestId);
      next();
    });

    // Error handling middleware
    app.use(
      async (err: any, req: Request, res: Response, next: NextFunction) => {
        const logger = await createContextLogger((req as any).requestId);

        if (err instanceof SyntaxError && "body" in err) {
          logger.warn("Invalid JSON in request body");
          return res.status(400).json({
            success: false,
            error: {
              code: ErrorCode.INPUT_INVALID,
              message: "Invalid JSON in request body",
            },
          } as AgentResponse);
        }

        logger.error("Unhandled middleware error", err);
        res.status(500).json({
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: "Internal server error",
          },
        } as AgentResponse);
      },
    );

    // API Routes
    const router = express.Router();

    /**
     * Agent execution endpoint
     */
    router.post<{}, any, AgentRequest>(
      "/agent",
      async (req: Request, res: Response, next: NextFunction) => {
        const requestId = (req as any).requestId;
        const logger = await createContextLogger(requestId, {
          endpoint: "/api/v1/agent",
          method: "POST",
        });

        const startTime = Date.now();

        return runWithSpan(
          "agent.request",
          {
            request_id: requestId,
            endpoint: "/api/v1/agent",
            method: "POST",
          },
          async () => {
            try {
              logger.info("Received agent request");

              // Validate input
              const validationResult = AgentRequestSchema.safeParse(req.body);

              if (!validationResult.success) {
                const errorMsg = validationResult.error.issues
                  .map((e: any) => `${e.path.join(".")}: ${e.message}`)
                  .join("; ");

                logger.warn("Request validation failed", {
                  errors: validationResult.error.issues,
                });

                return res.status(400).json({
                  success: false,
                  error: {
                    code: ErrorCode.INPUT_INVALID,
                    message: `Invalid request: ${errorMsg}`,
                    details: {
                      validationErrors: validationResult.error.issues,
                    },
                  },
                } as AgentResponse);
              }

              const { goal, mode, chatHistory, sessionId } = validationResult.data;

              // Extract auth headers for credit tracking
              const authHeaders = {
                authorization: req.headers.authorization,
                deviceId: req.headers["x-device-id"] as string | undefined,
              };

              // Load chat history from DB if sessionId is provided
              let effectiveChatHistory = chatHistory;
              if (sessionId) {
                try {
                  const dbMessages = await getSessionMessages(sessionId, 50);
                  if (dbMessages.length > 0) {
                    logger.info(`Loaded ${dbMessages.length} messages from DB for session ${sessionId}`);
                    // Cast the role types to match the schema
                    effectiveChatHistory = dbMessages.map(m => ({
                      role: m.role as "user" | "assistant",
                      content: m.content,
                    }));
                  }
                } catch (error) {
                  logger.warn(`Failed to load chat history from DB for session ${sessionId}: ${error}`);
                }
              }

              // Set response headers for streaming
              res.setHeader(
                "Content-Type",
                "application/x-ndjson; charset=utf-8",
              );
              res.setHeader("Transfer-Encoding", "chunked");
              res.setHeader("Cache-Control", "no-cache");

              // Create a stream writer callback that sends events to client immediately
              const streamWriter = (event: any) => {
                try {
                  const json = JSON.stringify(event) + "\n";
                  res.write(json);
                  logger.debug("Streamed event to client", {
                    requestId,
                    eventType: event.type,
                    stepId: event.data?.stepId,
                  });
                } catch (error) {
                  logger.error("Error writing event to response", error, {
                    requestId,
                  });
                }
              };

              // Initialize event queue with stream writer for real-time streaming
              initializeEventQueue(requestId, streamWriter);

              // Execute agent graph with event queue for streaming
              let result: any;
              let executionError: any = null;
              try {
                const compiledGraph = (await graph) as unknown as InvokableGraph;
                result = await runWithSpan(
                  "agent.graph.invoke",
                  {
                    request_id: requestId,
                    endpoint: "/api/v1/agent",
                    goal_length: goal.length,
                  },
                  async () =>
                    compiledGraph.invoke({
                      goal: goal as any,
                      requestId: requestId as any,
                      authHeaders: authHeaders as any,
                      searchMode: mode as any,
                      chatHistory: effectiveChatHistory as any,
                      planAttempts: 0 as any,
                      llmCalls: 0 as any,
                      startTime: startTime as any,
                    }),
                );
              } catch (error) {
                executionError = error;
                result = null;
              }

              const duration = Date.now() - startTime;

              // If there was an execution error
              if (executionError) {
                // Handle rate limit errors with extra details
                if (executionError instanceof RateLimitError) {
                  logger.warn("Rate limit exceeded", {
                    tier: executionError.tier,
                    type: executionError.type,
                    retryAfterMs: executionError.retryAfterMs,
                    duration,
                  });

                  res.write(
                    JSON.stringify({
                      type: "error",
                      data: {
                        message: executionError.message,
                        code: ErrorCode.RATE_LIMIT_ERROR,
                        isSystemError: true,
                        rateLimit: {
                          tier: executionError.tier,
                          type: executionError.type,
                          retryAfterMs: executionError.retryAfterMs,
                        },
                        timestamp: formatLocalTimestamp(),
                      },
                      timestamp: formatLocalTimestamp(),
                    }) + "\n",
                  );
                } else if (isAgentError(executionError)) {
                  logger.warn("Agent execution failed with AgentError", {
                    code: executionError.code,
                    message: executionError.message,
                    duration,
                  });

                  // Send error event
                  res.write(
                    JSON.stringify({
                      type: "error",
                      data: {
                        message: executionError.message,
                        code: executionError.code,
                        isSystemError: true, // This is a real system error
                        timestamp: formatLocalTimestamp(),
                      },
                      timestamp: formatLocalTimestamp(),
                    }) + "\n",
                  );
                } else {
                  logger.error(
                    "Agent execution failed with unexpected error",
                    String(executionError),
                    {
                      duration,
                      error: executionError,
                    },
                  );

                  // Send generic error event
                  res.write(
                    JSON.stringify({
                      type: "error",
                      data: {
                        message: "Agent execution failed",
                        code: ErrorCode.INTERNAL_ERROR,
                        isSystemError: true,
                        timestamp: formatLocalTimestamp(),
                      },
                      timestamp: formatLocalTimestamp(),
                    }) + "\n",
                  );
                }

                // Send completion event with error status
                res.write(
                  JSON.stringify({
                    type: "complete",
                    data: {
                      success: false,
                      error: true,
                      metadata: {
                        requestId,
                        duration,
                        timestamp: formatLocalTimestamp(),
                      },
                    },
                    timestamp: formatLocalTimestamp(),
                  }) + "\n",
                );

                return res.end();
              }


              // Persist messages to DB in-order so reload preserves user -> assistant sequence.
              if (sessionId) {
                const persistSession = sessionId;
                const finalResult = (result as any)?.finalResult;
                const stepResults = (result as any)?.stepResults;
                const persistedThinkingSteps = (getEventQueue(requestId)?.getAll() ?? [])
                  .filter((event) => event.type === "thinking")
                  .map((event) => event.data);

                // Save user message (no sources)
                await saveMessage(persistSession, "user", goal, []);

                // Save assistant message with chunk references
                if (finalResult && stepResults) {
                  const sources = buildSourcesFromStepResults(stepResults);
                  await saveMessage(
                    persistSession,
                    "assistant",
                    finalResult,
                    sources,
                    persistedThinkingSteps,
                  );
                }
              }

              res.write(
                JSON.stringify({
                  type: "complete",
                  data: {
                    success: true,
                    metadata: {
                      requestId,
                      duration,
                      timestamp: formatLocalTimestamp(),
                    },
                  },
                  timestamp: formatLocalTimestamp(),
                }) + "\n",
              );

              // Log cache statistics after execution
              await logCacheStatsSummary();

              // Clean up event queue after successful completion
              cleanupEventQueue(requestId);
              return res.end();
            } catch (error) {
              const duration = Date.now() - startTime;

              logger.error("Unexpected error in agent endpoint", error, {
                duration,
                error,
              });

              // Clean up event queue on error
              cleanupEventQueue(requestId);

              res.write(
                JSON.stringify({
                  type: "error",
                  data: {
                    message: "Internal server error",
                    code: ErrorCode.INTERNAL_ERROR,
                    isSystemError: true,
                    timestamp: formatLocalTimestamp(),
                  },
                  timestamp: formatLocalTimestamp(),
                }) + "\n",
              );

              res.write(
                JSON.stringify({
                  type: "complete",
                  data: {
                    success: false,
                    error: true,
                    metadata: {
                      requestId,
                      duration,
                      timestamp: formatLocalTimestamp(),
                    },
                  },
                  timestamp: formatLocalTimestamp(),
                }) + "\n",
              );

              return res.end();
            }
          },
        );
      },
    );

    /**
     * Health check endpoint
     */
    router.get<{}, any>("/healthz", (req: Request, res: Response) => {
      return res.status(200).json({
        status: "healthy",
        timestamp: formatLocalTimestamp(),
        version: "1.0.0",
      });
    });

    /**
     * Tool registry info endpoint
     */
    router.get<{}, any>("/tools", (req: Request, res: Response) => {
      const tools = toolRegistry.list();
      return res.status(200).json({
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
      });
    });

    /**
     * Cache statistics endpoint
     */
    router.get<{}, any>("/cache/stats", async (req: Request, res: Response) => {
      const { getCacheManager } = await import("./utils/cache");
      const manager = getCacheManager();
      const allStats = manager.getAllStats();

      const stats: Record<string, any> = {};
      let totalHits = 0;
      let totalMisses = 0;
      let totalSize = 0;

      for (const [name, cacheStats] of allStats.entries()) {
        stats[name] = cacheStats;
        totalHits += cacheStats.hits;
        totalMisses += cacheStats.misses;
        totalSize += cacheStats.size;
      }

      const totalOps = totalHits + totalMisses;
      const overallHitRate = totalOps > 0 ? totalHits / totalOps : 0;

      return res.status(200).json({
        caches: stats,
        summary: {
          totalHits,
          totalMisses,
          totalSize,
          overallHitRate,
          timestamp: formatLocalTimestamp(),
        },
      });
    });

    app.use("/api/v1", router);

    // 404 handler
    app.use((req: Request, res: Response) => {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found",
        },
      } as AgentResponse);
    });

    // Find preferred port (4170-4177) or fall back to OS-assigned
    const preferredPort = await findPreferredPort(config.server.host, logger);
    
    const server = app.listen(preferredPort, config.server.host, async () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : 0;

      // Write port to file for frontend to read
      await writePortFile(actualPort, logger);
      
      // Start periodic port file refresh (every 30 seconds)
      const refreshInterval = startPortFileRefresh(actualPort, logger);
      
      // Clean up on server close
      server.on("close", () => {
        clearInterval(refreshInterval);
        // Remove port file on shutdown
        try {
          const filePath = path.join(getSharedMementoDir(), "ports", "memento-agents.port");
          fs.unlinkSync(filePath);
          logger.info("Removed port file on shutdown");
        } catch (e) {
          // Ignore errors during cleanup
        }
      });

      logger.info(
        `Agent server started on http://${config.server.host}:${actualPort}/api/v1`,
      );
    });
  } catch (error) {



    console.log("Got the error in start server catch", error);

    console.log("Passsing to sentry")
    captureAgentException(error, {
      message: "Failed to start agents server",
      level: "fatal",
      tags: {
        phase: "startup",
      },
    });

    await shutdownSentry();

    const startupLogger = await initializeLogger().catch(() => null);
    if (startupLogger) {
      startupLogger.error({ error: String(error) }, "Failed to start server");
    } else {
      console.error("Failed to start server:", error);
    }
    process.exit(1);
  }
}

// Start server
startServer();

process.on("SIGINT", async () => {
  await shutdownSentry();
});

process.on("SIGTERM", async () => {
  await shutdownSentry();
});
