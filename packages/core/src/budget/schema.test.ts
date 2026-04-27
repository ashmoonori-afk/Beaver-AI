import { describe, it, expect } from 'vitest';

import { BudgetConfigSchema, BUDGET_DEFAULTS } from './schema.js';

describe('BudgetConfigSchema', () => {
  it('parses an empty object using all defaults', () => {
    const r = BudgetConfigSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(BUDGET_DEFAULTS);
  });

  it('accepts the doc example verbatim', () => {
    const r = BudgetConfigSchema.safeParse({
      perAgentUsd: 1.0,
      perTaskUsd: 3.0,
      perRunUsd: 20.0,
      warnThresholdPct: 70,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a per-run override', () => {
    const r = BudgetConfigSchema.safeParse({ perRunUsd: 50 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.perRunUsd).toBe(50);
  });

  it('rejects negative perAgentUsd', () => {
    const r = BudgetConfigSchema.safeParse({ perAgentUsd: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects zero perTaskUsd (must be positive)', () => {
    const r = BudgetConfigSchema.safeParse({ perTaskUsd: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects warnThresholdPct out of [1,100]', () => {
    expect(BudgetConfigSchema.safeParse({ warnThresholdPct: 0 }).success).toBe(false);
    expect(BudgetConfigSchema.safeParse({ warnThresholdPct: 101 }).success).toBe(false);
  });

  it('rejects non-integer warnThresholdPct', () => {
    const r = BudgetConfigSchema.safeParse({ warnThresholdPct: 70.5 });
    expect(r.success).toBe(false);
  });

  it('BUDGET_DEFAULTS is frozen', () => {
    expect(Object.isFrozen(BUDGET_DEFAULTS)).toBe(true);
  });
});
