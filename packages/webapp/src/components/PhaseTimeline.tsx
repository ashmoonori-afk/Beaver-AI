// UX-5 — lovable-style intermediate-process visibility.
//
// Groups recent events into the FSM phases (REFINING_GOAL, PLANNING,
// EXECUTING, REVIEWING, FINAL_REVIEW_PENDING) and renders each as a
// step card with a human-readable description + the most recent
// activity inside it. The user gets a "what's happening right now"
// view without having to read the raw event log.
//
// Files touched are surfaced from `task.dispatched` / `task.completed`
// payloads when present so users can see what the agent is producing.

import { useMemo } from 'react';

import type { LogEvent, RunState } from '../types.js';

export interface PhaseTimelineProps {
  events: readonly LogEvent[];
  currentState: RunState;
}

interface Phase {
  key: RunState;
  label: string;
  description: string;
  matches: ReadonlyArray<string>;
}

const PHASES: ReadonlyArray<Phase> = [
  {
    key: 'REFINING_GOAL',
    label: '1. Refining your goal',
    description:
      'Distilling your input into a structured PRD/MVP outline so the planner has clear acceptance criteria.',
    matches: ['goal.refined', 'state.transition'],
  },
  {
    key: 'PLANNING',
    label: '2. Drafting the plan',
    description:
      'Turning the PRD into a list of agent tasks with dependencies, role assignments, and budget hints.',
    matches: ['plan.persisted', 'plan.multitask_truncated'],
  },
  {
    key: 'EXECUTING',
    label: '3. Coding',
    description:
      'A coder agent (Claude Code or Codex) opens a worktree, edits files, and runs the project tooling.',
    matches: ['task.dispatched', 'task.progress', 'task.completed'],
  },
  {
    key: 'REVIEWING',
    label: '4. Reviewing',
    description:
      'The reviewer agent inspects the changes, runs validations, and votes accept / retry / escalate.',
    matches: ['review.verdict'],
  },
  {
    key: 'FINAL_REVIEW_PENDING',
    label: '5. Awaiting your approval',
    description:
      'Beaver paused at the final-review checkpoint. Approve to finalize or reject to abort.',
    matches: [],
  },
];

const STATE_ORDER: RunState[] = [
  'INITIALIZED',
  'REFINING_GOAL',
  'PLANNING',
  'EXECUTING',
  'REVIEWING',
  'FINAL_REVIEW_PENDING',
  'COMPLETED',
  'FAILED',
  'ABORTED',
];

function phaseStatus(phase: Phase, currentState: RunState): 'done' | 'active' | 'pending' {
  const phaseIdx = STATE_ORDER.indexOf(phase.key);
  const curIdx = STATE_ORDER.indexOf(currentState);
  if (curIdx === -1 || phaseIdx === -1) return 'pending';
  // Terminal states put everything to done.
  if (currentState === 'COMPLETED') return 'done';
  if (currentState === 'FAILED' || currentState === 'ABORTED') {
    return curIdx > phaseIdx ? 'done' : 'pending';
  }
  if (phaseIdx < curIdx) return 'done';
  if (phaseIdx === curIdx) return 'active';
  return 'pending';
}

/** Best-effort extract of a "files touched" list from event payloads.
 *  Each task.* event may include `{ files: string[] }`. We dedupe and
 *  cap at 12 to keep the UI compact. */
function filesFromEvents(events: readonly LogEvent[]): string[] {
  const seen = new Set<string>();
  for (const e of events) {
    if (!e.raw) continue;
    try {
      const parsed = JSON.parse(e.raw) as { files?: unknown };
      if (Array.isArray(parsed.files)) {
        for (const f of parsed.files) {
          if (typeof f === 'string') seen.add(f);
        }
      }
    } catch {
      // ignore non-JSON payloads
    }
    if (seen.size >= 12) break;
  }
  return Array.from(seen).slice(0, 12);
}

/** Most recent event whose `kind`/`message` matches one of the phase's
 *  patterns. Returns the message body so the card can show "the agent
 *  just did X". */
function latestActivity(phase: Phase, events: readonly LogEvent[]): string | null {
  if (phase.matches.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (!e) continue;
    const target = e.message ?? '';
    if (phase.matches.some((m) => target.includes(m))) {
      return target;
    }
  }
  return null;
}

export function PhaseTimeline({ events, currentState }: PhaseTimelineProps) {
  const files = useMemo(() => filesFromEvents(events), [events]);

  return (
    <section
      className="rounded-card border border-surface-700 bg-surface-800 p-4"
      aria-label="Run phase timeline"
    >
      <h3 className="mb-3 text-body font-medium text-text-50">What's happening</h3>
      <ol className="flex flex-col gap-2">
        {PHASES.map((phase) => {
          const status = phaseStatus(phase, currentState);
          const recent = latestActivity(phase, events);
          return (
            <li
              key={phase.key}
              className={`flex items-start gap-3 rounded-card border px-3 py-2 ${
                status === 'active'
                  ? 'border-accent-500 bg-surface-900'
                  : status === 'done'
                    ? 'border-emerald-700/40 bg-emerald-950/20'
                    : 'border-surface-700 bg-surface-800/60'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-caption ${
                  status === 'active'
                    ? 'animate-pulse bg-accent-500 text-surface-900'
                    : status === 'done'
                      ? 'bg-emerald-700 text-emerald-100'
                      : 'bg-surface-700 text-text-500'
                }`}
              >
                {status === 'done' ? '✓' : status === 'active' ? '●' : '○'}
              </span>
              <div className="flex-1">
                <p className="text-body text-text-50">{phase.label}</p>
                <p className="mt-0.5 text-caption text-text-400">{phase.description}</p>
                {recent && status !== 'pending' ? (
                  <p className="mt-1 text-caption text-text-500">
                    <span className="opacity-70">Latest:</span> {recent}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {files.length > 0 ? (
        <div className="mt-4 border-t border-surface-700 pt-3">
          <h4 className="text-caption uppercase tracking-wide text-text-500">Files touched</h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {files.map((f) => (
              <li
                key={f}
                className="rounded border border-surface-600 bg-surface-900 px-2 py-1 font-mono text-caption text-text-300"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
