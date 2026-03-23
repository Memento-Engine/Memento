/**
 * Token Usage Tracker
 * 
 * Tracks token consumption across agent pipeline stages with colored logging.
 * Provides percentage-based visibility into token budgets at each stage.
 */

import { getLogger } from "./logger";

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  
  // Stage colors
  cyan: "\x1b[36m",      // Stage headers
  green: "\x1b[32m",     // Success/under budget
  yellow: "\x1b[33m",    // Warning/near budget
  red: "\x1b[31m",       // Error/over budget
  magenta: "\x1b[35m",   // LLM calls
  blue: "\x1b[34m",      // Tools
  white: "\x1b[37m",     // Info
  gray: "\x1b[90m",      // Dim info
} as const;

type TokenStage = 
  | "chatContext"
  | "classifier"
  | "planner"
  | "react"
  | "finalLlm"
  | "total";

interface StageUsage {
  inputTokens: number;
  outputTokens: number;
  budget: number;
}

interface RequestTokens {
  stages: Map<TokenStage, StageUsage>;
  llmCalls: number;
  startTime: number;
}

// Per-request token tracking
const requestTokens = new Map<string, RequestTokens>();

/**
 * Initialize token tracking for a request
 */
export function initTokenTracker(requestId: string): void {
  requestTokens.set(requestId, {
    stages: new Map(),
    llmCalls: 0,
    startTime: Date.now(),
  });
}

/**
 * Record token usage for a stage
 */
export function recordTokenUsage(
  requestId: string,
  stage: TokenStage,
  inputTokens: number,
  outputTokens: number,
  budget: number
): void {
  const tracker = requestTokens.get(requestId);
  if (!tracker) return;
  
  const existing = tracker.stages.get(stage) ?? { inputTokens: 0, outputTokens: 0, budget };
  tracker.stages.set(stage, {
    inputTokens: existing.inputTokens + inputTokens,
    outputTokens: existing.outputTokens + outputTokens,
    budget,
  });
  tracker.llmCalls++;
}

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
 * Log stage entry with token budget info
 */
export async function logStageStart(
  requestId: string,
  stage: string,
  details?: Record<string, unknown>
): Promise<void> {
  const logger = await getLogger();
  const line = `${colors.cyan}[${stage}]${colors.reset} ${colors.dim}start${colors.reset}`;
  
  if (details && Object.keys(details).length > 0) {
    logger.info({ requestId, stage, ...details }, line);
  } else {
    logger.info({ requestId, stage }, line);
  }
}

/**
 * Log LLM call with token usage
 */
export async function logLlmCall(
  requestId: string,
  role: string,
  inputTokens: number,
  outputTokens: number,
  budget: number,
  durationMs: number
): Promise<void> {
  const logger = await getLogger();
  const total = inputTokens + outputTokens;
  
  const line = [
    `${colors.magenta}[LLM]${colors.reset}`,
    `${colors.bold}${role}${colors.reset}`,
    `in=${formatTokens(inputTokens, budget)}`,
    `out=${colors.white}${outputTokens}${colors.reset}`,
    `${colors.dim}${durationMs}ms${colors.reset}`,
  ].join(" ");
  
  logger.info({ requestId, role, inputTokens, outputTokens, budget, durationMs }, line);
}

/**
 * Log tool invocation
 */
export async function logToolCall(
  requestId: string,
  tool: string,
  resultCount: number,
  durationMs: number
): Promise<void> {
  const logger = await getLogger();
  const line = `${colors.blue}[TOOL]${colors.reset} ${tool} results=${resultCount} ${colors.dim}${durationMs}ms${colors.reset}`;
  logger.info({ requestId, tool, resultCount, durationMs }, line);
}

/**
 * Log stage completion with summary
 */
export async function logStageEnd(
  requestId: string,
  stage: string,
  inputTokens: number,
  outputTokens: number,
  budget: number,
  details?: Record<string, unknown>
): Promise<void> {
  const logger = await getLogger();
  const percent = budget > 0 ? Math.round((inputTokens / budget) * 100) : 0;
  const color = getPercentColor(percent);
  
  const line = `${colors.cyan}[${stage}]${colors.reset} ${color}done${colors.reset} tokens=${formatTokens(inputTokens, budget)} out=${outputTokens}`;
  
  logger.info({ requestId, stage, inputTokens, outputTokens, budget, percent, ...details }, line);
}

