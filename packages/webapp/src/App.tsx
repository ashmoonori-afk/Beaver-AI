// Top-level shell. Header (run id badge + nav) + active panel slot.
// Per-panel components: status panel renders the GoalBox empty state
// when no run is active, and the Bento grid (W.3) once a runId is set.
// Other panels: #checkpoints (W.4), #plan / #logs / #review (W.5),
// #wiki (W.6).
//
// `panels` is a Record<Panel, ReactNode> so adding a new Panel literal
// becomes a compile-time hole, not a silent fall-through to a stub.

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { Bento } from './components/Bento.js';
import { CheckpointPanel } from './components/CheckpointPanel.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { GoalBox } from './components/GoalBox.js';
import { HelpDialog } from './components/HelpDialog.js';
import { LogsPanel } from './components/LogsPanel.js';
import { PlanPanel } from './components/PlanPanel.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { WikiSearch } from './components/WikiSearch.js';
import { WorkspaceBanner } from './components/WorkspaceBanner.js';
import { makeMockAskWikiTransport } from './hooks/mockAskWikiTransport.js';
import { makeMockCheckpointTransport } from './hooks/mockCheckpointTransport.js';
import { makeMockEventsTransport } from './hooks/mockEventsTransport.js';
import { makeMockFinalReviewTransport } from './hooks/mockFinalReviewTransport.js';
import { makeMockPlanTransport } from './hooks/mockPlanTransport.js';
import { makeMockTransport } from './hooks/mockTransport.js';
import {
  makeTauriAskWikiTransport,
  makeTauriCheckpointTransport,
  makeTauriEventsTransport,
  makeTauriFinalReviewTransport,
  makeTauriPlanListTransport,
  makeTauriRunSnapshotTransport,
  tauriStartRun,
} from './hooks/tauriTransports.js';
import type { AskWikiTransport } from './hooks/useAskWiki.js';
import { useCheckpoints, type CheckpointTransport } from './hooks/useCheckpoints.js';
import { useEvents, type EventsTransport } from './hooks/useEvents.js';
import { useFinalReview, type FinalReviewTransport } from './hooks/useFinalReview.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { usePlanList, type PlanListTransport } from './hooks/usePlanList.js';
import { useRunSnapshot, type RunSnapshotTransport } from './hooks/useRunSnapshot.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { classifyError, type ClassifiedError } from './lib/errorMessages.js';
import { useCurrentPanel, type Panel, PANELS, navigate } from './router.js';
import { cn } from './lib/utils.js';
import { isTauri } from './lib/tauriRuntime.js';

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

/** Generate a fresh run id. Prefers crypto.randomUUID (real entropy);
 *  falls back to Date.now() + Math.random() in environments that
 *  don't expose it (older WebViews, edge cases in jsdom). */
function makeRunId(): string {
  const cryptoRef: { randomUUID?: () => string } | undefined = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoRef?.randomUUID) return `r-${cryptoRef.randomUUID()}`;
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StatusPanelProps {
  activeRunId: string | null;
  transport: RunSnapshotTransport;
  onSubmit: (goal: string) => void;
  /** Tauri-only: when no workspace is selected we render a folder
   *  picker card instead of the GoalBox so the user can't submit a
   *  goal that has nowhere to land. Browser mode passes null. */
  workspaceCard?: ReactNode;
}

