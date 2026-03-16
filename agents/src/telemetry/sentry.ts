import * as Sentry from "@sentry/node";
import { getConfig } from "../config/config";

let sentryEnabled = false;
type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

function isProductionEnvironment(env: string): boolean {
  return env === "production";
}

export async function initializeSentry(): Promise<void> {
  if (sentryEnabled) {
    return;
  }

  const config = await getConfig();
  const dsn = process.env.AGENTS_SENTRY_DSN ?? process.env.SENTRY_DSN;
  const enabled = isProductionEnvironment(config.server.environment) && Boolean(dsn);

  if (!enabled || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    environment: "backend",
    release: process.env.SENTRY_RELEASE ?? "memento@1.2.0",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
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
  if (!sentryEnabled) {
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
  if (!sentryEnabled) {
    return;
  }

  await Sentry.close(timeoutMs);
  sentryEnabled = false;
}
