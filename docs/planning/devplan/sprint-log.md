# Sprint Log

> Append-only record of completed sprints. One entry per sprint.

## [2026-04-27] P1.S2 — ClaudeCodeAdapter (spawn / parse / kill / budget)

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - Adapter currently uses caller-supplied `prompt` and `systemPrompt`
    via stdin. Real `claude` CLI takes `--print "<prompt>"` or similar
    instead of stdin; the production wiring will diverge here in P1.S3
    when the PreToolUse hook lands and we settle the actual CLI surface.
  - `summary` is the first 500 chars of streamed message_delta text.
    Good enough for v0.1; the orchestrator's `summarizer` role (P0.S2
    deferred / P2.S0) will produce the user-facing summary.
- notes:
  - 1 commit on `dev/p1.s2-claude-code-adapter`.
  - Source layout (392 lines across 6 files):
      providers/claude-code/protocol.ts   48   zod discriminated union
                                               of {message_delta, tool_use,
                                               tool_result, usage, stop}.
      providers/claude-code/parse.ts      51   parseLine + toAgentEvent.
                                               Translation is a switch on
                                               the discriminated union;
                                               unknown line types return
                                               null so callers can ignore
                                               richer real-CLI variants.
      providers/claude-code/spawn.ts      72   spawnClaudeCli({cliPath,
                                               args, cwd, stdin, signal})
                                               -> {child, lines, stderr,
                                               exit}. Pure plumbing — no
                                               event semantics.
      providers/claude-code/kill.ts       55   SIGTERM, escalate to SIGKILL
                                               after 2s, hard deadline 5s.
                                               No-op on already-exited child.
      providers/claude-code/adapter.ts   140   ClaudeCodeAdapter class
                                               implementing ProviderAdapter.
                                               Wires spawn + parse + kill
                                               + cost. Tracks usage per
                                               event, aborts on budget
                                               cap, on AbortSignal, or
                                               on timeoutMs. Writes
                                               .beaver-transcript.jsonl.
      budget/cost.ts                      26   computeCost helper using
                                               rate_table.
  - mock-cli.js extended with `delayBetweenEventsMs` so claude-slow.json
    can sit between events and trigger the adapter's wall-clock timeout.
  - Tests: 31 new (260 total). Coverage:
      protocol parsing per known event type + null on unknown
      switch translation per variant + custom source override
      spawn yields one stdout line per JSONL chunk + stderr captured
      kill terminates a slow child; no-op if already exited
      adapter happy path: status=ok + usage merged + transcript NDJSON
      adapter budget: $0.5 cap trips after 3 turns of 100/100 tokens
      adapter timeout: 1s timeout on a 5s fixture -> status=timeout
      cost helper: rate_table conversion + missing-rate error
  - Spaghetti gates: spawn / parse / kill in 3 separate files; no
    imports from core/orchestrator/; event translation switch on
    discriminated union (no string-typing); madge clean (49 ts files);
    no console.* in adapter source.

## [2026-04-27] P1.S1 — Mock CLI harness

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - Helper signature is `runWithMockCli({ fixturePath, stdin?, allowPartial? })`
    rather than the doc's `runWithMockCli(adapter, fixturePath)` because no
    adapter exists yet in S1.1. P1.S2's ClaudeCodeAdapter integration tests
    will wrap the helper or call it directly via a thin spawn shim — the
    helper API will be revisited then.
  - One-time eslint config improvement landed alongside this sprint:
    added `globals` package + `globals.node` to languageOptions, since
    every file in this project runs in Node and the previous config
    left `process` / `Buffer` undefined for plain `.js` files.
