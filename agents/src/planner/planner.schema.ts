import { z } from "zod";

/*
============================================================
SORTING CONFIGURATION
============================================================

Restrict sortable fields to prevent hallucinated column names.
The planner must choose ONLY from these predefined database fields.
*/

export const SortableFields = z.enum([
  "timestamp",
  "app_name",
  "window_title",
  "browser_url",
  "is_focused",
]);

export const SortOrder = z.enum(["asc", "desc"]);

/*
============================================================
AGGREGATION OPERATIONS
============================================================

Defines how results should be aggregated when required.

none          → return raw rows
count         → count number of matching records
sum_duration  → sum total active duration
unique_apps   → return unique applications
*/

export const AggregationOp = z.enum([
  "none",
  "count",
  "sum_duration",
  "unique_apps",
]);

/*
============================================================
TIME RANGE FILTER
============================================================

Used to restrict results to a time window.

Important:
We allow ANY string instead of `.datetime()` because
the planner may generate placeholders like:

{{step1.output}}

which are substituted at runtime.
*/

const TimeRangeSchema = z.object({
  start: z
    .string()
    .describe(
      "Start timestamp of the query window. Can be ISO datetime or placeholder like {{step1.output}}."
    )
    .optional(),

  end: z
    .string()
    .describe(
      "End timestamp of the query window. Can be ISO datetime or placeholder like {{step2.output}}."
    )
    .optional(),
});

/*
============================================================
DATABASE FILTERS
============================================================

Structured constraints applied before retrieval.

Filters improve accuracy and should be used whenever
structured information is known (e.g., app name or URL).
*/

export const DatabaseFilterSchema = z.object({
  app_name: z
    .string()
    .describe(
      "Exact name of the application that generated the activity record (e.g., 'Google Chrome', 'VS Code', 'Slack')."
    )
    .optional(),

  window_title_contains: z
    .string()
    .describe(
      "Substring that must appear inside the window title of the application."
    )
    .optional(),

  browser_url_contains: z
    .string()
    .describe(
      "Substring that must appear in the browser URL when filtering browser activity (e.g., 'github.com')."
    )
    .optional(),

  is_focused: z
    .boolean()
    .describe(
      "Whether the application window was actively focused by the user at that time."
    )
    .optional(),

  text_search: z
    .string()
    .describe(
      "Keyword or semantic phrase used to search inside OCR captured screen text."
    )
    .optional(),

  time_range: TimeRangeSchema.describe(
    "Time window restricting results to activities occurring within this range."
  ).optional(),
});

/*
============================================================
DATABASE QUERY
============================================================

Represents the full query configuration used by the
search executor.

This structure allows hybrid retrieval:

1. Full-text search
2. Semantic vector search
3. Structured filtering
*/

export const DatabaseQuerySchema = z.object({
  originalQuery: z
    .string()
    .min(1)
    .describe(
      "The original user query exactly as asked. Must not be rewritten or altered."
    ),

  semanticQuery: z
    .string()
    .min(1)
    .describe(
      "A rewritten version of the user query optimized for semantic vector search."
    ),

  keywords: z
    .array(z.string())
    .default([])
    .describe(
      "Keywords used for full-text search. Should contain meaningful entities such as application names or domains."
    ),

  filter: DatabaseFilterSchema.describe(
    "Optional structured filters applied before retrieval."
  ).optional(),

  sort: z
    .object({
      field: SortableFields.default("timestamp").describe(
        "Database column used to sort results."
      ),

      order: SortOrder.default("desc").describe(
        "Sort direction. 'desc' returns newest results first."
      ),
    })
    .default({
      field: "timestamp",
      order: "desc",
    }),

  aggregation: AggregationOp.default("none").describe(
    "Aggregation applied to the query result set."
  ),

  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum number of records returned by the query."),
});

/*
============================================================
PLANNER STEP TYPES
============================================================

Defines the role of each step within the execution plan.
*/

export const PlannerStepKindSchema = z.enum([
  "search",
  "compute",
  "tool",
  "reason",
  "final",
]);

/*
============================================================
STEP OUTPUT TYPES
============================================================

Defines the shape of data produced by a step.
*/

export const StepOutputSchema = z.object({
  type: z.enum(["value", "list", "object", "table"]),
});

/*
============================================================
STEP STATUS
============================================================

Execution status during runtime.
*/

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

/*
============================================================
SEARCH STEP
============================================================

A step that queries the activity database.
*/

const SearchStep = z.object({
  id: z.string().describe("Unique identifier for the step."),

  kind: z.literal("search"),

  dependsOn: z
    .array(z.string())
    .default([])
    .describe("IDs of steps that must complete before this step executes."),

  expectedOutput: StepOutputSchema.describe(
    "The expected structure of the step output."
  ),

  status: StepStatusSchema.default("pending"),

  databaseQuery: DatabaseQuerySchema.describe(
    "Database query executed by this search step."
  ),

  retryCount: z.number().default(0),

  maxRetries: z.number().default(2),
});

/*
============================================================
NON-SEARCH STEPS
============================================================
*/

const OtherStep = z.object({
  id: z.string(),

  kind: z.enum(["compute", "tool", "reason", "final"]),

  dependsOn: z.array(z.string()).default([]),

  expectedOutput: StepOutputSchema,

  status: StepStatusSchema.default("pending"),

  retryCount: z.number().default(0),

  maxRetries: z.number().default(2),
});

/*
============================================================
PLANNER STEP UNION
============================================================
*/

export const PlannerStepSchema = z.discriminatedUnion("kind", [
  SearchStep,
  OtherStep,
]);

/*
============================================================
FULL EXECUTION PLAN
============================================================
*/

export const PlannerPlanSchema = z.object({
  goal: z
    .string()
    .describe("Restated user goal that the execution plan will solve."),

  steps: z
    .array(PlannerStepSchema)
    .min(1)
    .describe("Ordered list of execution steps."),
});

/*
============================================================
TYPE EXPORTS
============================================================
*/

export type PlannerPlan = z.infer<typeof PlannerPlanSchema>;
export type PlannerStep = z.infer<typeof PlannerStepSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type PlannerStepKind = z.infer<typeof PlannerStepKindSchema>;
export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;