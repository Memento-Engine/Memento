import { PlannerPlan, PlannerPlanSchema, PlannerStep } from "./planner.schema";

export type ValidState<T> = { valid: true; data: T } | { valid: false; error: string };
export const PLACEHOLDER_REGEX = /\{\{(step\d+)\.output\}\}/g;


function validateSchema(plan: PlannerPlan): ValidState<PlannerPlan> {
  const result = PlannerPlanSchema.safeParse(plan);

  if (!result.success) {
    return {
      valid: false,
      error: result.error.message,
    };
  }

  return { valid: true, data: result.data };
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

function validatePlaceholders(plan: PlannerPlan): ValidState<string> {
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

  return { valid: true, data: "Place Holder Check was valid." };
}

function validateLogicalRules(plan: PlannerPlan): ValidState<string> {
  for (const step of plan.steps) {
    if (step.kind === "search" && !step.databaseQuery) {
      return {
        valid: false,
        error: `Search step ${step.id} missing databaseQuery`,
      };
    }
  }

  return { valid: true, data: "Logic is Correct." };
}
export function validatePlan(plan: PlannerPlan): ValidState<PlannerPlan> {
  const schema = validateSchema(plan);
  if (!schema.valid) return { valid: false, error: schema.error };

  const parsed = schema.data;

  if (!parsed?.steps) {
    return { valid: false, error: "No Steps were Found" };
  }

  if (detectCycle(parsed.steps)) {
    return { valid: false, error: "Planner produced cyclic dependencies" };
  }

  const placeholderCheck = validatePlaceholders(parsed);
  if (!placeholderCheck.valid)
    return {
      valid: false,
      error: placeholderCheck.error ?? "Placeholder check was failed.",
    };

  const logicCheck = validateLogicalRules(parsed);
  if (!logicCheck.valid) return { valid: false, error: logicCheck.error };

  return { valid: true, data: parsed };
}
