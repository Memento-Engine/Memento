import { Plan, PlanStep } from "../planner/plan.schema";

/*
============================================================
TASK SCHEDULER
============================================================

Pure code — no LLM. Builds topological execution levels from
the plan DAG so independent steps run in parallel and dependent
steps run sequentially.

Returns an array of "levels". Each level is an array of steps
that can execute concurrently.

Level 0: all root steps (no deps)
Level 1: steps whose deps are all in level 0
Level N: steps whose deps are all in levels 0..(N-1)
============================================================
*/

export type ScheduledLevel = PlanStep[];

export interface ExecutionSchedule {
  levels: ScheduledLevel[];
  /** Total number of steps */
  totalSteps: number;
}

/**
 * Build topological execution levels from a validated plan.
 * Assumes plan has already passed cycle detection.
 */
export function buildSchedule(plan: Plan): ExecutionSchedule {
  const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
  const assigned = new Map<string, number>(); // stepId → level index
  const levels: ScheduledLevel[] = [];

  // Assign each step to the earliest level where all deps are satisfied
  for (const step of plan.steps) {
    let level = 0;

    for (const depId of step.dependsOn) {
      const depLevel = assigned.get(depId);
      if (depLevel === undefined) {
        // This shouldn't happen after validation, but handle gracefully
        throw new Error(
          `Scheduler: dependency "${depId}" for step "${step.id}" has not been assigned a level`,
        );
      }
      level = Math.max(level, depLevel + 1);
    }

    assigned.set(step.id, level);

    while (levels.length <= level) {
      levels.push([]);
    }
    levels[level].push(step);
  }

  return {
    levels,
    totalSteps: plan.steps.length,
  };
}
