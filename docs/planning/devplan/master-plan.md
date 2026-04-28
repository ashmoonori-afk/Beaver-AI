# Master Development Plan — v0.1+

> Queue of remaining sprints from W.9 through Phase 9 + final code review. Drives everything that lands after the Phase 4D.1 commit (`bcf9556`). Updated at the end of each sprint.

**Last updated:** 2026-04-28
**Authority:** locked decisions D1–D17 (`docs/decisions/locked.md`); add D18+ as new decisions land
**Currently executing:** see top of `## Sprint queue`

---

## Why this doc exists

Three new requirements ("R1/R2/R3") were folded into the dev plan on 2026-04-28:

| ID  | Requirement                                                                                | Phase |
| --- | ------------------------------------------------------------------------------------------ | ----- |
| R1  | Planner refines/enriches user goal before plan-approval; coder only sees verified plan     | 7     |
| R2  | ElapsedClock wrongly shows "frozen" caption — fix UX                                       | W.9   |
| R3  | Token-as-ground-truth cost model (input/output/cached) before direct-API mode lands        | 8     |

This doc lays out how those land alongside the already-planned 4D continuation + Phase 9 hardening, in a single execution-ready queue.

---

## Sprint queue

Order of execution (top to bottom). Each sprint is its own branch (`dev/<id>-…`); each phase pushes to GitHub at end and FF-merges to `main` after CI green.

| #   | Sprint  | Scope                                                  | Status      |
| --- | ------- | ------------------------------------------------------ | ----------- |
| 1   | W.9     | UI bug fix — ElapsedClock label + mock timing          | shipped     |
| 2   | 7.1     | Orchestrator FSM gains REFINING_GOAL state             | shipped     |
| 3   | 7.2     | Refined-goal UI surface (new checkpoint kind)          | shipped     |
| 4   | 7.3     | Pre-coder handoff validation                           | queued      |
| 5   | 8.1     | UsageSchema gains input/output/cached token fields     | queued      |
| 6   | 8.2     | RunSnapshot gets tokens + costMode                     | queued      |
| 7   | 8.3     | CostTicker dual mode (tokens vs usd)                   | queued      |
| 8   | 8.4     | Rate table externalize + USD-equivalent toggle         | queued      |
| 9   | 4D.2    | Tauri invoke wiring (CLI sidecar replaces mocks)       | queued      |
| 10  | 4D.3    | Release CI scaffold (tag → tauri build → artifact)     | queued      |
| 11  | 4D.4    | Cross-OS matrix (ubuntu/macos/windows) + AppImage/dmg  | queued      |
| 12  | 9       | Real-API mode toggle (partial — OS sandbox deferred)   | queued      |
| 13  | review  | Final 5-loop multi-perspective review + fixes          | queued      |

---

## Per-sprint workflow (locked)

Every sprint follows this loop. Skipping any step is a process violation.

1. **Branch** from `main` (or stay on phase branch if the phase has multiple sprints): `git checkout -b dev/<id>-<slug>`
2. **Implement** — source files + tests next to them
3. **Exit gates** — must all pass before commit:
   - `pnpm --filter <changed-pkg> exec tsc --noEmit` (or `pnpm -r exec tsc --noEmit` if multi-pkg)
   - `pnpm lint`
   - `pnpm format:check` (auto-fix with `pnpm exec prettier --write` if dirty)
   - `pnpm vitest run <changed-paths>` then full `pnpm test`
   - `pnpm --filter @beaver-ai/webapp build` (if webapp touched) — must stay ≤ 250 KB gz
   - `pnpm dlx madge@latest --circular packages --extensions ts,tsx` — must be 0 cycles
4. **Spaghetti review** (≤ 5 min, self-applied):
   - Any new file > 300 lines? → split or annotate why
   - Any class string / lookup table / boilerplate duplicated in ≥ 2 places? → extract
   - Any `if (kind === 'X')` cascade? → registry/lookup
5. **Modularization review** (≤ 5 min, self-applied):
   - Could a small helper kill repeated code? → write it
   - Is a hook leaking implementation details? → harden the contract
