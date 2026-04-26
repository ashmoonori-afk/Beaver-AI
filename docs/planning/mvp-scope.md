# MVP Scope

> What ships in v0.1 vs. what is deferred. Cut hard so the end-to-end loop runs and is observable.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26 (D14 expanded: Wiki system replaces flat memory; config layering retained)
**See also:** [planning/next-steps.md](next-steps.md), [decisions/locked.md](../decisions/locked.md)

---

## In scope for v0.1

- TypeScript / Node 20 monorepo skeleton (pnpm). See [reference/module-layout.md](../reference/module-layout.md).
- **CLI-only providers** (per D10): `ClaudeCodeAdapter` and `CodexAdapter`. No direct-API adapters.
- Roles: `planner`, `coder`, `reviewer`, `summarizer`. (`tester` and `integrator` deferred — start with single-task runs.) Provider assignments per [models/agent-operations.md](../models/agent-operations.md).
- Bounded-parallel agent runtime (default 5), 2-retry policy, fresh-with-summaries context handoff, per-role wall-clock + 120 s output-stall watchdog.
- Workspace: git worktrees + SQLite ledger. See [architecture/workspace-state.md](../architecture/workspace-state.md).
- Plan: zod schema, versioned files end-to-end. See [models/plan-format.md](../models/plan-format.md).
- Budget: 3-layer enforcement and `budget-exceeded` checkpoint. See [models/cost-budget.md](../models/cost-budget.md).
- Sandbox policy engine + Claude Code PreToolUse hook **and** Codex PATH shim — both required because `coder` runs on Codex. See [models/sandbox-policy.md](../models/sandbox-policy.md).
- **Web app (primary surface, per D13)** — local HTTP server on `127.0.0.1`, auto-launched browser, panels per [models/app-ui.md](../models/app-ui.md): live status, checkpoint queue, plan view, logs, final review. (Tech stack and visual design TBD.)
- **CLI (secondary surface)** — `init`, `run`, `run --no-server`, `dashboard`, `status`, `logs --follow`, `checkpoints`, `answer`, `resume`, `abort`. CLI per [models/ui-policy.md](../models/ui-policy.md): Normal verbosity default, bottom-fixed status line, compact-list plan rendering.
- UX flow per [models/ux-flow.md](../models/ux-flow.md): planner clarification pass, approve/comment/reject on plan, Ctrl-C graceful pause / hard kill, leave-branches final review, one active run per project.
- Layered config (4 tiers) per [models/personalization.md](../models/personalization.md): user-level config at OS-conventional path overriding built-in defaults; project config overriding user.
- **Wiki system** at `<config>/wiki/` per [models/wiki-system.md](../models/wiki-system.md): minimum page set (`index`, `log`, `SCHEMA`, `user-profile`, `projects/<slug>`, `decisions/<run-id>`, `patterns/<slug>` on demand), post-run ingest by orchestrator + Claude Code CLI, query at PLANNING entry and before plan-approval / risky-change-confirmation prompts.
- Worked example: "given a goal, produce a TS project skeleton with one feature implemented and a written summary."

## Deferred to v0.2+

- `AnthropicApiAdapter`, `OpenAiApiAdapter` (direct-API path; revisit if CLI startup latency for orchestrator sub-decisions proves intolerable).
- Web app polish (inline plan editing in the GUI, advanced diff views, dark/light theme switcher).
- Multi-task DAG execution and the `integrator` role.
- `tester` role and acceptance-criteria scoring against test runs.
- Cost-based provider routing (open question Q7).
- Plugin / custom-role system.
- Notification integrations beyond local terminal/desktop.
- Remote dashboard auth (open question Q4).
- OS-level sandbox (sandbox-exec / bubblewrap), egress allowlist hardening, child-process resource limits (rlimits / cgroup) — bundled together.

## MVP exit criteria

The v0.1 MVP is "done" when all of these are true:

1. `beaver init && beaver run "<goal>"` succeeds end-to-end on a fresh repo for the worked example.
2. The run produces a valid plan (passes `PlanSchema.safeParse`) and at least one committed branch.
3. Aborting the process and running `beaver resume <run-id>` recovers the run from disk.
4. A run that exceeds the per-run cap pauses and posts a `budget-exceeded` checkpoint instead of aborting.
5. Every state transition is visible as a row in `events`.
