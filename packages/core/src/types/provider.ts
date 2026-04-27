// Provider/adapter contract per docs/architecture/provider-adapters.md.
//
// Schemas use zod (single source of truth); types are inferred via z.infer.
// Behavior-bearing shapes (ProviderAdapter, function/abstract fields of
// RunOptions) are TS interfaces because they cannot be expressed in zod.

import { z } from 'zod';

import { AgentBudgetSchema, type AgentBudget } from './budget.js';
import { ArtifactRefSchema } from './artifact.js';
import type { AgentEvent } from './event.js';
import type { ToolSpec } from './tool.js';
import { UsageSchema, CostEstimateSchema, type Usage, type CostEstimate } from './usage.js';

// Capabilities — provider-adapters.md §Capabilities.
export const CAPABILITIES = ['file-edit', 'web', 'sandbox', 'custom-tools', 'streaming'] as const;
export const CapabilitySchema = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof CapabilitySchema>;

export const CapabilitiesSchema = z.array(CapabilitySchema);
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

// RunStatus — provider-adapters.md RunResult.status.
export const RUN_STATUSES = ['ok', 'failed', 'timeout', 'aborted', 'budget_exceeded'] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// RunOptions — provider-adapters.md interface.
export interface RunOptions {
  prompt: string;
  workdir: string;
  systemPrompt?: string;
  tools?: ToolSpec[];
  timeoutMs?: number;
  budget?: AgentBudget;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

// RunResult — provider-adapters.md interface.
export const RunResultSchema = z.object({
  status: RunStatusSchema,
  summary: z.string(),
  artifacts: z.array(ArtifactRefSchema),
  usage: UsageSchema,
  finalAssistantMessage: z.string().optional(),
  rawTranscriptPath: z.string().min(1),
});
export type RunResult = z.infer<typeof RunResultSchema>;

// ProviderAdapter — methods cannot be expressed in zod.
export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: Capabilities;
  run(opts: RunOptions): Promise<RunResult>;
  cost(usage: Usage): CostEstimate;
}

// Re-export the schemas/types this interface consumes so callers can
// import everything from one place. No alias renames (P0.S2 spaghetti rule).
export {
  AgentBudgetSchema,
  ArtifactRefSchema,
  UsageSchema,
  CostEstimateSchema,
  type AgentBudget,
  type AgentEvent,
  type ToolSpec,
  type Usage,
  type CostEstimate,
};
export type { ArtifactRef } from './artifact.js';
