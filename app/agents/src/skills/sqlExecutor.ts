import { SqlExecuteInput, SqlValidationResult } from "./types";
import { getSqlExecuteUrl } from "../config/daemon";
import { getLogger, logSectionLine, logSeparator } from "../utils/logger";
import { getConfig } from "../config/config";
import axios from "axios";

/**
 * Forbidden SQL keywords that indicate write operations.
 */
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "REPLACE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
];

/**
 * Maximum rows allowed in a query result.
 */
const MAX_ROWS = 100;

/**
 * Default LIMIT to add if query doesn't have one.
 */
const DEFAULT_LIMIT = 50;

const FTS_OPERATORS = new Set(["AND", "OR", "NOT", "NEAR"]);

function quoteFtsTokenIfNeeded(token: string): string {
  if (!token) return token;

  // Preserve leading/trailing parentheses around a token.
  const leadingParens = token.match(/^\(+/)?.[0] ?? "";
  const trailingParens = token.match(/\)+$/)?.[0] ?? "";
  const core = token.slice(leadingParens.length, token.length - trailingParens.length);

  if (!core) return token;
  if (FTS_OPERATORS.has(core.toUpperCase())) return token;
  if ((core.startsWith('"') && core.endsWith('"')) || core === "*") return token;

  // Keep FTS prefix wildcard outside quotes: foo* => "foo"*
  const hasWildcard = core.endsWith("*");
  const bare = hasWildcard ? core.slice(0, -1) : core;

  // Quote tokens containing punctuation that FTS parsers treat as operators/syntax.
  if (/[.:/@-]/.test(bare)) {
    const escaped = bare.replace(/"/g, "");
    return `${leadingParens}"${escaped}"${hasWildcard ? "*" : ""}${trailingParens}`;
  }

  return token;
}

function normalizeFtsMatchExpressions(sql: string): string {
  // Normalize single-quoted MATCH expressions: chunks_fts MATCH '...'
  return sql.replace(/\bMATCH\s*'([^']*)'/gi, (_full, expr: string) => {
    const normalizedExpr = expr
      .split(/(\s+)/)
      .map((part) => (part.trim() ? quoteFtsTokenIfNeeded(part) : part))
      .join("");

    return `MATCH '${normalizedExpr}'`;
  });
}

/**
 * Validate that a SQL query is read-only and safe to execute.
 */
export function validateSql(sql: string): SqlValidationResult {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Must start with SELECT or WITH (for CTEs)
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return {
      valid: false,
      error: "Query must start with SELECT or WITH (CTEs)",
    };
  }

  // Check for forbidden keywords
  for (const keyword of FORBIDDEN_KEYWORDS) {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return {
        valid: false,
        error: `Query contains forbidden operation: ${keyword}`,
      };
    }
  }

  // Check for suspicious patterns
  if (sql.includes(";") && sql.indexOf(";") < sql.length - 1) {
    // Multiple statements
    return {
      valid: false,
      error: "Multiple SQL statements are not allowed",
    };
  }

  // Check for SQL injection patterns
  if (/--(?!>)/.test(sql) || /\/\*/.test(sql)) {
    // SQL comments (except HTML-like -->)
    return {
      valid: false,
      error: "SQL comments are not allowed",
    };
  }

  // Enforce LIMIT clause
  let normalized = trimmed;
  if (!/\bLIMIT\s+\d+/i.test(sql)) {
    // Add default LIMIT
    normalized = `${trimmed.replace(/;?\s*$/, "")} LIMIT ${DEFAULT_LIMIT}`;
  } else {
    // Check existing LIMIT isn't too high
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      if (limit > MAX_ROWS) {
        normalized = sql.replace(
          /\bLIMIT\s+\d+/i,
          `LIMIT ${MAX_ROWS}`
        );
      }
    }
  }

  // Normalize FTS MATCH expressions to avoid parser errors on dotted domains, URLs, etc.
  normalized = normalizeFtsMatchExpressions(normalized);

  return {
    valid: true,
    normalized: normalized.replace(/;\s*$/, ""), // Remove trailing semicolon
  };
}

/**
 * SQL execution result from the backend.
 */
