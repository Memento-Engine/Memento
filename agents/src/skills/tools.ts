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
  SqlExecuteInput,
  SemanticSearchInput,
} from "./types";
import {
  executeSql,
  formatResultsAsJson,
  formatResultsAsMarkdown,
  validateSql,
} from "./sqlExecutor";
import { getConfig } from "../config/config";
import { getLogger } from "../utils/logger";
import { runWithSpan } from "../telemetry/tracing";
import axios from "axios";

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
          { stepId: context.stepId, sqlPreview: input.sql.slice(0, 100) },
          "Executing SQL query",
        );

        const result = await executeSql(input);

        if (!result.success) {
          return toolFailure(result.error || "SQL execution failed", {
            executionTimeMs: result.executionTimeMs,
          });
        }

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

        try {
          // Extract base URL from searchToolUrl
          const searchToolUrl = config.backend.searchToolUrl;
          const baseUrl = searchToolUrl.replace("/api/v1/search_tool", "");
          const semanticEndpoint = `${baseUrl}/api/v1/semantic_search`;

          const response = await axios.post(
            semanticEndpoint,
            {
              query: input.query,
              limit: input.limit || 20,
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

        try {
          const searchToolUrl = config.backend.searchToolUrl;
          const baseUrl = searchToolUrl.replace("/api/v1/search_tool", "");
          const hybridEndpoint = `${baseUrl}/api/v1/hybrid_search`;

          const response = await axios.post(
            hybridEndpoint,
            {
              query: input.query,
              keywords: input.keywords,
              limit: input.limit || 20,
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
            return toolFailure(data.error || "Hybrid search failed");
          }

          const results = Array.isArray(data.results)
            ? data.results
            : Array.isArray(data)
              ? data
              : [];

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
          return toolFailure(`Hybrid search error: ${errorMessage}`);
        }
      },
    );
  }
}

/**
 * Create and return all skill-based tools.
 */
export function createSkillTools(): Tool[] {
  return [
    new SqlExecuteTool(),
    new SemanticSearchTool(),
    new HybridSearchTool(),
  ];
}
