# Plan Format

> A versioned, immutable JSON DAG of tasks. zod is the single source of truth for the schema. Markdown views are derived.

**Doc type:** model
**Status:** Locked (D8)
**Last updated:** 2026-04-26
**See also:** [decisions/locked.md](../decisions/locked.md) (D8), [architecture/orchestrator.md](../architecture/orchestrator.md), [architecture/workspace-state.md](../architecture/workspace-state.md)

---

## Schema (zod, single source of truth)

```ts
const TaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),         // stable kebab-case id
  role: z.enum([
    'planner', 'coder', 'reviewer',
    'tester', 'integrator', 'summarizer'
  ]),
  goal: z.string(),                              // human-readable summary
  prompt: z.string(),                            // detailed instructions for the agent
  dependsOn: z.array(z.string()),                // task ids that must complete first
  acceptanceCriteria: z.array(z.string()),       // checked by the reviewer
  providerHint: z.string().optional(),           // optional preferred provider
  budgetUsd: z.number().positive().optional(),   // overrides default per-task cap
  capabilitiesNeeded: z.array(z.string()).default([]),
});

const PlanSchema = z.object({
  version: z.number().int().positive(),          // strictly increasing
  goal: z.string(),                              // top-level user goal
  tasks: z.array(TaskSchema),
  createdAt: z.string(),                         // ISO 8601
  parentVersion: z.number().int().positive().optional(),
  modifiedBy: z.enum([
    'planner', 'reviewer', 'user', 'orchestrator'
  ]).optional(),
  modificationReason: z.string().optional(),
});

type Plan = z.infer<typeof PlanSchema>;
type Task = z.infer<typeof TaskSchema>;
```

## Versioning and mutation

Plans are append-only. A plan is **never** edited in place; any change produces a new file `runs/<run-id>/plan/plan-v<N+1>.json`.

The new version carries:

- `version` — strictly greater than the parent.
- `parentVersion` — pointer to the predecessor.
- `modifiedBy` — one of `planner | reviewer | user | orchestrator`.
- `modificationReason` — free-text explanation.

Reasons a new version may appear:

- Planner reacts to user feedback at a `plan-approval` checkpoint.
- Reviewer suggests added or changed tasks during REVIEWING.
- Orchestrator splits a too-large task during EXECUTING.

The runtime always works against the latest version, but the full lineage is preserved for audit and rollback.

## Validation contract

Every plan persisted to disk passes `PlanSchema.safeParse`. A plan that fails validation is rejected; the producing agent (planner or reviewer) is asked once to repair, then escalated to a `risky-change-confirmation` checkpoint.

## Cycle / dependency invariants

- Each `dependsOn` id must reference a task in the same plan.
- The dependency graph must be a DAG (no cycles); checked at validation time.
- Tasks with no unmet dependencies are eligible for execution; the Orchestrator's executor sub-decision picks among them. See [architecture/orchestrator.md](../architecture/orchestrator.md).

## Markdown rendering for humans

The same `Plan` is rendered to a Markdown table for terminal and dashboard display. The Markdown is **derived** from the JSON; it is never authored separately, eliminating drift.

Example renderer signature:

```ts
function renderPlanMarkdown(plan: Plan): string;
```
