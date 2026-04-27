# Sprint Log

> Append-only record of completed sprints. One entry per sprint.

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
