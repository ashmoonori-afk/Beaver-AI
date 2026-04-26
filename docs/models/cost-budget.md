# Cost & Budget Model

> USD as the user-facing unit. Three nested caps (agent / task / run). Hard cap pauses the run via a `budget-exceeded` checkpoint — never silently aborts.

**Doc type:** model
**Status:** Locked (D7)
**Last updated:** 2026-04-26
**See also:** [decisions/locked.md](../decisions/locked.md) (D7), [architecture/agent-runtime.md](../architecture/agent-runtime.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md)

---

## Ground truth: USD

Users care about dollars, not tokens. Tokens vary by model and provider.

- **External / persisted unit:** USD.
- **Internal tracking:** `(tokensIn, tokensOut, model)` per agent run, for accuracy and audit.
- **Conversion:** `ProviderAdapter.cost(usage) → USD` against a `rate_table` row, with `effective_from` to handle pricing changes over time.

```ts
type Usage = { tokensIn: number; tokensOut: number; model: string };
type CostEstimate = { usd: number; tokensIn: number; tokensOut: number };
```

## Three-layer caps

```
            per-run hard cap   ─────▶  emits budget-exceeded checkpoint
                    ▲
                    │ aggregates
            per-task budget    ─────▶  refuses to spawn next agent
                    ▲
                    │ aggregates
            per-agent budget   ─────▶  soft warns at 70%, kills at 100%
```

| Layer | Trigger | Action |
|-------|---------|--------|
| **Per-agent** | Adapter monitors usage during a run. | Soft warning at 70 % (logged event). Hard kill at 100 %, status = `budget_exceeded`. |
| **Per-task** | Running total across all agents (including retries) for one task. | When a retry would push the task over its budget, the orchestrator escalates instead of spawning. |
| **Per-run** | Running total across all tasks of a run. | Hard cap pauses all in-flight agents and posts a `budget-exceeded` checkpoint. |

## Defaults

```ts
const defaults: BudgetConfig = {
  perAgentUsd: 1.00,
  perTaskUsd:  3.00,
  perRunUsd:  20.00,
  warnThresholdPct: 70,
};
```

Overridable in `.beaver/config.json`, per-run via CLI flags (`--budget 50`), or per-task via the plan's `budgetUsd` field.

## `budget-exceeded` checkpoint

When the per-run hard cap is hit:

1. In-flight agents are aborted with `RunResult.status = 'budget_exceeded'`. Partial work is committed to their branches.
2. A checkpoint of kind `budget-exceeded` is posted with three options:

| Option | Behavior |
|--------|----------|
| `stop` | Mark run as `ABORTED` with reason `budget`. No further agents spawned. |
| `increase` | User supplies a new per-run cap; orchestrator resumes from where it paused. |
| `continue-once` | Permits exactly one more task to complete past the cap; orchestrator pauses again afterwards. |

This makes "autonomy with accountability" the default: Beaver never silently overspends, and the user always has a clean re-entry point.

## Cost telemetry

- Every `usage` event from an adapter is converted to USD on the spot and written to the `costs` table.
- The Orchestrator reads aggregates from `costs` (not from in-memory state) so crash recovery preserves cost accounting.
- `beaver status` reports per-run / per-task / per-agent spend against caps.
