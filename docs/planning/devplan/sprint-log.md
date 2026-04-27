# Sprint Log

> Append-only record of completed sprints. One entry per sprint.

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
