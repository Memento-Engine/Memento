import { SqlExecuteInput, SqlValidationResult } from "./types";
import { getLogger } from "../utils/logger";
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

  // Validate first
  const validation = validateSql(input.sql);
  if (!validation.valid) {
    logger.warn({ error: validation.error, sql: input.sql }, "SQL validation failed");
    return {
      success: false,
      error: validation.error,
    };
  }

  const safeSql = validation.normalized!;
  logger.debug({ sql: safeSql }, "Executing SQL");

  try {
    // Extract base URL from searchToolUrl
    const searchToolUrl = config.backend.searchToolUrl;
    const baseUrl = searchToolUrl.replace("/api/v1/search_tool", "");
    const sqlEndpoint = `${baseUrl}/api/v1/sql_execute`;

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
      return {
        success: false,
        error: data.error || "SQL execution failed (no error message)",
        executionTimeMs,
      };
    }

    const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    logger.info({ rowCount: rows.length, executionTimeMs }, "SQL executed successfully");

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
