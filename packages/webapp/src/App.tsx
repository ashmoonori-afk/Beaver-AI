// Top-level shell. Header (run id badge + nav) + active panel slot.
// Per-panel components: status panel renders the GoalBox empty state
// in W.2; bento status comes in W.3; checkpoint / plan / logs / review
// / wiki land in W.4–W.6.

import { useCallback } from 'react';

import { GoalBox } from './components/GoalBox.js';
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

function StatusPanel({ onSubmit }: { onSubmit: (goal: string) => void }) {
  // Sprint W.3 will replace this empty state with the bento grid when
  // a run is in progress. For W.2 the GoalBox is the entire status panel.
  return (
    <section className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <GoalBox onSubmit={onSubmit} />
    </section>
  );
}

export interface AppProps {
  /** Caller wires this to the upstream run-start path. Tests inject a
   *  spy. The Tauri shell (4D.1) wires it to invoke('runs.start', …). */
  onGoal?: (goal: string) => void;
}

export default function App({ onGoal }: AppProps = {}) {
  const panel = useCurrentPanel();
  const handleGoal = useCallback(
    (goal: string) => {
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
        {panel === 'status' ? <StatusPanel onSubmit={handleGoal} /> : <PanelStub name={panel} />}
      </main>
    </div>
  );
}
