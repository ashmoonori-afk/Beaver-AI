// Smoke test: every public symbol promised by the package surface is
// reachable from the barrel. Catches accidental drops in src/index.ts
// without requiring a sibling package to depend on @beaver-ai/core.

import { describe, it, expect } from 'vitest';

import * as core from './index.js';

describe('@beaver-ai/core barrel', () => {
  it('exposes provider types and schemas', () => {
    expect(core.UsageSchema).toBeDefined();
    expect(core.CostEstimateSchema).toBeDefined();
    expect(core.AgentBudgetSchema).toBeDefined();
    expect(core.ArtifactRefSchema).toBeDefined();
    expect(core.RunResultSchema).toBeDefined();
    expect(core.CapabilitySchema).toBeDefined();
    expect(core.RunStatusSchema).toBeDefined();
    expect(core.CAPABILITIES).toBeDefined();
    expect(core.RUN_STATUSES).toBeDefined();
  });

  it('exposes plan schema and cycle helper', () => {
    expect(core.TaskSchema).toBeDefined();
    expect(core.PlanSchema).toBeDefined();
    expect(core.TaskRoleSchema).toBeDefined();
    expect(core.PlanModifierSchema).toBeDefined();
    expect(core.TASK_ROLES).toBeDefined();
    expect(core.TASK_ID_PATTERN).toBeInstanceOf(RegExp);
    expect(typeof core.findPlanCycle).toBe('function');
  });

  it('exposes budget schema and defaults', () => {
    expect(core.BudgetConfigSchema).toBeDefined();
    expect(core.BUDGET_DEFAULTS).toEqual({
      perAgentUsd: 1.0,
      perTaskUsd: 3.0,
      perRunUsd: 20.0,
      warnThresholdPct: 70,
    });
  });

  it('exposes agent-ops schema and defaults', () => {
    expect(core.AgentOpsConfigSchema).toBeDefined();
    expect(core.AGENT_OPS_DEFAULTS.maxParallelAgents).toBe(5);
    expect(core.TierSchema).toBeDefined();
  });

  it('exposes workspace db wrapper, migration runner, and every DAO', () => {
    expect(typeof core.openDb).toBe('function');
    expect(typeof core.closeDb).toBe('function');
    expect(typeof core.runMigrations).toBe('function');
    // One representative function per DAO module.
    expect(typeof core.insertProject).toBe('function');
    expect(typeof core.insertRun).toBe('function');
    expect(typeof core.insertPlan).toBe('function');
    expect(typeof core.insertTask).toBe('function');
    expect(typeof core.insertAgent).toBe('function');
    expect(typeof core.insertEvent).toBe('function');
    expect(typeof core.insertCheckpoint).toBe('function');
    expect(typeof core.insertCost).toBe('function');
    expect(typeof core.insertRate).toBe('function');
  });

  it('events DAO is append-only — no updateEvent / deleteEvent in barrel', () => {
    const c = core as Record<string, unknown>;
    expect(c.updateEvent).toBeUndefined();
    expect(c.deleteEvent).toBeUndefined();
  });

  it('exposes both adapters, hook + shim install, and the audit', () => {
    expect(core.ClaudeCodeAdapter).toBeDefined();
    expect(core.CodexAdapter).toBeDefined();
    expect(typeof core.runHook).toBe('function');
    expect(typeof core.installHook).toBe('function');
    expect(typeof core.installShim).toBe('function');
    expect(typeof core.filesystemAudit).toBe('function');
    // Per-provider parse stays under namespaces because both export
    // parseLine / toAgentEvent.
    expect(typeof core.claudeCodeParse.parseLine).toBe('function');
    expect(typeof core.codexParse.parseLine).toBe('function');
  });
});
