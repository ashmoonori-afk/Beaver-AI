// Pre-coder handoff validation (Phase 7.3).
//
// Between PLAN_APPROVED and TASK_DISPATCHED the orchestrator runs every
// validator below. Any failure is collected into a HandoffError list;
// callers (loop.ts) post an `escalation` checkpoint with the violation
// summary instead of dispatching a coder.
//
// Each validator is a small, named function so a violation has a
// single-blame source. New validators are added to VALIDATORS — no
// `if (kind === 'X')` cascades.

import { findPlanCycle } from '../plan/cycle.js';
import type { Plan, TaskRole } from '../plan/schema.js';

export type ProviderId = 'claude-code' | 'codex';

/** Per-role default provider, derived from D10 (the role × provider matrix). */
export const ROLE_DEFAULT_PROVIDER: Record<TaskRole, ProviderId> = {
  planner: 'claude-code',
  coder: 'codex',
  reviewer: 'claude-code',
  tester: 'claude-code',
  integrator: 'claude-code',
  summarizer: 'claude-code',
};

/** Providers each role is allowed to use (default + alternates). */
export const ROLE_ALLOWED_PROVIDERS: Record<TaskRole, readonly ProviderId[]> = {
  planner: ['claude-code'],
  coder: ['claude-code', 'codex'],
  reviewer: ['claude-code', 'codex'],
  tester: ['claude-code', 'codex'],
  integrator: ['claude-code'],
  summarizer: ['claude-code', 'codex'],
};

export interface HandoffError {
  /** Validator that flagged. Stable identifier for the UI. */
  validator: string;
  /** Task id, or '<plan>' for plan-level violations. */
  scope: string;
  message: string;
}

export type HandoffResult = { ok: true } | { ok: false; errors: readonly HandoffError[] };

export interface HandoffOptions {
  /** Run-level USD cap. Sum of per-task budgets must fit underneath. */
  runCapUsd: number;
  /** Per-task default budget when a task omits `budgetUsd`. */
  defaultTaskBudgetUsd?: number;
}

const DEFAULT_TASK_BUDGET_USD = 3;

type Validator = (plan: Plan, opts: HandoffOptions) => readonly HandoffError[];

const VALIDATORS: readonly Validator[] = [
  validateNonEmptyTasks,
  validateNoDependencyCycle,
  validateBudgetSum,
  validateRoleProviderMatch,
];

/** Run every validator and merge the results. */
export function validateHandoff(plan: Plan, opts: HandoffOptions): HandoffResult {
  const errors: HandoffError[] = [];
  for (const v of VALIDATORS) {
    errors.push(...v(plan, opts));
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// --- validators -------------------------------------------------------

function validateNonEmptyTasks(plan: Plan): readonly HandoffError[] {
  if (plan.tasks.length === 0) {
    return [
      {
        validator: 'non-empty-tasks',
        scope: '<plan>',
        message: 'plan has zero tasks; nothing to dispatch',
      },
    ];
  }
  return [];
}

function validateNoDependencyCycle(plan: Plan): readonly HandoffError[] {
  const cycle = findPlanCycle(plan.tasks);
  if (cycle) {
    return [
      {
        validator: 'no-dependency-cycle',
        scope: '<plan>',
        message: `dependency cycle: ${cycle.join(' -> ')}`,
      },
    ];
  }
  return [];
}

function validateBudgetSum(plan: Plan, opts: HandoffOptions): readonly HandoffError[] {
  const cap = opts.runCapUsd;
  const perTaskDefault = opts.defaultTaskBudgetUsd ?? DEFAULT_TASK_BUDGET_USD;
  let sum = 0;
  for (const task of plan.tasks) {
    sum += task.budgetUsd ?? perTaskDefault;
  }
  if (sum > cap) {
    return [
      {
        validator: 'budget-sum',
        scope: '<plan>',
        message: `sum of per-task budgets ($${sum.toFixed(2)}) exceeds run cap ($${cap.toFixed(2)})`,
      },
    ];
  }
  return [];
}

function validateRoleProviderMatch(plan: Plan): readonly HandoffError[] {
  const errors: HandoffError[] = [];
  for (const task of plan.tasks) {
    if (!task.providerHint) continue;
    const allowed = ROLE_ALLOWED_PROVIDERS[task.role];
    if (!allowed.includes(task.providerHint as ProviderId)) {
      errors.push({
        validator: 'role-provider-match',
        scope: task.id,
        message: `role '${task.role}' is not allowed to use provider '${task.providerHint}' (allowed: ${allowed.join(', ')})`,
      });
    }
  }
  return errors;
}
