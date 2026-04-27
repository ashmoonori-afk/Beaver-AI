# Feedback Channel

> One checkpoint primitive (a SQLite row), two delivery surfaces (terminal and dashboard).

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26 (D13 ripple: web app primary in v0.1; CLI is the headless secondary)
**See also:** [decisions/locked.md](../decisions/locked.md) (D5, D11, D12, D13), [architecture/orchestrator.md](orchestrator.md), [models/cost-budget.md](../models/cost-budget.md), [models/ux-flow.md](../models/ux-flow.md), [models/ui-policy.md](../models/ui-policy.md), [models/app-ui.md](../models/app-ui.md)

---

## Primitive: the checkpoint

A **checkpoint** is a row in the `checkpoints` table that says "the run is paused; here is what we want a human to weigh in on." Both delivery surfaces read from and write to the same row.

```
checkpoints (id, run_id, kind, status, prompt, response)

status: pending | answered | timed_out | cancelled
```

When a checkpoint is `pending`, the Orchestrator suspends transitions until it becomes `answered` (or `cancelled` by the user).

## Checkpoint kinds

| Kind | Posted by | What we ask |
|------|-----------|-------------|
| `goal-clarification` | Planner before plan-v1 | Answer 1–2 questions the planner needs before drafting a plan. One round only. See [models/ux-flow.md](../models/ux-flow.md). |
| `plan-approval` | Orchestrator after PLANNING | `approve` / `comment <text>` / `reject`. Comment triggers a plan-v(N+1) revision and re-checkpoint. |
| `risky-change-confirmation` | Reviewer, coder, or sandbox policy hook | Confirm a wide-blast-radius change (schema migration, dependency bump, file deletion, write outside worktree). See [models/sandbox-policy.md](../models/sandbox-policy.md). |
| `merge-conflict` | Integrator | Resolve a non-trivial conflict the integrator agent could not handle confidently. |
| `escalation` | Orchestrator after retry exhaustion | Tell the user a task could not be completed; ask how to proceed. |
| `final-review` | Orchestrator in `FINAL_REVIEW_PENDING` before terminal `COMPLETED` | `approve` (mark COMPLETED, leave branches in place) or `discard` (ABORTED, remove branches). Auto-merge / PR are v0.2. See [models/ux-flow.md](../models/ux-flow.md). |
| `budget-exceeded` | Budget guard at hard cap | Stop / increase / continue-once. See [models/cost-budget.md](../models/cost-budget.md). |

## Surfaces

### Web app mode (primary in v0.1, per D13)

`beaver run "<goal>"` auto-launches the user's browser pointing at `http://127.0.0.1:<port>/runs/<id>`. The web UI renders the live status panel, checkpoint queue, plan view, logs, and final review. Server lifecycle and auth are defined in [app-ui.md](../models/app-ui.md). Authentication is localhost-only, no token (Q4 resolved).

### CLI mode (secondary, headless / scripting)

`beaver run "<goal>" --no-server` skips the GUI entirely; the CLI process polls the `checkpoints` table and renders interactive prompts inline using the unified frame from [ui-policy](../models/ui-policy.md). Required for CI, SSH-only sessions, and any environment without a graphical browser. Both surfaces read from the same `checkpoints` rows.

## Notification policy

When a checkpoint becomes `pending`:

- Web app surface: in-app toast + browser title flash; system notification when the tab is backgrounded.
- CLI surface (`--no-server` runs): terminal bell + status line update.

External integrations (Slack/email) are deferred to v0.2.

## Suggest-only hints (from the Wiki system)

For `plan-approval` and `risky-change-confirmation` checkpoints, the feedback layer asks the orchestrator to draft a one-line hint by reading relevant pages from the [Wiki system](../models/wiki-system.md) (`user-profile.md`, current `projects/<slug>.md`, recent `decisions/*.md`, matching `patterns/*.md`). If the wiki has nothing relevant, no hint is attached. Hints are informational only and never block the user response.
