import { getLogger } from "../utils/logger";
import path from "path";

let latencyLoggingInitialized = false;

export async function initializeTelemetry(): Promise<void> {
  if (latencyLoggingInitialized) {
    return;
  }

  const logger = await getLogger();
  const latencyLogFile = process.env.LATENCY_LOG_FILE ?? path.join(process.cwd(), "logs", "latency.log");
  logger.info(
    {
      channel: "latency",
      mode: "pino",
      slowThresholdMs: Number(process.env.LATENCY_SLOW_MS ?? "1200"),
      outputFile: latencyLogFile,
      toMainLog: (process.env.LATENCY_TO_MAIN_LOG ?? "false").toLowerCase() === "true",
    },
    "Latency logging initialized",
  );

  latencyLoggingInitialized = true;
}

export async function shutdownTelemetry(): Promise<void> {
  if (!latencyLoggingInitialized) {
    return;
  }

  const logger = await getLogger();
  logger.info({ channel: "latency", mode: "pino" }, "Latency logging shutdown");
  latencyLoggingInitialized = false;
}

export function registerTelemetryShutdownHooks(): void {
  process.on("SIGINT", async () => {
    await shutdownTelemetry();
  });

  process.on("SIGTERM", async () => {
    await shutdownTelemetry();
  });
}
