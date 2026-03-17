import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Shared pino logger for ai-gateway.
 *
 * Development  → pino-pretty with colors and human-readable timestamps
 * Production   → structured JSON (no pino-pretty overhead)
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    // Redact sensitive fields from logs
    redact: {
      paths: ["*.apiKey", "*.password", "*.token", "*.authorization", "*.secret"],
      censor: "[REDACTED]",
    },
    base: { service: "ai-gateway" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          colorizeObjects: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,service",
          levelFirst: true,
          // Custom level colors
          customColors:
            "fatal:bgRed,error:red,warn:yellow,info:cyan,debug:blue,trace:gray",
          messageFormat:
            "{msg}",
          singleLine: false,
        },
      })
    : undefined, // production: write structured JSON to stdout
);

/**
 * Create a child logger scoped to a specific module / request.
 *
 * @example
 * const log = childLogger("auth");
 * log.info("user validated");
 */
export function childLogger(
  module: string,
  bindings: Record<string, unknown> = {},
) {
  return logger.child({ module, ...bindings });
}
