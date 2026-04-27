// Top-level shell. Header (run id badge + nav) + active panel slot.
// Per-panel components: status panel renders the GoalBox empty state
// when no run is active, and the Bento grid (W.3) once a runId is set.
// Checkpoint / plan / logs / review / wiki land in W.4–W.6.

import { useCallback, useMemo, useState } from 'react';

import { Bento } from './components/Bento.js';
import { GoalBox } from './components/GoalBox.js';
import { makeMockTransport } from './hooks/mockTransport.js';
import { useRunSnapshot, type RunSnapshotTransport } from './hooks/useRunSnapshot.js';
import { useCurrentPanel, type Panel, PANELS, navigate } from './router.js';
import { cn } from './lib/utils.js';

const PANEL_LABEL: Record<Panel, string> = {
  status: 'Status',
  checkpoints: 'Checkpoints',
  plan: 'Plan',
  logs: 'Logs',
  review: 'Review',
  wiki: 'Wiki',
};

function Nav({ active }: { active: Panel }) {
  return (
    <nav className="flex gap-2 text-caption">
      {PANELS.map((p) => (
        <button
          key={p}
          onClick={() => navigate(p)}
          className={cn(
            'rounded-card px-3 py-1.5 transition-colors hover:bg-surface-700',
            active === p ? 'bg-surface-700 text-text-50' : 'text-text-300',
          )}
        >
          {PANEL_LABEL[p]}
        </button>
      ))}
    </nav>
  );
}

function PanelStub({ name }: { name: Panel }) {
  return (
    <section className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <p className="text-text-500 text-caption">
        {PANEL_LABEL[name]} panel — coming up in the next sprint.
      </p>
    </section>
  );
}

interface StatusPanelProps {
  activeRunId: string | null;
  transport: RunSnapshotTransport;
  onSubmit: (goal: string) => void;
}

function StatusPanel({ activeRunId, transport, onSubmit }: StatusPanelProps) {
  const snapshot = useRunSnapshot(activeRunId, transport);
  if (!activeRunId || !snapshot) {
    return (
      <section className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <GoalBox onSubmit={onSubmit} />
      </section>
    );
  }
  return <Bento snapshot={snapshot} />;
}

export interface AppProps {
  /** Caller wires this to the upstream run-start path. Tests inject a
   *  spy. The Tauri shell (4D.1) wires it to invoke('runs.start', …). */
  onGoal?: (goal: string) => void;
  /** Test seam: inject a stub transport. Defaults to the mock that walks
   *  PLANNING -> EXECUTING -> COMPLETED so the W.3 demo animates. */
  transport?: RunSnapshotTransport;
}

export default function App({ onGoal, transport }: AppProps = {}) {
  const panel = useCurrentPanel();
  const [activeGoal, setActiveGoal] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const resolvedTransport = useMemo(
    () => transport ?? makeMockTransport(activeGoal ?? ''),
    [transport, activeGoal],
  );
  const handleGoal = useCallback(
    (goal: string) => {
      setActiveGoal(goal);
      setActiveRunId(`r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      if (onGoal) onGoal(goal);
    },
    [onGoal],
  );
  return (
    <div className="min-h-screen bg-surface-900 font-sans">
      <header className="flex items-center justify-between border-b border-surface-700 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-hero text-text-50">Beaver</span>
          <span className="text-caption text-text-500">v0.1</span>
        </div>
        <Nav active={panel} />
      </header>
      <main className="px-6">
        {panel === 'status' ? (
          <StatusPanel
            activeRunId={activeRunId}
            transport={resolvedTransport}
            onSubmit={handleGoal}
          />
        ) : (
          <PanelStub name={panel} />
        )}
      </main>
    </div>
  );
}
