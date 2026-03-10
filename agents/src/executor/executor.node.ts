import { AgentStateType } from "../agentState";
import { DatabaseQuery, PlannerStep, PlannerPlan } from "../planner/planner.schema";
import { resolveDatabaseQuery, validateStepOutput } from "./extraction.validator";
import { extractorPrompt } from "../prompts/extractionPrompt";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler, withTimeout } from "../utils/parser";
import { getToolRegistry } from "../tools/registry";
import { ExecutorError, ToolError, ErrorCode, AgentError } from "../types/errors";
import { ToolContext } from "../types/tools";
import { emitError, emitStepEvent } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/**
 * Check if a result is empty or invalid.
 * Empty results include:
 * - null or undefined
 * - Empty arrays
 * - Empty objects
 * - Empty strings
 * - Null results from steps
 */
function isEmptyResult(result: any): boolean {
  if (result === null || result === undefined) {
    return true;
  }

  if (Array.isArray(result)) {
    return result.length === 0;
  }

  if (typeof result === "object") {
    return Object.keys(result).length === 0;
  }

  if (typeof result === "string") {
    return result.trim().length === 0;
  }

  return false;
}

/**
 * Check if a step has dependent steps that would be affected by empty results.
 */
function hasDependentSteps(plan: PlannerPlan, stepId: string): boolean {
  return plan.steps.some((s) => s.dependsOn.includes(stepId));
}

/**
 * Determine if we should trigger replanning based on current state.
 * Prevents infinite replanning loops.
 */
async function shouldTriggerReplan(state: AgentStateType): Promise<boolean> {
  const maxReplanAttempts = (await getConfig()).agent.maxReplanAttempts ?? 3;
  const currentReplanAttempts = state.replanAttempts ?? 0;

  // Only replan if we haven't reached the max attempts
  const shouldReplan = currentReplanAttempts < maxReplanAttempts;

  if (!shouldReplan) {
    const logger = await createContextLogger(state.requestId, {
      node: "executor",
    });
    logger.warn("Max replan attempts reached - will not trigger further replanning", {
      currentAttempts: currentReplanAttempts,
      maxAttempts: maxReplanAttempts,
    });
  }

  return shouldReplan;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof AgentError && error.code === ErrorCode.TIMEOUT_ERROR) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ETIMEDOUT/i.test(message);
}

function shouldReplanOnError(step: PlannerStep, error: unknown): boolean {
  if (isTimeoutError(error)) {
    return false;
  }

  if (error instanceof ToolError) {
    return true;
  }

  if (error instanceof ExecutorError && /dependency not resolved/i.test(error.message)) {
    return true;
  }

  return step.kind === "search";
}

/**
 * Execute a single step of the plan.
 * Handles tool execution, validation, and retries.
 */
async function executeStep(
  step: PlannerStep,
  stepResults: Record<string, any>,
  logger: any,
  state: AgentStateType
): Promise<{ result: any; llmCallsUsed: number }> {
  const config = await getConfig();
  const toolRegistry = await getToolRegistry();

  // Search steps use the search tool
  if (step.kind === "search") {
    let dbResults: any[] = [];

    logger.info("Resolving database query placeholders", {
      stepId: step.id,
      dependencyCount: step.dependsOn.length,
    });

    try {
      // Resolve placeholder references in database query
      step.databaseQuery = await resolveDatabaseQuery(
        step.databaseQuery,
        step.dependsOn,
        stepResults
      );

      step.databaseQuery.includeTextLayout = state.executionPlan?.include_text_layout ?? false;

      logger.debug("Resolved database query", {
        stepId: step.id,
        semanticQuery: step.databaseQuery.semanticQuery,
        includeTextLayout: step.databaseQuery.includeTextLayout,
      });

      // Execute search tool
      const searchTool = toolRegistry.getOrThrow("search");
      const toolContext: ToolContext = {
        requestId: state.requestId,
        stepId: step.id,
        attemptNumber: step.retryCount + 1,
        timeout: config.agent.stepTimeoutMs,
      };

      const toolResult = await withTimeout(
        searchTool.execute(step.databaseQuery, toolContext),
        config.agent.stepTimeoutMs,
        `Search tool timeout (${config.agent.stepTimeoutMs}ms)`
      );

      if (!toolResult.success) {
        throw new ToolError(`Search tool failed: ${toolResult.error}`, {
          stepId: step.id,
          tool: "search",
          error: toolResult.error,
        });
      }

      dbResults = toolResult.data ?? [];

      logger.info("Search tool completed", {
        stepId: step.id,
        rowsReturned: dbResults.length,
      });

      if (dbResults.length === 0) {
        logger.warn("Search returned no results", {
          stepId: step.id,
        });
        return { result: null, llmCallsUsed: 0 };
      }

      // OPTIMIZATION: Return database results directly without LLM extraction
      // Database results are already structured - no need for LLM interpretation
      logger.info("Search step completed successfully", {
        stepId: step.id,
        resultCount: dbResults.length,
        optimizationNote: "Skipping LLM extraction - using DB results directly",
      });

      return { result: dbResults, llmCallsUsed: 0 };
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      throw new ExecutorError(
        `Failed to execute search step: ${ErrorHandler.getSafeMessage(error)}`,
        {
          stepId: step.id,
          kind: "search",
          cause: error,
        }
      );
    }
  }

  // Non-search steps (reasoning, compute, etc) - use LLM for actual reasoning
  logger.info("Executing non-search step", {
    stepId: step.id,
    stepKind: step.kind,
    requiresLLM: true,
  });

  return await executeReasoningStep(step, stepResults, state, logger, config);
}

