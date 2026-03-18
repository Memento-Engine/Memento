import { getLogger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";
import { formatLocalTimestamp, getLocalTimeZone } from "../utils/time";

type SpanAttributes = Record<string, string | number | boolean | undefined>;

const LATENCY_LOGS_ENABLED = true;
const LATENCY_TO_MAIN_LOG = false;
const LATENCY_LOG_FILE = path.join(process.cwd(), "logs", "latency.log");
const LATENCY_SLOW_MS = 1200;

function sanitizeAttributes(attributes: SpanAttributes) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  );
}

function shouldEmitLatencyLogs(): boolean {
  return LATENCY_LOGS_ENABLED;
}

function shouldEmitToMainLog(): boolean {
  return LATENCY_TO_MAIN_LOG;
}

function getLatencyLogFilePath(): string {
  return LATENCY_LOG_FILE;
}

function getSlowSpanThresholdMs(): number {
  return LATENCY_SLOW_MS;
}

let latencyFileReady = false;

async function ensureLatencyFile(): Promise<void> {
  if (latencyFileReady) {
    return;
  }

  const filePath = getLatencyLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, "", "utf-8");
  latencyFileReady = true;
}

async function writeLatencyLine(line: string): Promise<void> {
  await ensureLatencyFile();
  await fs.appendFile(getLatencyLogFilePath(), `${line}\n`, "utf-8");
}

async function emitSpanLatencyLog(
  spanName: string,
  durationMs: number,
  attributes: SpanAttributes,
  status: "ok" | "error",
): Promise<void> {
  if (!shouldEmitLatencyLogs()) {
    return;
  }

  const severity = durationMs >= getSlowSpanThresholdMs() ? "SLOW" : "INFO";
  const line = JSON.stringify({
    timestamp: formatLocalTimestamp(),
    timezone: getLocalTimeZone(),
    severity,
    span: spanName,
    status,
    duration_ms: durationMs,
    attributes,
  });

  await writeLatencyLine(line);

  if (!shouldEmitToMainLog()) {
    return;
  }

  const logger = await getLogger();
  const payload = {
    channel: "latency",
    span: spanName,
    status,
    durationMs,
    requestId: attributes.request_id,
    node: attributes.node,
    stepId: attributes.step_id,
    endpoint: attributes.endpoint,
  };

  if (durationMs >= getSlowSpanThresholdMs()) {
    logger.warn(payload, "Slow operation");
  } else {
    logger.info(payload, "Operation latency");
  }
}

export async function runWithSpan<T>(
  spanName: string,
  attributes: SpanAttributes,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await fn();
    const cleanedAttributes = sanitizeAttributes(attributes);
    await emitSpanLatencyLog(spanName, Date.now() - startedAt, cleanedAttributes, "ok");
    return result;
  } catch (error) {
    const cleanedAttributes = sanitizeAttributes(attributes);
    await emitSpanLatencyLog(spanName, Date.now() - startedAt, cleanedAttributes, "error");
    throw error;
  }
}
