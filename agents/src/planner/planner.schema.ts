import { z } from "zod";

export const SortableFields = z.enum([
  "timestamp",
  "app_name",
  "window_title",
  "browser_url",
  "is_focused",
]);

export const SortOrder = z.enum(["asc", "desc"]);

const TimeRangeSchema = z.object({
  start: z.iso
    .datetime()
    .describe(
      "Start timestamp of the query window. Can be ISO datetime or placeholder like {{step1.output}}.",
    )
    .optional(),

  end: z.iso
    .datetime()
    .describe(
      "End timestamp of the query window. Can be ISO datetime or placeholder like {{step2.output}}.",
    )
    .optional(),
});

export const DatabaseFilterSchema = z.object({
  app_name: z
    .array(z.string())
    .describe(
      "Array of application name variations to match (e.g., ['VS Code', 'vscode', 'Visual Studio Code']). Matches if activity app_name contains any of these values.",
    )
    .optional(),

  window_title_contains: z
    .array(z.string())
    .describe(
      "Array of window title substrings to match. Matches if window_title contains any of these values.",
    )
    .optional(),

  browser_url_contains: z
    .array(z.string())
    .describe(
      "Array of browser URL substrings to match (e.g., ['github.com', 'gitlab.com']). Matches if browser_url contains any of these values.",
    )
    .optional(),

  is_focused: z
    .boolean()
    .describe(
      "Whether the application window was actively focused by the user at that time.",
    )
    .optional(),

  text_search: z
    .string()
    .describe(
      "Keyword or semantic phrase used to search inside OCR captured screen text.",
    )
    .optional(),

  time_range: TimeRangeSchema.describe(
    "Time window restricting results to activities occurring within this range.",
  ).optional(),
});

export const DatabaseQuerySchema = z.object({
  semanticQuery: z
    .string()
    .min(1)
    .describe(
      "A rewritten version of the user query optimized for semantic vector search.",
    ),

  keywords: z
    .array(z.string())
    .default([])
    .describe(
      "Keywords used for full-text search. Should contain meaningful entities such as application names or domains.",
    ),

  filter: DatabaseFilterSchema.describe(
    "Optional structured filters applied before retrieval.",
  ).optional(),

  sort: z
    .object({
      field: SortableFields.default("timestamp").describe(
        "Database column used to sort results.",
      ),

      order: SortOrder.default("desc").describe(
        "Sort direction. 'desc' returns newest results first.",
      ),
    })
    .default({
      field: "timestamp",
      order: "desc",
    }),

  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum number of records returned by the query."),
});

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
  variableName: z
    .string()
    .describe(
      "The key used to store this output in shared memory (e.g., 'start_timestamp')",
    ),
  description: z
    .string()
    .describe(
      "A precise description of what this data is, so the extraction step knows what to grab.",
    ),
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

const SearchStep = z.object({
  id: z.string().describe("Unique identifier for the step."),

  kind: z.literal("search"),

  query: z.string(),

  dependsOn: z
    .array(z.string())
    .default([])
    .describe("IDs of steps that must complete before this step executes."),

  expectedOutput: StepOutputSchema.describe(
    "The expected structure of the step output.",
  ),

  status: StepStatusSchema.default("pending"),

  databaseQuery: DatabaseQuerySchema.describe(
    "Database query executed by this search step.",
  ),

  retryCount: z.number().default(0),

  maxRetries: z.number().default(2),
});

const OtherStep = z.object({
  id: z.string(),

  kind: z.enum(["compute", "tool", "reason", "final"]),

  dependsOn: z.array(z.string()).default([]),

  expectedOutput: StepOutputSchema,

  query: z.string(),

  status: StepStatusSchema.default("pending"),

  retryCount: z.number().default(0),

  maxRetries: z.number().default(2),
});

export const PlannerStepSchema = z.discriminatedUnion("kind", [
  SearchStep,
  OtherStep,
]);

export const PlannerPlanSchema = z.object({
  goal: z
    .string()
    .describe("Restated user goal that the execution plan will solve."),

  steps: z
    .array(PlannerStepSchema)
    .min(1)
    .describe("Ordered list of execution steps."),
});

export type PlannerPlan = z.infer<typeof PlannerPlanSchema>;
export type PlannerStep = z.infer<typeof PlannerStepSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type PlannerStepKind = z.infer<typeof PlannerStepKindSchema>;
export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;
