import { z } from "zod";
import {
  Tool,
  ToolContext,
  ToolResult,
  toolSuccess,
  toolFailure,
} from "../types/tools";
import {
  SqlExecuteInputSchema,
  SemanticSearchInputSchema,
  CurrentDateTimeInputSchema,
  SqlExecuteInput,
  SemanticSearchInput,
  CurrentDateTimeInput,
} from "./types";
import {
  executeSql,
  formatResultsAsJson,
  formatResultsAsMarkdown,
  validateSql,
} from "./sqlExecutor";
import { getConfig } from "../config/config";
import { getHybridSearchUrl, getSemanticSearchUrl } from "../config/daemon";
import { getLogger, logSectionLine, logSeparator } from "../utils/logger";
import { runWithSpan } from "../telemetry/tracing";
import axios from "axios";

type CurrentDateTimeOutput = {
  localIso: string;
  utcIso: string;
  timezone: string;
  timezoneOffsetMinutes: number;
  localDate: string;
  localTime: string;
  unixMs: number;
};

/**
 * SQL Execution Tool
 * Executes read-only SQL queries against the database.
 * Only SELECT and WITH (CTEs) are allowed.
 */
export class SqlExecuteTool implements Tool<SqlExecuteInput, any> {
  name = "sql_execute";
  description =
    "Execute a read-only SQL query against the screen activity database. Only SELECT queries allowed.";
  inputSchema = SqlExecuteInputSchema;

  async execute(
    input: SqlExecuteInput,
    context: ToolContext,
  ): Promise<ToolResult<any>> {
    return runWithSpan(
      "agent.tool.sql_execute",
      {
        request_id: context.requestId,
        step_id: context.stepId,
      },
      async () => {
        const logger = await getLogger();

        // Pre-validate
        const validation = validateSql(input.sql);
        if (!validation.valid) {
          logger.warn({ error: validation.error }, "SQL validation failed");
          return toolFailure(`Invalid SQL: ${validation.error}`);
        }

        logger.info(
          { stepId: context.stepId, sql: input.sql },
          "Executing SQL query",
        );
        logSeparator(logger, "TOOL START | sql_execute", {
          requestId: context.requestId,
          stepId: context.stepId,
        });
        logSectionLine(logger, "CALLED TOOL sql_execute", {
          requestId: context.requestId,
          stepId: context.stepId,
          sql: input.sql,
        });

        const result = await executeSql(input);

        if (!result.success) {
          logSectionLine(logger, "RESULT TOOL sql_execute", {
            requestId: context.requestId,
            stepId: context.stepId,
            success: false,
            error: result.error,
            executionTimeMs: result.executionTimeMs,
          });
          return toolFailure(result.error || "SQL execution failed", {
            executionTimeMs: result.executionTimeMs,
          });
        }

        logSectionLine(logger, "RESULT TOOL sql_execute", {
          requestId: context.requestId,
          stepId: context.stepId,
          success: true,
          rowCount: result.rowCount,
          columns: result.columns,
          executionTimeMs: result.executionTimeMs,
        });
        logSeparator(logger, "TOOL END | sql_execute", {
          requestId: context.requestId,
          stepId: context.stepId,
        });

        return toolSuccess(formatResultsAsJson(result), {
          source: "sql_execute",
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
          columns: result.columns,
        });
      },
    );
  }
}

/**
 * Semantic Search Tool
 * Performs vector similarity search using embeddings.
 */
export class SemanticSearchTool implements Tool<SemanticSearchInput, any> {
  name = "semantic_search";
  description =
    "Search screen activity by meaning using semantic embeddings. Good for conceptual queries.";
  inputSchema = SemanticSearchInputSchema;

