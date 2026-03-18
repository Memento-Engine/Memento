import pino from "pino";
import pinoHttp from "pino-http";
import { getConfig } from "../config/config";
import { captureAgentException, isSentryEnabled } from "../telemetry/sentry";
import { formatLocalTimestamp, getLocalTimeZone } from "./time";

let loggerInstance: pino.Logger | null = null;
let httpLoggerInstance: pino.Logger | null = null;

/**
 * Initialize the logger with configuration.
 * Should be called once at application startup.
 */
export async function initializeLogger(): Promise<pino.Logger> {
  if (loggerInstance) {
    return loggerInstance;
  }

  const config = await getConfig();
  const isProd = config.server.environment === "production";
  const timezone = getLocalTimeZone();

  const baseLoggerConfig: pino.LoggerOptions = {
    level: config.logging.level,
    base: {
      service: "agents",
      timezone,
    },
    timestamp: () => `,"time":"${formatLocalTimestamp()}"`,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  };

  loggerInstance = pino(
    isProd
      ? baseLoggerConfig
      : {
          ...baseLoggerConfig,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: false,
              ignore: "pid,hostname,service,timezone",
              singleLine: false,
            },
          },
        },
  );

  return loggerInstance;
}

/**
 * Get the logger instance.
 * Initializes if not already initialized.
 */
export async function getLogger(): Promise<pino.Logger> {
  if (!loggerInstance) {
    await initializeLogger();
  }
  return loggerInstance!;
}

/**
 * Get the HTTP logger middleware.
 * Initializes if not already initialized.
 */
export async function getHttpLogger() {
  if (!httpLoggerInstance) {
    const logger = await getLogger();
    httpLoggerInstance = pinoHttp({
      logger,
      customAttributeKeys: {
        req: "request",
        res: "response",
        err: "error",
        responseTime: "duration",
      },
    }) as any;
  }
  return httpLoggerInstance as any;
}

/**
 * Extended logger with context tracking.
 */
export class ContextLogger {
  constructor(private logger: pino.Logger, private context: Record<string, any> = {}) {}

  private mergeContext(metadata?: Record<string, any>) {
    return { ...this.context, ...metadata };
  }

  debug(message: string, metadata?: Record<string, any>) {
    this.logger.debug(this.mergeContext(metadata), message);
  }

  info(message: string, metadata?: Record<string, any>) {
    this.logger.info(this.mergeContext(metadata), message);
  }

  warn(message: string, metadata?: Record<string, any>) {
    this.logger.warn(this.mergeContext(metadata), message);
  }

  private extractSource(stack?: string): string | undefined {
    if (!stack) return undefined;

    const lines = stack.split("\n").map((line) => line.trim());
    const sourceLine = lines.find(
      (line) =>
        (line.includes("agents\\src") || line.includes("agents/src")) &&
        !line.includes("utils\\logger.ts") &&
        !line.includes("utils/logger.ts"),
    );

    if (!sourceLine) {
      return undefined;
    }

    return sourceLine.replace(/^at\s+/, "");
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, any>) {
    const context = this.mergeContext(metadata);

    if (isSentryEnabled()) {
      captureAgentException(error ?? new Error(message), {
        message,
        level: "error",
        extra: context,
        tags: {
          source: "agents-logger",
        },
      });
    }

    if (error instanceof Error) {
      this.logger.error(
        {
          ...context,
          error: error.message,
          stack: error.stack,
          source: this.extractSource(error.stack),
        },
        message,
      );
    } else if (error) {
      const wrapped = new Error(String(error));
      this.logger.error(
        {
          ...context,
          error: String(error),
          stack: wrapped.stack,
          source: this.extractSource(wrapped.stack),
        },
        message,
      );
    } else {
      const wrapped = new Error(message);
      this.logger.error(
        {
          ...context,
          stack: wrapped.stack,
          source: this.extractSource(wrapped.stack),
        },
        message,
      );
    }
  }

  withContext(newContext: Record<string, any>): ContextLogger {
    return new ContextLogger(this.logger, {
      ...this.context,
      ...newContext,
    });
  }
}

/**
 * Create a context logger for a specific operation.
 */
export async function createContextLogger(
  requestId: string,
  metadata?: Record<string, any>,
): Promise<ContextLogger> {
  const logger = await getLogger();
  return new ContextLogger(logger, {
    requestId,
    ...metadata,
  });
}

type LoggerMetadata = Record<string, any>;

// Export singleton for backward compatibility.
// Keep methods sync so callers can do logger.info(...) without awaiting.
export const logger = {
  debug(message: string, metadata?: LoggerMetadata): void {
    void getLogger()
      .then((l) => l.debug(metadata ?? {}, message))
      .catch(() => {
        // Avoid throwing from logging paths.
      });
  },

  info(message: string, metadata?: LoggerMetadata): void {
    void getLogger()
      .then((l) => l.info(metadata ?? {}, message))
      .catch(() => {
        // Avoid throwing from logging paths.
      });
  },

  warn(message: string, metadata?: LoggerMetadata): void {
    void getLogger()
      .then((l) => l.warn(metadata ?? {}, message))
      .catch(() => {
        // Avoid throwing from logging paths.
      });
  },

  error(message: string, error?: Error | unknown, metadata?: LoggerMetadata): void {
    void getLogger()
      .then((l) => {
        new ContextLogger(l).error(message, error, metadata);
      })
      .catch(() => {
        // Avoid throwing from logging paths.
      });
  },
};
