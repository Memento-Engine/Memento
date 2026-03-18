import * as Sentry from "@sentry/node";
import { getConfig } from "../config/config";
import { logger } from "../utils/logger";

let sentryEnabled = false;
type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

export async function initializeSentry(): Promise<void> {
  if (sentryEnabled) {
    return;
  }

  const config = await getConfig();
  const dsn = "https://a291be24371ccc5399d82f2b67fe8ab3@o4511037138206720.ingest.us.sentry.io/4511064036081664";
  const enabled = config.server.environment === "production" && Boolean(dsn);

  logger.info("[Sentry] Initializing Sentry for backend with config", {
    enabled,
    environment: config.server.environment,
    hasDsn: Boolean(dsn),
  });

  if (!enabled || !dsn) {
    logger.info("[Sentry] Sentry is disabled or DSN is missing");
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    environment: "backend",
    release: "memento@1.2.0",
    tracesSampleRate: 0.1,
    initialScope: {
      tags: {
        environment: "backend",
        service: "agent",
      },
    },
  });

  sentryEnabled = true;
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}



export function captureAgentException(
  error: unknown,
  context?: {
    message?: string;
    level?: SentrySeverityLevel;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  },
): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.message) {
      scope.setContext("message", { value: context.message });
    }

    if (context?.extra) {
      scope.setExtras(context.extra);
    }

    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }

    Sentry.captureException(error);
  });
}

export async function shutdownSentry(timeoutMs = 1500): Promise<void> {
  if (!isSentryEnabled()) {
    return;
  }

  await Sentry.close(timeoutMs);
  sentryEnabled = false;
}
