import { z } from "zod";

/*
============================================================
EXECUTION-TIME QUERY SCHEMA
============================================================

Fully concrete database query. No placeholders ever.
Built at execution time by the query-builder LLM when all
dependencies are resolved and real data is available.
Validated with Zod BEFORE hitting the database.
============================================================
*/

export const SortableFields = z.enum([
  "timestamp",
  "app_name",
  "window_title",
  "browser_url",
  "is_focused",
]);

export const SortOrder = z.enum(["asc", "desc"]);

export const TimeRangeSchema = z.object({
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
});

export const DatabaseFilterSchema = z.object({
  app_name: z
    .array(z.string())
    .describe("Application name variations to match")
    .optional(),
  window_title_contains: z
    .array(z.string())
    .describe("Window title substrings to match")
    .optional(),
  browser_url_contains: z
    .array(z.string())
    .describe("URL substrings to match")
    .optional(),
  is_focused: z
    .boolean()
    .describe("Whether the window was actively focused")
    .optional(),
  text_search: z
    .string()
    .describe("Keyword/phrase for OCR text search")
    .optional(),
  time_range: TimeRangeSchema.describe(
    "Time window restricting results",
  ).optional(),
});

export const ResolvedQuerySchema = z.object({
  semanticQuery: z
    .string()
    .min(1)
    .describe("Rewritten query optimized for semantic vector search"),
  keywords: z
    .array(z.string())
    .default([])
    .describe("Keywords for full-text search"),
  filter: DatabaseFilterSchema.optional(),
  sort: z
    .object({
      field: SortableFields.default("timestamp"),
      order: SortOrder.default("desc"),
    })
    .default({ field: "timestamp", order: "desc" }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  includeTextLayout: z
    .boolean()
    .default(false)
    .describe("When true, include text_json layout payload"),
});

export type ResolvedQuery = z.infer<typeof ResolvedQuerySchema>;
export type DatabaseFilter = z.infer<typeof DatabaseFilterSchema>;
