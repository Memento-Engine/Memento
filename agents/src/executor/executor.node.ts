import { AgentStateType } from "../agentState";
import { DatabaseQuery, PlannerStep, PlannerPlan } from "../planner/planner.schema";
import { getLLM } from "../planner/planner.node";
import { resolveDatabaseQuery, validateStepOutput } from "./extraction.validator";
import { extractorPrompt } from "../prompts/extractionPrompt";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler, withTimeout } from "../utils/parser";
import { getToolRegistry } from "../tools/registry";
import { ExecutorError, ToolError, ErrorCode, AgentError } from "../types/errors";
import { ToolContext } from "../types/tools";
import { emitError, emitStepEvent } from "../utils/eventQueue";

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

/**
 * Execute a single step of the plan.
 * Handles tool execution, validation, and retries.
 */
async function executeStep(
  step: PlannerStep,
  stepResults: Record<string, any>,
  logger: any,
  state: AgentStateType
): Promise<any> {
  const config = await getConfig();
  const llm = await getLLM();
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
      step.databaseQuery = await resolveDatabaseQuery(step.databaseQuery, step.dependsOn, stepResults);

      logger.debug("Resolved database query", {
        stepId: step.id,
        semanticQuery: step.databaseQuery.semanticQuery,
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
        return null;
      }

      // OPTIMIZATION: Return database results directly without LLM extraction
      // Database results are already structured - no need for LLM interpretation
      logger.info("Search step completed successfully", {
        stepId: step.id,
        resultCount: dbResults.length,
        optimizationNote: "Skipping LLM extraction - using DB results directly",
      });

      return dbResults;
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

  return await executeReasoningStep(step, stepResults, state, logger, config, llm);
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
  config: any,
  llm: any
): Promise<any> {
  let lastError: string = "";

  for (let attempt = 1; attempt <= step.maxRetries; attempt++) {
    logger.info("Reasoning step execution attempt", {
      stepId: step.id,
      attempt,
      maxRetries: step.maxRetries,
      stepKind: step.kind,
    });

    try {
      // Build context from previous step results and current step query
      const dependencyContext = Object.fromEntries(
        step.dependsOn.map((depId) => [depId, stepResults[depId]])
      );

      const prompt = await extractorPrompt.invoke({
        goal: step.query,
        previousErrors: lastError,
        step: JSON.stringify(step, null, 2),
        dbResults: JSON.stringify(dependencyContext, null, 2),
        outputType: step.expectedOutput.type,
        variableName: step.expectedOutput.variableName,
        outputDescription: step.expectedOutput.description,
        currentStepDependencyResults: dependencyContext,
      });

      const llmResult = await withTimeout(
        llm.invoke(prompt),
        config.llm.timeout,
        "Reasoning LLM request timeout"
      );

      const llmResponse = llmResult as any;
      logger.debug("LLM response received for reasoning step", {
        stepId: step.id,
        contentLength: String(llmResponse.content).length,
      });

      const parsedContent = SafeJsonParser.parseContent(llmResponse.content);

      logger.debug("Reasoning output parsed", {
        stepId: step.id,
        type: typeof parsedContent,
        goal: step.query,
      });

      // Validate parsed output against expected schema
      const validation = validateStepOutput(step, parsedContent);

      if (validation.valid) {
        logger.info("Reasoning step completed successfully", {
          stepId: step.id,
          outputVariable: step.expectedOutput.variableName,
          type: step.expectedOutput.type,
        });

        return parsedContent;
      }

      // Validation failed - prepare for retry
      lastError = validation.error;
      logger.warn("Reasoning output validation failed", {
        stepId: step.id,
        error: validation.error,
        stepKind : step.kind,
        stepQuery: step.query,
        stepExpectedOutput: step.expectedOutput,
        attempt,
      });
    } catch (error) {
      lastError = ErrorHandler.getSafeMessage(error);
      logger.error("Error during reasoning step", String(error), {
        stepId: step.id,
        attempt,
        error: lastError,
      });
    }

    if (attempt < step.maxRetries) {
      logger.info("Retrying reasoning step", {
        stepId: step.id,
        nextAttempt: attempt + 1,
      });
    }
  }

  // All retries exhausted
  throw new ExecutorError(
    `Reasoning step ${step.id} failed after ${step.maxRetries} attempts: ${lastError}`,
    {
      stepId: step.id,
      maxRetries: step.maxRetries,
      lastError,
    }
  );
}

/**
 * Executor node: Execute planned steps and collect results.
 */
export async function executorNode(state: AgentStateType): Promise<AgentStateType> {
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

  try {
    for (let i = state.currentStep; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      logger.info("Executing step", {
        stepIndex: i,
        stepId: step.id,
        stepKind: step.kind,
        query: step.query,
      });

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
        // Execute the step
        const result = await executeStep(step, stepResults, logger, state);

        // Evaluate if result is empty or invalid
        const isResultEmpty = isEmptyResult(result);

        if (result === null && step.kind === "search") {
          // Empty search results
          stepResults[step.id] = [];
          logger.warn("Step completed with empty results - may trigger replanning", {
            stepId: step.id,
            stepKind: step.kind,
          });

          // Emit search step event with no results
          emitStepEvent(step.id, "searching", step.query, "completed", state.requestId, {
            description: step.query,
            query: step.query,
            resultCount: 0,
            message: "Search returned no results",
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
            };
          }
        } else if (isResultEmpty) {
          // Non-search step returned empty result
          logger.warn("Non-search step returned empty result", {
            stepId: step.id,
            stepKind: step.kind,
            resultType: typeof result,
          });

          emitStepEvent(
            step.id,
            step.kind === "search" ? "searching" : "reasoning",
            step.query,
            "completed",
            state.requestId,
            {
              description: step.query,
              query: step.query,
              message: "Step returned no data",
            }
          );

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

          // Emit successful step event
          emitStepEvent(
            step.id,
            step.kind === "search" ? "searching" : "reasoning",
            step.query,
            "completed",
            state.requestId,
            {
              description: step.query,
              query: step.query,
              results: Array.isArray(result) ? result.slice(0, 3) : undefined,
              resultCount: Array.isArray(result) ? result.length : 1,
            }
          );
        }

        completedSteps++;
      } catch (error) {
        const errorMsg = ErrorHandler.getSafeMessage(error);
        stepErrors[step.id] = errorMsg;

        logger.error("Step execution failed", String(error), {
          stepId: step.id,
          error: errorMsg,
        });

        // Check if we should replan instead of failing
        // Only replan if we haven't already exhausted max replan attempts
        if (await shouldTriggerReplan(state)) {
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
    };
  } catch (error) {
    const agentError = ErrorHandler.toAgentError(error, ErrorCode.EXECUTOR_FAILED, {
      completedSteps,
      totalSteps: plan.steps.length,
      stepErrors,
    });

    logger.error("Executor node failed", String(error), {
      error: agentError.code,
      completedSteps,
      stepResults,
    });

    throw agentError;
  }
}