function StatusPanel({ activeRunId, transport, onSubmit, workspaceCard }: StatusPanelProps) {
  const snapshot = useRunSnapshot(activeRunId, transport);
  if (!activeRunId || !snapshot) {
    return (
      <section className="flex h-[calc(100vh-4rem)] items-center justify-center">
        {workspaceCard ?? <GoalBox onSubmit={onSubmit} />}
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
  // 4D.2: when running inside the Tauri shell, default to the real
  // transports. Browser (mock) transports stay the default outside
  // the desktop runtime so dev-mode + tests behave the same as before.
  const desktop = isTauri();
  const workspace = useWorkspace();
  const [bannerError, setBannerError] = useState<ClassifiedError | null>(null);
  const lastGoalRef = useRef<string | null>(null);
  const resolvedTransport = useMemo(
    () =>
      transport ??
      (desktop ? makeTauriRunSnapshotTransport() : makeMockTransport(activeGoal ?? '')),
    [transport, desktop, activeGoal],
  );
  const resolvedCheckpointTransport = useMemo(
    () =>
      checkpointTransport ??
      (desktop ? makeTauriCheckpointTransport() : makeMockCheckpointTransport()),
    [checkpointTransport, desktop],
  );
  const resolvedPlanTransport = useMemo(
    () => planTransport ?? (desktop ? makeTauriPlanListTransport() : makeMockPlanTransport()),
    [planTransport, desktop],
  );
  const resolvedEventsTransport = useMemo(
    () => eventsTransport ?? (desktop ? makeTauriEventsTransport() : makeMockEventsTransport()),
    [eventsTransport, desktop],
  );
  const resolvedFinalReviewTransport = useMemo(
    () =>
      finalReviewTransport ??
      (desktop ? makeTauriFinalReviewTransport() : makeMockFinalReviewTransport()),
    [finalReviewTransport, desktop],
  );
  const resolvedAskWikiTransport = useMemo(
    () => askWikiTransport ?? (desktop ? makeTauriAskWikiTransport() : makeMockAskWikiTransport()),
    [askWikiTransport, desktop],
  );
  // Guard against double-submit while a tauri runs_start is in flight.
  // Without this, a quick second click would spawn a second Rust
  // sidecar; whichever response resolved last would set activeRunId,
  // which could then point at the wrong run.
  const startingRef = useRef(false);
  const handleGoal = useCallback(
    (goal: string) => {
      if (startingRef.current) return;
      setActiveGoal(goal);
      lastGoalRef.current = goal;
      setBannerError(null);
      // In Tauri the run id comes from the Rust side (so the renderer
      // and the orchestrator agree). In browser mode synthesize a local
      // id so the mock transport has something to key on.
      if (desktop) {
        startingRef.current = true;
        tauriStartRun(goal)
          .then(({ runId }) => setActiveRunId(runId))
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error('runs_start failed', err);
            setBannerError(classifyError(err));
          })
          .finally(() => {
            startingRef.current = false;
          });
      } else {
        setActiveRunId(makeRunId());
      }
      if (onGoal) onGoal(goal);
    },
    [onGoal, desktop],
  );

  const handleBannerAction = useCallback(
    (intent: 'pick-workspace' | 'retry' | 'open-docs') => {
      if (intent === 'pick-workspace') {
        setBannerError(null);
        void workspace.pick();
        return;
      }
      if (intent === 'retry') {
        const last = lastGoalRef.current;
        setBannerError(null);
        if (last !== null && last.trim().length > 0) {
          handleGoal(last);
        }
        return;
      }
      // 'open-docs' — ErrorBanner handles window.open itself.
    },
    [workspace, handleGoal],
  );

  // Tauri-only: block goal submission until a workspace is picked, by
  // rendering the picker card in the GoalBox slot. Browser mode keeps
  // the GoalBox so demo/dev flows continue to work without a folder.
  const workspaceCard =
    desktop && !workspace.path && !workspace.loading ? (
      <WorkspaceBanner
        path={workspace.path}
        loading={workspace.loading}
        error={workspace.error}
        onPick={() => {
          void workspace.pick();
        }}
        variant="card"
      />
    ) : null;

  const panels: Record<Panel, ReactNode> = {
    status: (
      <StatusPanel
        activeRunId={activeRunId}
        transport={resolvedTransport}
        onSubmit={handleGoal}
        {...(workspaceCard !== null ? { workspaceCard } : {})}
      />
    ),
    checkpoints: (
      <CheckpointsPanel activeRunId={activeRunId} transport={resolvedCheckpointTransport} />
    ),
    plan: <PlanRoute activeRunId={activeRunId} transport={resolvedPlanTransport} />,
    logs: <LogsRoute activeRunId={activeRunId} transport={resolvedEventsTransport} />,
    review: <ReviewRoute activeRunId={activeRunId} transport={resolvedFinalReviewTransport} />,
    wiki: <WikiSearch transport={resolvedAskWikiTransport} />,
  };
  return (
    <div className="min-h-screen bg-surface-900 font-sans">
      <header className="flex items-center justify-between border-b border-surface-700 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-hero text-text-50">Beaver</span>
          <span className="text-caption text-text-500">v0.1</span>
        </div>
        <div className="flex items-center gap-3">
          {desktop ? (
            <WorkspaceBanner
              path={workspace.path}
              loading={workspace.loading}
              error={workspace.error}
              onPick={() => {
                void workspace.pick();
              }}
              variant="chip"
            />
          ) : null}
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
      {bannerError ? (
        <ErrorBanner
          error={bannerError}
          onAction={handleBannerAction}
          onDismiss={() => setBannerError(null)}
        />
      ) : null}
      <main className="px-6">{panels[panel]}</main>
      {helpOpen ? <HelpDialog onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
