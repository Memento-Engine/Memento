import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";
import { logger } from "@/utils/logger.ts";

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const R     = "\u001b[0m";   // reset
const BOLD  = "\u001b[1m";
const DIM   = "\u001b[2m";

// HTTP method → color
const METHOD_COLOR: Record<string, string> = {
  GET:     "\u001b[32m",  // green
  POST:    "\u001b[36m",  // cyan
  PUT:     "\u001b[33m",  // yellow
  PATCH:   "\u001b[35m",  // magenta
  DELETE:  "\u001b[31m",  // red
  OPTIONS: "\u001b[90m",  // grey
  HEAD:    "\u001b[90m",  // grey
};

// HTTP status → color
function statusColor(code: number): string {
  if (code >= 500) return "\u001b[31m";  // red
  if (code >= 400) return "\u001b[33m";  // yellow
  if (code >= 300) return "\u001b[36m";  // cyan
  return "\u001b[32m";                   // green
}

// Latency → color-coded badge: green < 100 ms, yellow < 500 ms, red ≥ 500 ms
function latencyBadge(ms: number): string {
  if (ms < 100) return `\u001b[32m${ms}ms${R}`;
  if (ms < 500) return `\u001b[33m${ms}ms${R}`;
  return `${BOLD}\u001b[31m${ms}ms${R}`;
}

const isDev = process.env.NODE_ENV !== "production";

// ── Message builders ──────────────────────────────────────────────────────────

function buildSuccessMsg(
  req: IncomingMessage,
  res: ServerResponse,
  responseTime: number,
): string {
  const method = req.method ?? "?";
  const url    = (req as any).originalUrl ?? req.url ?? "?";
  const status = res.statusCode;

  if (!isDev) {
    return `${method} ${url} ${status} ${responseTime}ms`;
  }

  const mc = METHOD_COLOR[method] ?? R;
  const sc = statusColor(status);

  return (
    `${BOLD}${mc}${method.padEnd(7)}${R}` +
    ` ${DIM}${url}${R}` +
    ` ${sc}${BOLD}${status}${R}` +
    ` ${latencyBadge(responseTime)}`
  );
}

function buildErrorMsg(
  req: IncomingMessage,
  res: ServerResponse,
  err: Error,
): string {
  const method = req.method ?? "?";
  const url    = (req as any).originalUrl ?? req.url ?? "?";
  const status = res.statusCode;

  if (!isDev) {
    return `${method} ${url} ${status} — ${err.message}`;
  }

  const mc = METHOD_COLOR[method] ?? R;
  const sc = statusColor(status);

  return (
    `${BOLD}${mc}${method.padEnd(7)}${R}` +
    ` ${DIM}${url}${R}` +
    ` ${sc}${BOLD}${status}${R}` +
    ` \u001b[31m— ${err.message}${R}`
  );
}

// ── Middleware ────────────────────────────────────────────────────────────────
export const httpLogger = pinoHttp({
  logger,

  // Map status codes / errors to pino log levels
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400)        return "warn";
    return "info";
  },

  // Colored message for normal responses (inc. 4xx/5xx that don't throw)
  customSuccessMessage: (req, res, responseTime) =>
    buildSuccessMsg(req as IncomingMessage, res as ServerResponse, responseTime),

  // Colored message for actual thrown errors
  customErrorMessage: (req, res, err) =>
    buildErrorMsg(req as IncomingMessage, res as ServerResponse, err),

  // Keep req/res as structured data for production JSON logs;
  // pino-pretty hides them via the `ignore` option in logger.ts
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ status: res.statusCode }),
  },

  // Suppress noisy health-check pings
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});
