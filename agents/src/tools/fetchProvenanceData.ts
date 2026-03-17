/**
 * Fetch Provenance Data Tool
 * 
 * Allows the LLM to explicitly request raw data from a provenance entry
 * when compressed summaries aren't sufficient.
 * 
 * This is for DATA dependencies where the LLM needs to see actual content.
 */

import { z } from "zod";
import { Tool, ToolContext, ToolResult, toolSuccess, toolFailure } from "../types/tools";
import { getProvenanceRegistry, ProvenanceRow } from "../provenance";
import { getLogger } from "../utils/logger";
import { runWithSpan } from "../telemetry/tracing";

/**
 * Input schema for fetch_provenance_data
 */
export const FetchProvenanceInputSchema = z.object({
  provenance_ids: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Provenance IDs to fetch data from (max 5)"),
  
  fields: z
    .array(z.string())
    .optional()
    .describe("Specific fields to include (e.g., ['chunk_id', 'text_content', 'app_name']). If omitted, returns all fields."),
  
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum records per provenance (default 10, max 20)"),
  
  filter_app_names: z
    .array(z.string())
    .optional()
    .describe("Filter to specific app names"),
});

export type FetchProvenanceInput = z.infer<typeof FetchProvenanceInputSchema>;

/**
 * Output structure
 */
interface FetchProvenanceOutput {
  [provenanceId: string]: {
    record_count: number;
    records: ProvenanceRow[];
    truncated: boolean;
  };
}

/**
 * Fetch Provenance Data Tool
 * 
 * Use when:
 * - Summary isn't enough to compare/analyze data
 * - Need actual text content for detailed examination
 * - Connecting research to code (need to see both contents)
 */
export class FetchProvenanceDataTool implements Tool<FetchProvenanceInput, FetchProvenanceOutput> {
  name = "fetch_provenance_data";
  description = 
    "Fetch raw data from provenance registry when compressed summaries aren't sufficient. " +
    "Use sparingly - only when you need actual content to compare, analyze, or cite. " +
    "Returns up to 20 records per provenance.";
  inputSchema = FetchProvenanceInputSchema;

  async execute(
    input: FetchProvenanceInput,
    context: ToolContext,
  ): Promise<ToolResult<FetchProvenanceOutput>> {
    return runWithSpan(
      "agent.tool.fetch_provenance_data",
      {
        request_id: context.requestId,
        step_id: context.stepId,
        provenance_count: input.provenance_ids.length,
      },
      async () => {
        const logger = await getLogger();
        const registry = getProvenanceRegistry(context.requestId);
        
        logger.info(
          { 
            provenanceIds: input.provenance_ids,
            fields: input.fields,
            limit: input.limit,
          },
          "Fetching provenance data",
        );

        const output: FetchProvenanceOutput = {};
        let totalRecords = 0;

        for (const provId of input.provenance_ids) {
          const entry = registry.get(provId);
          
          if (!entry) {
            logger.warn({ provId }, "Provenance not found");
            output[provId] = {
              record_count: 0,
              records: [],
              truncated: false,
            };
            continue;
          }

          let records = entry.raw_data;

          // Apply app name filter
          if (input.filter_app_names && input.filter_app_names.length > 0) {
            const appSet = new Set(input.filter_app_names.map(a => a.toLowerCase()));
            records = records.filter(r => {
              const appName = String(r.app_name ?? "").toLowerCase();
              return appSet.has(appName);
            });
          }

          // Apply field filter
          if (input.fields && input.fields.length > 0) {
            records = records.map(row => {
              const filtered: ProvenanceRow = { chunk_id: row.chunk_id };
              for (const field of input.fields!) {
                if (field in row && field !== "chunk_id") {
                  filtered[field] = row[field];
                }
              }
              return filtered;
            });
          }

          // Apply limit
          const truncated = records.length > input.limit;
          records = records.slice(0, input.limit);
          
          totalRecords += records.length;

          output[provId] = {
            record_count: records.length,
            records,
            truncated,
          };
        }

        logger.info(
          { 
            provenanceCount: input.provenance_ids.length,
            totalRecords,
          },
          "Provenance data fetched",
        );

        return toolSuccess(output, {
          source: "fetch_provenance_data",
          provenanceCount: input.provenance_ids.length,
          totalRecords,
        });
      },
    );
  }
}

/**
 * Create the fetch provenance data tool instance
 */
export function createFetchProvenanceTool(): FetchProvenanceDataTool {
  return new FetchProvenanceDataTool();
}
