import { PlanStep } from "../planner/plan.schema";
import { extractorPromptV2 } from "../prompts/extractorPromptV2";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser } from "../utils/parser";
import { ExecutorError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";
import { DependencyData } from "./queryBuilder";

/*
============================================================
EXTRACTOR
============================================================

Takes raw search / reasoning results and extracts the expected
output for a step. Validates the shape (value / list / object / table).
If the step is a search step with simple "table" output, we can
skip the LLM call and return raw results directly.
============================================================
*/

/**
 * Validate that the extracted data matches the expected output type.
 */
function validateOutputShape(
  type: string,
  data: unknown,
): { valid: boolean; error?: string } {
  switch (type) {
    case "value": {
      const ok =
        data === null ||
        typeof data === "string" ||
        typeof data === "number" ||
        typeof data === "boolean";
      return ok
        ? { valid: true }
        : { valid: false, error: `Expected value (primitive) but got ${typeof data}` };
    }
    case "list": {
      return Array.isArray(data)
        ? { valid: true }
        : { valid: false, error: `Expected list (array) but got ${typeof data}` };
    }
    case "object": {
      const ok =
        typeof data === "object" && data !== null && !Array.isArray(data);
      return ok
        ? { valid: true }
        : { valid: false, error: `Expected object but got ${Array.isArray(data) ? "array" : typeof data}` };
    }
    case "table": {
      const ok =
        Array.isArray(data) && data.every((r) => typeof r === "object" && r !== null);
      return ok
        ? { valid: true }
        : { valid: false, error: "Expected table (array of objects)" };
    }
    default:
      return { valid: false, error: `Unknown output type: ${type}` };
  }
}

/**
 * Extract the expected output from search results.
 *
 * Optimization: if the step expects "table" output and the search results
 * are already an array of objects, skip the LLM and return directly.
 */
export async function extractStepOutput(
  step: PlanStep,
  rawResults: unknown,
  dependencies: DependencyData[],
  requestId: string,
): Promise<{ data: unknown; llmCallsUsed: number }> {
  const logger = await createContextLogger(requestId, {
    node: "extractor",
    stepId: step.id,
  });

  return runWithSpan(
    "agent.executor.extractor",
    {
      request_id: requestId,
      step_id: step.id,
      output_type: step.expectedOutput.type,
    },
    async () => {
      const expectedType = step.expectedOutput.type;

      // ── Fast path: search step expecting table → return raw rows ──
      if (
        step.kind === "search" &&
        expectedType === "table" &&
        Array.isArray(rawResults) &&
        rawResults.length > 0
      ) {
        logger.info("Fast path: returning raw search results as table", {
          stepId: step.id,
          rowCount: rawResults.length,
        });
        return { data: rawResults, llmCallsUsed: 0 };
      }

      // ── Fast path: null / empty results ────────────────────────────
      if (
        rawResults === null ||
        rawResults === undefined ||
        (Array.isArray(rawResults) && rawResults.length === 0)
      ) {
        const emptyVal = expectedType === "value" ? null : [];
        logger.info("Empty results — returning empty output", {
          stepId: step.id,
          outputType: expectedType,
        });
        return { data: emptyVal, llmCallsUsed: 0 };
      }

      // ── LLM extraction ────────────────────────────────────────────
      const depContext =
        dependencies.length > 0
          ? dependencies
              .map(
                (d) =>
                  `- ${d.variableName} (from ${d.stepId}): ${JSON.stringify(d.data, null, 2)}`,
              )
              .join("\n")
          : "(none)";

      const prompt = await extractorPromptV2.invoke({
        intent: step.intent,
        searchResults: JSON.stringify(rawResults, null, 2),
        dependencyData: depContext,
        outputType: expectedType,
        variableName: step.expectedOutput.variableName,
        outputDescription: step.expectedOutput.description,
      });

      const llmResult = await invokeRoleLlm({
        role: "executor",
        prompt,
        requestId,
        spanName: "agent.executor.extractor.llm",
        spanAttributes: {
          step_id: step.id,
          output_type: expectedType,
        },
      });

      const parsed = await SafeJsonParser.parseContent(
        llmResult.response.content,
      );

      // Normalise: if LLM wraps in { output: ..., result: ..., data: ... }
      const normalised = normaliseExtractorOutput(
        parsed,
        expectedType,
        step.expectedOutput.variableName,
      );

      const validation = validateOutputShape(expectedType, normalised);

      if (!validation.valid) {
        logger.warn("Extractor output shape mismatch", {
          stepId: step.id,
          error: validation.error,
        });
        throw new ExecutorError(
          `Extractor for step "${step.id}" produced invalid output: ${validation.error}`,
          { stepId: step.id, code: ErrorCode.OUTPUT_INVALID },
        );
      }

      logger.info("Extraction complete", {
        stepId: step.id,
        outputType: expectedType,
        variableName: step.expectedOutput.variableName,
      });

      return { data: normalised, llmCallsUsed: 1 };
    },
  );
}

// ── Helpers ──────────────────────────────────────────────

function normaliseExtractorOutput(
  raw: unknown,
  expectedType: string,
  variableName: string,
): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== "object" || Array.isArray(raw)) return raw;

  const obj = raw as Record<string, unknown>;

  // Try unwrapping common wrapper keys
  for (const key of [variableName, "output", "result", "data", "value", "items", "rows"]) {
    if (key in obj) {
      const inner = obj[key];

      // Only unwrap if the inner value matches expected type
      if (expectedType === "list" && Array.isArray(inner)) return inner;
      if (expectedType === "table" && Array.isArray(inner)) return inner;
      if (expectedType === "value" && !Array.isArray(inner) && typeof inner !== "object")
        return inner;
      if (expectedType === "object" && typeof inner === "object" && !Array.isArray(inner))
        return inner;
    }
  }

  return raw;
}
