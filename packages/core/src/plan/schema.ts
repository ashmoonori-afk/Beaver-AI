// Plan / Task schemas per docs/models/plan-format.md.
// PlanSchema.superRefine enforces graph invariants (unique ids, known
// dependsOn refs, no cycles) so a single safeParse covers all rules.

import { z } from 'zod';

import { findPlanCycle } from './cycle.js';

export const TASK_ROLES = [
  'planner',
  'coder',
  'reviewer',
  'tester',
  'integrator',
  'summarizer',
] as const;
export const TaskRoleSchema = z.enum(TASK_ROLES);
export type TaskRole = z.infer<typeof TaskRoleSchema>;

export const TASK_ID_PATTERN = /^[a-z0-9-]+$/;

export const TaskSchema = z.object({
  id: z.string().regex(TASK_ID_PATTERN, {
    message: 'task id must be kebab-case ([a-z0-9-]+)',
  }),
  role: TaskRoleSchema,
  goal: z.string().min(1),
  prompt: z.string().min(1),
  dependsOn: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  providerHint: z.string().optional(),
  budgetUsd: z.number().positive().optional(),
  capabilitiesNeeded: z.array(z.string()).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export const PLAN_MODIFIERS = ['planner', 'reviewer', 'user', 'orchestrator'] as const;
export const PlanModifierSchema = z.enum(PLAN_MODIFIERS);
export type PlanModifier = z.infer<typeof PlanModifierSchema>;

export const PlanSchema = z
  .object({
    version: z.number().int().positive(),
    goal: z.string().min(1),
    tasks: z.array(TaskSchema),
    createdAt: z.string().min(1),
    parentVersion: z.number().int().positive().optional(),
    modifiedBy: PlanModifierSchema.optional(),
    modificationReason: z.string().optional(),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    for (const [i, t] of plan.tasks.entries()) {
      if (ids.has(t.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', i, 'id'],
          message: `duplicate task id '${t.id}'`,
        });
      }
      ids.add(t.id);
    }

    for (const [i, task] of plan.tasks.entries()) {
      for (const [j, dep] of task.dependsOn.entries()) {
        if (!ids.has(dep)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', i, 'dependsOn', j],
            message: `task '${task.id}' depends on unknown task id '${dep}'`,
          });
        }
      }
    }

    const cycle = findPlanCycle(plan.tasks);
    if (cycle) {
      ctx.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: `dependency cycle detected: ${cycle.join(' -> ')}`,
      });
    }
  });
export type Plan = z.infer<typeof PlanSchema>;
