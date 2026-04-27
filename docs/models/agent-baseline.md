# Agent Behavioral Baseline

> The default behavioral contract injected as the system-prompt prefix for every agent Beaver spawns. Bundled with Beaver, additively merged with the user's project-level CLAUDE.md, then specialized per role.

**Doc type:** model
**Status:** Locked (D15)
**Last updated:** 2026-04-27 (physical convention file isolation clarified)
**See also:** [decisions/locked.md](../decisions/locked.md) (D15), [models/agent-operations.md](agent-operations.md), [architecture/agent-runtime.md](../architecture/agent-runtime.md), [models/wiki-system.md](wiki-system.md)

---

## Why a baseline

Every spawned agent (Claude Code or Codex) needs a stable behavioral contract on top of the task-specific prompt. Without it, agents drift toward over-engineering, speculative refactors, and silent assumptions — exactly the failure modes that erode trust in autonomous tools. The baseline is short, opinionated, and shipped as part of Beaver itself so that *every* agent starts from the same posture regardless of which provider runs it.

## Convention file naming (per-provider)

The baseline content is **provider-agnostic** — one source, two file-name conventions:

| Provider | Convention file the CLI auto-discovers in cwd |
|----------|-----------------------------------------------|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |

Beaver renders the same merged baseline out under whichever name the spawning provider expects, so a `coder` agent (Codex) and a `reviewer` agent (Claude Code) both read the same canonical content. The bundled source lives once at `packages/core/agent-baseline/AGENT_BASELINE.md`; the file written into the agent's environment is named per provider.

## Canonical content (verbatim)

Bundled at `packages/core/agent-baseline/AGENT_BASELINE.md` and rendered as a single document into agent system prompts. Verbatim:

> **Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.**
>
> **Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.
>
> **1. Think Before Coding — Don't assume. Don't hide confusion. Surface tradeoffs.**
> Before implementing: state assumptions explicitly; if uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. If something is unclear, stop, name what's confusing, ask.
>
> **2. Simplicity First — Minimum code that solves the problem. Nothing speculative.**
> No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" not requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
>
> **3. Surgical Changes — Touch only what you must. Clean up only your own mess.**
> Don't "improve" adjacent code. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove imports/variables/functions YOUR changes orphaned. Don't remove pre-existing dead code unless asked. Every changed line should trace directly to the user's request.
>
> **4. Goal-Driven Execution — Define success criteria. Loop until verified.**
> "Add validation" → "Write tests for invalid inputs, then make them pass." "Fix the bug" → "Write a test that reproduces it, then make it pass." For multi-step tasks, state a brief plan with verifications. Strong success criteria let you loop independently; weak criteria require constant clarification.
>
> **These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come *before* implementation rather than after mistakes.

## Precedence and merging

When Beaver builds an agent's system prompt, it concatenates in this order (top-down):

1. **Built-in baseline** — the canonical content above. Always present.
2. **User-level override** — optional `<config>/agent-baseline.md`. Replaces the built-in only if present (rare; mostly for advanced users with a strong house style).
3. **Project-level merge** — the repo's root `CLAUDE.md` and/or `AGENTS.md`, if either exists. Both are appended additively (not replacing). When both exist, content is concatenated under clear `## from CLAUDE.md` / `## from AGENTS.md` headers so the agent can tell their origins.
4. **Role addendum** — short per-role guidance (see below).
5. **Task prompt** — the `prompt` field from the [plan](plan-format.md) task.

Headers between layers make their origin obvious to the agent (e.g., `## Project conventions (from <repo>/CLAUDE.md)`). Layers are never silently merged into one paragraph.

Physical file rule: Beaver never overwrites a user's root `CLAUDE.md` or `AGENTS.md`. The merged convention file is written only inside the agent-owned worktree control area (for example `<worktree>/.beaver/agent-context/CLAUDE.md`) or passed as an explicit system prompt when the provider supports it. If a provider only auto-discovers convention files at cwd root, Beaver creates a transient untracked file after verifying no user file exists at that path; if a user file exists, Beaver uses prompt injection rather than shadowing it. These generated files are excluded from agent commits.

## Role addenda (built-in)

Short per-role refinements layered after the baseline:

| Role | Addendum focus |
|------|----------------|
| `planner` | Plan to the smallest set of tasks that satisfies acceptance criteria. Prefer verification-by-test where applicable. Surface ambiguities at the `goal-clarification` checkpoint instead of guessing. |
| `coder` | Stay within the assigned task's scope. The worktree is your boundary. Match the repo's existing style and tooling. |
| `reviewer` | Apply all four baseline principles as review criteria. Flag violations specifically (e.g., "this PR introduces an abstraction not requested by the task"). |
| `tester` | Generate the minimum tests needed to cover the task's acceptance criteria. No speculative test infrastructure. |
| `integrator` | Touch only conflict regions. Preserve each branch's intent; do not silently rewrite during merge. |
| `summarizer` | Terse. Bullet what changed, what didn't, and why. Match the tone in [ui-policy](ui-policy.md). |

Role addenda are also bundled in `packages/core/agent-baseline/role/<role>.md`.

## Wiki-system relationship

The Wiki system's `SCHEMA.md` (see [wiki-system](wiki-system.md)) describes how the wiki itself is structured. The agent baseline is orthogonal: it tells *agents* how to behave. Both are read by the orchestrator at the right moments — the baseline at agent spawn, the schema at wiki ingest.

## What the baseline does NOT do

- It does not enforce code style — that comes from the repo's lint/format config (D14, implicit via worktree).
- It does not enumerate sandbox patterns — those are in [sandbox-policy](sandbox-policy.md).
- It does not specify cost or retry policy — those are in [cost-budget](cost-budget.md) and [agent-operations](agent-operations.md).

The baseline is purely **behavioral posture**.

## Versioning

The baseline content is part of Beaver's release. Changes ship in Beaver releases like any other code. The currently-installed version is reported by `beaver --version` and embedded in each agent transcript so old runs remain interpretable when the baseline evolves.
