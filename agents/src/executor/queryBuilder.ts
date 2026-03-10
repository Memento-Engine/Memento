import { PlanStep, SearchStep } from "../planner/plan.schema";
import { ResolvedQuery, ResolvedQuerySchema } from "./query.schema";
import { queryBuilderPrompt } from "../prompts/queryBuilderPrompt";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser } from "../utils/parser";
import { ExecutorError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";
import { formatLocalTimestamp } from "../utils/time";

/*
============================================================
QUERY BUILDER
============================================================

Called at EXECUTION TIME when all dependencies are resolved.
Takes a search step + resolved dependency data and asks an
LLM to produce a concrete, Zod-validated DatabaseQuery.

Replaces the old resolveDatabaseQuery() regex approach.
No placeholders. No regex. The LLM sees real data and writes
a real query.

Retries up to maxRetries times with Zod error feedback.
============================================================
*/

export interface DependencyData {
  stepId: string;
  variableName: string;
  data: unknown;
}

export async function buildSearchQuery(
  step: PlanStep & { kind: "search" },
  dependencies: DependencyData[],
  userGoal: string,
  requestId: string,
  maxRetries: number = 2,
): Promise<{ query: ResolvedQuery; llmCallsUsed: number }> {
  const logger = await createContextLogger(requestId, {
    node: "query_builder",
    stepId: step.id,
  });

  return runWithSpan(
    "agent.executor.query_builder",
    {
      request_id: requestId,
      step_id: step.id,
    },
    async () => {
      const startMs = Date.now();

      const depContext =
        dependencies.length > 0
          ? dependencies
              .map(
                (d) =>
                  `- ${d.variableName} (from ${d.stepId}): ${JSON.stringify(d.data, null, 2)}`,
              )
              .join("\n")
          : "(no dependencies — this is a root search step)";

      const hintsContext = step.searchHints
        ? JSON.stringify(step.searchHints, null, 2)
        : "(no search hints)";

      let lastError = "";
      let attempts = 0;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attempts++;
        const errorFeedback =
          lastError.length > 0
            ? `\n\nYour previous attempt failed Zod validation:\n${lastError}\nFix the issues and try again.`
            : "";

        try {
          const prompt = await queryBuilderPrompt.invoke({
            intent: step.intent + errorFeedback,
            searchHints: hintsContext,
            dependencyData: depContext,
            userGoal,
            currentDateTime: formatLocalTimestamp(),
          });

          const llmResult = await invokeRoleLlm({
            role: "query_builder",
            prompt,
            requestId,
            spanName: "agent.executor.query_builder.llm",
            spanAttributes: {
              step_id: step.id,
              attempt: attempt + 1,
            },
          });

          const parsed = await SafeJsonParser.parseContent(
            llmResult.response.content,
          );

          const validation = ResolvedQuerySchema.safeParse(parsed);

          if (validation.success) {
            const durationMs = Date.now() - startMs;

            logger.info("Query built and validated", {
              stepId: step.id,
              semanticQuery: validation.data.semanticQuery,
              attempt: attempt + 1,
              durationMs,
            });

            return { query: validation.data, llmCallsUsed: attempts };
          }

          // Validation failed — build error message for retry
          lastError = validation.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");

          logger.warn("Query validation failed — retrying", {
            stepId: step.id,
            attempt: attempt + 1,
            error: lastError,
          });
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : String(error);

          logger.warn("Query builder LLM call failed — retrying", {
            stepId: step.id,
            attempt: attempt + 1,
            error: lastError,
          });
        }
      }

      throw new ExecutorError(
        `Failed to build valid query for step "${step.id}" after ${attempts} attempts: ${lastError}`,
        {
          stepId: step.id,
          code: ErrorCode.LLM_INVALID_OUTPUT,
          lastValidationError: lastError,
        },
      );
    },
  );
}
