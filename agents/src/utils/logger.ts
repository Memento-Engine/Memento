import pino from "pino";
import pinoHttp from "pino-http";
import { getConfig } from "../config/config";

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

  loggerInstance = pino(
    isProd
      ? {
          level: config.logging.level,
          formatters: {
            level: (label) => {
              return { level: label };
            },
          },
        }
      : {
          level: config.logging.level,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
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

  error(message: string, error?: Error | unknown, metadata?: Record<string, any>) {
    const context = this.mergeContext(metadata);
    if (error instanceof Error) {
      this.logger.error({ ...context, error: error.message }, message);
    } else if (error) {
      this.logger.error({ ...context, error: String(error) }, message);
    } else {
      this.logger.error(context, message);
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

// Export singleton for backward compatibility
export const logger = new Proxy(new ContextLogger(null as any), {
  async get(target, prop) {
    const actualLogger = await getLogger();
    const contextLogger = new ContextLogger(actualLogger);
    return (contextLogger as any)[prop];
  },
});
