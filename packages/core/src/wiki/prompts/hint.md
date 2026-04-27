# Wiki hint draft

You are the Beaver wiki keeper drafting a one-line hint to attach above a
checkpoint prompt. The hint should remind the user of a relevant prior
decision IF one is clearly applicable to the current context. Otherwise,
emit `null`.

## Checkpoint kind

{{kind}}

## Current context (JSON)

```
{{context}}
```

## Source pages (relevant excerpts)

```
{{pages}}
```

## Output contract

Return ONLY a single JSON object on the FINAL line of stdout:

```
{ "hint": "previously you ... " | null }
```

When emitting a hint, lead with the word "previously" so the user recognizes
it as historical context. No prose, no markdown fences, no commentary.
