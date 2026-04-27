// AgentOpsConfig per docs/models/agent-operations.md.
// Every knob is optional with a documented default so callers can supply
// only what they intend to override (e.g. just stallThresholdSeconds).
//
// Defaults are tagged 'initial values, not measured constants' in the doc
// and will be revisited after the first reference runs.

import { z } from 'zod';

import type { TaskRole } from '../plan/schema.js';

const DEFAULT_TIMEOUT_MINUTES: Readonly<Record<TaskRole, number>> = {
  planner: 5,
  coder: 30,
  reviewer: 10,
  tester: 20,
  integrator: 15,
  summarizer: 5,
};

const DEFAULT_PROVIDER_BY_ROLE: Readonly<Record<TaskRole, string>> = {
  planner: 'claude-code',
  coder: 'codex',
  reviewer: 'claude-code',
  tester: 'claude-code',
  integrator: 'codex',
  summarizer: 'claude-code',
};

export const TIER_VALUES = ['balanced', 'premium'] as const;
export const TierSchema = z.enum(TIER_VALUES);
export type Tier = z.infer<typeof TierSchema>;

// Note on .default() shape: zod 4 wants a value matching the schema's
// *output* (post-defaults) type, not the input. Pass the fully-populated
// object so empty input -> all defaults; partial input still merges per-field.
const TimeoutMinutesSchema = z
  .object({
    planner: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.planner),
    coder: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.coder),
    reviewer: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.reviewer),
    tester: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.tester),
    integrator: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.integrator),
    summarizer: z.number().positive().default(DEFAULT_TIMEOUT_MINUTES.summarizer),
  })
  .default(() => ({ ...DEFAULT_TIMEOUT_MINUTES }));

const ProviderByRoleSchema = z
  .object({
    planner: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.planner),
    coder: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.coder),
    reviewer: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.reviewer),
    tester: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.tester),
    integrator: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.integrator),
    summarizer: z.string().min(1).default(DEFAULT_PROVIDER_BY_ROLE.summarizer),
  })
  .default(() => ({ ...DEFAULT_PROVIDER_BY_ROLE }));

export const AgentOpsConfigSchema = z.object({
  maxParallelAgents: z.number().int().min(1).default(5),
  retriesPerTask: z.number().int().nonnegative().default(2),
  timeoutMinutes: TimeoutMinutesSchema,
  providerByRole: ProviderByRoleSchema,
  defaultTier: TierSchema.default('balanced'),
  stallThresholdSeconds: z.number().int().positive().default(120),
});
export type AgentOpsConfig = z.infer<typeof AgentOpsConfigSchema>;

export const AGENT_OPS_DEFAULTS: Readonly<AgentOpsConfig> = Object.freeze({
  maxParallelAgents: 5,
  retriesPerTask: 2,
  timeoutMinutes: { ...DEFAULT_TIMEOUT_MINUTES },
  providerByRole: { ...DEFAULT_PROVIDER_BY_ROLE },
  defaultTier: 'balanced',
  stallThresholdSeconds: 120,
});
