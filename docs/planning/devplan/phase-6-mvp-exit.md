# Phase 6 — MVP exit

> Worked example end-to-end via both surfaces, resumability, budget overflow, and the v0.1 exit checklist from [mvp-scope](../mvp-scope.md).

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../mvp-scope.md](../mvp-scope.md), [../../reference/reference-flow.md](../../reference/reference-flow.md)

---

## Phase goal

Make sure every promise of v0.1 holds on a fresh checkout, and that the whole stack survives the failure modes we designed for.

## Phase exit criteria — v0.1 ship

All five exit criteria from [mvp-scope](../mvp-scope.md) pass on a clean machine:

1. `beaver init && beaver run "<goal>"` succeeds end-to-end on a fresh repo for the worked example.
2. The run produces a valid plan (passes `PlanSchema.safeParse`) and at least one committed branch.
3. Aborting the process and running `beaver resume <run-id>` recovers the run from disk.
4. A run that exceeds the per-run cap pauses and posts a `budget-exceeded` checkpoint instead of aborting.
5. Every state transition is visible as a row in `events`.

---

## Sprint 6.1: Worked example via web + CLI

**Goal.** The reference goal from [reference-flow](../../reference/reference-flow.md) ("Build a TypeScript TODO app") runs end-to-end through both surfaces. Web UI run is recorded as a screencast; CLI `--no-server` run is recorded as transcript.
**Depends on.** P2.S5, P3.S3, P4.S6, P5.S2, P5.S3.

### Tasks
1. T1 — Define the v0.1 worked example: simpler than the doc reference flow (single-task) → "create a TS Vite skeleton with a TODO list page" → verify: plan after clarification has ≤ 4 tasks.
2. T2 — Run via `beaver run "<goal>"` (web default) on a fresh repo → verify: COMPLETED, branches present, final-report.md generated.
3. T3 — Run via `beaver run --no-server "<goal>"` on a different fresh repo → verify: same outcome.
4. T4 — Capture screencast (web) and transcript (CLI) in `examples/` for later README/demo use → verify: artifacts checked in.

### Spaghetti test
- Worked example does not require any code outside `examples/<name>/`.
- The same `<goal>` string runs unchanged through both surfaces (no special path).

### Bug test
- Web run: server linger after COMPLETED for 60 s → server shuts down on its own.
- CLI run: Ctrl-C once during EXECUTING → graceful pause; `beaver resume` continues.
- Re-running the example on a dirty checkout (e.g., uncommitted changes) → `beaver init` warns; `beaver run` proceeds with worktrees as documented.

### Code review checklist
- README in `examples/<name>/` is present and matches the actual fixture.
- The screencast / transcript do not include personal API keys or paths.

---

## Sprint 6.2: Resumability stress test

**Goal.** Beat on every documented resume scenario.
**Depends on.** P6.S1.

### Tasks
1. T1 — Plan crash matrix: process kill at each FSM state, then `beaver resume` → verify: each state recovers correctly.
2. T2 — Mid-agent kill: SIGTERM the running coder agent, leaving its branch with a partial commit → verify: orchestrator restarts the agent with same prompt and same branch.
3. T3 — Server-only crash: SIGKILL the Fastify server while the run is RUNNING in the background → verify: orchestrator continues writing to SQLite; `beaver dashboard` re-spawns the server and reattaches.
4. T4 — Power-loss simulation via `kill -9` to the orchestrator process → verify: WAL recovery on restart; events table consistent.

### Spaghetti test
- Resume code path lives in one module; not duplicated across CLI / library entries.
- Recovery uses the existing FSM transitions, not a parallel "recovery FSM."

### Bug test
- Resuming a run with an unanswered checkpoint → polls again on resume.
- Resuming a COMPLETED run → no-op with a friendly message.
- Resuming after the user manually deleted a worktree → orchestrator detects, restarts the affected agent.

### Code review checklist
- No write to `events` during resume that contradicts replay (idempotent transitions only).
- Resume does not silently retry a `policy-violation` failure.

---

## Sprint 6.3: Budget overflow scenarios

**Goal.** All three budget cap layers hit and recovered correctly.
**Depends on.** P6.S1.

### Tasks
1. T1 — Per-agent budget cap hit → adapter aborts, status `budget_exceeded`, retry counter incremented if applicable → verify: bug test below.
2. T2 — Per-task budget cap hit (across 2 retries) → orchestrator escalates rather than spawning a third agent → verify: `escalation` checkpoint posted.
3. T3 — Per-run hard cap hit → orchestrator pauses, posts `budget-exceeded` checkpoint with `stop / increase / continue-once` options → verify: each option is exercised.
4. T4 — `continue-once` lets exactly one more task complete → verify: orchestrator pauses again after that task.

### Spaghetti test
- Budget tests use the mock CLI from P1.S1 with scripted token usage to keep tests deterministic.
- Cost aggregation reads from the `costs` table, not in-memory state, in the test as well.

### Bug test
- Per-run cap reached mid-agent → cleanup runs, partial commit preserved, checkpoint posted.
- `increase` option doubles the cap and resumes → next task spawns; spent USD continues from prior total.
- Wiki ingest cost is not counted against the user's run cap (D14 specifies separate $0.10).

### Code review checklist
- All cost arithmetic uses integer "thousandths of USD" or a decimal library, never raw floats.
- No race between the budget check and the agent spawn (atomic compare-and-spawn).

---

## Sprint 6.4: Final exit checklist

**Goal.** Walk the v0.1 exit criteria and the full doc surface; record the result.
**Depends on.** P6.S1, P6.S2, P6.S3.

### Tasks
1. T1 — Run the five [mvp-scope](../mvp-scope.md) exit criteria as scripted checks → verify: all pass on a fresh CI runner.
2. T2 — Doc audit: every locked decision (D1–D16) has a doc page and is linked from `INDEX.md` → verify: link checker.
3. T3 — Cross-platform smoke: macOS + Linux + (best-effort) Windows-WSL → verify: all three install, run, complete the worked example.
4. T4 — Tag `v0.1.0`, write release notes summarizing locked decisions and exit-criteria evidence → verify: release artifact present.

### Spaghetti test
- The exit-check script imports only from `core/` and `cli/`; no test-only helpers in production code.
- Release notes are generated from `decisions/locked.md`; no parallel hand-written list to drift.

### Bug test
- Fresh clone on macOS Sonoma → install / build / worked example clean.
- Fresh clone on Ubuntu LTS → same.
- WSL2 Ubuntu → same (Windows native is best-effort, not blocking).

### Code review checklist
- No `// TODO` markers in `core/` paths (move open work to GitHub issues with the `v0.2` label).
- Release notes mention every D1–D16 with a one-line outcome.
- The `examples/` worked example is the same fixture referenced by all the exit-criteria docs.
