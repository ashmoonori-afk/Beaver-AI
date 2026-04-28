// Diagnostic card shown when the sidecar fails to materialise a run
// row within a few seconds. Surfaces the tail of `.beaver/sidecar-
// stderr.log` so the user can see Node's actual error (typically:
// "claude: command not found", "ANTHROPIC_API_KEY not set",
// permission denied, etc.) instead of staring at a blank "starting"
// state.

export interface SidecarDiagnosticProps {
  /** Tail of sidecar-stderr.log; null while still loading. */
  stderrTail: string | null;
}

export function SidecarDiagnostic({ stderrTail }: SidecarDiagnosticProps) {
  return (
    <section
      className="rounded-card border border-amber-500/40 bg-amber-950/30 p-4 text-amber-50"
      role="alert"
      aria-label="Sidecar diagnostic"
    >
      <h3 className="text-body font-medium">Sidecar didn't start</h3>
      <p className="mt-1 text-caption opacity-90">
        Beaver spawned the orchestrator process but it exited before recording a run. The most
        common cause is a missing dependency (Node ≥ 22 on PATH, or the{' '}
        <code className="rounded bg-amber-950/50 px-1 py-0.5">claude</code> CLI / an{' '}
        <code className="rounded bg-amber-950/50 px-1 py-0.5">ANTHROPIC_API_KEY</code> env). Below
        is the tail of <code>.beaver/sidecar-stderr.log</code>.
      </p>
      <pre className="mt-3 max-h-64 overflow-auto rounded bg-surface-900 p-3 font-mono text-caption text-text-200">
        {stderrTail ?? 'loading log…'}
      </pre>
    </section>
  );
}
