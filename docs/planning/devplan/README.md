# Devplan — v0.1 MVP

> Phase / sprint / task breakdown for the v0.1 MVP. Sprints are ordered to minimize error propagation: pure functions and types before I/O, persistence before integration, single-task before multi-task.

**Doc type:** planning
**Status:** Draft (the plan itself; sprints unmarked)
**Last updated:** 2026-04-26
**See also:** [conventions.md](conventions.md), [../mvp-scope.md](../mvp-scope.md), [../next-steps.md](../next-steps.md)

---

## Phase map

| # | Phase | Focus | File |
|---|-------|-------|------|
| 0 | Foundations | Repo scaffold, types, SQLite, sandbox engine — all pure / easily testable. | [phase-0-foundations.md](phase-0-foundations.md) |
| 1 | Providers | `ClaudeCodeAdapter`, `CodexAdapter`, PreToolUse hook, PATH shim. | [phase-1-providers.md](phase-1-providers.md) |
| 2 | Orchestrator | Agent runtime, baseline rendering, FSM, LLM sub-decisions, single-task happy path. | [phase-2-orchestrator.md](phase-2-orchestrator.md) |
| 3 | CLI | Checkpoint primitive, subcommands, terminal UI, `--no-server` flow. | [phase-3-cli.md](phase-3-cli.md) |
| 4a | Web UI · Server side | Fastify, SSE, browser launch, integration. | [phase-4-server.md](phase-4-server.md) |
| 4b | Web UI · Webapp side | React + Vite + Tailwind + shadcn, hash routing, panels. | [phase-4-webapp.md](phase-4-webapp.md) |
| 5 | Wiki system | Bootstrap, ingest, query / hint generation. | [phase-5-wiki.md](phase-5-wiki.md) |
| 6 | MVP exit | Worked example, resumability, budget overflow, exit checklist. | [phase-6-mvp-exit.md](phase-6-mvp-exit.md) |

## Why this order

- **Pure → I/O.** Types and zod schemas (Phase 0) are pure and let every later phase typecheck the moment it lands.
- **Local → external.** Sandbox engine, SQLite, and DAO (Phase 0) have no external dependencies. Provider integration (Phase 1) is where the first real-world flake appears, but by then the logic that runs *around* it is already verified.
- **Backend → frontend.** Orchestrator FSM (Phase 2) and CLI (Phase 3) close the headless loop end-to-end before the web UI (Phase 4) is added. This means the web UI is built on a known-good substrate.
- **Cross-cutting last.** Wiki (Phase 5) ingests *completed* runs, so it can only be exercised after Phase 2–4 produce real ones. The wiki is therefore last among the building blocks.

## How to use this plan

1. Read [conventions.md](conventions.md) once — it defines sprint structure, the three sprint-exit tests, and how to record progress.
2. Walk phases in order. Skipping ahead invalidates the dependency rationale above.
3. Each sprint is exit-gated by passing all three tests (spaghetti, bug, code-review). Do not start the next sprint with an open exit gate.
4. Track per-sprint progress in `docs/planning/devplan/sprint-log.md` (created on first sprint start; not pre-populated).

## Cross-cutting expectations

- Every commit traces to a sprint task ID (e.g., `[P0.S2.T3] add Plan zod schema`). Helps later when reading git history against this plan.
- TypeScript everywhere. `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes` on.
- No file > 300 lines without justification (D15: simplicity first).
- Tests live next to the code they cover, not in a parallel `__tests__` tree (avoid drift).
