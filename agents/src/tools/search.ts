import axios, { AxiosError } from "axios";
import { Tool, ToolContext, ToolResult, toolSuccess, toolFailure } from "../types/tools";
import { ResolvedQuery, ResolvedQuerySchema } from "../executor/query.schema";
import { getConfig } from "../config/config";
import { getLogger } from "../utils/logger";
import { runWithSpan } from "../telemetry/tracing";

/**
 * Search tool for querying the activity database.
 * Executes resolved (concrete) queries and returns structured results.
 */
export class SearchTool implements Tool<ResolvedQuery, any[]> {
  name = "search";
  description = "Search the activity database with structured queries";
  inputSchema = ResolvedQuerySchema;

  async execute(input: ResolvedQuery, context: ToolContext): Promise<ToolResult<any[]>> {
    return runWithSpan(
      "agent.tool.search.execute",
      {
        request_id: context.requestId,
        step_id: context.stepId,
        attempt: context.attemptNumber,
      },
      async () => {
        const logger = await getLogger();
        const config = await getConfig();

        logger.info("Executing search tool");

        try {
          const response = await axios.post(config.backend.searchToolUrl, input, {
            timeout: config.backend.timeout,
            headers: {
              "Content-Type": "application/json",
            },
          });

          const payload = response.data as ToolResult<any[]> | any[];

          console.log("Search tool response", { payload });

          if (Array.isArray(payload)) {
            logger.info("Search tool succeeded (legacy response format)");
            return toolSuccess(payload, {
              source: "database",
              timestamp: new Date().toISOString(),
            });
          }

          if (payload && typeof payload === "object" && "success" in payload) {
            const envelope = payload as ToolResult<any[]>;

            const parsedError =
              typeof envelope.error === "string" ? { message: envelope.error } : envelope.error;

            if (!envelope.success) {
              const errMsg = parsedError?.message ?? "Search backend returned an error";
              return toolFailure(`Search backend error: ${errMsg}`, {
                code: parsedError?.code,
                stage: parsedError?.stage,
                details: parsedError?.details,
                backendMetadata: envelope.metadata,
              });
            }

            if (!Array.isArray(envelope.data)) {
              logger.warn(
                { responseType: typeof envelope.data },
                "Invalid response data in tool envelope"
              );
              return toolFailure("Search backend returned invalid data payload", {
                backendMetadata: envelope.metadata,
              });
            }

            logger.info(
              {
                rowCount: envelope.data.length,
                metadata: envelope.metadata,
              },
              "Search tool succeeded"
            );

            return toolSuccess(envelope.data, {
              source: "database",
              timestamp: new Date().toISOString(),
              backendMetadata: envelope.metadata,
            });
          }

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
          console.log("Search tool error Failed", error);

          return this.handleError(error, context);
        }
      }
    );
  }

  private async handleError(error: unknown, context: ToolContext): Promise<ToolResult> {
    const logger = await getLogger();

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as ToolResult<any[]> | undefined;
      const parsedError =
        typeof responseData?.error === "string"
          ? { message: responseData.error }
          : responseData?.error;
      const backendMessage = parsedError?.message;
      const backendCode = parsedError?.code;
      const backendStage = parsedError?.stage;
      const backendDetails = parsedError?.details;

      if (axiosError.code === "ECONNABORTED") {
        logger.error("Search backend timeout");
        return toolFailure("Search backend request timed out");
      }

      if (axiosError.response?.status === 404) {
        logger.warn("Search backend not found");
        return toolFailure("Search backend service not available (404)");
      }

      if (axiosError.response?.status === 500) {
        logger.error("Search backend error", undefined, {
          backendCode,
          backendStage,
          backendDetails,
        });
        return toolFailure(
          backendMessage
            ? `Search backend returned an error: ${backendMessage}`
            : "Search backend returned an error",
          {
            code: backendCode,
            stage: backendStage,
            details: backendDetails,
          }
        );
      }

      logger.error("Search tool error");

      return toolFailure(`Network error: ${axiosError.message}`, { code: axiosError.code });
    }

    logger.error("Search tool unexpected error");

    return toolFailure("Unexpected error in search tool");
  }
}

/**
 * Tool factory for creating tool instances.
 */
export class ToolFactory {
  static createSearchTool(): Tool<ResolvedQuery, any[]> {
    return new SearchTool();
  }
}
