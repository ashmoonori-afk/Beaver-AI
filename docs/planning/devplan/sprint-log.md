# Sprint Log

> Append-only record of completed sprints. One entry per sprint.

## [2026-04-27] P6 + Final — Integration loop, audit, packaging

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- final integration loop test (3 cases, all pass): claude+codex CLIs
  on $PATH (soft-skip when missing — CI), Beaver.run() drives mock-cli
  to COMPLETED, wiki bootstrap creates the documented page set.
- audit findings:
  * Source files >200 lines: `wiki/ingest.ts` 224 (justified
    fail-soft branches, well under 300 hard cap),
    `orchestrator/loop.ts` 216 (within 250 spec cap).
  * No hardcoded secrets in any source file.
  * ClaudeCodeAdapter ↔ CodexAdapter share ~80 lines of run() loop
    structure. Recorded as v0.2 refactor (extract reusable
    `runProviderLoop(adapter, providerSpec)`); not done in v0.1
    because both adapters are well-tested and stable.
  * No `console.*` in production source (matches in comments only).
  * `madge --circular`: 81 ts files, no cycle.
- modularization deltas this milestone:
  * `_shared/spawn.ts` + `_shared/kill.ts` extracted in P1.S4.
  * Per-provider `parseLine` / `toAgentEvent` exposed under
    `claudeCodeParse` / `codexParse` namespaces in the public barrel.
  * Wiki: structured (`queryWiki`) + free-form (`askWiki`)
    entry points share a page-selection helper instead of duplicating it.
  * Orchestrator: small per-state handlers (no if/else cascades).
- packaging deliverables:
  * `.claude-plugin/plugin.json` + `skills/beaver-runner.md` +
    `skills/beaver-wiki-ask.md` + `commands/beaver.md` —
    drop-in Claude Code plugin manifest.
  * `Start-Beaver.bat` (Windows), `Start-Beaver.command` (macOS),
    `Start-Beaver.sh` (Linux) — double-click launchers that prompt
    for a goal and shell out to the CLI.
  * CLI bin: `node --import=tsx packages/cli/src/bin.ts <subcommand>`
    works locally; ready for `bin` linking once the package is
    published.
- deferred to v0.2 (intentional, documented):
  * Phase 4 web UI (Fastify server + React webapp). CLI is sufficient
    for the v0.1 launcher; web UI is the polish layer.
  * Adapter base-class refactor (the ~80-line run-loop dedup).
  * Real-LLM integration tests (cost & flakiness gate; mock-cli covers
    the deterministic path).
  * Bundling hook.ts / classify-cli.ts to ship without `tsx` runtime.
- final test count: **388 tests passing** across **64 test files**.
- All 5 mvp-scope.md exit criteria are satisfiable on a fresh checkout
  (verified via the integration test + the worked-example flow).

## [2026-04-27] P1.S4 — CodexAdapter + PATH shim + filesystem audit

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - **Shim integration tests skip on Windows** by design (POSIX shell
    only in v0.1, per spec). Windows Codex shimming is a v0.2
    OS-sandbox concern.
  - **Adapter does not auto-call the audit**. `filesystemAudit` is
    exported and tested separately; the orchestrator (P2) wires it
    after each Codex `run()` because that layer owns the runId +
    runStartedAt context the audit needs.
  - **Shim installer added a 4th env var** `BEAVER_CLASSIFY_CLI` (with
    a `<shimDir>/.beaver-classify-cmd` sidecar fallback) so the shim
    can locate classify-cli without a hard-coded path. Documented in
    the shim README. Spec only mentioned 3 env vars; this 4th is
    load-bearing — without it the shim is unimplementable.
  - **Sub-second shim overhead spec deferred**: '100 calls < 100ms'
    targets a shell-only shim, but ours invokes a TS classify-cli
    (via tsx) for each call. Per-call overhead is dominated by
    classify-cli startup (~30-50ms). Functional correctness is the
    v0.1 bar; v0.2 may daemonize classify-cli over a unix socket.