- notes:
  - 1 commit on `dev/p1.s1-mock-cli-harness`.
  - File layout (source 166 lines, well under the 200 cap):
      providers/_test/mock-cli.js               52   plain JS executable
                                                     (not TS — node spawns
                                                     it directly without a
                                                     transpile step).
      providers/_test/fixture.ts                26   zod-validated loader,
                                                     pure JSON fixtures.
      providers/_test/run-with-mock-cli.ts      88   spawns mock-cli, captures
                                                     stdout JSONL, asserts
                                                     events match
                                                     fixture.events; rejects
                                                     fixtures missing
                                                     finalResult unless
                                                     allowPartial.
      providers/_test/fixtures/{happy, truncated, stdin-required}.json
  - Tests: 9 (3 fixture loader, 6 helper). Bug-test items met:
    happy fixture replays deterministically across 100 sequential
    runs (no flake); truncated fixture rejected with
    "fixture truncated"; stdin omission triggers event-mismatch
    error path.
  - `_test/` is intentionally NOT exported via the public barrel —
    it is internal test infrastructure (leading underscore signals).
  - madge --circular: 43 ts files, no cycle.

## [2026-04-27] P0.S4 — Sandbox policy engine

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - `npm install` (bare, no pkg arg) is currently allowed by default —
    it reinstalls package.json deps without opening a new supply-chain
    surface. Only `npm install <pkg>` triggers the require-confirmation
    path. Revisit if the orchestrator finds a case where bare reinstall
    pulls in a fresh transitive.
  - "any single command that touches more than 100 files" from the
    require-confirmation table is NOT detectable statically and is
    deferred. The Codex shim doc (D9) already calls this out as an
    `agent.shell.bypass-attempt` post-hoc filesystem audit concern.
- notes:
  - 1 commit on `dev/p0.s4-sandbox-policy` (single coherent domain — split
    into 3 source files anyway for separation of concerns).
  - File layout (source 268 lines, well under the 400 cap):
      sandbox/patterns.ts   126   16 named patterns; ordered array of
                                  {id, regex, verdict, reason}; no
                                  alias renames for Verdict (single
                                  literal-union type).
      sandbox/paths.ts       39   pure helpers: resolveAgainst,
                                  isInsideOrEqual, isSystemRoot,
                                  effectiveCwd (peels `cd <x> && rest`).
      sandbox/classify.ts   103   classify(cmd, cwd, worktree) — empty
                                  -> hard-deny, regex table, then
                                  path-aware rm-rf check, then
                                  write-outside-worktree, then allow.
                                  buildClassifyEvent emits the
                                  agent.shell.classify shape.
  - Tests: 87 new (198 total). One test per pattern fixture (T1),
    table-row tests for hard-deny + require-confirmation, free-pass
    list (pytest, ls, git diff, ...), all 9 T3 counterexamples, and
    event-payload shape (T4 — including patternId omission when
    classify did not attribute one).
  - Order: regex patterns first so literal `rm -rf /` reports as the
    documented `rm-rf-system` patternId; the resolved-target check is
    a fallback that catches `cd / && rm -rf .` after cd-peeling and
    reports as `rm-rf-system-resolved`.
  - Pure function verified: no fs / no process / no Date.now reads
    inside any sandbox source file (grep clean).
  - madge --circular: 41 ts files, no cycle.

## [2026-04-27] P0.S3 — SQLite migration + DAO

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - `node:sqlite` emits an `ExperimentalWarning` on Node 22/23/24 even
    though the API is stable enough for our use. Cosmetic; revisit
    when Node marks it stable (likely 26 LTS).
  - DAOs return row shapes (`*Row` zod schemas) that mirror the SQL
    columns rather than the P0.S2 domain types. The two layers will
    converge in P0.S4 mappers (Task -> tasks row, etc.); v0.1 keeps
    them distinct so DAO is purely persistence and never reaches into
    domain semantics.
