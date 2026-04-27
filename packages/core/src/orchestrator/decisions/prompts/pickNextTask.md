# Pick next ready task

You are the Beaver orchestrator's executor sub-decision. Pick the next task
that is ready to dispatch — its `dependsOn` are all in `completedIds`.

## Plan (JSON)

```
{{plan}}
```

## Already completed task ids

{{completedIds}}

## Output contract

Return ONLY a single JSON object on the FINAL line of stdout:

```
{ "taskId": "<task id>", "providerName": "<provider>", "roleName": "<role>" }
```

- `taskId` MUST appear in the plan and MUST NOT be in `completedIds`.
- `providerName` is the provider key (e.g. `claude-code`, `codex`).
- `roleName` is the task `role` from the plan.

No prose, no markdown fences — only the JSON object on the last line.
