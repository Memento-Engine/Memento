import { getLogger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";

type SpanAttributes = Record<string, string | number | boolean | undefined>;

function sanitizeAttributes(attributes: SpanAttributes) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  );
}

function shouldEmitLatencyLogs(): boolean {
  return (process.env.LATENCY_LOGS ?? "true").toLowerCase() !== "false";
}

function shouldEmitToMainLog(): boolean {
  return (process.env.LATENCY_TO_MAIN_LOG ?? "false").toLowerCase() === "true";
}

function getLatencyLogFilePath(): string {
  return process.env.LATENCY_LOG_FILE ?? path.join(process.cwd(), "logs", "latency.log");
}

function getSlowSpanThresholdMs(): number {
  const parsed = Number(process.env.LATENCY_SLOW_MS ?? "1200");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1200;
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

  const now = new Date().toISOString();
  const severity = durationMs >= getSlowSpanThresholdMs() ? "SLOW" : "INFO";
  const line = [
    `${now}`,
    `[${severity}]`,
    `span=${spanName}`,
    `status=${status}`,
    `duration_ms=${durationMs}`,
    attributes.request_id ? `request_id=${attributes.request_id}` : "",
    attributes.node ? `node=${attributes.node}` : "",
    attributes.step_id ? `step_id=${attributes.step_id}` : "",
    attributes.endpoint ? `endpoint=${attributes.endpoint}` : "",
  ]
    .filter(Boolean)
    .join(" ");

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
  const cleanedAttributes = sanitizeAttributes(attributes);

  try {
    const result = await fn();
    await emitSpanLatencyLog(spanName, Date.now() - startedAt, cleanedAttributes, "ok");
    return result;
  } catch (error) {
    await emitSpanLatencyLog(spanName, Date.now() - startedAt, cleanedAttributes, "error");
    throw error;
  }
}
