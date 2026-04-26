# Beaver AI — Documentation Index

> Map of all project documents. Each file is a single-purpose, LLM-friendly chunk (target ≤ ~150 lines).

**Project:** Beaver AI — fully autonomous development orchestrator
**Last updated:** 2026-04-26 (devplan added under planning/devplan/)
**Reading order for newcomers:** [overview](overview.md) → [decisions/locked](decisions/locked.md) → [architecture/overview](architecture/overview.md) → drill into individual layers as needed.

---

## Overview
- [overview.md](overview.md) — One-page elevator pitch and project goals.

## Decisions
- [decisions/locked.md](decisions/locked.md) — D1–D8: locked architectural decisions with rationale.
- [decisions/open-questions.md](decisions/open-questions.md) — Q3, Q4, Q6, Q7: open questions still to resolve before MVP.

## Architecture
- [architecture/overview.md](architecture/overview.md) — Six-layer system overview and ASCII map.
- [architecture/entry-layer.md](architecture/entry-layer.md) — CLI and library entry surfaces.
- [architecture/orchestrator.md](architecture/orchestrator.md) — Top-level FSM and LLM sub-decisions.
- [architecture/agent-runtime.md](architecture/agent-runtime.md) — Agent lifecycle, roles, message bus.
- [architecture/provider-adapters.md](architecture/provider-adapters.md) — `ProviderAdapter` interface and built-in adapters.
- [architecture/workspace-state.md](architecture/workspace-state.md) — Git worktrees, `.beaver/` layout, SQLite schema.
- [architecture/feedback-channel.md](architecture/feedback-channel.md) — Terminal and dashboard checkpoints.

## Domain Models
- [models/cost-budget.md](models/cost-budget.md) — USD ground truth, three-layer caps, `budget-exceeded` checkpoint.
- [models/plan-format.md](models/plan-format.md) — JSON DAG plan schema, versioning, validation rules.
- [models/sandbox-policy.md](models/sandbox-policy.md) — Four-layer trust model, hard-deny / require-confirmation patterns, per-adapter enforcement.
- [models/agent-operations.md](models/agent-operations.md) — Concurrency, retry policy, role × provider matrix, context handoff, timeouts.
- [models/ux-flow.md](models/ux-flow.md) — Onboarding, goal entry, plan approval, mid-run interrupt, watching, final review, concurrency, failure UX.
- [models/ui-policy.md](models/ui-policy.md) — **CLI surface** policy: verbosity, status line, colors, plan compact-list, prompt frame, tone, accessibility.
- [models/app-ui.md](models/app-ui.md) — **Web app surface** (primary in v0.1): localhost server lifecycle, browser auto-launch, auth model, panel inventory, CLI parity table.
- [models/personalization.md](models/personalization.md) — Layered config (defaults → user → project → flags), implicit coding-style inheritance.
- [models/wiki-system.md](models/wiki-system.md) — LLM-maintained persistent knowledge base at `<config>/wiki/`: page set, ingest/query/lint operations, three-layer architecture.
- [models/agent-baseline.md](models/agent-baseline.md) — Behavioral baseline injected into every agent's system prompt: 4 principles, additive merge with repo `CLAUDE.md`, role addenda.

## Reference
- [reference/module-layout.md](reference/module-layout.md) — pnpm monorepo layout.
- [reference/reference-flow.md](reference/reference-flow.md) — End-to-end "Build me a TODO app" walkthrough.
- [reference/glossary.md](reference/glossary.md) — Glossary of project terms.

## Planning
- [planning/mvp-scope.md](planning/mvp-scope.md) — In-scope and deferred items for v0.1 MVP.
- [planning/next-steps.md](planning/next-steps.md) — High-level work queue (a thin pointer into the devplan).
- [planning/devplan/README.md](planning/devplan/README.md) — Phase / sprint / task breakdown of the v0.1 MVP build.
- [planning/devplan/conventions.md](planning/devplan/conventions.md) — Sprint structure and the three exit-tests every sprint must pass.

---

## Conventions

- **Header template** — every file opens with: `> one-line summary`, then `**Doc type**`, `**Status**`, `**Last updated**`, and `**See also**` cross-links.
- **Length budget** — keep each file under ~150 lines / ~5 KB so an agent can pull several into one turn.
- **Code blocks inline** — TypeScript snippets, SQL, and ASCII diagrams stay in the doc that owns them; no separate snippet files.
- **Decision lifecycle** — entries move from [decisions/open-questions.md](decisions/open-questions.md) to [decisions/locked.md](decisions/locked.md) when locked, and the docs they affect link back to the locked decision.
- **Glossary first** — when introducing a project-specific term, define it once in [reference/glossary.md](reference/glossary.md) and link to it from elsewhere.