- notes:
  - 1 commit on `dev/p1.s4-codex-adapter`. 2 sub-agents dispatched in
    parallel (codex adapter + shim infrastructure); audit + adapter
    wiring done foreground.
  - Foundation refactor in this sprint:
      providers/_shared/spawn.ts (was claude-code/spawn.ts; renamed
        spawnClaudeCli -> spawnAdapterCli)
      providers/_shared/kill.ts (was claude-code/kill.ts)
      claude-code/adapter.ts updated to import from _shared/.
  - Source layout (codex side, 497 lines):
      providers/codex/protocol.ts          48  zod union of {output_delta,
                                               tool_call, tool_output,
                                               usage, done}.
      providers/codex/parse.ts             56  parseLine + toAgentEvent
                                               (translates to the same
                                               agent.* event types Claude
                                               uses).
      providers/codex/adapter.ts          181  CodexAdapter (mirrors
                                               ClaudeCodeAdapter) +
                                               optional installShim:true
                                               that prepends the shim
                                               dir to spawned PATH.
      providers/codex/shim-install.ts      90  idempotent shim install:
                                               copies the 7 wrappers to
                                               <workdir>/.beaver/shim/,
                                               chmod +x, writes
                                               .beaver-classify-cmd +
                                               .beaver-shim-meta.json
                                               for the install manifest.
      providers/codex/shim/{rm,curl,wget,
        npm,pip,sudo,git}                  30  byte-identical bash
                                               wrappers; basename "$0"
                                               derives the wrapped
                                               command.
      providers/codex/shim/README.md       57  documents the bypass
                                               surface (T4 deliverable).
      providers/codex/audit.ts             75  filesystemAudit walks
                                               scanPaths and emits
                                               agent.shell.bypass-attempt
                                               events for files mtime'd
                                               at/after runStartedAt
                                               and not under worktree.
      sandbox/classify-cli.ts              47  TS executable used by the
                                               shim. Reads cmd from
                                               stdin, exits 0/1/2 per
                                               verdict.
  - Tests (35 new, 279 total):
      sandbox/classify-cli.test.ts (5):  spawn-based; pytest exit 0,
                                         npm install bcrypt exit 1,
                                         rm -rf / exit 2, empty exit 2.
      providers/codex/parse.test.ts (13): parseLine + toAgentEvent
                                          translation table, custom
                                          source.
      providers/codex/adapter.test.ts (3): happy + transcript NDJSON +
                                           cost via rate_table.
      providers/codex/audit.test.ts (4):  marker file outside worktree,
                                          inside-worktree ignore,
                                          old-mtime ignore, missing
                                          scan path tolerated.
      providers/codex/shim.test.ts (5):   each shim wrapping rm -rf /
                                          blocks; allowed paths exec
                                          real binary. Skips on Windows.
      providers/codex/shim-install.test.ts (4): install / idempotent /
                                                preserves keys / Windows
                                                error.
  - Barrel: per-provider parse + protocol exported under `claudeCodeParse`,
    `claudeCodeProtocol`, `codexParse`, `codexProtocol` namespaces to
    disambiguate the shared `parseLine` / `toAgentEvent` symbol names.
    No alias renames inside the namespaces (still satisfies the S2
    "no rename aliases" rule — namespaces preserve source names).
  - madge --circular: 60 ts files, no cycle.

## [2026-04-27] P1.S3 — PreToolUse hook + policy wiring

- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups:
  - **D1 amendment**: engine bumped from `>=22.5.0` to `>=22.6.0` for
    `--experimental-strip-types` support. CI workflow stays on Node 22
    (latest patch picks up 22.6+); @types/node already at 22.x.
  - **Hook deployment story is unsettled**: tsx is a devDep used to
    spawn `hook.ts` in tests via `node --import=tsx`. Production
    integration with real Claude Code will need either (a) a bundle
    step that flattens hook + deps to a single .js, (b) ship tsx as
    a runtime dep, or (c) wait for Node to natively resolve `.js`
    relative imports against `.ts` source. Decision deferred to P1.S3
    follow-up (when real CLI integration lands; for v0.1 the test path
    using `--import=tsx` mirrors the production spawn shape).
  - Hook installer writes `.claude/settings.json` in the workdir with
    a structured PreToolUse entry. Real Claude Code may use a different
    config schema; the installer abstracts the file write so the schema
    can evolve without touching the adapter.
- notes:
  - 1 commit on `dev/p1.s3-pretooluse-hook`.
  - Source layout (3 hook files; total 275 lines):
      providers/claude-code/hook-core.ts    138  pure-ish runHook(input,
                                                 env, opts) -> result.
                                                 Imports only from
                                                 sandbox/classify and
                                                 workspace/* (P1.S3
                                                 Spaghetti rule).
                                                 Injectable sleep / now /
                                                 idGen for test control.
      providers/claude-code/hook.ts          63  thin wrapper. Reads
                                                 stdin + env, calls
                                                 runHook, writes stderr
                                                 from result.stderr,
                                                 exits with result.exitCode.
      providers/claude-code/hook-install.ts  74  idempotent settings.json
                                                 writer. Preserves
                                                 unrelated keys. Adds
                                                 only one PreToolUse
                                                 entry on repeat install.
  - Tests (14 new, 244 total):
      hook-core.test.ts:    allow / hard-deny / require-confirmation
                            (approve + reject) / fail-closed-on-db-error
                            / 100-call p95 < 50ms in-process
      hook.test.ts:         spawn-based E2E via `node --import=tsx`:
                            rm -rf / -> exit 2 + agent.shell.denied event;
                            allowed cmd -> exit 0 + agent.shell.classify
                            event; missing env vars -> exit 2 with clear
                            stderr; 5-call sequence -> 5 events.
      hook-install.test.ts: first install creates entry; second install
                            no-op; preserves unrelated settings keys;
                            overwrites unparseable settings.json.
  - tsconfig.base.json gained `allowImportingTsExtensions: true` and
    `rewriteRelativeImportExtensions: true` so the strict relative-import
    convention can be relaxed at the hook entry without breaking the
    rest of core (which keeps its `.js` imports for NodeNext compat).
  - Added `tsx` as a devDependency. Used only in
    `node --import=tsx hook.ts` for the spawn-based E2E test.
  - madge --circular: 51 ts files, no cycle.
  - Bug-test items met:
      rm -rf / proposed -> hook denies, run terminates (exit 2).
      npm install <pkg> proposed -> checkpoint row created; manual
        UPDATE (DAO answerCheckpoint) drives approve/reject paths.
      100 allowed shell calls in sequence -> in-process p95 < 50ms;
        spawn-based 5-call sequence completes in seconds.
  - Code review items met:
      hook script (hook.ts) 63 lines (< 150).
      polling loop uses 500ms (default) sleep, not busy-loop;
        injectable for test control.
      hook errors -> deny exit 2 (fail closed, never fail open).

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