function normalizeReasoningOutput(step: PlannerStep, parsed: any): any {
  if (parsed === null || parsed === undefined) {
    return parsed;
  }

  const expectedType = step.expectedOutput.type;
  const variableName = step.expectedOutput.variableName;

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  if (variableName in parsed) {
    return (parsed as Record<string, any>)[variableName];
  }

  if ("output" in parsed) {
    return (parsed as Record<string, any>).output;
  }

  if ("result" in parsed) {
    return (parsed as Record<string, any>).result;
  }

  if ("data" in parsed) {
    return (parsed as Record<string, any>).data;
  }

  if (expectedType === "value" && "value" in parsed) {
    return (parsed as Record<string, any>).value;
  }

  if (
    expectedType === "list" &&
    "items" in parsed &&
    Array.isArray((parsed as Record<string, any>).items)
  ) {
    return (parsed as Record<string, any>).items;
  }

  if (
    expectedType === "table" &&
    "rows" in parsed &&
    Array.isArray((parsed as Record<string, any>).rows)
  ) {
    return (parsed as Record<string, any>).rows;
  }

  return parsed;
}

/**
 * Execute a reasoning or computation step using the LLM.
 * This is only called for non-search steps that require true reasoning.
 */
async function executeReasoningStep(
  step: PlannerStep,
  stepResults: Record<string, any>,
  state: AgentStateType,
  logger: any,
  config: any
): Promise<{ result: any; llmCallsUsed: number }> {
  return runWithSpan(
    "agent.node.executor.reasoning_step",
    {
      request_id: state.requestId,
      step_id: step.id,
      step_kind: step.kind,
    },
    async () => {
      const dependencyContext = Object.fromEntries(
        step.dependsOn.map((depId) => [depId, stepResults[depId]])
      );

      const prompt = await extractorPrompt.invoke({
        goal: step.query,
        previousErrors: "",
        step: JSON.stringify(step, null, 2),
        dbResults: JSON.stringify(dependencyContext, null, 2),
        outputType: step.expectedOutput.type,
        variableName: step.expectedOutput.variableName,
        outputDescription: step.expectedOutput.description,
        currentStepDependencyResults: dependencyContext,
      });

      const llmInvocation = await invokeRoleLlm({
        role: "executor",
        prompt,
        requestId: state.requestId,
        spanName: "agent.node.executor.reasoning_llm",
        spanAttributes: {
          step_id: step.id,
          step_kind: step.kind,
        },
      });

      const llmResponse = llmInvocation.response as any;
      const parsedContent = await SafeJsonParser.parseContent(llmResponse.content);
      const normalizedContent = normalizeReasoningOutput(step, parsedContent);

      const validation = validateStepOutput(step, normalizedContent);

      if (!validation.valid) {
        throw new ExecutorError(
          `Reasoning step ${step.id} produced invalid output: ${validation.error}`,
          {
            stepId: step.id,
            validationError: validation.error,
          }
        );
      }

      logger.info("Reasoning step completed successfully", {
        stepId: step.id,
        outputVariable: step.expectedOutput.variableName,
        type: step.expectedOutput.type,
      });

      return { result: normalizedContent, llmCallsUsed: 1 };
    }
  );
}

