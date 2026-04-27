---
name: beaver-wiki-ask
description: Use when the user asks the Beaver AI wiki a free-form question about prior runs, decisions, project conventions, or "what did we decide last about X?". The wiki is an LLM-maintained markdown KB at `<config>/wiki/` that compounds across runs; askWiki returns a grounded answer with citations.
---

# Beaver wiki — natural-language Q&A

The Beaver wiki is a structured set of markdown pages that Beaver writes after every run (page set: `index.md`, `log.md`, `user-profile.md`, `projects/<slug>.md`, `decisions/<run-id>.md`, `patterns/<slug>.md`).

## When to invoke

The user asks a free-form question that should be grounded in prior Beaver runs. Examples:

- "What did we decide last about auth?"
- "Why did we skip integration tests in the dashboard project?"
- "Which patterns has Beaver seen me reject before?"
- "Summarize the last 3 runs in this project."

## How to invoke

The wiki is callable in two ways:

**Programmatic (TypeScript):**

```ts
import { askWiki, ClaudeCodeAdapter, openDb } from '@beaver-ai/core';

const db = openDb({ path: '<repo>/.beaver/beaver.db' });
const adapter = new ClaudeCodeAdapter({ db });

const { answer, sourcePages } = await askWiki({
  wikiRoot: '<userConfigDir>/wiki',
  question: 'what did we decide last about auth?',
  adapter,
});
```

**Direct file reads:** When the wiki is small, the simpler path is to `cat` the relevant pages (`projects/<slug>.md`, `decisions/<latest>.md`) and answer from them directly.

## Reporting back

- Quote the wiki answer
- List `sourcePages` so the user can verify
- If `sourcePages` is empty, say "no relevant wiki entry found" rather than guessing

## Guardrails

- The wiki query has a tiny budget ($0.02 per ask by default)
- Hint validation rejects token-shaped strings (no secrets in answers)
- Never claim wiki content the citations don't support
