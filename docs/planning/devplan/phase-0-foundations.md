# Phase 0 — Foundations

> Repo scaffold, canonical types & schemas, SQLite + DAO, sandbox policy engine. All pure / locally testable; no external CLI yet.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../../reference/module-layout.md](../../reference/module-layout.md), [../../models/sandbox-policy.md](../../models/sandbox-policy.md), [../../architecture/workspace-state.md](../../architecture/workspace-state.md)

---

## Phase goal

Establish the typed, persisted, policy-aware substrate every later phase plugs into. **Nothing in this phase makes a network call or spawns an external process.**

## Phase exit criteria

- `pnpm install && pnpm build && pnpm test` clean on a fresh checkout.
- All zod schemas import without circular references; `madge --circular` reports zero.
- Sandbox policy engine classifies the spec's example commands correctly.
- SQLite migration + DAO round-trips one of every table with WAL mode enabled.

---

## Sprint 0.1: Repo scaffold

**Goal.** Working pnpm monorepo with TypeScript, lint, format, and CI green on an empty test.
**Depends on.** None.

### Tasks
1. T1 — initialize pnpm workspace with `core`, `cli`, `server`, `webapp`, `beaver-ai` packages → verify: `pnpm -r exec node -e "1"` exits 0.
2. T2 — root `tsconfig.base.json` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` → verify: `pnpm -r exec tsc --noEmit` exits 0.
3. T3 — `eslint` + `prettier` with project config → verify: `pnpm lint` and `pnpm format:check` exit 0 on empty repo.
4. T4 — `vitest` configured at root, single placeholder test → verify: `pnpm test` runs and passes.
5. T5 — GitHub Actions (or equivalent) running `pnpm install && pnpm lint && pnpm test` on push → verify: green CI on a no-op PR.

### Spaghetti test
- No package depends on another package yet (sanity).
- `tsconfig.base.json` is the single source of compiler options; per-package `tsconfig.json` only sets `extends` + `include`.

### Bug test
- Fresh clone → `pnpm install && pnpm build && pnpm test` succeeds without manual steps.
- Adding a wrong-type expression to a placeholder file fails `tsc --noEmit`.

### Code review checklist
- No prebuilt boilerplate left from generators (e.g., scaffolded `.example` files removed).
- No more than ~50 lines per scaffolded file.
- No premature dependency on shadcn / Tailwind / Fastify yet — those land in their respective phases.

---

## Sprint 0.2: Core types & zod schemas

**Goal.** A single module exporting the canonical types: `ProviderAdapter`, `RunOptions`, `RunResult`, `AgentBudget`, `AgentOpsConfig`, `Plan`, `Task`, `BudgetConfig`. All zod, all typed via `z.infer`.
**Depends on.** P0.S1.

### Tasks
1. T1 — `core/types/provider.ts` exporting `ProviderAdapter`, `RunOptions`, `RunResult`, `AgentBudget` per [provider-adapters](../../architecture/provider-adapters.md) → verify: types compile.
2. T2 — `core/plan/schema.ts` exporting `TaskSchema`, `PlanSchema` per [plan-format](../../models/plan-format.md). Includes DAG cycle check helper → verify: unit tests with valid + cyclic + invalid plans.
3. T3 — `core/budget/schema.ts` exporting `BudgetConfigSchema` and the 3-layer cap defaults per [cost-budget](../../models/cost-budget.md) → verify: schema parses the example config.
4. T4 — `core/agent-runtime/schema.ts` exporting `AgentOpsConfigSchema` per [agent-operations](../../models/agent-operations.md) → verify: defaults match the doc.
5. T5 — barrel export `core/index.ts` so consumers `import { ... } from '@beaver-ai/core'`.

### Spaghetti test
- Each schema file is < 100 lines or it gets split.
- No type defined here is currently unused (run `tsc --noEmit` with `noUnusedLocals: true` and run a custom export-graph check).
- No re-export aliases in `core/index.ts` that hide the source module name (no `export { TaskSchema as PlanTask }`).

### Bug test
- Cyclic plan rejected by `PlanSchema.safeParse` with a useful error.
- Plan with `dependsOn` referring to an unknown id rejected.
- BudgetConfig with negative USD rejected.
- AgentOpsConfig override of `maxParallelAgents = 0` rejected.

### Code review checklist
- Schemas mirror the doc tables verbatim — drift between doc and schema is a fail.
- No "future-proof" optional fields (e.g., a v0.2 field with `.optional()`). Add when needed.
- Error messages on parse failures include the field name and a one-line reason.

---

## Sprint 0.3: SQLite migration + DAO

**Goal.** Persisted ledger matching [workspace-state](../../architecture/workspace-state.md). Every table has a typed DAO method.
**Depends on.** P0.S2.

### Tasks
1. T1 — use the built-in `node:sqlite` (sync API) shipped in Node ≥22.5. No native dep needed; engine bumped from ≥20 to ≥22.5 in D1. Verify: WAL mode toggles via `db.exec('PRAGMA journal_mode = WAL')` and reads back as `wal` for a file-backed db.
2. T2 — write `001_initial.sql` migration with all tables from the schema sketch → verify: applies on empty DB and is idempotent on re-run.
3. T3 — minimal DAO module (`core/workspace/db.ts`) exposing typed insert/get/update for `runs`, `plans`, `tasks`, `agents`, `events`, `checkpoints`, `costs`, `rate_table` → verify: round-trip test inserts then reads each table.
4. T4 — events table is append-only at the API level (DAO has no `update_event`) → verify: typecheck refuses an `events.update` call.

### Spaghetti test
- DAO methods take and return zod-validated types from P0.S2; no untyped `any` rows.
- SQL strings live next to the methods that issue them, not in a separate `queries.ts` god file.
- No business logic in the DAO layer (no decisions about retry / verdict / etc.).

### Bug test
- Insert + crash + reopen + read → all rows present (WAL durability).
- Two concurrent reads while one write in progress → no SQLITE_BUSY (WAL).
- Migration applied twice → second run is a no-op.

### Code review checklist
- One file per table's DAO methods, under `core/workspace/dao/<table>.ts`.
- No catch-all `try/catch` — sqlite errors propagate with their original codes.
- Test fixtures use `:memory:` databases so tests are hermetic.

---

## Sprint 0.4: Sandbox policy engine

**Goal.** Pure-function classifier per [sandbox-policy](../../models/sandbox-policy.md) — input `(cmd, cwd, agentWorktree)` → verdict `hard-deny | require-confirmation | allow` plus a reason string.
**Depends on.** P0.S2 (types).

### Tasks
1. T1 — `core/sandbox/patterns.ts` defining the hard-deny and require-confirmation regex sets verbatim from the doc → verify: each pattern has a unit test naming it.
2. T2 — `core/sandbox/classify.ts` exporting `classify(cmd, cwd, worktreePath): Verdict` → verify: unit test per row of each policy table.
3. T3 — counterexamples test: `rm` inside worktree (allow), `rm` outside worktree (require-confirmation), `rm -rf /` (hard-deny), `git push` (hard-deny), `npm install bcrypt` (require-confirmation if publisher unfamiliar) → verify: every counterexample passes.
4. T4 — classifier emits an `agent.shell.classify` event payload for the upstream caller to log → verify: payload shape is the documented event shape.

### Spaghetti test
- `classify` is a pure function (no I/O, no `Date.now`) — assert via grep.
- Each pattern object is `{ id, regex, reason }` and patterns are an array, not nested if/else.
- No alias for "allow" (e.g., do not coexist `Verdict.ALLOW` and `'allow'`); pick one literal type and stick with it.

### Bug test
- `rm -rf /` → hard-deny.
- `cd / && rm -rf .` → still hard-deny (path normalization works).
- `mkdir -p /tmp/foo` → require-confirmation (write outside worktree).
- `pytest` inside worktree → allow.
- Empty cmd → hard-deny with reason "empty command" (defensive default).

### Code review checklist
- Total file size under `core/sandbox/` < 400 lines.
- No reach into SQLite or any I/O — the engine is reusable in tests, hooks, and shims.
- Reason strings are short, present-tense, lowercase ("write outside worktree", not "Write Outside the Worktree was attempted!").
