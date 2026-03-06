import { ChatOpenAI } from "@langchain/openai";
import { PlannerPlan, PlannerPlanSchema, PlannerStep } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentState, AgentStateType } from "../agentState";
import { config } from "dotenv";

config();

console.log("KEY:", process.env.OPENROUTER_API_KEY);
export const llm = new ChatOpenAI({
  model: "deepseek/deepseek-chat",
  temperature: 0,

  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },

  apiKey:
    "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",
});

const plannerModel = llm.withStructuredOutput(PlannerPlanSchema);

function propagateFilters(plan: PlannerPlan) {
  for (const step of plan.steps) {
    if (step.kind !== "search") continue;

    for (const dep of step.dependsOn) {
      const parent = plan.steps.find((s) => s.id === dep);
      if (
        parent?.kind === "search" &&
        parent?.databaseQuery?.filter?.app_name
      ) {
        step.databaseQuery.filter = {
          ...parent.databaseQuery.filter,
          ...step.databaseQuery.filter,
        };
      }
    }
  }
}

function validateSchema(plan: PlannerPlan) {
  const result = PlannerPlanSchema.safeParse(plan);

  if (!result.success) {
    return {
      valid: false,
      error: result.error.message,
    };
  }

  return { valid: true, plan: result.data };
}

function detectCycle(steps: PlannerStep[]): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const map = new Map(steps.map((s) => [s.id, s]));

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    stack.add(id);

    const step = map.get(id);
    if (!step) return false;

    for (const dep of step.dependsOn) {
      if (dfs(dep)) return true;
    }

    stack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (dfs(step.id)) return true;
  }

  return false;
}

const PLACEHOLDER_REGEX = /\{\{(step\d+)\.output\}\}/g;

function validatePlaceholders(plan: PlannerPlan) {
  const stepIds = new Set(plan.steps.map((s) => s.id));

  for (const step of plan.steps) {
    const json = JSON.stringify(step);

    const matches = [...json.matchAll(PLACEHOLDER_REGEX)];

    for (const m of matches) {
      const ref = m[1];

      if (!stepIds.has(ref)) {
        return {
          valid: false,
          error: `Invalid placeholder reference: ${ref}`,
        };
      }

      if (!step.dependsOn.includes(ref)) {
        return {
          valid: false,
          error: `Step ${step.id} uses ${ref} but does not depend on it`,
        };
      }
    }
  }

  return { valid: true };
}

function validateLogicalRules(plan: PlannerPlan) {
  for (const step of plan.steps) {
    if (step.kind === "search" && !step.databaseQuery) {
      return {
        valid: false,
        error: `Search step ${step.id} missing databaseQuery`,
      };
    }
  }

  return { valid: true };
}

function validatePlan(plan: PlannerPlan) {
  const schema = validateSchema(plan);
  if (!schema.valid) return schema;

  const parsed = schema.plan;
  if (!parsed?.steps) {
    return { valid: false, plan: parsed };
  }
  if (detectCycle(parsed.steps)) {
    return { valid: false, error: "Planner produced cyclic dependencies" };
  }

  const placeholderCheck = validatePlaceholders(parsed);
  if (!placeholderCheck.valid) return placeholderCheck;

  const logicCheck = validateLogicalRules(parsed);
  if (!logicCheck.valid) return logicCheck;

  return { valid: true, plan: parsed };
}

export async function plannerNode(
  state: AgentStateType,
  config?: RunnableConfig
): Promise<AgentStateType> {

  console.log("Planner was called.");

  const goal = state.goal;

  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS) {

    const prompt = await plannerPrompt.invoke({
      goal,
      previousErrors: state.plannerErrors ?? ""
    });

    const rawPlan = await plannerModel.invoke(prompt);

    const validation = validatePlan(rawPlan);

    if (validation.valid) {

      const plan = validation.plan;

      propagateFilters(plan);

      console.dir(plan.steps, { depth: null, colors: true });

      return {
        ...state,
        plan,
        currentStep: 0,
        plannerErrors: undefined
      };
    }

    attempts++;

    console.log("Planner validation failed:", validation?.error);

    state.plannerErrors = validation?.error;
  }

  throw new Error("Planner failed after multiple attempts");
}