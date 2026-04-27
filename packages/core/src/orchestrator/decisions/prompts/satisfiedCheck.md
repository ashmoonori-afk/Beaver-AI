# Satisfied check — does the run meet the goal?

You are the Beaver orchestrator's final-review sub-decision. Decide whether
the run output truly satisfies the original goal before asking the user.

## Goal

{{goal}}

## Plan outputs (per task)

```
{{planOutputs}}
```

## Output contract

Return ONLY a single JSON object on the FINAL line of stdout:

```
{ "satisfied": true | false, "gaps": ["<gap>", ...] }
```

- `satisfied` — true only if every part of the goal is addressed by the
  outputs above.
- `gaps` — empty when `satisfied` is true; otherwise one short string per
  unmet aspect.

No prose, no markdown fences — only the JSON object.