/**
 * Executor node: Execute planned steps and collect results.
 */
export async function executorNode(state: AgentStateType): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.executor",
    {
      request_id: state.requestId,
      node: "executor",
      current_step: state.currentStep,
    },
    async () => {
      const logger = await createContextLogger(state.requestId, {
        node: "executor",
        currentStep: state.currentStep,
      });

      logger.info("Executor node started", {
        totalSteps: state.plan?.steps?.length ?? 0,
      });

      const { plan } = state;

      if (!plan?.steps || plan.steps.length === 0) {
        throw new ExecutorError("Plan has no steps", {
          plan: plan ? "exists but empty" : "undefined",
        });
      }

      const stepResults = state.stepResults ?? {};
      const stepErrors: Record<string, string> = state.stepErrors ?? {};
      let completedSteps = Object.keys(stepResults).length;
      const executionStartedAt = state.startTime ?? Date.now();
      let llmCalls = state.llmCalls ?? 0;
      let executedSteps = 0;
      let reasoningSteps = 0;
      const maxLlmCalls = (await getConfig()).agent.maxLlmCalls;
      const maxSteps = (await getConfig()).agent.maxSteps;
      const maxRuntimeMs = (await getConfig()).agent.maxRuntimeMs;
      const maxReasoningSteps = (await getConfig()).agent.maxReasoningSteps;

      try {
        for (let i = state.currentStep; i < plan.steps.length; i++) {
          const step = plan.steps[i];

          if (Date.now() - executionStartedAt > maxRuntimeMs) {
            logger.warn("Global runtime limit reached; returning partial answer", {
              maxRuntimeMs,
              executedSteps,
            });
            break;
          }

          if (executedSteps >= maxSteps) {
            logger.warn("Global step limit reached; returning partial answer", {
              maxSteps,
              executedSteps,
            });
            break;
          }

          if (step.kind !== "search" && reasoningSteps >= maxReasoningSteps) {
            logger.warn("Reasoning step limit reached; skipping remaining reasoning steps", {
              maxReasoningSteps,
              reasoningSteps,
              stepId: step.id,
            });
            break;
          }

          logger.info("Executing step", {
            stepIndex: i,
            stepId: step.id,
            stepKind: step.kind,
            query: step.query,
          });

          emitStepEvent(
            step.id,
            step.kind === "search" ? "searching" : "reasoning",
            step.kind === "search" ? "Searching your memories..." : "Evaluating search results...",
            "running",
            state.requestId,
            {
              description: step.query,
              query: step.query,
            }
          );

          // Verify dependencies are satisfied
          for (const dep of step.dependsOn) {
            if (!(dep in stepResults)) {
              throw new ExecutorError(`Step ${step.id} dependency not resolved: ${dep}`, {
                stepId: step.id,
                missingDependency: dep,
                availableResults: Object.keys(stepResults),
              });
            }
          }

          try {
            if (step.kind !== "search" && llmCalls >= maxLlmCalls) {
              logger.warn("Global LLM call limit reached; returning partial answer", {
                maxLlmCalls,
                llmCalls,
              });
              break;
            }

            const stepExecution = await runWithSpan(
              "agent.node.executor.step",
              {
                request_id: state.requestId,
                step_id: step.id,
                step_kind: step.kind,
                step_index: i,
              },
              async () => executeStep(step, stepResults, logger, state)
            );
            const result = stepExecution.result;
            llmCalls += stepExecution.llmCallsUsed;
            executedSteps += 1;
            if (step.kind !== "search") {
              reasoningSteps += 1;
            }

            // Evaluate if result is empty or invalid
            const isResultEmpty = isEmptyResult(result);

            if (result === null && step.kind === "search") {
              // Empty search results
              stepResults[step.id] = [];
              logger.warn("Step completed with empty results - may trigger replanning", {
                stepId: step.id,
                stepKind: step.kind,
              });

              // Signal for replanning if this is a critical step
              // Critical steps are those that return data needed for downstream steps
              if (hasDependentSteps(plan, step.id)) {
                logger.info("Empty result detected on step with dependent steps", {
                  stepId: step.id,
                  dependentCount: plan.steps.filter((s) => s.dependsOn.includes(step.id)).length,
                });

                // Return early to trigger replanning
                return {
                  ...state,
                  stepResults,
                  stepErrors: Object.keys(stepErrors).length > 0 ? stepErrors : undefined,
                  currentStep: i,
                  shouldReplan: true,
                  lastFailedStepId: step.id,
                  failureReason: `Search step returned empty results. Query: "${step.query}"`,
                  llmCalls,
                };
              }
            } else if (isResultEmpty) {
              // Non-search step returned empty result
              logger.warn("Non-search step returned empty result", {
                stepId: step.id,
                stepKind: step.kind,
                resultType: typeof result,
              });

              // Similar logic for non-search steps
              if (hasDependentSteps(plan, step.id)) {
                logger.info("Empty result detected on non-search step with dependents", {
                  stepId: step.id,
                });

                return {
                  ...state,
                  stepResults,
                  stepErrors: Object.keys(stepErrors).length > 0 ? stepErrors : undefined,
                  currentStep: i,
                  shouldReplan: true,
                  lastFailedStepId: step.id,
                  failureReason: `Step returned empty result. Kind: ${step.kind}. Query: "${step.query}"`,
                  llmCalls,
                };
              } else {
                // Final step or non-critical step with empty result
                stepResults[step.id] = result ?? null;
                logger.info("Empty result on non-critical step - continuing", {
                  stepId: step.id,
                });
              }
            } else {
              stepResults[step.id] = result;
              logger.info("Step completed successfully", {
                stepId: step.id,
                resultType: typeof result,
              });
            }

            logger.info("Came This Far..");

            if (step.kind === "search") {
              const rows = Array.isArray(stepResults[step.id]) ? stepResults[step.id] : [];
              logger.info("Emitting search step event with results");
              emitStepEvent(
                step.id,
                "searching",
                "Found search results",
                "running",
                state.requestId,
                {
                  description: `Found ${rows.length} result${rows.length === 1 ? "" : "s"}`,
                  query: step.query,
                  results: rows,
                  resultCount: rows.length,
                }
              );
            } else {
              emitStepEvent(
                step.id,
                "reasoning",
                "Evaluation complete",
                "running",
                state.requestId,
                {
                  description: step.query,
                  query: step.query,
                }
              );
            }

            completedSteps++;
          } catch (error) {
            const errorMsg = ErrorHandler.getSafeMessage(error);
            stepErrors[step.id] = errorMsg;

            logger.error("Step execution failed", error, {
              stepId: step.id,
              error: errorMsg,
            });

            // Check if we should replan instead of failing
            // Only replan if we haven't already exhausted max replan attempts
            if (shouldReplanOnError(step, error) && (await shouldTriggerReplan(state))) {
              logger.info("Triggering replanning due to step execution error", {
                stepId: step.id,
                error: errorMsg,
              });

              return {
                ...state,
                stepResults,
                stepErrors,
                currentStep: i,
                shouldReplan: true,
                lastFailedStepId: step.id,
                failureReason: `Step execution failed: ${errorMsg}`,
                llmCalls,
              };
            }

            emitError(errorMsg, ErrorCode.EXECUTOR_FAILED, state.requestId, true);
            throw error;
          }
        }

        logger.info("Executor completed all steps", {
          totalSteps: plan.steps.length,
          completedSteps,
          resultCount: Object.keys(stepResults).length,
        });

        // Check if we actually found any search results
        const hasAnyResults = Object.values(stepResults).some(
          (result) => result && (!Array.isArray(result) || result.length > 0)
        );

        return {
          ...state,
          stepResults,
          stepErrors: Object.keys(stepErrors).length > 0 ? stepErrors : undefined,
          currentStep: plan.steps.length,
          hasSearchResults: hasAnyResults,
          llmCalls,
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(error, ErrorCode.EXECUTOR_FAILED, {
          completedSteps,
          totalSteps: plan.steps.length,
          stepErrors,
        });

        logger.error("Executor node failed", error, {
          error: agentError.code,
          completedSteps,
          stepResults,
        });

        throw agentError;
      }
    }
  );
}
