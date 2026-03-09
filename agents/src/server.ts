import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { graph } from "./agent";
import { getConfig, loadConfig } from "./config/config";
import {
  initializeLogger,
  getHttpLogger,
  createContextLogger,
} from "./utils/logger";
import { initializeToolRegistry } from "./tools/registry";
import { AgentRequest, AgentResponse } from "./types/agent";
import { isAgentError, ErrorCode } from "./types/errors";
import {
  withEventQueue,
  drainQueuedEvents,
  initializeEventQueue,
  cleanupEventQueue,
} from "./utils/eventQueue";

// Request validation schema
const AgentRequestSchema = z.object({
  goal: z
    .string()
    .min(1, "Goal cannot be empty")
    .max(5000, "Goal exceeds maximum length")
    .trim(),
});

/**
 * Initialize and start the agent server.
 */
async function startServer() {
  try {
    // Load and validate configuration
    const config = await loadConfig();
    console.log(
      `Configuration loaded: ${config.server.environment} mode on ${config.server.host}:${config.server.port}`,
    );

    // Initialize logging
    const logger = await initializeLogger();
    logger.info("Logger initialized");

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
    app.use(async (err: any, req: Request, res: Response, next: NextFunction) => {
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
    });

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
                details: { validationErrors: validationResult.error.issues },
              },
            } as AgentResponse);
          }

          const { goal } = validationResult.data;
          logger.info("Request validated", { goal: goal.slice(0, 100) });

          // Set response headers for streaming
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("Transfer-Encoding", "chunked");
          res.setHeader("Cache-Control", "no-cache");

          // Create a stream writer callback that sends events to client immediately
          const streamWriter = (event: any) => {
            try {
              const json = JSON.stringify(event) + "\n";
              res.write(json);
              console.log(`Streamed event to client [${requestId}]: type=${event.type}, stepId=${event.data?.stepId}`);
            } catch (error) {
              console.error(` Error writing event to response: ${error}`);
            }
          };

          // Initialize event queue with stream writer for real-time streaming
          initializeEventQueue(requestId, streamWriter);

          // Execute agent graph with event queue for streaming
          let result: any;
          let executionError: any = null;

          try {
            result = await (await graph).invoke({
              goal: goal as any,
              requestId: requestId as any,
              planAttempts: 0 as any,
              stepErrors: {} as any,
              startTime: startTime as any,
            });
          } catch (error) {
            executionError = error;
            result = null;
          }

          const duration = Date.now() - startTime;

          // If there was an execution error
          if (executionError) {
            if (isAgentError(executionError)) {
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
                    timestamp: new Date().toISOString(),
                  },
                  timestamp: new Date().toISOString(),
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
                    timestamp: new Date().toISOString(),
                  },
                  timestamp: new Date().toISOString(),
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
                    timestamp: new Date().toISOString(),
                  },
                },
                timestamp: new Date().toISOString(),
              }) + "\n",
            );

            return res.end();
          }

          // Success case - stream final text in chunks and send metadata
          logger.info("Agent execution completed successfully", {
            duration,
            hasResult: !!result?.finalResult,
            noResultsFound: result?.noResultsFound,
          });

          // Stream final text in chunks for progressive rendering
          if (result?.finalResult) {
            const finalText = result.finalResult;
            // Split into chunks of ~50 characters for smooth streaming
            const chunkSize = 50;

            for (let i = 0; i < finalText.length; i += chunkSize) {
              const chunk = finalText.slice(i, i + chunkSize);
              res.write(
                JSON.stringify({
                  type: "text",
                  data: {
                    chunk: chunk,
                    isComplete: false,
                    timestamp: new Date().toISOString(),
                  },
                  timestamp: new Date().toISOString(),
                }) + "\n",
              );
            }
          }

          res.write(
            JSON.stringify({
              type: "complete",
              data: {
                success: true,
                result: result?.finalResult,
                metadata: {
                  requestId,
                  duration,
                  noResultsFound: result?.noResultsFound,
                  timestamp: new Date().toISOString(),
                },
              },
              timestamp: new Date().toISOString(),
            }) + "\n",
          );

          // Clean up event queue after successful completion
          cleanupEventQueue(requestId);
          return res.end();
        } catch (error) {
          const duration = Date.now() - startTime;

          logger.error("Unexpected error in agent endpoint", String(error), {
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
                timestamp: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
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
                  timestamp: new Date().toISOString(),
                },
              },
              timestamp: new Date().toISOString(),
            }) + "\n",
          );

          return res.end();
        }
      },
    );

    /**
     * Health check endpoint
     */
    router.get<{}, any>("/healthz", (req: Request, res: Response) => {
      return res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
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

    // Start server
    app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `Agent server started on http://${config.server.host}:${config.server.port}/api/v1`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start server
startServer();
