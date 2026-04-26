# Workspace & State

> Filesystem layout under `.beaver/`, the role of git worktrees, and the SQLite schema that holds the run/task/event ledger.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [decisions/locked.md](../decisions/locked.md) (D4), [architecture/agent-runtime.md](agent-runtime.md), [models/cost-budget.md](../models/cost-budget.md), [models/plan-format.md](../models/plan-format.md)

---

## On-disk layout

```
<repo>/
├── .beaver/
│   ├── beaver.db               # SQLite ledger
│   ├── config.json             # project-level config (incl. budgets, rate table)
│   ├── runs/
│   │   └── <run-id>/
│   │       ├── plan/           # one file per plan version (plan-v1.json, plan-v2.json …)
│   │       ├── transcripts/    # full agent transcripts
│   │       └── reviews/        # review documents
│   └── worktrees/
│       └── <agent-id>/         # git worktree, branch beaver/<run-id>/<agent-id>
└── ... (the user's actual project)
```

## Git worktrees

Every agent runs in its own `git worktree` on a dedicated branch named `beaver/<run-id>/<agent-id>`. This gives:

- **Physical isolation** — agents cannot clobber each other's files.
- **Natural conflict handling** — cross-task contention becomes a merge conflict at integration time.
- **Clean rollback** — abort an agent with `git worktree remove` plus `git branch -D`.
- **Inspectable progress** — `git log <branch>` shows exactly what an agent did.

The `integrator` agent merges branches in dependency order; non-trivial conflicts emit a `merge-conflict` checkpoint.

## SQLite schema (initial sketch)

```
projects     (id, name, root_path, created_at, config_json)
runs         (id, project_id, goal, status, started_at, ended_at,
              budget_usd, spent_usd)
plans        (id, run_id, version, parent_version, modified_by, content_path)
tasks        (id, run_id, parent_id, role, status, depends_on_json,
              budget_usd, spent_usd)
agents       (id, task_id, provider, worktree_path, branch, status,
              budget_usd, spent_usd)
artifacts    (id, task_id, kind, path, sha, summary)
events       (id, run_id, ts, source, type, payload_json)   -- append-only
checkpoints  (id, run_id, kind, status, prompt, response)
costs        (id, run_id, agent_id, provider, tokens_in, tokens_out,
              usd, model, ts)
rate_table   (provider, model, tokens_in_per_usd, tokens_out_per_usd,
              effective_from)
```

## Source-of-truth rules

- **`events` is the system of record.** All other tables are materialized views. On crash, replaying `events` reconstructs in-memory orchestrator state.
- **`costs` is read by the budget aggregator** rather than in-memory counters, so cost accounting survives restarts.
- **`plans` table stores metadata**; the plan content lives in `runs/<run-id>/plan/plan-v<N>.json` and is referenced by `content_path`. See [models/plan-format.md](../models/plan-format.md).

## Concurrency

- A single run is single-writer to its tables; the Orchestrator process owns the writes.
- Multiple `beaver status` reads against the database are safe (SQLite WAL mode).
- Two simultaneous `beaver run` invocations in the same repo are rejected by checking for an active `RUNNING` row.