6. **Commit** — type-scoped message (`feat(<area>/<sprint>): …`). No `Co-Authored-By Claude` (per user CLAUDE.md). Multi-paragraph body listing changes + exit gate results.
7. **Push** — `git push -u origin dev/<id>-<slug>`. Do this once per **phase** (not per sprint within a phase) to reduce CI noise.
8. **CI** — `gh run watch <id> --exit-status` until green.
9. **FF main** — `git checkout main && git merge --ff-only dev/<id>-<slug> && git push origin main`.
10. **Update this doc** — flip the row's status from `queued` → `in-progress` → `shipped`, and the `Last updated` date at the top.

---

## Sprint specifications

### W.9 — UI bug-fix sprint

**Why.** Tauri shell smoke test (4D.1) surfaced two demo-flow rough edges. ElapsedClock's "frozen" caption reads wrong. Mock transport completes in 3 s — too fast for a demo browse.

**Tasks.**
- T1: Remove the "frozen" caption from `ElapsedClock`. Terminal state shows the elapsed time alone, optionally with a faint `endedAt` timestamp tooltip. Live state still says "live" so users can tell the clock is updating.
- T2: Slow down `mockTransport` from 1500 ms → 5000 ms ticks so the demo state-machine animation is browsable.
- T3: Update tests that asserted on "frozen" / 1500 ms.

**Files.** `packages/webapp/src/components/ElapsedClock.tsx`, `packages/webapp/src/components/ElapsedClock.test.tsx`, `packages/webapp/src/hooks/mockTransport.ts`, `packages/webapp/src/hooks/mockTransport.test.ts`.

**Exit gates.** Standard. No new dependency.

---

### Phase 7 — Goal refinement loop (R1)

**D18 (proposed).** Orchestrator runs an explicit `REFINING_GOAL` state between `INITIALIZED` and `PLANNING`. Planner's first job is to reconcile the user's goal into a structured "enriched goal" — sometimes via a clarifying-question checkpoint. Only after the user (implicitly or explicitly) approves the enriched goal does the planner draft a plan. **Reason:** subjective goals + LLM interpretation = ambiguous prompts that burn tokens and produce wrong plans. A cheap upfront refinement pass costs O(1 LLM call) and prevents O(N) wasted planner-coder cycles.

#### 7.1 — Orchestrator FSM gains `REFINING_GOAL` state

**Tasks.**
- T1: Add `REFINING_GOAL` to `RunState` (core + webapp types).
- T2: Add `goal-refinement` to `CHECKPOINT_KINDS`. Response shape is approve-style (`approve | reject | comment:<text>`).
- T3: Loop transitions `INITIALIZED → REFINING_GOAL → PLANNING` (instead of straight to `PLANNING`).
- T4: Inside `REFINING_GOAL`: planner runs once. Output schema = `{ enrichedGoal: string, assumptions: string[], questions?: string[] }`. If `questions` non-empty → post `goal-refinement` checkpoint and block on `waitForAnswer`. If empty → fall through.
- T5: User comments thread back as additional context for a re-run; reject restarts the state with a fresh planner.

**Files.** `packages/core/src/orchestrator/state.ts`, `packages/core/src/orchestrator/loop.ts`, `packages/core/src/feedback/checkpoint.ts`, `packages/core/src/types/event.ts`, plus matching `.test.ts`. Webapp types ts mirror.

#### 7.2 — Refined-goal UI surface

**Tasks.**
- T1: New file `packages/webapp/src/checkpoints/goal-refinement.tsx`. Body renders a 2-column diff: raw goal (left, dimmed) → enriched goal (right, highlighted). Below: assumption list + clarifying questions.
- T2: Register in `checkpoints/registry.ts`.
- T3: `plan-approval` body extended to include the enriched goal as a collapsed details panel above the plan, so the user has consistent context.
- T4: Tests next to each new file. axe-core suite gets a new entry.

**Files.** Above + `packages/webapp/src/components/CheckpointCard.test.tsx` updated for the 7th kind, `packages/webapp/src/a11y.test.tsx`.

#### 7.3 — Pre-coder handoff validation

**Tasks.**
- T1: New `packages/core/src/orchestrator/handoff.ts`. Input: approved enriched goal + approved plan. Output: `Result<HandoffPacket, HandoffError>`.
- T2: Validators: dependency cycle, role/provider matching the role-provider matrix (D10), each task's USD/token cap fits within the run cap. Each validator a small named function.
- T3: Failure → orchestrator posts `escalation` checkpoint with the offending task ids + the validator that flagged.
- T4: Unit tests + integration test that simulates a cap-overflow handoff.

**Files.** `packages/core/src/orchestrator/handoff.ts`, `packages/core/src/orchestrator/handoff.test.ts`, plus loop wiring.

