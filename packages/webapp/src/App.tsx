// Top-level shell. Header (run id badge + nav) + active panel slot.
// Per-panel components: status panel renders the GoalBox empty state
// when no run is active, and the Bento grid (W.3) once a runId is set.
// Other panels: #checkpoints (W.4), #plan / #logs / #review (W.5),
// #wiki (W.6 / 4U.5 — still stubbed here).

import { useCallback, useMemo, useState } from 'react';

import { Bento } from './components/Bento.js';
import { CheckpointPanel } from './components/CheckpointPanel.js';
import { GoalBox } from './components/GoalBox.js';
import { HelpDialog } from './components/HelpDialog.js';
import { LogsPanel } from './components/LogsPanel.js';
import { PlanPanel } from './components/PlanPanel.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { WikiSearch } from './components/WikiSearch.js';
import { makeMockAskWikiTransport } from './hooks/mockAskWikiTransport.js';
import { makeMockCheckpointTransport } from './hooks/mockCheckpointTransport.js';
import { makeMockEventsTransport } from './hooks/mockEventsTransport.js';
import { makeMockFinalReviewTransport } from './hooks/mockFinalReviewTransport.js';
import { makeMockPlanTransport } from './hooks/mockPlanTransport.js';
import { makeMockTransport } from './hooks/mockTransport.js';
import type { AskWikiTransport } from './hooks/useAskWiki.js';
import { useCheckpoints, type CheckpointTransport } from './hooks/useCheckpoints.js';
import { useEvents, type EventsTransport } from './hooks/useEvents.js';
import { useFinalReview, type FinalReviewTransport } from './hooks/useFinalReview.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { usePlanList, type PlanListTransport } from './hooks/usePlanList.js';
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

function CheckpointsPanel({
  activeRunId,
  transport,
}: {
  activeRunId: string | null;
  transport: CheckpointTransport;
}) {
  const { checkpoints, answer } = useCheckpoints(activeRunId, transport);
  return <CheckpointPanel checkpoints={checkpoints} onAnswer={answer} />;
}

function PlanRoute({
  activeRunId,
  transport,
}: {
  activeRunId: string | null;
  transport: PlanListTransport;
}) {
  const plans = usePlanList(activeRunId, transport);
  return <PlanPanel plans={plans} />;
}

function LogsRoute({
  activeRunId,
  transport,
}: {
  activeRunId: string | null;
  transport: EventsTransport;
}) {
  const events = useEvents(activeRunId, transport);
  return <LogsPanel events={events} />;
}

function ReviewRoute({
  activeRunId,
  transport,
}: {
  activeRunId: string | null;
  transport: FinalReviewTransport;
}) {
  const { report, decide } = useFinalReview(activeRunId, transport);
  return <ReviewPanel report={report} onDecide={decide} />;
}

export interface AppProps {
  /** Caller wires this to the upstream run-start path. Tests inject a
   *  spy. The Tauri shell (4D.1) wires it to invoke('runs.start', …). */
  onGoal?: (goal: string) => void;
  /** Test seams — defaults are mock transports that exercise the demo. */
  transport?: RunSnapshotTransport;
  checkpointTransport?: CheckpointTransport;
  planTransport?: PlanListTransport;
  eventsTransport?: EventsTransport;
  finalReviewTransport?: FinalReviewTransport;
  askWikiTransport?: AskWikiTransport;
}

export default function App({
  onGoal,
  transport,
  checkpointTransport,
  planTransport,
  eventsTransport,
  finalReviewTransport,
  askWikiTransport,
}: AppProps = {}) {
  const panel = useCurrentPanel();
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeGoal, setActiveGoal] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  useKeyboardShortcuts({ onHelp: () => setHelpOpen(true) });
  const resolvedTransport = useMemo(
    () => transport ?? makeMockTransport(activeGoal ?? ''),
    [transport, activeGoal],
  );
  const resolvedCheckpointTransport = useMemo(
    () => checkpointTransport ?? makeMockCheckpointTransport(),
    [checkpointTransport],
  );
  const resolvedPlanTransport = useMemo(
    () => planTransport ?? makeMockPlanTransport(),
    [planTransport],
  );
  const resolvedEventsTransport = useMemo(
    () => eventsTransport ?? makeMockEventsTransport(),
    [eventsTransport],
  );
  const resolvedFinalReviewTransport = useMemo(
    () => finalReviewTransport ?? makeMockFinalReviewTransport(),
    [finalReviewTransport],
  );
  const resolvedAskWikiTransport = useMemo(
    () => askWikiTransport ?? makeMockAskWikiTransport(),
    [askWikiTransport],
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
        <div className="flex items-center gap-3">
          <Nav active={panel} />
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-card bg-surface-800 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            aria-label="Open keyboard shortcuts help"
          >
            ?
          </button>
        </div>
      </header>
      <main className="px-6">
        {panel === 'status' ? (
          <StatusPanel
            activeRunId={activeRunId}
            transport={resolvedTransport}
            onSubmit={handleGoal}
          />
        ) : panel === 'checkpoints' ? (
          <CheckpointsPanel activeRunId={activeRunId} transport={resolvedCheckpointTransport} />
        ) : panel === 'plan' ? (
          <PlanRoute activeRunId={activeRunId} transport={resolvedPlanTransport} />
        ) : panel === 'logs' ? (
          <LogsRoute activeRunId={activeRunId} transport={resolvedEventsTransport} />
        ) : panel === 'review' ? (
          <ReviewRoute activeRunId={activeRunId} transport={resolvedFinalReviewTransport} />
        ) : panel === 'wiki' ? (
          <WikiSearch transport={resolvedAskWikiTransport} />
        ) : (
          <PanelStub name={panel} />
        )}
      </main>
      {helpOpen ? <HelpDialog onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
