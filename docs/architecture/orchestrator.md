# Orchestrator

> The brain of Beaver. A deterministic top-level state machine drives the run; LLM calls handle judgment-call sub-decisions inside each state.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [decisions/locked.md](../decisions/locked.md) (D6, D10), [models/plan-format.md](../models/plan-format.md), [models/agent-operations.md](../models/agent-operations.md), [architecture/agent-runtime.md](agent-runtime.md)

---

## Top-level state machine

```
                                 ┌──────────────┐
                                 │ INITIALIZED  │
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │   PLANNING   │ ◄── plan-approval checkpoint
                                 └──────┬───────┘
                                        ▼
                       ┌──────► ┌──────────────┐
                       │        │  EXECUTING   │ ◄── budget-exceeded checkpoint
                       │        └──────┬───────┘
                       │               ▼
                       │        ┌──────────────┐
                       └─retry──┤  REVIEWING   │
                                └──────┬───────┘
                                       ▼
                                ┌──────────────┐
                                │ INTEGRATING  │ ◄── merge-conflict checkpoint
                                └──────┬───────┘
                                       ▼
                                ┌──────────────┐
                                │  COMPLETED   │   final-review checkpoint
                                └──────────────┘

   Terminal: COMPLETED · FAILED · ABORTED
   Any state can yield to FEEDBACK_PENDING when a checkpoint is posted.
```

State transitions are plain TypeScript. Each transition writes an entry to the `events` table, which is the system of record for resumability — `beaver resume <run-id>` rebuilds in-memory state by replaying events.

## LLM sub-decisions

Within each state, the Orchestrator makes judgment calls via direct API calls against structured prompts. These are the *only* LLM-driven decision points in the outer loop:

| State | Sub-decision | Output schema |
|-------|--------------|---------------|
| PLANNING | Refine plan when user feedback is given on the draft. | `Plan` (next version) — see [plan-format](../models/plan-format.md) |
| EXECUTING | Pick the next ready task; assign provider and role. | `{ taskId, providerName, roleName }` |
| REVIEWING | Accept, retry, or escalate the just-completed task. | `{ verdict: 'accept' \| 'retry' \| 'escalate', reason }` |
| INTEGRATING | Resolve a non-trivial merge conflict. | `{ resolution, confidence, escalate? }` |
| COMPLETED | Has the run truly satisfied the goal? | `{ satisfied: boolean, gaps: string[] }` |

Every sub-decision call carries: the run goal, the current plan, the most relevant recent events, and the specific question. Responses are validated against a zod schema; on validation failure, the Orchestrator falls back to a deterministic conservative default (e.g., escalate to user).

## Runtime placement

The Orchestrator's state machine logic runs **in-process** as plain TypeScript. Sub-decision LLM calls are dispatched through the **Claude Code CLI** (per D10 — CLI-only prototype) rather than via direct API; CLI startup overhead is accepted in exchange for a single integration story to debug. v0.2 may reintroduce direct-API for orchestrator sub-decisions if latency becomes a concern.

Real work — file editing, code generation, test execution — is always delegated to spawned CLI agents in the [agent-runtime](agent-runtime.md) layer; provider assignments are in [models/agent-operations.md](../models/agent-operations.md).

## Observability

- Every state transition emits an `event` row.
- Every sub-decision LLM call emits a `decision` event with the prompt, response, and validation outcome.
- `beaver status` renders the current state plus the last decision summary.