---

### Phase 8 — Token cost model (R3)

**D19 (proposed).** Tokens are the ground-truth cost unit. USD is a derived view available via rate table. Subscription CLI users (the v0.1 default) only see token figures; direct-API users (v0.2) see USD. **Reason:** showing fictional USD to a Claude Pro user is dishonest — they paid a subscription. Token counts are real. The cost-mode switch lets the same UI honor both billing realities.

#### 8.1 — UsageSchema gains token fields

**Tasks.**
- T1: Extend `UsageSchema` in `packages/core/src/types/usage.ts` with `inputTokens`, `outputTokens`, `cachedInputTokens` (all default 0). Stream-json parsers (`claude-code/parse.ts`, `codex/parse.ts`) already see these in `usage.input_tokens` / `usage.output_tokens` / `usage.cache_read_input_tokens` etc. — promote them.
- T2: SQLite migration: `costs` table gains 3 nullable INT columns. DAO writes them on insert; reads use COALESCE 0 for old rows.
- T3: Existing USD calc unchanged — runs alongside.

**Files.** `packages/core/src/types/usage.ts`, `packages/core/src/workspace/dao/costs.ts`, `packages/core/src/workspace/migrate.ts`, `packages/core/src/providers/claude-code/parse.ts`, `packages/core/src/providers/codex/parse.ts`.

#### 8.2 — RunSnapshot tokens + costMode

**Tasks.**
- T1: `webapp/src/types.ts` — `RunSnapshot.tokens?: { input, output, cached }` and `RunSnapshot.costMode: 'tokens' | 'usd'` (default `'tokens'`).
- T2: Per-agent token line in `AgentSummary.tokens?: …` for the agents row.
- T3: Mock transports emit synthetic token counts so the demo shows realistic numbers. Default `costMode='tokens'`; tests can override.

**Files.** `webapp/src/types.ts`, all 6 mock transports, all 6 hooks.

#### 8.3 — CostTicker dual mode

**Tasks.**
- T1: `CostTicker` reads `snapshot.costMode`. In `tokens` mode renders three lines (input / output / cached) with a unified progress bar against `tokenCap` (default 1M total). In `usd` mode preserves existing `$X.XX of $Y.YY` display.
- T2: 70 % / 100 % thresholds work in both modes (against the active cap).
- T3: Per-agent display in `AgentCard` follows the same costMode rule.

**Files.** `webapp/src/components/CostTicker.tsx`, `webapp/src/components/AgentCard.tsx` and tests.

#### 8.4 — Rate table externalize + USD-equivalent

**Tasks.**
- T1: Move the `claude-code` and `codex` rate tables out of TS source into `packages/core/rates/<provider>.json`. Loader at startup. Versioned. New models add a row, no code change.
- T2: `lib/usdEquivalent.ts` derives USD from token counts on demand. Used as a tooltip in `tokens` mode (`$1.42 equiv`).
- T3: Tests for the loader (malformed JSON rejected, missing model warning), plus the equiv calc.

**Files.** `packages/core/rates/`, `packages/core/src/budget/rate.ts`, `webapp/src/lib/usdEquivalent.ts`.

---

### Phase 4D — Desktop completion (continues from 4D.1)

#### 4D.2 — Tauri invoke wiring

**Tasks.**
- T1: 6 Tauri commands in `packages/desktop/src-tauri/src/commands/`: `runs_start`, `runs_subscribe`, `checkpoints_list`, `checkpoints_answer`, `final_review_subscribe`, `final_review_decide`, `wiki_ask`. Each spawns or queries the `node packages/cli/src/bin.ts` sidecar.
- T2: Sidecar discovery: prefer `packages/cli/dist/bin.js` (production build), fall back to dev path (`node --import=tsx packages/cli/src/bin.ts`). Sidecar binary built via `node-sea` per 4D.0 lock — that's a separate sub-task here.
- T3: Tauri events `run.snapshot.<runId>`, `checkpoints.list.<runId>`, etc. forward NDJSON from the CLI to the renderer.
- T4: New `webapp/src/hooks/tauriTransport.ts` — implements all 6 transport interfaces using `@tauri-apps/api/core/invoke` + `@tauri-apps/api/event/listen`. App.tsx auto-detects Tauri runtime (`window.__TAURI_INTERNALS__` present) and swaps mock transports for tauri transports.
- T5: Smoke test: launch desktop, type a goal, verify a real run starts and bento updates from CLI events.

