# Reference Flow — "Build me a TODO app"

> A worked end-to-end example showing how the layers, FSM, and persistence cooperate during a real run.

**Doc type:** reference
**Status:** Draft
**Last updated:** 2026-04-26 (D10 ripple: provider names corrected)
**See also:** [architecture/orchestrator.md](../architecture/orchestrator.md), [architecture/agent-runtime.md](../architecture/agent-runtime.md), [models/plan-format.md](../models/plan-format.md), [models/agent-operations.md](../models/agent-operations.md)

---

## Scenario

The user invokes:

```
beaver run "Build a TypeScript TODO app with auth"
```

## Step-by-step

```
 1. user           beaver run "Build a TypeScript TODO app with auth"
 2. CLI            creates run row, opens transcript file
 3. Orchestrator   STATE = PLANNING; planner agent (Claude Code CLI)
                   produces plan-v1.json:
                     [spec, scaffold, auth, ui, tests]
 4. Orchestrator   posts checkpoint(plan-approval)
 5. Terminal       renders plan; user replies "skip auth for now"
 6. Orchestrator   planner sub-decision → plan-v2.json
                   (parentVersion: 1, modifiedBy: planner,
                    modificationReason: "skip auth per user")
 7. Orchestrator   STATE = EXECUTING. For each ready task:
    a. AgentRuntime    git worktree add .beaver/worktrees/<agent-id>
    b. Adapter         spawns codex CLI in workdir (coder uses Codex per D10);
                       enforces per-agent budget; PATH shim applies sandbox policy
    c. Coder agent     edits files, commits to its branch
    d. Reviewer agent  diffs branch vs main, scores against
                       acceptanceCriteria, files findings
    e. Tester agent    (deferred past v0.1 MVP) — runs tests, parses output
    f. Orchestrator    REVIEWING sub-decision → accept | retry | escalate
 8. Integrator     STATE = INTEGRATING; merges branches in dependency order
                   (deferred past v0.1 MVP — single-task runs first)
 9. Summarizer     writes runs/<run-id>/final-report.md
10. Orchestrator   posts checkpoint(final-review)
11. user           approves → STATE = COMPLETED
```

## What is persisted at each step

- **Step 2** — `runs` row with `status='RUNNING'`, `started_at`, `goal`.
- **Step 3** — `plans` row pointing to `plan-v1.json`; `events` row `plan.created`.
- **Step 4** — `checkpoints` row, status `pending`.
- **Step 6** — `plans` row for v2 with `parent_version=1`; `events` row `plan.revised`.
- **Step 7c** — `agents` row, `costs` rows per usage event, `artifacts` rows for committed files.
- **Step 11** — `runs.status='COMPLETED'`, `runs.ended_at`; `events` row `run.completed`.

## What `beaver resume <run-id>` rebuilds

- The current FSM state (from the latest `events` of type `state.transition`).
- The latest plan version (latest `plans` row).
- Per-agent / task / run cost aggregates (from `costs`).
- Outstanding pending checkpoints (from `checkpoints`).
- Active worktrees (from `agents` rows with status `running`, cross-checked against `git worktree list`).