export interface SqlExecuteResult {
  success: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Execute a validated SQL query against the database.
 * This calls the backend daemon's SQL execution endpoint.
 */
export async function executeSql(input: SqlExecuteInput): Promise<SqlExecuteResult> {
  const logger = await getLogger();
  const config = await getConfig();
  const startTime = Date.now();

  logSeparator(logger, "SQL EXECUTION START", {
    sql: input.sql,
  });
  logSectionLine(logger, "CALLED sqlExecutor.executeSql", {
    sql: input.sql,
  });

  // Validate first
  const validation = validateSql(input.sql);
  if (!validation.valid) {
    logger.warn({ error: validation.error, sql: input.sql }, "SQL validation failed");
    logSectionLine(logger, "RESULT sqlExecutor.executeSql", {
      success: false,
      error: validation.error,
    });
    return {
      success: false,
      error: validation.error,
    };
  }

  const safeSql = validation.normalized!;
  logger.debug({ sql: safeSql }, "Executing SQL");

  try {
    const sqlEndpoint = await getSqlExecuteUrl();

    logSectionLine(logger, "CALLED backend /api/v1/sql_execute", {
      endpoint: sqlEndpoint,
      timeoutMs: config.backend.timeout,
    });

    const response = await axios.post(
      sqlEndpoint,
      { sql: safeSql },
      {
        timeout: config.backend.timeout,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const executionTimeMs = Date.now() - startTime;
    const data = response.data;

    logger.debug({ status: response.status, data: JSON.stringify(data).slice(0, 500) }, "SQL endpoint response");

    if (data.success === false) {
      logSectionLine(logger, "RESULT sqlExecutor.executeSql", {
        success: false,
        error: data.error || "SQL execution failed (no error message)",
        executionTimeMs,
      });
      return {
        success: false,
        error: data.error || "SQL execution failed (no error message)",
        executionTimeMs,
      };
    }

    const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    logger.info({ rowCount: rows.length, executionTimeMs }, "SQL executed successfully");
    logSectionLine(logger, "RESULT sqlExecutor.executeSql", {
      success: true,
      rowCount: rows.length,
      columns,
      executionTimeMs,
    });
    logSeparator(logger, "SQL EXECUTION END", {
      success: true,
      rowCount: rows.length,
    });

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    
    // Extract error message from axios error response or error object
    let errorMessage: string;
    if (axios.isAxiosError(error) && error.response?.data) {
      const data = error.response.data;
      errorMessage = data.error || data.message || JSON.stringify(data);
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    logger.error({ error: errorMessage, sql: safeSql }, "SQL execution failed");
    logSectionLine(logger, "RESULT sqlExecutor.executeSql", {
      success: false,
      error: errorMessage,
      executionTimeMs,
    });
    logSeparator(logger, "SQL EXECUTION END", {
      success: false,
      error: errorMessage,
    });

    return {
      success: false,
      error: `SQL execution error: ${errorMessage}`,
      executionTimeMs,
    };
  }
}

/**
 * Format SQL results as a markdown table for LLM consumption.
 */
export function formatResultsAsMarkdown(result: SqlExecuteResult): string {
  if (!result.success) {
    return `**Error:** ${result.error}`;
  }

  if (!result.rows || result.rows.length === 0) {
    return "No results found.";
  }

  const columns = result.columns || Object.keys(result.rows[0]);
  
  // Header row
  let md = `| ${columns.join(" | ")} |\n`;
  md += `| ${columns.map(() => "---").join(" | ")} |\n`;

  // Data rows
  for (const row of result.rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "";
      // Escape pipe characters and truncate long values
      const str = String(val).replace(/\|/g, "\\|");
      return str.length > 100 ? str.slice(0, 100) + "..." : str;
    });
    md += `| ${values.join(" | ")} |\n`;
  }

  md += `\n*${result.rowCount} rows returned in ${result.executionTimeMs}ms*`;

  return md;
}

/**
 * Format SQL results as structured data for further processing.
 */
export function formatResultsAsJson(result: SqlExecuteResult): {
  success: boolean;
  data: Record<string, unknown>[];
  metadata: {
    rowCount: number;
    columns: string[];
    executionTimeMs: number;
  };
  error?: string;
} {
  if (!result.success) {
    return {
      success: false,
      data: [],
      metadata: {
        rowCount: 0,
        columns: [],
        executionTimeMs: result.executionTimeMs || 0,
      },
      error: result.error,
    };
  }

  return {
    success: true,
    data: result.rows || [],
    metadata: {
      rowCount: result.rowCount || 0,
      columns: result.columns || [],
      executionTimeMs: result.executionTimeMs || 0,
    },
  };
}
