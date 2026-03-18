import { AgentStateType } from "../agentState";
import {
  SkillPlan,
  SkillStep,
  SkillStepResult,
  SkillPlanSchema,
} from "./types";
import { getSkills, buildSkillContext } from "./loader";
import { executeSql, formatResultsAsJson } from "./sqlExecutor";
import { getToolRegistry } from "../tools/registry";
import { createContextLogger, getLogger } from "../utils/logger";
import { getConfig } from "../config/config";
import { invokeRoleLlm } from "../llm/routing";
import {
  skillPlannerPrompt,
  skillReasoningPrompt,
  buildAvailableSkillsDescription,
} from "./prompts";
import { SafeJsonParser } from "../utils/parser";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";

/**
 * Execute a SQL step.
 */
async function executeSqlStep(
  step: SkillStep,
  stepResults: Record<string, SkillStepResult>,
  state: AgentStateType,
): Promise<SkillStepResult> {
  const startTime = Date.now();
  const logger = await getLogger();

  if (!step.sql) {
    return {
      stepId: step.id,
      type: "sql",
      success: false,
      error: "SQL step missing sql property",
      executionTimeMs: Date.now() - startTime,
    };
  }

  // Substitute variables from previous steps
  let sql = step.sql;
  for (const depId of step.dependsOn) {
    const depResult = stepResults[depId];
    if (depResult?.data) {
      // Replace placeholders like {step1.column_name}
      const data = depResult.data as any;
      if (Array.isArray(data) && data.length > 0) {
        const row = data[0];
        for (const [key, value] of Object.entries(row)) {
          sql = sql.replace(
            new RegExp(`\\{${depId}\\.${key}\\}`, "g"),
            String(value),
          );
        }
      } else if (typeof data === "object") {
        for (const [key, value] of Object.entries(data)) {
          sql = sql.replace(
            new RegExp(`\\{${depId}\\.${key}\\}`, "g"),
            String(value),
          );
        }
      }
    }
  }

  logger.debug(
    { stepId: step.id, sql: sql.slice(0, 200) },
    "Executing SQL step",
  );

  const result = await executeSql({ sql });

  return {
    stepId: step.id,
    type: "sql",
    success: result.success,
    data: result.success ? result.rows : undefined,
    error: result.error,
    rowCount: result.rowCount,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute a semantic search step.
 */
async function executeSemanticStep(
  step: SkillStep,
  stepResults: Record<string, SkillStepResult>,
  state: AgentStateType,
): Promise<SkillStepResult> {
  const startTime = Date.now();
  const logger = await getLogger();

  if (!step.semanticQuery) {
    return {
      stepId: step.id,
      type: "semantic",
      success: false,
      error: "Semantic step missing semanticQuery property",
      executionTimeMs: Date.now() - startTime,
    };
  }

  const toolRegistry = await getToolRegistry();
  const semanticTool = toolRegistry.get("semantic_search");

  if (!semanticTool) {
    return {
      stepId: step.id,
      type: "semantic",
      success: false,
      error: "Semantic search tool not registered",
      executionTimeMs: Date.now() - startTime,
    };
  }

  const toolResult = await semanticTool.execute(
    {
      query: step.semanticQuery,
      limit: 20,
      filters: step.semanticFilters,
    },
    {
      requestId: state.requestId,
      stepId: step.id,
      attemptNumber: 1,
      timeout: 30000,
    },
  );

  return {
    stepId: step.id,
    type: "semantic",
    success: toolResult.success,
    data: toolResult.data,
    error:
      typeof toolResult.error === "string"
        ? toolResult.error
        : toolResult.error?.message,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute a reasoning step (LLM call).
 */
async function executeReasoningStep(
  step: SkillStep,
  stepResults: Record<string, SkillStepResult>,
  state: AgentStateType,
): Promise<SkillStepResult> {
  const startTime = Date.now();
  const logger = await getLogger();

  if (!step.reasoningPrompt) {
    return {
      stepId: step.id,
      type: "reason",
      success: false,
      error: "Reasoning step missing reasoningPrompt property",
      executionTimeMs: Date.now() - startTime,
    };
  }

  // Gather input data from dependencies
  const inputData: Record<string, unknown> = {};
  for (const varName of step.inputVariables ?? step.dependsOn) {
    const depResult = stepResults[varName];
    if (depResult) {
      inputData[varName] = depResult.data;
    }
  }

  try {
    const prompt = await skillReasoningPrompt.formatMessages({
      step_results: JSON.stringify(inputData, null, 2),
      reasoning_prompt: step.reasoningPrompt,
    });

    const { response } = await invokeRoleLlm({
      role: "executor",
      prompt,
      requestId: state.requestId,
      spanName: "skill.reasoning_step",
      spanAttributes: { step_id: step.id },
      authHeaders: state.authHeaders,
    });

    const content = typeof response === "string" ? response : response.content;
    const parsed = await SafeJsonParser.parseContent(content);

    return {
      stepId: step.id,
      type: "reason",
      success: true,
      data: parsed ?? { interpretation: content },
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { stepId: step.id, error: errorMessage },
      "Reasoning step failed",
    );

    return {
      stepId: step.id,
      type: "reason",
      success: false,
      error: errorMessage,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute a single skill step based on its type.
 */
async function executeStep(
  step: SkillStep,
  stepResults: Record<string, SkillStepResult>,
  state: AgentStateType,
): Promise<SkillStepResult> {
  switch (step.type) {
    case "sql":
      return executeSqlStep(step, stepResults, state);
    case "semantic":
      return executeSemanticStep(step, stepResults, state);
    case "reason":
      return executeReasoningStep(step, stepResults, state);
    default:
      return {
        stepId: step.id,
        type: step.type,
        success: false,
        error: `Unknown step type: ${step.type}`,
        executionTimeMs: 0,
      };
  }
}

/**
 * Check if a step's dependencies are satisfied.
 */
function dependenciesSatisfied(
  step: SkillStep,
  completedSteps: Set<string>,
): boolean {
  return step.dependsOn.every((depId) => completedSteps.has(depId));
}

/**
 * Evaluate a conditional expression against step results.
 */
function evaluateCondition(
  condition: string,
  stepResults: Record<string, SkillStepResult>,
): boolean {
  try {
    // Simple condition evaluation
    // Supports: result.length === 0, result[0].column === null
    const match = condition.match(
      /^(\w+)(\.length\s*===\s*0|\.data\.length\s*===\s*0|\[\d+\]\.\w+\s*===\s*null)$/,
    );
    if (match) {
      const [, stepId, check] = match;
      const result = stepResults[stepId];

      if (check.includes("length === 0")) {
        const data = result?.data;
        return Array.isArray(data) ? data.length === 0 : !data;
      }
    }

    // Fallback: check if result is empty
    const stepIdMatch = condition.match(/^(\w+)/);
    if (stepIdMatch) {
      const result = stepResults[stepIdMatch[1]];
      const data = result?.data;
      return Array.isArray(data) ? data.length === 0 : !data;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Execute a skill plan with multi-step support.
 */
export async function executeSkillPlan(
  plan: SkillPlan,
  state: AgentStateType,
): Promise<{
  results: Record<string, SkillStepResult>;
  success: boolean;
  finalStepId: string;
}> {
  const logger = await getLogger();
  const stepResults: Record<string, SkillStepResult> = {};
  const completedSteps = new Set<string>();
  const skippedSteps = new Set<string>();

  logger.info(
    {
      goal: plan.goal,
      stepCount: plan.steps.length,
      requiresMultiStep: plan.requiresMultiStep,
    },
    "Executing skill plan",
  );

  // Build step lookup
  const stepMap = new Map(plan.steps.map((s) => [s.id, s]));

  // Execute steps in dependency order
  let currentStepIndex = 0;
  let lastCompletedStepId = "";

  while (currentStepIndex < plan.steps.length) {
    const step = plan.steps[currentStepIndex];

    // Skip if already completed or skipped
    if (completedSteps.has(step.id) || skippedSteps.has(step.id)) {
      currentStepIndex++;
      continue;
    }

    // Check dependencies
    if (!dependenciesSatisfied(step, completedSteps)) {
      // Find a step that can be executed
      let foundExecutable = false;
      for (let i = currentStepIndex + 1; i < plan.steps.length; i++) {
        const candidateStep = plan.steps[i];
        if (
          !completedSteps.has(candidateStep.id) &&
          !skippedSteps.has(candidateStep.id) &&
          dependenciesSatisfied(candidateStep, completedSteps)
        ) {
          // Execute this step first
          const result = await executeStep(candidateStep, stepResults, state);
          stepResults[candidateStep.id] = result;
          completedSteps.add(candidateStep.id);
          lastCompletedStepId = candidateStep.id;
          foundExecutable = true;

          const stepType =
            candidateStep.type === "sql" || candidateStep.type === "semantic"
              ? "searching"
              : "reasoning";

          break;
        }
      }

      if (!foundExecutable) {
        // Deadlock - dependencies can't be satisfied
        logger.error(
          { stuckStep: step.id, completedSteps: Array.from(completedSteps) },
          "Skill plan execution deadlock",
        );
        break;
      }
      continue;
    }

    // Execute the step
    const stepType =
      step.type === "sql" || step.type === "semantic"
        ? "searching"
        : "reasoning";

    const result = await executeStep(step, stepResults, state);
    stepResults[step.id] = result;
    completedSteps.add(step.id);
    lastCompletedStepId = step.id;

    // Handle conditional branching
    if (step.conditionalNext) {
      const conditionMet = evaluateCondition(
        step.conditionalNext.condition,
        stepResults,
      );
      const nextStepId = conditionMet
        ? step.conditionalNext.ifTrue
        : step.conditionalNext.ifFalse;

      if (nextStepId === "END") {
        logger.info(
          { stepId: step.id, conditionMet },
          "Conditional branch leads to END",
        );
        break;
      }

      // Skip steps that aren't on the chosen branch
      for (const s of plan.steps) {
        if (s.id !== nextStepId && s.dependsOn.includes(step.id)) {
          skippedSteps.add(s.id);
        }
      }
    }

    currentStepIndex++;
  }

  const success = Array.from(completedSteps).every(
    (id) => stepResults[id]?.success,
  );

  logger.info(
    {
      completedSteps: completedSteps.size,
      skippedSteps: skippedSteps.size,
      success,
    },
    "Skill plan execution complete",
  );

  return {
    results: stepResults,
    success,
    finalStepId: lastCompletedStepId,
  };
}

/**
 * Generate a skill plan from a user query.
 */
export async function generateSkillPlan(
  query: string,
  state: AgentStateType,
): Promise<SkillPlan> {
  const logger = await getLogger();
  const skills = await getSkills();

  // Get schema context
  const schemaSkill = skills.get("database-schema");
  const schemaContext = schemaSkill?.content ?? "";

  // Build available skills description
  const availableSkills = buildAvailableSkillsDescription(skills);

  // Format the prompt
  const prompt = await skillPlannerPrompt.formatMessages({
    available_skills: availableSkills,
    schema_context: schemaContext,
    current_date: new Date().toISOString().split("T")[0],
    query,
  });

  logger.info({ query }, "Generating skill plan");

  const { response } = await invokeRoleLlm({
    role: "planner",
    prompt,
    requestId: state.requestId,
    spanName: "skill.generate_plan",
    authHeaders: state.authHeaders,
  });

  const content = typeof response === "string" ? response : response.content;
  const parsed = await SafeJsonParser.parseContent(content);

  if (!parsed) {
    throw new Error("Failed to parse skill plan from LLM response");
  }

  // Validate with Zod
  const validatedPlan = SkillPlanSchema.parse(parsed);

  logger.info(
    {
      goal: validatedPlan.goal,
      stepCount: validatedPlan.steps.length,
      requiresMultiStep: validatedPlan.requiresMultiStep,
      selectedSkills: validatedPlan.selectedSkills,
    },
    "Skill plan generated",
  );

  return validatedPlan;
}
