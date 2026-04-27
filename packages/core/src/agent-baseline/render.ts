// Agent baseline system-prompt renderer.
//
// Pure (input -> string). All fs I/O happens in `loadFromDisk` so this
// module is trivially snapshot-testable and deterministic. See
// docs/models/agent-baseline.md "Precedence and merging".
//
// Layer order (top-down):
//   1. baseline           (or userOverride if provided — replaces, not merges)
//   2. repoClaudeMd       (additive, headed by origin)
//   3. repoAgentsMd       (additive, headed by origin)
//   4. roleAddendum
//   5. taskPrompt
//
// Each layer is preceded by a `## ` header so the agent can tell origins
// apart. Single trailing newline is enforced.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TaskRole } from '../plan/schema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const AGENT_BASELINE_PROVIDERS = ['claude-code', 'codex'] as const;
export type AgentBaselineProvider = (typeof AGENT_BASELINE_PROVIDERS)[number];

export interface RenderInputs {
  baseline: string;
  userOverride?: string;
  repoClaudeMd?: string;
  repoAgentsMd?: string;
  roleAddendum: string;
  taskPrompt: string;
}

function section(header: string, body: string): string {
  return `## ${header}\n\n${body.trim()}\n`;
}

/**
 * Pure render: pre-loaded strings -> single system-prompt string.
 *
 * `userOverride`, when provided, REPLACES `baseline` (it is rare; reserved
 * for users with a strong house style). `repoClaudeMd` / `repoAgentsMd`
 * are always additive when present.
 */
export function renderSystemPrompt(inputs: RenderInputs): string {
  const baselineText = inputs.userOverride ?? inputs.baseline;
  const baselineHeader = inputs.userOverride ? 'Agent baseline (user override)' : 'Agent baseline';

  const parts: string[] = [section(baselineHeader, baselineText)];

  if (inputs.repoClaudeMd) {
    parts.push(section('Project conventions (from CLAUDE.md)', inputs.repoClaudeMd));
  }
  if (inputs.repoAgentsMd) {
    parts.push(section('Project conventions (from AGENTS.md)', inputs.repoAgentsMd));
  }

  parts.push(section('Role addendum', inputs.roleAddendum));
  parts.push(section('Task', inputs.taskPrompt));

  // Single trailing newline. parts already end with one '\n'; join inserts
  // a blank line between sections.
  return parts.join('\n').replace(/\n+$/, '\n');
}

export interface LoadFromDiskOpts {
  provider: AgentBaselineProvider;
  role: TaskRole;
  repoRoot: string;
  taskPrompt: string;
  userOverridePath?: string;
}

function readIfExists(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'ENOENT'
    ) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Locate bundled assets and call {@link renderSystemPrompt}.
 *
 * Provider is currently informational at this layer — it influences which
 * file name `writeBaselineToWorktree` writes, not the rendered text.
 */
export function loadAndRenderFromDisk(opts: LoadFromDiskOpts): string {
  const baseline = fs.readFileSync(path.join(HERE, 'AGENT_BASELINE.md'), 'utf8');
  const roleAddendum = fs.readFileSync(path.join(HERE, 'role', `${opts.role}.md`), 'utf8');

  const userOverride = opts.userOverridePath ? readIfExists(opts.userOverridePath) : undefined;
  const repoClaudeMd = readIfExists(path.join(opts.repoRoot, 'CLAUDE.md'));
  const repoAgentsMd = readIfExists(path.join(opts.repoRoot, 'AGENTS.md'));

  return renderSystemPrompt({
    baseline,
    roleAddendum,
    taskPrompt: opts.taskPrompt,
    ...(userOverride !== undefined && { userOverride }),
    ...(repoClaudeMd !== undefined && { repoClaudeMd }),
    ...(repoAgentsMd !== undefined && { repoAgentsMd }),
  });
}
