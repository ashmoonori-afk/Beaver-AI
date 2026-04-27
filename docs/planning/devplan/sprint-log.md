# Sprint Log

> Append-only record of completed sprints. One entry per sprint.

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