- notes:
  - 4 commits on `dev/p0.s3-sqlite-dao` (foundation + 9 DAOs + barrel +
    durability tests + this entry).
  - **Decision amendment in flight**: D1 bumped from `Node ≥20 LTS` to
    `Node ≥22.5 LTS` so we can use the built-in `node:sqlite` and avoid
    fragile native bindings on Windows / mixed CI. CI workflow node-version
    20 -> 22; @types/node 20 -> 22. Recorded in commit
    `[P0.S3] use node:sqlite, bump engines to >=22.5`.
  - 3 sub-agents dispatched in parallel for the 9 DAO files (one agent per
    3-table group). Each was given the table SQL, the API to expose, the
    test pattern, and the file-size cap; they wrote the files, ran
    tsc/lint/format/test locally, and reported back. The orchestrator
    integrated barrels + durability tests + the commit.
  - Schema & sizes:
      foundation:    db.ts 37 / migrate.ts 65 / 001_initial.sql 121
      DAOs (avg 64): runs 55 / tasks 61 / agents 61 / plans 70 /
                     checkpoints 61 / costs 82 / events 61 /
                     rate_table 82 / projects 44
      tests:         53 DAO tests + 3 durability tests + 4 foundation tests
                     + 2 barrel-smoke tests = 62 new (111 total).
  - madge --circular: 39 ts files, no cycle.
  - T4 events append-only: enforced structurally (no updateEvent /
    deleteEvent exported anywhere — verified at runtime in events.test.ts
    and in core/index.test.ts on the public barrel).

## [2026-04-27] P0.S2 — Core types & zod schemas

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - tester / integrator role enums kept in TaskSchema and AgentOpsConfig
    even though those roles ship in v0.2 (per plan-format.md and
    agent-operations.md note). Will be exercised end-to-end only when the
    matching adapters / runtime paths land.
- notes:
  - 5 task-level commits + 1 setup commit + 1 fix/sprint-log commit on
    `dev/p0.s2-core-types` (branched from main after P0.S1 fast-forward).
  - zod 4.3.6 added to @beaver-ai/core (single source of truth schema lib).
  - File layout: `core/src/{types,plan,budget,agent-runtime}/` with a
    flat `core/src/index.ts` barrel using `export *` only (no rename
    aliases — Spaghetti rule).
  - Schemas: 11 source files, all <100 lines (provider.ts 57, plan/schema.ts
    85, agent-runtime/schema.ts 76, budget/schema.ts 24, ...).
  - madge --circular: clean (16 ts files processed).
  - One spaghetti regression caught and fixed: plan/schema ↔ plan/cycle
    type-only cycle resolved by defining `TaskNode` structurally inside
    cycle.ts (one-way dep).
  - One zod 4 gotcha caught: `.default()` must match the schema's *output*
    type (post-defaults), not the input. `.default(() => ({...DEFAULTS}))`
    used for nested role-keyed objects so empty input returns full defaults
    while partial input still merges per-field.
  - Test count: 45 tests across 5 files (1 placeholder removed in T5).

## [2026-04-27] P0.S1 — Repo scaffold

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - T5 "green CI on no-op PR" verify is pending first push to
    https://github.com/ashmoonori-afk/Beaver-AI-Dev (deferred — awaits user
    authorization per CLAUDE.md commit rules).
  - `.gitattributes` not added: docs/ files appear with `M` in `git status`
    after the initial commit due to `core.autocrlf=true` (CRLF normalization).
    Cosmetic only; does not affect builds. Defer until it actually causes pain.
- notes:
  - Task-level commits: `[P0.S1.T1] init pnpm workspace` … `[P0.S1.T5] add
    GitHub Actions CI workflow`. Branch: `dev/p0.s1-repo-scaffold`.
  - Tooling pinned: pnpm 10.15.0, node ≥20, typescript 5.9.3, vitest 4.1.5,
    eslint 10.2.1 (flat config), prettier 3.8.3.
  - 5 packages scaffolded with placeholder `src/index.ts` (1 line each)
    so `tsc --noEmit` has inputs and tests can attach later.
  - Local CI rehearsal (install / lint / format:check / tsc / test) all
    green; remote workflow file mirrors that exactly.
