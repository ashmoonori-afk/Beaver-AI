// Unified checkpoint frame + per-kind body renderer per ui-policy.md.
// Pure: data → string. The frame is owned by this module; per-kind bodies
// receive the prompt text and a hint string only — no DB access.

import type { CheckpointKind } from '@beaver-ai/core';

import { color } from './colors.js';

export interface CheckpointHeader {
  runId: string;
  spentUsd: number;
  elapsedMs: number;
  context: string;
}

export interface CheckpointRenderInput {
  kind: CheckpointKind;
  prompt: string;
  header: CheckpointHeader;
  hint?: string;
}

const FRAME_WIDTH = 60;

function rule(kind: string): string {
  const left = `─── checkpoint: ${kind} `;
  const fill = '─'.repeat(Math.max(3, FRAME_WIDTH - left.length));
  return color.dim(left + fill);
}

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function bodyFor(kind: CheckpointKind, prompt: string): string {
  switch (kind) {
    case 'plan-approval':
    case 'final-review':
    case 'risky-change-confirmation':
      return `${prompt}\n\n${color.prompt('[ approve | comment <text> | reject ]')}`;
    case 'budget-exceeded':
      return `${prompt}\n\n${color.prompt('[ stop | increase | continue-once ]')}`;
    case 'goal-clarification':
    case 'merge-conflict':
    case 'escalation':
      return `${prompt}\n\n${color.prompt('> _')}`;
    default:
      return prompt;
  }
}

export function renderCheckpoint(input: CheckpointRenderInput): string {
  const { kind, prompt, header, hint } = input;
  const lines: string[] = [];
  lines.push(rule(kind));
  lines.push(
    color.dim(
      `run: ${header.runId} · spent: $${header.spentUsd.toFixed(2)} · elapsed: ${fmtElapsed(header.elapsedMs)}`,
    ),
  );
  lines.push(color.dim(`context: ${header.context}`));
  lines.push('');
  if (hint && hint.trim().length > 0) {
    lines.push(color.dim(`[hint] ${hint}`));
  }
  lines.push(bodyFor(kind, prompt));
  return lines.join('\n');
}
