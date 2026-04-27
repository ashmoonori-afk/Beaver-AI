# UX Flow

> The contract between autonomy and user control. Where Beaver pauses to involve the user, what those moments look like, and how runs are entered, observed, paused, and resumed.

**Doc type:** model
**Status:** Locked (D11)
**Last updated:** 2026-04-27 (final-review pending state clarified)
**See also:** [decisions/locked.md](../decisions/locked.md) (D11), [architecture/entry-layer.md](../architecture/entry-layer.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md), [architecture/orchestrator.md](../architecture/orchestrator.md)

---

## Onboarding — `beaver init`

When the user runs `beaver init` in a repo:

1. Refuse if the cwd is not a git repo (with a clear remediation).
2. Create `.beaver/` with default `config.json`, an empty `beaver.db` migrated to current schema, and empty `runs/` and `worktrees/` directories.
3. Validate the configured providers' CLIs are installed and authenticated:
   - `claude --version` succeeds; a tiny ping confirms auth.
   - `codex --version` succeeds; a tiny ping confirms auth.
4. Print a next-step pointer: `Try beaver run "<goal>".`

A pre-existing `.beaver/` is detected; `beaver init` becomes a no-op with an "already initialized" message.

## Goal entry

The only entry point is `beaver run "<goal>"`. Goals are free-form text — no templates, no structured flags in v0.1.

The planner is allowed (and encouraged) to ask **one clarifying pass** before producing the first plan. This produces a new checkpoint kind: `goal-clarification`.

```
1. user        beaver run "Add user auth"
2. planner     posts goal-clarification:
                 - Which auth provider — JWT, OAuth, magic link?
                 - Sign-up enabled or invite-only?
3. user        replies inline.
4. planner     produces plan-v1 with the augmented goal.
```

If the goal is unambiguous the clarifying pass is skipped. The pass is bounded to **one round** to avoid death-spiral interrogation; if the planner cannot proceed after one round it falls back to a best-effort plan-v1 and surfaces remaining ambiguities as `acceptanceCriteria` items the reviewer will catch later.

## Plan approval

At the `plan-approval` checkpoint the user has three options:

| Option | Behavior |
|--------|----------|
| `approve` | Plan is locked at the current version; orchestrator transitions to EXECUTING. |
| `comment <text>` | Planner produces plan-v(N+1) with `modifiedBy: planner`, `modificationReason: <text>`. Posts plan-approval again. |
| `reject` | Run is aborted with status `ABORTED`, reason `user-rejected-plan`. |

In v0.1 (terminal) the comment is a single free-text response. v0.2 dashboard adds line-level editing.

## Mid-run interrupt

In foreground mode (`beaver run "<goal>"`) the user controls the run with Ctrl-C:

- **Ctrl-C once:** request graceful pause. Orchestrator stops dispatching new agents, signals in-flight agents to commit their current state, then transitions RUNNING → PAUSED. Worktrees and branches are preserved.
- **Ctrl-C twice within 3 seconds:** hard kill. Process tree terminated. Worktrees preserved; SQLite is consistent because every transition is event-sourced.

After either, `beaver resume <run-id>` re-enters from the last consistent state.

## Watching mode

The **primary** watching surface in v0.1 is the auto-launched web app (D13) — it shows the live status panel, checkpoint queue, plan view, and logs with the same SQLite data.

CLI alternatives (always available, required when `--no-server`):

- `beaver status` — snapshot of the active run: state, plan version, ready/running/done task counts, spent USD, open checkpoints.
- `beaver logs --follow [<run-id>]` — pretty-printed tail of the `events` table.
- `beaver checkpoints` — list of pending checkpoints; `beaver answer <id> <response>` to respond.

Both surfaces read from the same SQLite ledger.

## Final review

When execution/review is done and the summarizer writes `final-report.md`, Beaver enters `FINAL_REVIEW_PENDING` and posts a `final-review` checkpoint with:

- The run goal (verbatim).
- Plan version history (which versions were produced and why).
- List of agent branches with commit counts.
- Diff stats (files changed, +/− lines) per branch.
- Total spend and per-role spend breakdown.
- Pointer to `runs/<run-id>/final-report.md`.

User options:

| Option | Behavior |
|--------|----------|
| `approve` | Run marked COMPLETED. Branches **left in place**; the user merges manually with their preferred git workflow. |
| `discard` | Run marked ABORTED, reason `user-discarded`. Branches and worktrees removed. |

Auto-merge to main and PR creation are **not** v0.1 behaviors — they would put Beaver inside the user's git review workflow, which is too consequential without explicit opt-in. Both are tracked for v0.2.

## Run concurrency

A given `.beaver/` directory hosts **one active run at a time** in v0.1. `beaver run` rejects when an existing run has status `RUNNING` or `PAUSED`:

```
A run is already in progress (id: <id>, status: PAUSED).
Resume it with `beaver resume <id>` or abort it with `beaver abort <id>`.
```

This avoids worktree branch-name collisions, multi-writer SQLite contention, and a confusing terminal experience. Multi-run is on the v0.2 list and will rely on namespaced branches, WAL-mode shared writes, and a multiplexed event stream.

## Failure communication

When a run terminates as FAILED or ABORTED, Beaver prints:

1. **Headline** — one line ("Run failed: reviewer rejected coder output 3 times").
2. **Cause classification** — one of: `policy-violation`, `agent-unable`, `retry-exhausted`, `budget-exhausted`, `user-rejected-plan`, `user-discarded`, `user-aborted`.
3. **Pointer** — `beaver logs <run-id>` for the full transcript.
4. **Restart hint** — when applicable, `beaver resume <run-id>`.

The cause classifications align with `RunResult.status` and the run's terminal-state metadata; see [agent-operations](agent-operations.md) and [cost-budget](cost-budget.md).

## Help & discovery

- `beaver help` lists subcommands.
- `beaver help <subcommand>` shows usage and one example.
- `--examples` flag on any subcommand prints common usage patterns.

## Deferred to v0.2+

- Web dashboard for any of the above (richer plan editing, live status, checkpoint UI).
- Auto-merge or PR creation as opt-in `final-review` actions.
- Multi-run concurrency in one project.
- `beaver run` from saved templates.
- Inline plan line-editing in the terminal (TUI).
