import { describe, it, expect } from 'vitest';

import { PlanSchema, TaskSchema, type Task } from './schema.js';

function task(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    id: overrides.id,
    role: overrides.role ?? 'coder',
    goal: overrides.goal ?? 'goal',
    prompt: overrides.prompt ?? 'do the thing',
    dependsOn: overrides.dependsOn ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ['compiles'],
    capabilitiesNeeded: overrides.capabilitiesNeeded ?? [],
    ...(overrides.providerHint !== undefined && { providerHint: overrides.providerHint }),
    ...(overrides.budgetUsd !== undefined && { budgetUsd: overrides.budgetUsd }),
  };
}

function basePlan(tasks: Task[]) {
  return {
    version: 1,
    goal: 'build something',
    tasks,
    createdAt: '2026-04-27T00:00:00Z',
  };
}

describe('TaskSchema', () => {
  it('accepts a minimal valid task', () => {
    const r = TaskSchema.safeParse(task({ id: 'scaffold' }));
    expect(r.success).toBe(true);
  });

  it('rejects a non-kebab-case id', () => {
    const r = TaskSchema.safeParse(task({ id: 'Scaffold_v2' }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'id')).toBe(true);
    }
  });

  it('rejects a role not in the enum', () => {
    const r = TaskSchema.safeParse({ ...task({ id: 'x' }), role: 'janitor' });
    expect(r.success).toBe(false);
  });

  it('rejects negative budgetUsd', () => {
    const r = TaskSchema.safeParse(task({ id: 'x', budgetUsd: -1 }));
    expect(r.success).toBe(false);
  });

  it('applies capabilitiesNeeded default of []', () => {
    const r = TaskSchema.safeParse({
      id: 'x',
      role: 'coder',
      goal: 'g',
      prompt: 'p',
      dependsOn: [],
      acceptanceCriteria: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.capabilitiesNeeded).toEqual([]);
  });
});

describe('PlanSchema', () => {
  it('accepts a valid linear plan', () => {
    const p = basePlan([
      task({ id: 'scaffold' }),
      task({ id: 'feature', dependsOn: ['scaffold'] }),
      task({ id: 'review', role: 'reviewer', dependsOn: ['feature'] }),
    ]);
    const r = PlanSchema.safeParse(p);
    expect(r.success).toBe(true);
  });

  it('rejects version=0', () => {
    const r = PlanSchema.safeParse({ ...basePlan([task({ id: 'a' })]), version: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects duplicate task ids', () => {
    const r = PlanSchema.safeParse(basePlan([task({ id: 'a' }), task({ id: 'a' })]));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('duplicate task id'))).toBe(true);
    }
  });

  it('rejects dependsOn referring to an unknown task id', () => {
    const r = PlanSchema.safeParse(basePlan([task({ id: 'a', dependsOn: ['ghost'] })]));
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('|');
      expect(msg).toContain("unknown task id 'ghost'");
    }
  });

  it('rejects a 3-cycle (a -> b -> c -> a)', () => {
    const r = PlanSchema.safeParse(
      basePlan([
        task({ id: 'a', dependsOn: ['c'] }),
        task({ id: 'b', dependsOn: ['a'] }),
        task({ id: 'c', dependsOn: ['b'] }),
      ]),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('dependency cycle'))).toBe(true);
    }
  });

  it('rejects a self-loop (a -> a)', () => {
    const r = PlanSchema.safeParse(basePlan([task({ id: 'a', dependsOn: ['a'] })]));
    expect(r.success).toBe(false);
  });

  it('accepts a diamond (a -> b,c; b,c -> d)', () => {
    const r = PlanSchema.safeParse(
      basePlan([
        task({ id: 'a' }),
        task({ id: 'b', dependsOn: ['a'] }),
        task({ id: 'c', dependsOn: ['a'] }),
        task({ id: 'd', dependsOn: ['b', 'c'] }),
      ]),
    );
    expect(r.success).toBe(true);
  });
});