/**
 * Log request summary with all stage totals
 */
export async function logRequestSummary(requestId: string): Promise<void> {
  const logger = await getLogger();
  const tracker = requestTokens.get(requestId);
  
  if (!tracker) {
    logger.warn({ requestId }, "No token tracking data for request");
    return;
  }
  
  const elapsed = Date.now() - tracker.startTime;
  let totalInput = 0;
  let totalOutput = 0;
  
  const stageLines: string[] = [];
  for (const [stage, usage] of tracker.stages) {
    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;
    const percent = usage.budget > 0 ? Math.round((usage.inputTokens / usage.budget) * 100) : 0;
    const color = getPercentColor(percent);
    stageLines.push(`  ${stage}: ${color}${percent}%${colors.reset} (${usage.inputTokens}/${usage.budget})`);
  }
  
  const header = `${colors.cyan}${colors.bold}[SUMMARY]${colors.reset} requestId=${requestId.slice(0, 8)}...`;
  const stats = `  llmCalls=${tracker.llmCalls} totalTokens=${totalInput + totalOutput} elapsed=${elapsed}ms`;
  
  logger.info(
    { 
      requestId, 
      llmCalls: tracker.llmCalls, 
      totalInputTokens: totalInput, 
      totalOutputTokens: totalOutput, 
      elapsedMs: elapsed 
    },
    [header, stats, ...stageLines].join("\n")
  );
  
  // Cleanup
  requestTokens.delete(requestId);
}

/**
 * Log final query completion summary with total and last stage tokens
 */