  async execute(
    input: SemanticSearchInput,
    context: ToolContext,
  ): Promise<ToolResult<any>> {
    return runWithSpan(
      "agent.tool.semantic_search",
      {
        request_id: context.requestId,
        step_id: context.stepId,
        query: input.query,
      },
      async () => {
        const logger = await getLogger();
        const config = await getConfig();

        logger.info(
          { stepId: context.stepId, query: input.query, limit: input.limit },
          "Executing semantic search",
        );
        logSeparator(logger, "TOOL START | semantic_search", {
          requestId: context.requestId,
          stepId: context.stepId,
        });
        logSectionLine(logger, "CALLED TOOL semantic_search", {
          requestId: context.requestId,
          stepId: context.stepId,
          query: input.query,
          limit: input.limit || 20,
          offset: input.offset ?? 0,
          filters: input.filters,
        });

        try {
          const semanticEndpoint = await getSemanticSearchUrl();

          const response = await axios.post(
            semanticEndpoint,
            {
              query: input.query,
              limit: input.limit || 20,
              offset: input.offset ?? 0,
              filters: input.filters,
            },
            {
              timeout: config.backend.timeout,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

          const data = response.data;


          if (data.success === false) {
            logSectionLine(logger, "RESULT TOOL semantic_search", {
              requestId: context.requestId,
              stepId: context.stepId,
              success: false,
              error: data.error,
            });
            return toolFailure(data.error || "Semantic search failed");
          }

          const results = Array.isArray(data.results)
            ? data.results
            : Array.isArray(data)
              ? data
              : [];

          logger.info(
            { resultCount: results.length },
            "Semantic search completed",
          );
          logSectionLine(logger, "RESULT TOOL semantic_search", {
            requestId: context.requestId,
            stepId: context.stepId,
            success: true,
            resultCount: results.length,
          });
          logSeparator(logger, "TOOL END | semantic_search", {
            requestId: context.requestId,
            stepId: context.stepId,
          });

          return toolSuccess(
            {
              success: true,
              data: results,
              metadata: {
                resultCount: results.length,
                query: input.query,
              },
            },
            {
              source: "semantic_search",
              resultCount: results.length,
            },
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error({ error: errorMessage }, "Semantic search failed");
          logSectionLine(logger, "RESULT TOOL semantic_search", {
            requestId: context.requestId,
            stepId: context.stepId,
            success: false,
            error: errorMessage,
          });
          return toolFailure(`Semantic search error: ${errorMessage}`);
        }
      },
    );
  }
}

/**
 * Hybrid Search Tool
 * Combines FTS and semantic search for optimal results.
 */
export class HybridSearchTool implements Tool<
  SemanticSearchInput & { keywords?: string[] },
  any
> {
  name = "hybrid_search";
  description = "Combined keyword and semantic search. Best for most queries.";
  inputSchema = SemanticSearchInputSchema.extend({
    keywords: z
      .array(z.string())
      .optional()
      .describe("Keywords for FTS search"),
  });

  async execute(
    input: SemanticSearchInput & { keywords?: string[] },
    context: ToolContext,
  ): Promise<ToolResult<any>> {
    return runWithSpan(
      "agent.tool.hybrid_search",
      {
        request_id: context.requestId,
        step_id: context.stepId,
      },
      async () => {
        const logger = await getLogger();
        const config = await getConfig();

        logger.info(
          {
            stepId: context.stepId,
            query: input.query,
            keywords: input.keywords,
          },
          "Executing hybrid search",
        );
        logSeparator(logger, "TOOL START | hybrid_search", {
          requestId: context.requestId,
          stepId: context.stepId,
        });
        logSectionLine(logger, "CALLED TOOL hybrid_search", {
          requestId: context.requestId,
          stepId: context.stepId,
          query: input.query,
          keywords: input.keywords,
          limit: input.limit || 20,
          offset: input.offset ?? 0,
          filters: input.filters,
        });

        try {
          const hybridEndpoint = await getHybridSearchUrl();

          const response = await axios.post(
            hybridEndpoint,
            {
              query: input.query,
              keywords: input.keywords,
              limit: input.limit || 20,
              offset: input.offset ?? 0,
              filters: input.filters,
            },
            {
              timeout: config.backend.timeout,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

          const data = response.data;

          if (data.success === false) {
            logSectionLine(logger, "RESULT TOOL hybrid_search", {
              requestId: context.requestId,
              stepId: context.stepId,
              success: false,
              error: data.error,
            });
            return toolFailure(data.error || "Hybrid search failed");
          }

          const results = Array.isArray(data.results)
            ? data.results
            : Array.isArray(data)
              ? data
              : [];

          logSectionLine(logger, "RESULT TOOL hybrid_search", {
            requestId: context.requestId,
            stepId: context.stepId,
            success: true,
            resultCount: results.length,
          });
          logSeparator(logger, "TOOL END | hybrid_search", {
            requestId: context.requestId,
            stepId: context.stepId,
          });

          return toolSuccess(
            {
              success: true,
              data: results,
              metadata: {
                resultCount: results.length,
                query: input.query,
                keywords: input.keywords,
              },
            },
            {
              source: "hybrid_search",
              resultCount: results.length,
            },
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error({ error: errorMessage }, "Hybrid search failed");
          logSectionLine(logger, "RESULT TOOL hybrid_search", {
            requestId: context.requestId,
            stepId: context.stepId,
            success: false,
            error: errorMessage,
          });
          return toolFailure(`Hybrid search error: ${errorMessage}`);
        }
      },
    );
  }
}

/**
 * Current DateTime Tool
 * Returns user machine local date/time with timezone metadata.
 */
export class CurrentDateTimeTool implements Tool<CurrentDateTimeInput, CurrentDateTimeOutput> {
  name = "current_datetime";
  description =
    "Get the current date and time from the user's machine, including local timezone.";
  inputSchema = CurrentDateTimeInputSchema;

  async execute(
    _input: CurrentDateTimeInput,
    context: ToolContext,
  ): Promise<ToolResult<CurrentDateTimeOutput>> {
    return runWithSpan(
      "agent.tool.current_datetime",
      {
        request_id: context.requestId,
        step_id: context.stepId,
      },
      async () => {
        const logger = await getLogger();
        const now = new Date();

        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
        const localDate = now.toLocaleDateString("en-CA");
        const localTime = now.toLocaleTimeString("en-GB", { hour12: false });

        const payload: CurrentDateTimeOutput = {
          localIso: now.toString(),
          utcIso: now.toISOString(),
          timezone: timeZone,
          timezoneOffsetMinutes: -now.getTimezoneOffset(),
          localDate,
          localTime,
          unixMs: now.getTime(),
        };

        logSeparator(logger, "TOOL START | current_datetime", {
          requestId: context.requestId,
          stepId: context.stepId,
        });
        logSectionLine(logger, "CALLED TOOL current_datetime", {
          requestId: context.requestId,
          stepId: context.stepId,
        });
        logSectionLine(logger, "RESULT TOOL current_datetime", {
          requestId: context.requestId,
          stepId: context.stepId,
          timezone: payload.timezone,
          localDate: payload.localDate,
          localTime: payload.localTime,
        });
        logSeparator(logger, "TOOL END | current_datetime", {
          requestId: context.requestId,
          stepId: context.stepId,
        });

        return toolSuccess(payload, {
          source: "current_datetime",
          timezone: payload.timezone,
          localDate: payload.localDate,
          localTime: payload.localTime,
        });
      },
    );
  }
}

/**
 * Create and return all skill-based tools.
 */
export function createSkillTools(): Tool[] {
  return [
    new CurrentDateTimeTool(),
    new SqlExecuteTool(),
    new SemanticSearchTool(),
    new HybridSearchTool(),
  ];
}
