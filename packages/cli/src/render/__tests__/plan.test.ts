import { beforeEach, describe, expect, it } from 'vitest';

import { PlanSchema, type Plan } from '@beaver-ai/core';

import { setColorOverride, stripAnsi } from '../colors.js';
import { renderPlan } from '../plan.js';

beforeEach(() => setColorOverride(false));

const buildPlan = (overrides: Partial<Plan> = {}): Plan =>
  PlanSchema.parse({
    version: 2,
    parentVersion: 1,
    modifiedBy: 'planner',
    modificationReason: 'skip auth per user',
    goal: 'todo app',
    createdAt: '2026-04-27T00:00:00Z',
    tasks: [
      {
        id: 'scaffold',
        role: 'coder',
        goal: 'set up TS + Vite skeleton',
        prompt: 'p',
        dependsOn: [],
        acceptanceCriteria: ['ok'],
        capabilitiesNeeded: [],
      },
      {
        id: 'ui-list',
        role: 'coder',
        goal: 'render TODO list view',
        prompt: 'p',
        dependsOn: ['scaffold'],
        acceptanceCriteria: ['ok'],
        capabilitiesNeeded: [],
      },
    ],
    ...overrides,
  });

describe('renderPlan', () => {
  it('renders header + per-task lines + totals', () => {
    const plan = buildPlan();
    const out = stripAnsi(
      renderPlan(plan, { estUsd: { scaffold: 0.4, 'ui-list': 0.8 }, perRunCapUsd: 20 }),
    );
    expect(out).toContain('plan v2 (parent: v1) — modified by planner: "skip auth per user"');
    expect(out).toContain('scaffold');
    expect(out).toContain('[coder]');
    expect(out).toContain('set up TS + Vite skeleton');
    expect(out).toContain('→ no deps · est. $0.40');
    expect(out).toContain('→ deps: scaffold · est. $0.80');
    expect(out).toContain('total est. $1.20  (per-run cap $20.00)');
  });

  it('handles a 0-task plan without crashing', () => {
    const plan = PlanSchema.parse({
      version: 1,
      goal: 'empty',
      createdAt: '2026-04-27T00:00:00Z',
      tasks: [],
    });
    const out = stripAnsi(renderPlan(plan));
    expect(out).toContain('plan v1');
    expect(out).toContain('(no tasks)');
  });
});
