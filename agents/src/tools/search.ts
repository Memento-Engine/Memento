import axios, { AxiosError } from "axios";
import { z } from "zod";
import { Tool, ToolContext, ToolResult, toolSuccess, toolFailure } from "../types/tools";
import { DatabaseQuery, DatabaseQuerySchema } from "../planner/planner.schema";
import { getConfig } from "../config/config";
import { getLogger } from "../utils/logger";
import { ToolError, ErrorCode } from "../types/errors";

/**
 * Search tool for querying the activity database.
 * Executes database queries and returns structured results.
 */
export class SearchTool implements Tool<DatabaseQuery, any[]> {
  name = "search";
  description = "Search the activity database with structured queries";
  inputSchema = DatabaseQuerySchema;

  async execute(
    input: DatabaseQuery,
    context: ToolContext,
  ): Promise<ToolResult<any[]>> {
    const logger = await getLogger();
    const config =  await getConfig();

    logger.info("Executing search tool");

    try {
      const response = await axios.post(
        config.backend.searchToolUrl,
        input,
        {
          timeout: config.backend.timeout,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!Array.isArray(response.data)) {
        logger.warn("Invalid response format");
        return toolFailure("Search tool returned invalid response format");
      }

      logger.info("Search tool succeeded");

      return toolSuccess(response.data, {
        source: "database",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  private async handleError(error: unknown, context: ToolContext): Promise<ToolResult> {
    const logger = await getLogger();

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === "ECONNABORTED") {
        logger.error("Search backend timeout");
        return toolFailure("Search backend request timed out");
      }

      if (axiosError.response?.status === 404) {
        logger.warn("Search backend not found");
        return toolFailure("Search backend service not available (404)");
      }

      if (axiosError.response?.status === 500) {
        logger.error("Search backend error");
        return toolFailure("Search backend returned an error");
      }

      logger.error("Search tool error");

      return toolFailure(
        `Network error: ${axiosError.message}`,
        { code: axiosError.code },
      );
    }

    logger.error("Search tool unexpected error");

    return toolFailure("Unexpected error in search tool");
  }
}

/**
 * Tool factory for creating tool instances.
 */
export class ToolFactory {
  static createSearchTool(): Tool<DatabaseQuery, any[]> {
    return new SearchTool();
  }
}
