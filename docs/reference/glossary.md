# Glossary

> Definitions of project-specific terms used across all docs. When a term appears in another doc, it should link back here.

**Doc type:** reference
**Status:** Stable
**Last updated:** 2026-04-26
**See also:** [INDEX.md](../INDEX.md)

---

| Term | Definition |
|------|------------|
| **Adapter** | The in-Beaver code that talks to a Provider via the unified `ProviderAdapter` interface. See [provider-adapters](../architecture/provider-adapters.md). |
| **Agent baseline** | Bundled `AGENT_BASELINE.md` injected as the first layer of every agent's system prompt. Four principles: think before coding, simplicity first, surgical changes, goal-driven execution. Rendered as `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex (same content, dual naming). See [agent-baseline](../models/agent-baseline.md). |
| **Agent** | A configured runtime instance bound to one task and one worktree. See [agent-runtime](../architecture/agent-runtime.md). |
| **Budget** | A USD cap at agent / task / run level. See [cost-budget](../models/cost-budget.md). |
| **Capability** | A declared feature of a `ProviderAdapter` (e.g., `file-edit`, `sandbox`). Used by the Orchestrator to match adapters to task needs. |
| **Checkpoint** | A row in the `checkpoints` table that pauses the run pending human input. See [feedback-channel](../architecture/feedback-channel.md). |
| **DAG** | Directed Acyclic Graph — used as a constraint on the [Plan](../models/plan-format.md). |
| **FSM** | Finite State Machine — Beaver's deterministic top-level state machine. See [orchestrator](../architecture/orchestrator.md). |
| **Orchestrator** | The brain of Beaver. Owns the FSM and makes LLM-driven sub-decisions inside each state. |
| **Plan** | A versioned, validated DAG of tasks. See [plan-format](../models/plan-format.md). |
| **Provider** | An external LLM service or its CLI wrapper (e.g., Claude Code, Codex, the Anthropic API). |
| **Rate table** | A `(provider, model) → tokens-per-USD` lookup with `effective_from` versioning. |
| **Role** | The kind of work an agent is configured for — `planner`, `coder`, `reviewer`, `tester`, `integrator`, `summarizer`. |
| **Clarification pass** | Single pre-plan round in which the planner posts a `goal-clarification` checkpoint asking 1–2 questions before producing plan-v1. See [ux-flow](../models/ux-flow.md). |
| **Wiki system** | LLM-maintained, persistent set of markdown files at `<config>/wiki/` that compounds across runs. Replaces flat memory; powers suggest-only hints. See [wiki-system](../models/wiki-system.md). |
| **Wiki ingest** | The orchestrator's post-run step that updates the wiki using the Claude Code CLI (separate small budget). |
| **Suggest-only learning** | Beaver's v0.1 personalization stance: past patterns surface as informational hints from the Wiki system but are never auto-applied. |
| **Policy hook** | Pre-tool-use script that classifies a shell call as hard-deny / require-confirmation / allow before it executes. See [sandbox-policy](../models/sandbox-policy.md). |
| **Run** | One user-initiated invocation with a goal. Lives until `COMPLETED` / `FAILED` / `ABORTED`. |
| **Sub-decision** | An LLM-driven judgment call made by the Orchestrator inside an FSM state, validated against a zod output schema. |
| **Task** | A unit of work inside a run, owned by exactly one agent at a time. |
| **Worktree** | A `git worktree`-managed isolated checkout used by a single agent. See [workspace-state](../architecture/workspace-state.md). |
