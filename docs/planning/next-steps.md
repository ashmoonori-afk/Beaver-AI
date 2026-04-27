# Next Steps

> A thin pointer into the [devplan](devplan/README.md). Detailed phase / sprint / task breakdown lives there; this page summarizes order and dependencies for quick reference.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26 (D16 locked: lock-sub-decisions step removed; queue collapsed to 9 steps)
**See also:** [planning/mvp-scope.md](mvp-scope.md), [decisions/open-questions.md](../decisions/open-questions.md)

---

## Queue

1. **Land the canonical TypeScript types.** A single file (or small module) that exports `ProviderAdapter`, `RunOptions`, `RunResult`, `AgentBudget`, `AgentOpsConfig`, plus the zod schemas for `Plan` and `Task`. With unit tests for schema validation and dependency-cycle detection.
2. **Sandbox policy engine module.** Implement classify(cmd, cwd, agentWorktree) → `hard-deny` | `require-confirmation` | `allow`. Pattern set from [models/sandbox-policy.md](../models/sandbox-policy.md). Pure-function unit tests for every rule.
3. **Stub `ClaudeCodeAdapter`.** Spawn the real `claude` CLI; verify spawn / parse / kill / budget-abort works end-to-end against a tiny task. Wire the PreToolUse hook to call the policy module from step 2.
4. **Stub `CodexAdapter`** with PATH-shim sandbox enforcement. Cover `rm`, `curl`, `wget`, `npm`, `pip`, `sudo`, `git`. Verify spawn / parse / kill / budget-abort and shim correctness against the policy engine.
5. **SQLite migration + DAO layer.** Schema from [architecture/workspace-state.md](../architecture/workspace-state.md) as a migration file; thin DAO that the orchestrator, policy hook, and HTTP server share.
6. **Bring up `@beaver-ai/server` skeleton.** Fastify on `127.0.0.1`, serves the webapp bundle, exposes SSE at `GET /api/runs/:runId/events` plus token-protected `POST /api/checkpoints/:id/answer` (per D16/D13).
7. **Bring up `@beaver-ai/webapp` skeleton.** React + Vite + Tailwind + shadcn/ui (dark default). Live status panel + checkpoint queue panel are the v0.1 minimum. Hash routing (`#status`, `#checkpoints`).
8. **Minimum Orchestrator FSM.** Single-task happy path: `planner → coder → reviewer → summarizer`. Bounded-parallel scheduler (default 5) and 2-retry policy from [models/agent-operations.md](../models/agent-operations.md). Run the worked example end-to-end through both the web app and `--no-server` CLI. See [reference/reference-flow.md](../reference/reference-flow.md).
9. **Wiki ingest stub.** Post-COMPLETED step that updates `<config>/wiki/index.md`, `log.md`, `decisions/<run-id>.md`, `projects/<slug>.md` per [models/wiki-system.md](../models/wiki-system.md). Smallest acceptable v0.1 subset.

## Dependencies

| Step | Depends on |
|------|------------|
| 2 | step 1 (types) |
| 3 | steps 1, 2 |
| 4 | steps 1, 2 |
| 5 | step 1 |
| 6 | step 5 |
| 7 | step 6 |
| 8 | steps 2–5, 6, 7 |
| 9 | steps 5, 8 |

Q6, Q7 do not block the v0.1 MVP — see [decisions/open-questions.md](../decisions/open-questions.md). Q3 → D9. Q4 → D13 (localhost-only, no account auth, token-protected mutations). Agent ops locked as D10. UX/UI locked as D11–D13. Personalization + Wiki + agent baseline + app UI tech stack locked as D14–D16.
