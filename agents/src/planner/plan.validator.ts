import { Plan, PlanSchema, PlanStep } from "./plan.schema";

/*
============================================================
PLAN VALIDATOR
============================================================

Pure code — no LLM. Validates the planner's output:
  1. Zod schema validation (always works — no placeholders in typed fields)
  2. Duplicate step IDs
  3. Dependency references exist
  4. No dependency cycles (topological sort)
  5. Last step must be "final"
============================================================
*/

export type ValidState<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

function detectCycle(steps: PlanStep[]): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adj = new Map(steps.map((s) => [s.id, s.dependsOn]));

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const dep of adj.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  return steps.some((s) => dfs(s.id));
}

export function validatePlan(raw: unknown): ValidState<Plan> {
  // 1. Schema validation — always works, no placeholder ambiguity
  const result = PlanSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { valid: false, error: `Schema validation failed: ${message}` };
  }

  const plan = result.data;

  // 2. Duplicate step IDs
  const stepIds = new Set<string>();
  for (const step of plan.steps) {
    if (stepIds.has(step.id)) {
      return { valid: false, error: `Duplicate step ID: "${step.id}"` };
    }
    stepIds.add(step.id);
  }

  // 3. Dependency references exist
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        return {
          valid: false,
          error: `Step "${step.id}" depends on unknown step "${dep}"`,
        };
      }
    }
  }

  // 4. No cycles
  if (detectCycle(plan.steps)) {
    return { valid: false, error: "Dependency cycle detected" };
  }

  // 5. Forward-only dependencies (step can only depend on earlier steps)
  const idOrder = new Map(plan.steps.map((s, i) => [s.id, i]));
  for (const step of plan.steps) {
    const selfIndex = idOrder.get(step.id)!;
    for (const dep of step.dependsOn) {
      const depIndex = idOrder.get(dep)!;
      if (depIndex >= selfIndex) {
        return {
          valid: false,
          error: `Step "${step.id}" depends on "${dep}" which is not an earlier step`,
        };
      }
    }
  }

  // 6. Last step must be "final"
  const lastStep = plan.steps[plan.steps.length - 1];
  if (lastStep.kind !== "final") {
    return { valid: false, error: "Last step must be kind 'final'" };
  }

  // 7. Unique variableNames
  const varNames = new Set<string>();
  for (const step of plan.steps) {
    const vn = step.expectedOutput.variableName;
    if (varNames.has(vn)) {
      return {
        valid: false,
        error: `Duplicate variableName "${vn}" in step "${step.id}"`,
      };
    }
    varNames.add(vn);
  }

  return { valid: true, data: plan };
}
