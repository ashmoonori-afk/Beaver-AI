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
import { PhaseTimeline } from './components/PhaseTimeline.js';
import { PlanPanel } from './components/PlanPanel.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { RunsList } from './components/RunsList.js';
import { SidecarDiagnostic } from './components/SidecarDiagnostic.js';
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
import { useRunsList } from './hooks/useRunsList.js';
import { useSidecarDiagnostic } from './hooks/useSidecarDiagnostic.js';
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
  eventsTransport: EventsTransport;
  onSubmit: (goal: string) => void;
  /** Tauri-only: when no workspace is selected we render a folder
   *  picker card instead of the GoalBox so the user can't submit a
   *  goal that has nowhere to land. Browser mode passes null. */
  workspaceCard?: ReactNode;
  /** UX-2: render the run history sidebar when in Tauri mode. */
  runsSidebar?: ReactNode;
  /** UX-4: Continue / iterate-on-completed CTA shown when the active
   *  run is in a terminal state. */
  continueCta?: ReactNode;
}

function StatusPanel({
  activeRunId,
  transport,
  eventsTransport,
  onSubmit,
  workspaceCard,
  runsSidebar,
  continueCta,
}: StatusPanelProps) {
  const snapshot = useRunSnapshot(activeRunId, transport);
  // UX-5: feed the same events stream that drives the Logs panel
  // into the PhaseTimeline so the user sees what's happening now
  // without leaving the Status panel.
  const events = useEvents(activeRunId, eventsTransport);
  // Watchdog: if the sidecar dies before inserting the runs row, this
  // pulls the stderr tail so the user sees Node's actual error.
  const diagnostic = useSidecarDiagnostic(activeRunId, snapshot);
  const isTerminal =
    snapshot?.state === 'COMPLETED' ||
    snapshot?.state === 'FAILED' ||
    snapshot?.state === 'ABORTED';

  if (!activeRunId || !snapshot) {
    return (
      <section className="grid gap-6 py-6 lg:grid-cols-[1fr,18rem]">
        <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-6">
          {activeRunId && diagnostic.showing ? (
            <div className="w-full max-w-2xl">
              <SidecarDiagnostic stderrTail={diagnostic.stderrTail} />
            </div>
          ) : activeRunId ? (
            <p className="text-body text-text-400" aria-live="polite">
              Starting run… (this should take a couple seconds)
            </p>
          ) : (
            (workspaceCard ?? <GoalBox onSubmit={onSubmit} />)
          )}
        </div>
        {runsSidebar ? (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <h2 className="mb-2 text-caption uppercase tracking-wide text-text-500">Runs</h2>
            {runsSidebar}
          </aside>
        ) : null}
      </section>
    );
  }
  return (
    <section className="grid gap-6 py-6 lg:grid-cols-[1fr,18rem]">
      <div className="flex flex-col gap-6">
        <Bento snapshot={snapshot} />
        <PhaseTimeline events={events} currentState={snapshot.state} />
        {isTerminal && continueCta ? continueCta : null}
      </div>
      {runsSidebar ? (
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-2 text-caption uppercase tracking-wide text-text-500">Runs</h2>
          {runsSidebar}
        </aside>
      ) : null}
    </section>
  );
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
  const runs = useRunsList();
  const [bannerError, setBannerError] = useState<ClassifiedError | null>(null);
  const lastGoalRef = useRef<string | null>(null);
  const [continueDraft, setContinueDraft] = useState<string>('');
  // review-pass v0.1: in desktop mode the transport doesn't depend on
  // activeGoal — re-creating it on every keystroke caused
  // useRunSnapshot to re-subscribe and blink the Bento. Split the
  // memo so only the browser-mode mock transport carries activeGoal
  // as a dep.
  const resolvedTransport = useMemo(() => {
    if (transport) return transport;
    if (desktop) return makeTauriRunSnapshotTransport();
    return makeMockTransport(activeGoal ?? '');
  }, [transport, desktop, ...(desktop ? [] : [activeGoal])]);
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

  /** UX-1 — clear the active run so the GoalBox returns. The previous
   *  run remains in SQLite (visible from the Runs panel UX-2) so this
   *  is non-destructive: it only resets the renderer-side selection. */
  const handleStartOver = useCallback(() => {
    setActiveRunId(null);
    setActiveGoal(null);
    setBannerError(null);
    setContinueDraft('');
    navigate('status');
  }, []);

  /** UX-2/UX-3 — re-key onto a previous run from the runs sidebar.
   *  The existing transports re-subscribe automatically since they
   *  depend on activeRunId. Pending-review runs land back in the
   *  CheckpointPanel where the user can answer. */
  const handleSelectRun = useCallback((runId: string) => {
    setActiveRunId(runId);
    setActiveGoal(null);
    setBannerError(null);
    setContinueDraft('');
  }, []);

  /** UX-4 — start a follow-up run using the previous goal as context.
   *  v0.1 keeps the orchestrator stateless across runs: we prepend the
   *  previous goal to the new draft so the planner/refiner can see
   *  what was attempted. v0.1.x will thread BEAVER_PARENT_RUN_ID and
   *  load the prior run's plan as additional context. */
  const handleContinueRun = useCallback(() => {
    const prior = runs.find((r) => r.id === activeRunId);
    const draft = continueDraft.trim();
    if (!draft) return;
    const followUp = prior
      ? `Continue from previous goal: "${prior.goal}"\n\nNew request:\n${draft}`
      : draft;
    handleGoal(followUp);
  }, [runs, activeRunId, continueDraft, handleGoal]);

  // Tauri-only: block goal submission until a workspace is picked, by
  // rendering the picker card (or its loading variant) in the GoalBox
  // slot. Browser mode keeps the GoalBox so demo/dev flows continue
  // to work without a folder.
  // review-pass v0.1: also block during the cold-start workspace_get
  // round-trip, so a fast typist can't submit a goal before the
  // workspace state has been confirmed.
  const workspaceCard =
    desktop && !workspace.path ? (
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

  // UX-2/UX-3 — render the runs sidebar in Tauri mode only (browser
  // mode has no run history surface).
  const runsSidebar = desktop ? (
    <RunsList runs={runs} activeRunId={activeRunId} onSelect={handleSelectRun} />
  ) : null;

  // UX-4 — when the active run is in a terminal state, render a
  // follow-up draft box so the user can iterate.
  const continueCta = (
    <section
      className="rounded-card border border-surface-700 bg-surface-800 p-4"
      aria-label="Continue from this run"
    >
      <h3 className="text-body font-medium text-text-50">Anything to refine?</h3>
      <p className="mt-1 text-caption text-text-400">
        This run is finished. Type what's still missing or what you'd like changed; Beaver will kick
        off a follow-up run that uses this run's goal as context.
      </p>
      <textarea
        value={continueDraft}
        onChange={(e) => setContinueDraft(e.target.value)}
        placeholder="e.g. Add input validation to the /login endpoint"
        rows={3}
        className="mt-3 w-full resize-y rounded-card border border-surface-600 bg-surface-900 px-3 py-2 text-body text-text-50 placeholder:text-text-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      />
      <button
        type="button"
        onClick={handleContinueRun}
        disabled={continueDraft.trim().length === 0}
        className="mt-3 inline-flex items-center gap-1.5 rounded-card bg-accent-500 px-4 py-2 text-body text-surface-900 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue run
      </button>
    </section>
  );

  const panels: Record<Panel, ReactNode> = {
    status: (
      <StatusPanel
        activeRunId={activeRunId}
        transport={resolvedTransport}
        eventsTransport={resolvedEventsTransport}
        onSubmit={handleGoal}
        {...(workspaceCard !== null ? { workspaceCard } : {})}
        {...(runsSidebar !== null ? { runsSidebar } : {})}
        continueCta={continueCta}
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
          {activeRunId !== null ? (
            <button
              type="button"
              onClick={handleStartOver}
              className="inline-flex items-center gap-1.5 rounded-card bg-surface-800 px-3 py-1.5 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              aria-label="Start a new run"
              title="Start a new run (the current run keeps logging in the background)"
            >
              <span aria-hidden>＋</span>
              <span>New run</span>
            </button>
          ) : null}
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
