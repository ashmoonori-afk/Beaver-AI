// #plan panel — latest plan card + thin version dropdown. Selecting an
// older version dims the rest of the screen (no "history" tab). Same
// compact list the CLI renders, so they stay in sync.

import { useMemo, useState } from 'react';

import { cn } from '../lib/utils.js';
import type { PlanSummary, PlanTask } from '../types.js';

export interface PlanPanelProps {
  plans: readonly PlanSummary[];
}

export function PlanPanel({ plans }: PlanPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latest = plans[0];
  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? latest,
    [plans, selectedId, latest],
  );
  const isHistorical = selected !== undefined && selected !== latest;

  if (!latest || !selected) {
    return (
      <section
        data-testid="plan-panel"
        className="flex h-[calc(100vh-4rem)] items-center justify-center"
      >
        <p className="text-caption text-text-500">
          No plan yet. The planner will write one once a run is in flight.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="plan-panel"
      className={cn(
        'mx-auto w-full max-w-3xl space-y-4 py-6 transition-opacity',
        isHistorical && 'opacity-60',
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-hero text-text-50">Plan</h2>
        <PlanVersionDropdown
          plans={plans}
          selectedId={selected.id}
          onSelect={(id) => setSelectedId(id === latest.id ? null : id)}
        />
      </header>
      <PlanCard plan={selected} />
    </section>
  );
}

interface PlanVersionDropdownProps {
  plans: readonly PlanSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function PlanVersionDropdown({ plans, selectedId, onSelect }: PlanVersionDropdownProps) {
  return (
    <label className="flex items-center gap-2 text-caption text-text-500">
      <span>Version</span>
      <select
        data-testid="plan-version-dropdown"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-card bg-surface-800 px-3 py-1.5 text-body text-text-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        aria-label="Plan version"
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            v{p.version}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  return (
    <article data-testid={`plan-card-${plan.id}`} className="rounded-card bg-surface-800 px-5 py-4">
      <ol className="space-y-2">
        {plan.tasks.map((t, idx) => (
          <li key={t.id} className="flex items-start gap-3">
            <span className="text-caption text-text-500 font-mono w-6 shrink-0">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <PlanTaskRow task={t} />
          </li>
        ))}
      </ol>
    </article>
  );
}

function PlanTaskRow({ task }: { task: PlanTask }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-body text-text-50">{task.title}</span>
      <span className="text-caption text-text-500 font-mono">
        {task.agentRole}
        {task.dependsOn && task.dependsOn.length > 0
          ? ` · depends on ${task.dependsOn.join(', ')}`
          : ''}
      </span>
    </div>
  );
}