**Files.** `packages/desktop/src-tauri/src/commands/*.rs`, `packages/desktop/src-tauri/src/lib.rs` (handler list), `packages/desktop/src-tauri/Cargo.toml` (tauri-plugin-shell), `packages/desktop/src-tauri/capabilities/default.json` (shell permissions), `webapp/src/hooks/tauriTransport.ts`, `webapp/src/App.tsx` (runtime detect).

#### 4D.3 — Release CI scaffold

**Tasks.**
- T1: New workflow `.github/workflows/release.yml`. Triggered on tag `v*`. Matrix: `windows-latest` only for now. Runs `pnpm install`, `pnpm --filter @beaver-ai/desktop tauri build`. Uploads `target/release/bundle/**` to a draft GitHub Release.
- T2: Documentation: how the user supplies a code-signing cert via repo secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). When secrets absent, build still produces unsigned artifacts (fine for self-signed channel per 4D.0).
- T3: Updater feed scaffold (`tauri-plugin-updater`) — config-only, deferred wiring.

**Files.** `.github/workflows/release.yml`, `docs/operations/release-process.md`, `packages/desktop/src-tauri/tauri.conf.json` (updater config block).

#### 4D.4 — Cross-OS matrix

**Tasks.**
- T1: Extend release workflow matrix to `ubuntu-22.04` and `macos-13`. Linux build needs `libwebkit2gtk-4.1-dev` apt install step. macOS notarization step gated on `APPLE_CERTIFICATE` secret.
- T2: Tauri bundle targets per OS: `nsis,msi` for Windows (already), `deb,appimage` for Linux, `dmg` for macOS.
- T3: Release notes auto-generated from `git log` between tags. Stamped into the GitHub Release body.

**Files.** `.github/workflows/release.yml`, `packages/desktop/src-tauri/tauri.conf.json`, `docs/operations/release-process.md`.

---

### Phase 9 — Production hardening (partial)

In-session scope is **real-API mode toggle** only. OS-level sandbox (sandbox-exec / bubblewrap) is multi-week and stays in v0.2 deferred.

#### 9 — Real-API mode toggle

**Tasks.**
- T1: New provider class `DirectApiProvider` (parallel to `ClaudeCodeAdapter` / `CodexAdapter`) that calls `@anthropic-ai/sdk` / `openai` directly. Same `ProviderAdapter` interface so the orchestrator doesn't care.
- T2: Selection: env `BEAVER_PROVIDER_MODE=cli|api`. CLI is default. API requires `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — fail fast at startup if missing.
- T3: When `MODE=api`, `RunSnapshot.costMode` defaults to `'usd'` (Phase 8 hookup). Token counts still tracked (for parity).
- T4: Tests: mock the SDK clients, assert the same NDJSON event stream comes out.

**Files.** `packages/core/src/providers/direct-api/adapter.ts` + tests, `packages/core/src/providers/index.ts` (factory), env-var wiring in `packages/cli/src/index.ts`.

---

### Final review — multi-perspective code review + fix

W.8-style 5 parallel agents (spaghetti, security, bug/edge, test coverage, architecture) over the entire delta from `bcf9556` → `HEAD`. Apply HIGH/MEDIUM findings. DoD verification: 5x consecutive `pnpm test` runs locally, 0 flakes.

---

## Locked decisions (delta from this plan)

To be added to `docs/decisions/locked.md` as each phase completes:

| ID  | Decision                                                                                 | Phase | Status     |
| --- | ---------------------------------------------------------------------------------------- | ----- | ---------- |
| D18 | `REFINING_GOAL` orchestrator state precedes `PLANNING`; planner refines first, drafts second | 7    | proposed   |
| D19 | Tokens are ground truth; USD is derived via rate table; costMode selects display unit     | 8    | proposed   |
| D20 | Direct-API provider parallel to CLI adapters; env `BEAVER_PROVIDER_MODE` selects         | 9    | proposed   |

---

## Out-of-session (true v0.2 deferred)

- OS-level sandbox (sandbox-exec / bubblewrap) — multi-week, OS-specific, deserves a phase of its own
- Real-LLM nightly CI gate — burns USD, requires budget approval
- Wiki lint, goal templates, multi-run, PR auto-create
- Light theme (4U.7) — still queued, low value pre-shipping
