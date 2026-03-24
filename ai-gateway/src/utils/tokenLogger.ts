/**
 * Token Usage Logger for AI Gateway
 * 
 * Provides clean, colored logging for token consumption per role.
 */

import { childLogger } from "./logger.ts";

const log = childLogger("tokens");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",      // Stage/Role
  green: "\x1b[32m",     // Success/under budget
  yellow: "\x1b[33m",    // Warning/near budget
  red: "\x1b[31m",       // Error/over budget
  magenta: "\x1b[35m",   // Token info
  blue: "\x1b[34m",      // Info
} as const;

/**
 * Get percentage color based on usage
 */
function getPercentColor(percent: number): string {
  if (percent <= 60) return colors.green;
  if (percent <= 85) return colors.yellow;
  return colors.red;
}

/**
 * Format token count with percentage
 */
function formatTokens(used: number, budget: number): string {
  const percent = budget > 0 ? Math.round((used / budget) * 100) : 0;
  const color = getPercentColor(percent);
  return `${color}${used.toLocaleString()}${colors.reset}/${budget.toLocaleString()} (${color}${percent}%${colors.reset})`;
}

/**
 * Log LLM chat call with token usage
 */
export function logChatCall(
  role: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  userId: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const budgetEstimate = 65536; // Approximate budget
  
  const line = [
    `${colors.magenta}[LLM]${colors.reset}`,
    `${colors.bold}${role}${colors.reset}`,
    `in=${formatTokens(promptTokens, budgetEstimate)}`,
    `out=${colors.bold}${completionTokens}${colors.reset}`,
    `total=${colors.blue}${totalTokens}${colors.reset}`,
    `${colors.dim}${durationMs}ms${colors.reset}`,
  ].join(" ");
  
  log.info({ role, promptTokens, completionTokens, totalTokens, userId, durationMs, ...metadata }, line);
}

/**
 * Log context shrinking
 */
export function logContextShrink(
  originalTokens: number,
  shrunkTokens: number,
  messagesRemoved: number,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const savedPercent = Math.round(((originalTokens - shrunkTokens) / originalTokens) * 100);
  const line = `${colors.blue}[SHRINK]${colors.reset} ${originalTokens} → ${colors.green}${shrunkTokens}${colors.reset} tokens (${colors.green}${savedPercent}%${colors.reset} saved, ${messagesRemoved} msg removed)`;
  
  log.info({ originalTokens, shrunkTokens, messagesRemoved, userId, ...metadata }, line);
}

/**
 * Log web search call
 */
export function logSearchCall(
  query: string,
  resultCount: number,
  durationMs: number,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const line = `${colors.blue}[SEARCH]${colors.reset} query="${query}" results=${colors.bold}${resultCount}${colors.reset} ${colors.dim}${durationMs}ms${colors.reset}`;
  
  log.info({ query, resultCount, durationMs, userId, ...metadata }, line);
}

/**
 * Log usage tracking
 */
export function logUsageTracked(
  role: string,
  totalTokens: number,
  tier: string,
  quotaRemaining: number | null,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const quotaInfo = quotaRemaining !== null ? ` quota=${colors.bold}${quotaRemaining}${colors.reset}` : "";
  const tierColor = tier === "premium" ? colors.green : colors.yellow;
  const line = `${colors.magenta}[USAGE]${colors.reset} ${colors.bold}${totalTokens}${colors.reset} tokens tracked (${tierColor}${tier}${colors.reset})${quotaInfo}`;
  
  log.info({ role, totalTokens, tier, quotaRemaining, userId, ...metadata }, line);
}

/**
 * Log rate limit
 */
export function logRateLimit(
  tier: string,
  reason: string,
  retryAfterMs: number | undefined,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const retryInfo = retryAfterMs ? ` retry after ${colors.bold}${(retryAfterMs / 1000).toFixed(1)}s${colors.reset}` : "";
  const line = `${colors.red}[RATE_LIMIT]${colors.reset} ${reason} (${tier})${retryInfo}`;
  
  log.warn({ tier, reason, retryAfterMs, userId, ...metadata }, line);
}

/**
 * Log validation error
 */
export function logValidationError(
  endpoint: string,
  error: string,
  metadata?: Record<string, unknown>
): void {
  const line = `${colors.red}[VALIDATION]${colors.reset} ${endpoint}: ${error}`;
  
  log.warn({ endpoint, error, ...metadata }, line);
}

/**
 * Log error in chat/search
 */
export function logChatError(
  role: string,
  error: Error | string,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : error;
  const line = `${colors.red}[ERROR]${colors.reset} ${role}: ${message}`;
  
  log.error({ role, error: message, userId, ...metadata }, line);
}
