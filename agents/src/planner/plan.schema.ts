import { z } from "zod";

/*
============================================================
PLAN-TIME SCHEMA
============================================================

The planner decides:
  - What steps to run
  - In what order (dependencies)
  - What each step should accomplish (natural language intent)
  - Which skills/tools to use for search steps

It does NOT write database queries. That happens at execution time
when all dependencies are resolved and we have concrete data.
============================================================
*/

// ── Search Approach ──────────────────────────────────────

export const SearchApproachSchema = z.enum([
  "semantic",     // Vector similarity search for conceptual queries
  "fts",          // Full-text search for exact keyword matches
  "hybrid",       // Combination of both approaches
  "temporal",     // Time-based queries
  "aggregation",  // Statistics and summaries
]);

// ── Step Output ──────────────────────────────────────────

export const StepOutputSchema = z.object({
  type: z.enum(["value", "list", "object", "table"]),
  variableName: z
    .string()
    .describe(
      "Key used to store this output in shared memory (e.g. 'session_times', 'app_list')",
    ),
  description: z
    .string()
    .describe(
      "Precise description of what this data represents so the extractor knows what to pull",
    ),
});

// ── Search Hints ─────────────────────────────────────────
// Soft guidance for the query builder. These are NOT the
// final query — just hints. All fields are literal values,
// never placeholders.

export const SearchHintSchema = z.object({
  appNames: z
    .array(z.string())
    .optional()
    .describe(
      "Application names to look for (literal values only, e.g. ['Chrome', 'VS Code'])",
    ),
  urlPatterns: z
    .array(z.string())
    .optional()
    .describe("URL patterns to match (literal values only, e.g. ['github.com'])"),
  windowTitleKeywords: z
    .array(z.string())
    .optional()
    .describe("Window title keywords (literal values only)"),
  textSearchTerms: z
    .array(z.string())
    .optional()
    .describe("OCR text search terms (literal values only)"),
  timeContext: z
    .string()
    .optional()
    .describe(
      "Natural language time description, e.g. 'yesterday afternoon' or " +
      "'during the session found in step1'. Resolved at execution time.",
    ),
  resultLimit: z.number().int().min(1).max(100).default(10),
});

// ── Step Kinds ───────────────────────────────────────────

const SearchStepSchema = z.object({
  id: z.string().describe("Unique identifier (e.g. 'step1')"),
  kind: z.literal("search"),
  stepGoal: z.string().describe("What this search step should accomplish"),
  intent: z
    .string()
    .describe(
      "Natural language description of what to search for. " +
      "Should specify which skill/approach to use (semantic, fts, hybrid, temporal, aggregation). " +
      "Reference prior step outputs by name when needed: " +
      "'Use semantic search to find browser activity during {{session_times}}'",
    ),
  suggestedSkill: z
    .string()
    .optional()
    .describe(
      "Suggested skill to use (e.g. 'semantic-search', 'fts-search', 'hybrid-search', 'temporal-query', 'aggregation-digest')",
    ),
  suggestedTool: z
    .enum(["sql_execute", "semantic_search", "search"])
    .optional()
    .describe("Suggested tool to execute this step"),
  dependsOn: z.array(z.string()).default([]),
  // Legacy fields for executor compatibility
  expectedOutput: StepOutputSchema.optional().describe("Expected output structure for extraction"),
  searchHints: SearchHintSchema.optional().describe("Soft hints for query builder"),
});

const ReasonStepSchema = z.object({
  id: z.string(),
  kind: z.literal("reason"),
  stepGoal: z.string().describe("What this reasoning step should accomplish"),
  intent: z
    .string()
    .describe("What reasoning / computation to perform on dependency data"),
  dependsOn: z.array(z.string()).default([]),
  // Legacy field for executor compatibility
  expectedOutput: StepOutputSchema.optional().describe("Expected output structure for extraction"),
});

const FinalStepSchema = z.object({
  id: z.string(),
  kind: z.literal("final"),
  stepGoal: z.string().describe("What this final step should accomplish"),
  intent: z.string().describe("How to synthesize the final answer"),
  dependsOn: z.array(z.string()).default([]),
  // Legacy field for executor compatibility
  expectedOutput: StepOutputSchema.optional().describe("Expected output structure for extraction"),
});

// ── Discriminated Union ──────────────────────────────────

export const PlanStepSchema = z.discriminatedUnion("kind", [
  SearchStepSchema,
  ReasonStepSchema,
  FinalStepSchema,
]);

// ── Full Plan ────────────────────────────────────────────

export const PlanSchema = z.object({
  goal: z.string().describe("Restated user goal that this plan will solve"),
  steps: z.array(PlanStepSchema).min(1).describe("Ordered list of execution steps"),
});

// ── Types ────────────────────────────────────────────────

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type SearchStep = z.infer<typeof SearchStepSchema>;
export type ReasonStep = z.infer<typeof ReasonStepSchema>;
export type FinalStep = z.infer<typeof FinalStepSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type SearchHint = z.infer<typeof SearchHintSchema>;
export type SearchApproach = z.infer<typeof SearchApproachSchema>;
