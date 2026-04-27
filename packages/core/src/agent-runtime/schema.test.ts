import { describe, it, expect } from 'vitest';

import { AgentOpsConfigSchema, AGENT_OPS_DEFAULTS } from './schema.js';

describe('AgentOpsConfigSchema', () => {
  it('parses an empty object using all defaults', () => {
    const r = AgentOpsConfigSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(AGENT_OPS_DEFAULTS);
  });

  it('default values match the documented values verbatim', () => {
    expect(AGENT_OPS_DEFAULTS.maxParallelAgents).toBe(5);
    expect(AGENT_OPS_DEFAULTS.retriesPerTask).toBe(2);
    expect(AGENT_OPS_DEFAULTS.timeoutMinutes).toEqual({
      planner: 5,
      coder: 30,
      reviewer: 10,
      tester: 20,
      integrator: 15,
      summarizer: 5,
    });
    expect(AGENT_OPS_DEFAULTS.providerByRole).toEqual({
      planner: 'claude-code',
      coder: 'codex',
      reviewer: 'claude-code',
      tester: 'claude-code',
      integrator: 'codex',
      summarizer: 'claude-code',
    });
    expect(AGENT_OPS_DEFAULTS.defaultTier).toBe('balanced');
    expect(AGENT_OPS_DEFAULTS.stallThresholdSeconds).toBe(120);
  });

  it('rejects maxParallelAgents = 0', () => {
    const r = AgentOpsConfigSchema.safeParse({ maxParallelAgents: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects negative maxParallelAgents', () => {
    expect(AgentOpsConfigSchema.safeParse({ maxParallelAgents: -3 }).success).toBe(false);
  });

  it('rejects non-integer maxParallelAgents', () => {
    expect(AgentOpsConfigSchema.safeParse({ maxParallelAgents: 1.5 }).success).toBe(false);
  });

  it('rejects negative retriesPerTask', () => {
    expect(AgentOpsConfigSchema.safeParse({ retriesPerTask: -1 }).success).toBe(false);
  });

  it('accepts retriesPerTask = 0', () => {
    expect(AgentOpsConfigSchema.safeParse({ retriesPerTask: 0 }).success).toBe(true);
  });

  it('partial timeoutMinutes override merges with defaults', () => {
    const r = AgentOpsConfigSchema.safeParse({ timeoutMinutes: { coder: 60 } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.timeoutMinutes.coder).toBe(60);
      expect(r.data.timeoutMinutes.planner).toBe(5);
    }
  });

  it('partial providerByRole override merges with defaults', () => {
    const r = AgentOpsConfigSchema.safeParse({ providerByRole: { coder: 'claude-code' } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.providerByRole.coder).toBe('claude-code');
      expect(r.data.providerByRole.planner).toBe('claude-code');
      expect(r.data.providerByRole.integrator).toBe('codex');
    }
  });

  it("rejects defaultTier 'foo'", () => {
    expect(AgentOpsConfigSchema.safeParse({ defaultTier: 'foo' }).success).toBe(false);
  });

  it('rejects stallThresholdSeconds = 0', () => {
    expect(AgentOpsConfigSchema.safeParse({ stallThresholdSeconds: 0 }).success).toBe(false);
  });

  it('AGENT_OPS_DEFAULTS is frozen', () => {
    expect(Object.isFrozen(AGENT_OPS_DEFAULTS)).toBe(true);
  });
});
