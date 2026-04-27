// Compact-list plan renderer per docs/models/ui-policy.md.
//
// Pure: takes a Plan + per-task est USD map, returns the printable string.
// Renderer never reads from the DB.

import type { Plan, Task } from '@beaver-ai/core';

import { color } from './colors.js';

export interface PlanRenderOptions {
  /** Optional per-task estimated USD; missing entries omit the est line. */
  estUsd?: Record<string, number>;
  /** Optional per-run cap, printed on the totals line. */
  perRunCapUsd?: number;
}

const COL = 14;
const ROLE_COL = 18;

function pad(s: string, n: number): string {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function depsLine(task: Task, est: number | undefined): string {
  const deps = task.dependsOn.length === 0 ? 'no deps' : `deps: ${task.dependsOn.join(', ')}`;
  const tail = est === undefined ? '' : ` · est. ${fmtUsd(est)}`;
  return `${color.dim('→')} ${color.dim(deps + tail)}`;
}

export function renderPlan(plan: Plan, opts: PlanRenderOptions = {}): string {
  const lines: string[] = [];
  const header =
    plan.parentVersion !== undefined
      ? `plan v${plan.version} (parent: v${plan.parentVersion})`
      : `plan v${plan.version}`;
  const modSuffix =
    plan.modifiedBy && plan.modificationReason
      ? ` — modified by ${plan.modifiedBy}: "${plan.modificationReason}"`
      : '';
  lines.push(color.prompt(header + modSuffix));
  lines.push('');

  if (plan.tasks.length === 0) {
    lines.push(color.dim('  (no tasks)'));
    return lines.join('\n');
  }

  let total = 0;
  for (const task of plan.tasks) {
    const est = opts.estUsd?.[task.id];
    if (est !== undefined) total += est;
    const id = pad(task.id, COL);
    const role = pad(`[${task.role}]`, ROLE_COL);
    lines.push(`  ${id}${role}${task.goal}`);
    lines.push(`  ${' '.repeat(COL + ROLE_COL - 1)}${depsLine(task, est)}`);
  }
  lines.push('');
  const cap = opts.perRunCapUsd === undefined ? '' : `  (per-run cap ${fmtUsd(opts.perRunCapUsd)})`;
  lines.push(`  total est. ${fmtUsd(total)}${cap}`);
  return lines.join('\n');
}
