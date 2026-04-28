import { describe, expect, it } from 'vitest';

import type { Plan, Task } from '../plan/schema.js';

import { validateHandoff, ROLE_DEFAULT_PROVIDER, ROLE_ALLOWED_PROVIDERS } from './handoff.js';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 't1',
    role: overrides.role ?? 'coder',
    goal: overrides.goal ?? 'g',
    prompt: overrides.prompt ?? 'p',
    dependsOn: overrides.dependsOn ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    capabilitiesNeeded: overrides.capabilitiesNeeded ?? [],
    ...(overrides.providerHint !== undefined && { providerHint: overrides.providerHint }),
    ...(overrides.budgetUsd !== undefined && { budgetUsd: overrides.budgetUsd }),
  };
}

function plan(tasks: Task[]): Plan {
  return {
    version: 1,
    goal: 'g',
    createdAt: '2026-04-28T00:00:00.000Z',
    tasks,
  };
}

describe('validateHandoff', () => {
  it('returns ok=true for a single-task plan that fits the budget', () => {
    const result = validateHandoff(plan([task({ id: 't1', budgetUsd: 1 })]), { runCapUsd: 20 });
    expect(result.ok).toBe(true);
  });

  it('flags an empty plan via non-empty-tasks validator', () => {
    const result = validateHandoff(plan([]), { runCapUsd: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.validator === 'non-empty-tasks')).toBe(true);
    }
  });

  it('flags a dependency cycle', () => {
    const result = validateHandoff(
      plan([task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b', dependsOn: ['a'] })]),
      { runCapUsd: 20 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycleErr = result.errors.find((e) => e.validator === 'no-dependency-cycle');
      expect(cycleErr).toBeDefined();
      expect(cycleErr?.message).toMatch(/cycle/);
    }
  });

  it('flags when sum of explicit per-task budgets exceeds run cap', () => {
    const result = validateHandoff(
      plan([
        task({ id: 't1', budgetUsd: 12 }),
        task({ id: 't2', budgetUsd: 12, dependsOn: ['t1'] }),
      ]),
      { runCapUsd: 20 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.find((e) => e.validator === 'budget-sum')).toBeDefined();
    }
  });

  it('uses the default per-task budget when budgetUsd is absent', () => {
    // 8 tasks × default $3 = $24 > $20 cap
    const tasks: Task[] = Array.from({ length: 8 }, (_, i) => task({ id: `t${i + 1}` }));
    const result = validateHandoff(plan(tasks), { runCapUsd: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.find((e) => e.validator === 'budget-sum')).toBeDefined();
    }
  });

  it('flags a planner task that asks for codex (not in allowed list)', () => {
    const result = validateHandoff(
      plan([task({ id: 't1', role: 'planner', providerHint: 'codex' })]),
      { runCapUsd: 20 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.validator === 'role-provider-match');
      expect(err).toBeDefined();
      expect(err?.scope).toBe('t1');
    }
  });

  it('accepts a coder task on either claude-code or codex', () => {
    const a = validateHandoff(plan([task({ id: 't1', role: 'coder', providerHint: 'codex' })]), {
      runCapUsd: 20,
    });
    const b = validateHandoff(
      plan([task({ id: 't1', role: 'coder', providerHint: 'claude-code' })]),
      { runCapUsd: 20 },
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('skips role-provider check when providerHint is omitted', () => {
    const result = validateHandoff(plan([task({ id: 't1', role: 'planner' })]), {
      runCapUsd: 20,
    });
    expect(result.ok).toBe(true);
  });

  it('aggregates multiple violations into one result', () => {
    const result = validateHandoff(
      plan([
        task({ id: 't1', role: 'planner', providerHint: 'codex', budgetUsd: 12 }),
        task({ id: 't2', dependsOn: ['t1'], budgetUsd: 12 }),
      ]),
      { runCapUsd: 20 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const validators = new Set(result.errors.map((e) => e.validator));
      expect(validators.has('role-provider-match')).toBe(true);
      expect(validators.has('budget-sum')).toBe(true);
    }
  });
});

describe('ROLE_DEFAULT_PROVIDER + ROLE_ALLOWED_PROVIDERS (D10 matrix)', () => {
  it('every default is in the allowed list for that role', () => {
    for (const role of Object.keys(ROLE_DEFAULT_PROVIDER) as Array<
      keyof typeof ROLE_DEFAULT_PROVIDER
    >) {
      const def = ROLE_DEFAULT_PROVIDER[role];
      expect(ROLE_ALLOWED_PROVIDERS[role]).toContain(def);
    }
  });

  it('planner only allows claude-code (per D10 v0.1)', () => {
    expect(ROLE_ALLOWED_PROVIDERS.planner).toEqual(['claude-code']);
  });

  it('integrator only allows claude-code (per D10 v0.1)', () => {
    expect(ROLE_ALLOWED_PROVIDERS.integrator).toEqual(['claude-code']);
  });
});