export async function logFinalQuerySummary(requestId: string, durationMs: number): Promise<void> {
  const logger = await getLogger();
  const tracker = requestTokens.get(requestId);
  
  if (!tracker) {
    logger.warn({ requestId }, "No token tracking data for request");
    return;
  }
  
  let totalInput = 0;
  let totalOutput = 0;
  let lastStageInput = 0;
  let lastStageOutput = 0;
  
  for (const [stage, usage] of tracker.stages) {
    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;
    
    // Track last stage (finalLlm)
    if (stage === "finalLlm") {
      lastStageInput = usage.inputTokens;
      lastStageOutput = usage.outputTokens;
    }
  }
  
  const totalTokens = totalInput + totalOutput;
  const lastStageTokens = lastStageInput + lastStageOutput;
  
  // Determine color based on total consumption
  const totalColor = totalTokens <= 8000 ? colors.green : totalTokens <= 12000 ? colors.yellow : colors.red;
  
  const header = `${colors.cyan}${colors.bold}╔════════════════════════════════════════╗${colors.reset}`;
  const title = `${colors.cyan}${colors.bold}║  QUERY COMPLETE - TOKEN SUMMARY${colors.reset}${' '.repeat(4)}${colors.cyan}║${colors.reset}`;
  const sep = `${colors.cyan}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const totalLine = `${colors.cyan}║${colors.reset} Total Tokens Consumed: ${totalColor}${colors.bold}${totalTokens.toLocaleString()}${colors.reset}${' '.repeat(Math.max(0, 15 - String(totalTokens).length))} ${colors.cyan}║${colors.reset}`;
  const lastLine = `${colors.cyan}║${colors.reset} Final LLM Stage:       ${colors.blue}${lastStageTokens.toLocaleString()}${colors.reset}${' '.repeat(Math.max(0, 15 - String(lastStageTokens).length))} ${colors.cyan}║${colors.reset}`;
  const durationLine = `${colors.cyan}║${colors.reset} Request Duration:      ${colors.white}${durationMs}ms${colors.reset}${' '.repeat(Math.max(0, 18 - String(durationMs).length))} ${colors.cyan}║${colors.reset}`;
  const llmCallsLine = `${colors.cyan}║${colors.reset} LLM Calls Made:        ${colors.magenta}${tracker.llmCalls}${colors.reset}${' '.repeat(Math.max(0, 19 - String(tracker.llmCalls).length))} ${colors.cyan}║${colors.reset}`;
  
  const footer = `${colors.cyan}${colors.bold}╚════════════════════════════════════════╝${colors.reset}`;
  
  logger.info(
    { 
      requestId, 
      totalTokens,
      lastStageTokens,
      durationMs,
      llmCalls: tracker.llmCalls
    },
    [header, title, sep, totalLine, lastLine, durationLine, llmCallsLine, footer].join("\n")
  );
  
  // Cleanup
  requestTokens.delete(requestId);
}

/**
 * Clean up token tracker without logging summary (for error paths)
 */
export function cleanupTokenTracker(requestId: string): void {
  requestTokens.delete(requestId);
}

/**
 * Log error with context
 */
export async function logError(
  requestId: string,
  stage: string,
  error: Error | string,
  details?: Record<string, unknown>
): Promise<void> {
  const logger = await getLogger();
  const message = error instanceof Error ? error.message : error;
  const line = `${colors.red}[ERROR]${colors.reset} ${stage}: ${message}`;
  logger.error({ requestId, stage, error: message, ...details }, line);
}

/**
 * Simple colored info log
 */
export async function logInfo(
  requestId: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const logger = await getLogger();
  logger.info({ requestId, ...details }, `${colors.dim}${message}${colors.reset}`);
}

/**
 * Log warning
 */
export async function logWarn(
  requestId: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const logger = await getLogger();
  logger.warn({ requestId, ...details }, `${colors.yellow}[WARN]${colors.reset} ${message}`);
}

/**
 * Log raw chat history at query start
 */
export async function logChatHistoryStart(
  requestId: string,
  goal: string,
  chatHistory: Array<{ role: string; content: string }> | undefined,
): Promise<void> {
  const logger = await getLogger();
  
  const header = `${colors.cyan}${colors.bold}╔════════════════════════════════════════╗${colors.reset}`;
  const title = `${colors.cyan}${colors.bold}║  QUERY STARTED - CHAT HISTORY${colors.reset}${' '.repeat(6)}${colors.cyan}║${colors.reset}`;
  const sep = `${colors.cyan}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const goalLine = `${colors.cyan}║${colors.reset} ${colors.bold}User Goal:${colors.reset}`;
  const goalContent = goal.length > 70 ? goal.slice(0, 67) + "..." : goal;
  const goalPadding = ' '.repeat(Math.max(0, 36 - goalContent.length));
  const goalDisplay = `${colors.cyan}║${colors.reset}   ${colors.green}${goalContent}${colors.reset}${goalPadding} ${colors.cyan}║${colors.reset}`;
  
  const historyCountLine = `${colors.cyan}║${colors.reset} ${colors.bold}History:${colors.reset} ${colors.white}${chatHistory?.length ?? 0} messages${colors.reset}${' '.repeat(Math.max(0, 22 - String(chatHistory?.length ?? 0).length))} ${colors.cyan}║${colors.reset}`;
  const sep2 = `${colors.cyan}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const lines: string[] = [header, title, sep, goalLine, goalDisplay, historyCountLine, sep2];
  
  if (chatHistory && chatHistory.length > 0) {
    for (let i = 0; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      const roleColor = msg.role === "user" ? colors.blue : colors.magenta;
      const roleLabel = `${i + 1}. ${msg.role.toUpperCase()}`;
      const contentPreview = msg.content.length > 60 ? msg.content.slice(0, 57) + "..." : msg.content;
      
      lines.push(`${colors.cyan}║${colors.reset} ${roleColor}${roleLabel}:${colors.reset}\n${colors.cyan}║${colors.reset}   ${contentPreview}`);
    }
  } else {
    lines.push(`${colors.cyan}║${colors.reset} ${colors.dim}(no prior conversation)${colors.reset}`);
  }
  
  const footer = `${colors.cyan}${colors.bold}╚════════════════════════════════════════╝${colors.reset}`;
  lines.push(footer);
  
  logger.info(
    { 
      requestId,
      goal,
      messageCount: chatHistory?.length ?? 0,
      fullHistory: chatHistory,
    },
    lines.join("\n")
  );
}

/**
 * Log when chat summarization is triggered
 */
export async function logSummarizationTriggered(
  requestId: string,
  reason: string,
  oldTokens: number,
  newSummaryTokens: number,
  existingSummary: string,
  newSummary: string,
): Promise<void> {
  const logger = await getLogger();
  
  const header = `${colors.yellow}${colors.bold}╔════════════════════════════════════════╗${colors.reset}`;
  const title = `${colors.yellow}${colors.bold}║  CHAT SUMMARIZATION TRIGGERED${colors.reset}${' '.repeat(5)}${colors.yellow}║${colors.reset}`;
  const sep = `${colors.yellow}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const reasonLine = `${colors.yellow}║${colors.reset} ${colors.bold}Reason:${colors.reset} ${reason}`;
  const reasonPadding = ' '.repeat(Math.max(0, 31 - reason.length));
  const reasonDisplay = `${colors.yellow}║${colors.reset} ${colors.bold}Reason:${colors.reset} ${reason}${reasonPadding} ${colors.yellow}║${colors.reset}`;
  
  const tokenLine = `${colors.yellow}║${colors.reset} ${colors.bold}Old Context:${colors.reset} ${colors.red}${oldTokens}${colors.reset} tokens`;
  const tokenPadding = ' '.repeat(Math.max(0, 22 - String(oldTokens).length));
  const tokenDisplay = `${colors.yellow}║${colors.reset} ${colors.bold}Old Context:${colors.reset} ${colors.red}${oldTokens}${colors.reset} tokens${tokenPadding} ${colors.yellow}║${colors.reset}`;
  
  const newSummaryLine = `${colors.yellow}║${colors.reset} ${colors.bold}New Summary:${colors.reset} ${colors.green}${newSummaryTokens}${colors.reset} tokens`;
  const newSummaryPadding = ' '.repeat(Math.max(0, 22 - String(newSummaryTokens).length));
  const newSummaryDisplay = `${colors.yellow}║${colors.reset} ${colors.bold}New Summary:${colors.reset} ${colors.green}${newSummaryTokens}${colors.reset} tokens${newSummaryPadding} ${colors.yellow}║${colors.reset}`;
  
  const sep2 = `${colors.yellow}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const lines: string[] = [
    header,
    title,
    sep,
    reasonDisplay,
    tokenDisplay,
    newSummaryDisplay,
    sep2,
    `${colors.yellow}║${colors.reset} ${colors.bold}${colors.dim}Previous Summary:${colors.reset}`,
    `${colors.yellow}║${colors.reset}   ${existingSummary || colors.dim + "(empty)" + colors.reset}`,
    `${colors.yellow}║${colors.reset}`,
    `${colors.yellow}║${colors.reset} ${colors.bold}${colors.dim}New Summary:${colors.reset}`,
    `${colors.yellow}║${colors.reset}   ${newSummary}`,
  ];
  
  const footer = `${colors.yellow}${colors.bold}╚════════════════════════════════════════╝${colors.reset}`;
  lines.push(footer);
  
  logger.info(
    { 
      requestId,
      reason,
      oldTokens,
      newSummaryTokens,
      existingSummary,
      newSummary,
    },
    lines.join("\n")
  );
}

/**
 * Log final formatted chat context for this query
 */
export async function logFormattedChatContext(
  requestId: string,
  formattedContext: string,
  totalTokens: number,
  summarizationPerformed: boolean,
): Promise<void> {
  const logger = await getLogger();
  
  const header = `${colors.blue}${colors.bold}╔════════════════════════════════════════╗${colors.reset}`;
  const title = `${colors.blue}${colors.bold}║  CHAT CONTEXT WINDOW${colors.reset}${' '.repeat(14)}${colors.blue}║${colors.reset}`;
  const sep = `${colors.blue}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const tokenLine = `${colors.blue}║${colors.reset} ${colors.bold}Tokens:${colors.reset} ${colors.white}${totalTokens}${colors.reset}/1500${' '.repeat(Math.max(0, 20 - String(totalTokens).length))} ${colors.blue}║${colors.reset}`;
  const summarizedLine = `${colors.blue}║${colors.reset} ${colors.bold}Summarized:${colors.reset} ${summarizationPerformed ? colors.green + "Yes" + colors.reset : colors.dim + "No" + colors.reset}${' '.repeat(Math.max(0, 24 - (summarizationPerformed ? 3 : 2)))} ${colors.blue}║${colors.reset}`;
  const sep2 = `${colors.blue}${colors.bold}╠════════════════════════════════════════╣${colors.reset}`;
  
  const contextLines = formattedContext.split("\n").map(line => 
    `${colors.blue}║${colors.reset} ${line}`
  );
  
  const footer = `${colors.blue}${colors.bold}╚════════════════════════════════════════╝${colors.reset}`;
  
  const lines: string[] = [
    header,
    title,
    sep,
    tokenLine,
    summarizedLine,
    sep2,
    ...contextLines,
    footer,
  ];
  
  logger.info(
    { 
      requestId,
      totalTokens,
      summarizationPerformed,
      contextLength: formattedContext.length,
    },
    lines.join("\n")
  );
}
