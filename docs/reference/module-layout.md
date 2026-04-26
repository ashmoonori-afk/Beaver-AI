# Module / Package Layout

> A pnpm monorepo. One published npm package (`beaver-ai`); private workspaces hold the implementation.

**Doc type:** reference
**Status:** Draft
**Last updated:** 2026-04-26 (D14 + D15 ripple: core/wiki/ and core/agent-baseline/ added)
**See also:** [architecture/entry-layer.md](../architecture/entry-layer.md), [architecture/overview.md](../architecture/overview.md)

---

## Tree

```
beaver-ai/
├── packages/
│   ├── core/                # @beaver-ai/core (private workspace)
│   │   ├── orchestrator/
│   │   ├── agent-runtime/
│   │   ├── agent-baseline/  # AGENT_BASELINE.md + role addenda (D15)
│   │   ├── workspace/       # worktree + sqlite
│   │   ├── feedback/
│   │   ├── budget/          # cost model
│   │   ├── plan/            # plan schema + io
│   │   ├── wiki/            # wiki ingest + query (D14)
│   │   └── providers/         # CLI-only in v0.1 (D10)
│   │       ├── base.ts
│   │       ├── claude-code/   # planner/reviewer/tester/summarizer + orchestrator
│   │       └── codex/         # coder (and integrator when it lands)
│   │       # anthropic-api/, openai-api/ deferred to v0.2
│   ├── cli/                 # @beaver-ai/cli (private workspace) — secondary surface
│   ├── server/              # @beaver-ai/server — Fastify, SSE (D16)
│   ├── webapp/              # @beaver-ai/webapp — React + Vite + Tailwind + shadcn (D16)
│   └── beaver-ai/           # the published meta-package, re-exports
├── examples/
└── docs/
```

## Publishing model

- **Public on npm:** `beaver-ai` (the meta-package).
- **Bundled inside it:**
  - The public API surface re-exported from `@beaver-ai/core`.
  - The `beaver` binary built from `@beaver-ai/cli`.
  - The HTTP server from `@beaver-ai/server`, which serves the static webapp bundle and SSE/WS endpoints.
  - The webapp's static assets (HTML/JS/CSS) compiled from `@beaver-ai/webapp`.
- **Private workspaces:** `core`, `cli`, `server`, `webapp` are not published independently — they exist for internal modularity only.

## Why pnpm

- Strict dependency hoisting prevents accidental imports across workspaces.
- Built-in monorepo tooling (`pnpm -r`, filters, workspace protocol).
- Faster installs than npm/yarn for this size of project.

## Module-to-doc mapping

| Module | Doc |
|--------|-----|
| `core/orchestrator/` | [architecture/orchestrator.md](../architecture/orchestrator.md) |
| `core/agent-runtime/` | [architecture/agent-runtime.md](../architecture/agent-runtime.md) |
| `core/workspace/` | [architecture/workspace-state.md](../architecture/workspace-state.md) |
| `core/feedback/` | [architecture/feedback-channel.md](../architecture/feedback-channel.md) |
| `core/agent-baseline/` | [models/agent-baseline.md](../models/agent-baseline.md) |
| `core/wiki/` | [models/wiki-system.md](../models/wiki-system.md) |
| `server/`, `webapp/` | [models/app-ui.md](../models/app-ui.md) |
| `core/budget/` | [models/cost-budget.md](../models/cost-budget.md) |
| `core/plan/` | [models/plan-format.md](../models/plan-format.md) |
| `core/providers/` | [architecture/provider-adapters.md](../architecture/provider-adapters.md) |
| `cli/`, `beaver-ai/` | [architecture/entry-layer.md](../architecture/entry-layer.md) |
