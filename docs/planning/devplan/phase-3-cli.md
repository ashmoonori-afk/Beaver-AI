# Phase 3 — CLI

> Checkpoint primitive (already used by Phase 1 hook), the full `beaver` subcommand surface, and the terminal renderer per [ui-policy](../../models/ui-policy.md). After this phase, `beaver run --no-server` works end-to-end.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../../architecture/entry-layer.md](../../architecture/entry-layer.md), [../../architecture/feedback-channel.md](../../architecture/feedback-channel.md), [../../models/ui-policy.md](../../models/ui-policy.md), [../../models/ux-flow.md](../../models/ux-flow.md)

---

## Phase goal

`beaver init`, `beaver run --no-server "<goal>"`, `beaver status`, `beaver logs --follow`, `beaver checkpoints`, `beaver answer`, `beaver resume`, `beaver abort` all work in a real terminal, all backed by the orchestrator from Phase 2.

## Phase exit criteria

- The Phase 2 worked example also runs interactively via `beaver run --no-server "create a hello.txt"`.
- All checkpoints render with the unified frame from [ui-policy](../../models/ui-policy.md).
- Ctrl-C once → graceful pause; Ctrl-C twice within 3 s → hard kill; `beaver resume` recovers.
- Piped output (`beaver status | grep ...`) is plain (no ANSI), TTY output has color and the bottom status line.

---

## Sprint 3.1: Checkpoint primitive (full lifecycle)

**Goal.** The `checkpoints` table reads + the answer flow used by everything else (`beaver answer`, the web UI in Phase 4, the sandbox hook from Phase 1).
**Depends on.** P0.S3, P2.S3.

### Tasks
1. T1 — `core/feedback/checkpoint.ts` — `post(kind, body)`, `pendingFor(runId)`, `answer(id, response)` → verify: round-trip round-trip test.
2. T2 — Polling helper for blocking callers (CLI, hook): `await waitForAnswer(checkpointId, { signal })` returning the response → verify: triggers within 500 ms of an UPDATE.
3. T3 — Validation: `kind` ∈ documented set; `response` shape matches kind (e.g., `plan-approval` → `approve|comment|reject`, `budget-exceeded` → `stop|increase|continue-once`) → verify: invalid response rejected with a typed error.
4. T4 — Memory hint reads (D14): query the [Wiki system](../../models/wiki-system.md) before posting plan-approval / risky-change-confirmation; attach `hint?` to the body if a relevant entry exists. The wiki implementation arrives in Phase 5; for v0.1 of this sprint, accept a `WikiQuery` interface and inject a no-op stub → verify: the path exists and the no-op stub returns no hint.

### Spaghetti test
- Checkpoint module imports only DAO + types; no provider or orchestrator pulls.
- Polling helper is a single function; not a class with state.
- Hint indirection is a typed interface, not a string-keyed registry.

### Bug test
- Two pollers waiting on the same checkpoint — both return the same answer.
- Cancelling a poller via `AbortSignal` exits within 100 ms.
- Posting a checkpoint with an unknown kind throws at the API boundary.

### Code review checklist
- All response shapes live in zod schemas (re-exported from `core/types`).
- No SQL string concatenation across the layer; prepared statements only.
- No `any` slip through `JSON.parse` — parse + validate.

---

## Sprint 3.2: CLI subcommand surface

**Goal.** All commands listed in [entry-layer](../../architecture/entry-layer.md), `--no-server` paths fully functional, `--server` paths stubbed with a "Phase 4" message until the web stack lands.
**Depends on.** P2.S5, P3.S1.

### Tasks
1. T1 — Argument parsing (commander or yargs; pick one) → verify: `beaver --help` prints subcommands.
2. T2 — `beaver init` per [ux-flow](../../models/ux-flow.md): repo check, `.beaver/` creation, CLI ping for `claude` and `codex` → verify: ping failure prints actionable error.
3. T3 — `beaver run --no-server "<goal>"` blocks on terminal checkpoints → verify: bug test below.
4. T4 — `beaver status`, `beaver logs --follow`, `beaver checkpoints`, `beaver answer <id> <response>`, `beaver resume <run-id>`, `beaver abort <run-id>` → verify: each round-trips through DAO without writing to stdout outside the renderer.
5. T5 — One-active-run rule (D11): `beaver run` rejects when an existing run is RUNNING/PAUSED → verify: error message points at `beaver resume`/`abort`.

### Spaghetti test
- Each subcommand handler is a thin function calling into `core`; CLI files contain no business logic.
- No subcommand reads SQLite directly — all access through the DAO.
- The renderer is the only writer to stdout/stderr (no rogue `console.log` in handlers).

### Bug test
- `beaver init` in a non-git directory → fails with "this directory is not a git repo" and exit code ≠ 0.
- `beaver run --no-server "<goal>"` answering `comment "skip auth"` at plan-approval → planner re-runs and posts a new plan-approval.
- `beaver answer` against an unknown checkpoint id → fails with "no such checkpoint" without crashing.
- Two `beaver run` invocations concurrently in the same project → second exits non-zero with "run already in progress".

### Code review checklist
- Subcommand handlers all have the same shape: `(args) => Promise<exitCode>`.
- No flags wired up that aren't documented in [entry-layer](../../architecture/entry-layer.md).
- `--help` text mirrors the doc's subcommand table verbatim.

---

## Sprint 3.3: Terminal renderer per UI policy

**Goal.** Implement [ui-policy](../../models/ui-policy.md) — verbosity levels, bottom-fixed status line, semantic colors with text/symbol pairing, compact-list plan render, unified checkpoint frame, `[hint]` line above eligible prompts.
**Depends on.** P3.S2.

### Tasks
1. T1 — `cli/render/colors.ts` — semantic palette + TTY detection + `NO_COLOR` / `--no-color` honoring → verify: piped output has no ANSI.
2. T2 — `cli/render/status-line.ts` — bottom-fixed line, 1 s redraw, `[STATE] running X/Y · spent $ · elapsed M:SS · ⌛ N open`, suppressed in non-TTY → verify: snapshot test for each state.
3. T3 — `cli/render/plan.ts` — compact-list render of `Plan` exactly matching the doc's example → verify: snapshot equality with the doc fixture.
4. T4 — `cli/render/checkpoint.ts` — unified frame; per-kind body renderer; hint line attached when present → verify: snapshot per kind.
5. T5 — `cli/render/logs.ts` — pretty `<HH:MM:SS> <source> <type> · <message>`; `--json` switches to NDJSON → verify: round-trip of NDJSON parses.

### Spaghetti test
- One module per render artifact; no mega `render.ts`.
- All renderers are pure: input data → string. No fs, no network, no DB.
- Status line is owned by a single render loop; subcommands do not draw on top of it.

### Bug test
- `BEAVER_NO_OPEN=1 NO_COLOR=1 beaver status | cat` → no ANSI bytes in output.
- `beaver run --no-server "<goal>"` foreground for 30 s → status line redraws every second without flicker.
- `beaver run --quiet --no-server` shows only checkpoints + final result.
- `beaver run --verbose --no-server` streams agent stdout dimmed inline.

### Code review checklist
- Renderers do not import the DAO; they take pre-fetched data.
- Plan render handles a 0-task plan without crashing.
- All terminal control sequences are produced via a single helper (not scattered `\x1b[...]`).
