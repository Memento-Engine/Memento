import { getLogger } from "../utils/logger";
import path from "path";
import { getMementoSharedDir } from "@shared/config/mementoPaths";

let latencyLoggingInitialized = false;
const LATENCY_LOG_FILE = path.join(getMementoSharedDir(), "logs", "agents", "latency.log");
const LATENCY_SLOW_MS = 1200;
const LATENCY_TO_MAIN_LOG = false;

export async function initializeTelemetry(): Promise<void> {
  if (latencyLoggingInitialized) {
    return;
  }

  const logger = await getLogger();
  logger.info(
    {
      channel: "latency",
      mode: "pino",
      slowThresholdMs: LATENCY_SLOW_MS,
      outputFile: LATENCY_LOG_FILE,
      toMainLog: LATENCY_TO_MAIN_LOG,
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
