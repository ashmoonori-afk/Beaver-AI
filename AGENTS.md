# AGENTS.md

> Durable spec for autonomous agents working on this repo. Read this **first** every iteration. Format inspired by [Ralph](https://github.com/snarktank/ralph) (Geoffrey Huntley).

**Companion files (mandatory reads, in order):**

1. [CLAUDE.md](./CLAUDE.md) — user-level conventions (Korean conversation, English docs, ask-before-implement, etc.)
2. [docs/architecture/overview.md](./docs/architecture/overview.md) — 7-layer system map
3. [docs/decisions/locked.md](./docs/decisions/locked.md) — D1–D17 (and proposed D18–D20)
4. [docs/planning/devplan/master-plan.md](./docs/planning/devplan/master-plan.md) — sprint queue + per-sprint workflow
5. [packages/core/src/agent-baseline/AGENT_BASELINE.md](./packages/core/src/agent-baseline/AGENT_BASELINE.md) — D15 behavioral baseline (4 principles)

---

## What this project is

**Beaver AI** — fully autonomous local development orchestrator. Drives Claude Code + Codex CLIs through `plan → execute → review → integrate` loops with strong policy guardrails (sandbox, USD/token budget, hooks). One project per pnpm workspace; one active run per project.

- TypeScript monorepo (pnpm workspaces, Node ≥ 22.6 LTS, NodeNext modules with `.js` relative-import suffix)
- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`
- React 19 + Vite + Tailwind for the renderer (`packages/webapp`)
- Tauri v2 for the desktop shell (`packages/desktop`, Phase 4D)
- Rust 1.77+ + MSVC toolchain for desktop builds

## Workflow contract (sprint-based)

Every code change lives in a sprint. Sprints follow this loop — **skipping any step is a process violation**:

1. **Branch** from `main`: `git checkout -b dev/<id>-<slug>`
2. **Implement** — source files + tests next to them
3. **Exit gates** (all must pass):
   - `pnpm --filter <pkg> exec tsc --noEmit` (or `pnpm -r exec tsc --noEmit`)
   - `pnpm lint`
   - `pnpm format:check` (auto-fix with `pnpm exec prettier --write`)
   - `pnpm vitest run <changed-paths>` then full `pnpm test`
   - `pnpm --filter @beaver-ai/webapp build` if webapp touched (≤ 250 KB gz cap)
   - `pnpm dlx madge@latest --circular packages --extensions ts,tsx` — 0 cycles
4. **Spaghetti review** (5 min, self-applied):
   - Any new file > 300 lines? Split or annotate why.
   - Any class string / lookup table / boilerplate duplicated in ≥ 2 places? Extract.
   - Any `if (kind === 'X')` cascade? Replace with a registry/lookup.
5. **Modularization review** (5 min, self-applied):
   - Could a small helper kill repeated code? Write it.
   - Is a hook leaking implementation details? Harden the contract.
6. **Commit** — type-scoped message (`feat(<area>/<sprint>): …`). No `Co-Authored-By Claude` (per CLAUDE.md). Multi-paragraph body listing changes + exit gate results.
7. **Push** — once per **phase** (not per sprint within a phase) to reduce CI noise.
8. **CI** — `gh run watch <id> --exit-status` until green.
9. **FF main** — `git checkout main && git merge --ff-only dev/<id>-<slug> && git push origin main`.
10. **Update master plan** — flip the sprint row from `queued` → `shipped` in `docs/planning/devplan/master-plan.md`.

## Coding conventions

- **Many small files** > few large files. 200–400 lines typical, 800 max, 300 the soft target.
- **Immutability** — never mutate function arguments. Return new objects.
- **Defaults at boundaries** — validate user input + external data with zod. Trust internal code.
- **No `console.log`** in production source. Use the structured logger or NDJSON event bus.
- **No `dangerouslySetInnerHTML`** anywhere in `packages/webapp`. React-markdown is wired with `rehype-sanitize`.
- **No `any`** in application code. Use `unknown` + narrow.
- **Comments only when WHY is non-obvious.** Don't narrate WHAT — well-named identifiers do that.
- **One hook per data shape** (Phase 4U spaghetti rule). The 6 transport hooks each own exactly one type.
- **Registry > switch** — when a behavior depends on a discriminated union, build a `Record<Discriminator, Handler>` lookup. No `if (kind === 'X')` cascades.

## Testing discipline (TDD-friendly)

- 80%+ line coverage target. Tests live next to the source (`Foo.tsx` ↔ `Foo.test.tsx`).
- React tests use `// @vitest-environment jsdom` docblock + `afterEach(cleanup)`.
- Provider/CLI tests use the mock-cli fixture pattern (`process.execPath` + `[mockCliPath, fixturePath]` as defaultArgs).
- Snapshot transports for the webapp — never call real Tauri APIs directly in unit tests.
- a11y: `axe-core` runs against every panel + dialog (4U.6 review gate). 0 violations.

## Goal refinement workflow (Ralph-inspired, Phase 7 + W.10)

When the user submits a goal:

1. Orchestrator enters `REFINING_GOAL` state.
2. Planner produces a **structured `GoalRefinement` payload** containing:
   - `rawGoal` (verbatim) + `enrichedGoal` (planner's interpretation)
   - `assumptions[]`
   - `clarifyingQuestions[]` with **lettered options** (`Q1: A | B | C`, Ralph-style — user replies `Q1=B`)
   - `prd` — `{ overview, goals, userStories[], nonGoals, successMetrics }`
   - `mvp` — `{ pitch, features, deferred, scope }`
3. UI renders this as a `goal-refinement` checkpoint card with per-section "Suggest edit" buttons that pre-fill `comment:[prd:goals] …` for the next iteration.
4. User approves → planner drafts an actual `Plan` from the locked PRD/MVP.
5. Plan-approval checkpoint surfaces the plan + the locked enriched goal.

This converts the "garbage in / wasted tokens" risk into a **cheap upfront review** of a structured artifact — the Ralph loop pattern adapted to a single planner pass instead of an outer relentless loop (since Beaver's FSM already provides resumability + audit trail via SQLite).

## Locked decisions you must respect

- **D1** TypeScript on Node ≥ 22.6.
- **D6** Top-level FSM is deterministic; LLM calls only inside states.
- **D9** Worktree write boundary; sandbox classifier blocks risky shells.
- **D10** Bounded parallel (5) · max 2 retries · CLI-only providers.
- **D15** Inject `AGENT_BASELINE.md` as the first layer of every spawned agent's system prompt.
- **D17** Tauri v2 desktop shell + node-sea sidecar (Phase 4D).
- **D19 (proposed)** Tokens are ground truth; USD is derived. `costMode` selects display unit.

## What NOT to change without explicit approval

- `packages/core/src/orchestrator/fsm.ts` — adding states requires a new D-decision in `docs/decisions/locked.md` first.
- `packages/core/src/types/usage.ts` `tokensIn` / `tokensOut` field names — five DAOs depend on them.
- `packages/core/rates/*.json` rate-table file format — DAO + cost.ts read this shape.
- `packages/desktop/src-tauri/Cargo.toml` lib name (`beaver_desktop_lib`) — main.rs imports it directly.
- The capability tag list (`['streaming', 'custom-tools', 'file-edit', 'web']`) — provider-adapters.md spec.

## Loop convergence (when to stop)

The current sprint is done when:

- Every test in `pnpm test` passes (≥ 5 consecutive runs, 0 flakes).
- Every exit gate above is green.
- The master-plan row for this sprint says `shipped`.
- Main has been fast-forwarded and pushed.

Before starting the next sprint, **re-read this file** + the master plan row.
