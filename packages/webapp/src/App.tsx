// Top-level shell. Header (run id badge + nav) + active panel slot.
// Per-panel components are stubs in this sprint; real renders land in
// 4U.1 (GoalBox) → 4U.2 (bento) → 4U.3 (CheckpointCard) → 4U.4 → 4U.5.

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

export default function App() {
  const panel = useCurrentPanel();
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
        <PanelStub name={panel} />
      </main>
    </div>
  );
}
