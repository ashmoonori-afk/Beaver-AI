# Wiki System

> An LLM-maintained, persistent knowledge base — a structured, interlinked set of markdown files that Beaver writes and keeps current across runs. Replaces a flat memory log with a compounding artifact the planner and feedback layer can read at decision points.

**Doc type:** model
**Status:** Locked (D14)
**Last updated:** 2026-04-27 (ingest failure semantics clarified)
**See also:** [decisions/locked.md](../decisions/locked.md) (D14), [models/personalization.md](personalization.md), [models/agent-operations.md](agent-operations.md), [models/ux-flow.md](ux-flow.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md)

---

## Why a wiki, not a log

A flat append-only memory rediscovers the same patterns on every query. A wiki *compounds*: contradictions get flagged, cross-references get maintained, the synthesis already reflects everything the user has done. Beaver's wiki is **maintained by Beaver**; the user does not edit it (though they can — it is plain markdown).

Inspired by the LLM-Wiki pattern (Vannevar Bush's Memex, made tractable by giving the bookkeeping to an LLM).

## Three layers

1. **Raw sources** — every run's persisted artifacts: events, plans, transcripts, review documents, cost reports. These live under each project's `.beaver/runs/<run-id>/` and are immutable. Beaver reads from them but never modifies them.
2. **The wiki** — a directory of LLM-generated markdown files at the **user-level OS-conventional path** (cross-project): `<config>/wiki/`. Beaver owns this layer entirely.
3. **The schema** — `<config>/wiki/SCHEMA.md`, a co-evolving document that tells Beaver how to structure the wiki: page types, link conventions, frontmatter, ingest rules. The user may hand-edit the schema; Beaver re-reads it at every ingest.

## Page set in v0.1

| File | Purpose |
|------|---------|
| `index.md` | Catalog: every page listed with one-line summary, organized by category. Updated on every ingest. |
| `log.md` | Append-only chronological log. Each entry begins with `## [<date>] ingest \| <run-id> · <repo>` for grep-ability. |
| `SCHEMA.md` | Page templates, link conventions, ingest rules. Co-evolved between user and Beaver. |
| `user-profile.md` | Observed user attributes: preferred languages, frameworks, tone, recurring rejections, naming conventions. Updated when new signal contradicts or strengthens existing claims. |
| `projects/<slug>.md` | One per repo the user has run Beaver in: domain summary, conventions, recurring decisions, key dependencies, last-known state. |
| `decisions/<run-id>.md` | One per terminal-state run: goal, plan version history, key decisions, final verdict, links into the source `.beaver/runs/<run-id>/` artifacts. |
| `patterns/<slug>.md` | Created on demand: recurring patterns ("rejection of bcrypt-fork", "preference for vitest over jest"). Linked from user-profile and from relevant decision pages. |

Other page types (domains, comparisons, syntheses) emerge as the wiki grows; SCHEMA.md tracks what conventions take shape.

## Operations

### Ingest (post-run)

After a run reaches a terminal state and the user `approve`s `final-review` (or the run is `discard`ed / `abort`ed), the orchestrator runs a **wiki-ingest** post-step:

1. Read `SCHEMA.md` to refresh conventions.
2. Read the run's events, plan history, reviews, costs.
3. Update or create `decisions/<run-id>.md` (always).
4. Update `projects/<slug>.md` (always, even on failure — the failure mode itself is signal).
5. Update `user-profile.md` only when new signal materially changes a claim.
6. Create or update `patterns/<slug>.md` if a recurring decision pattern has accumulated enough evidence (≥ 2 confirming runs).
7. Update `index.md`.
8. Append a single-line entry to `log.md`.

The wiki-ingest step uses the Claude Code CLI (per D10) like any other orchestrator sub-decision. Budget: a small fixed allowance (default $0.10), separate from the run's own budget — the wiki is meta-work, not user-billable run work.

Failure semantics in v0.1:

- Wiki ingest is best-effort. Failure logs a `wiki.ingest.failed` event and never changes the already-terminal run outcome.
- Writes are staged to temporary files and renamed into place per file, so a partial ingest cannot corrupt an existing page.
- If budget is exceeded, Beaver writes no new wiki pages, logs the failure, and continues.
- `log.md` is appended only after required page writes for that ingest have succeeded; it is the marker that an ingest completed.

### Query (during a run)

The wiki is read at two decision points in the orchestrator FSM:

- **Entering PLANNING.** The planner is given a structured pack: the relevant excerpts from `user-profile.md`, the current repo's `projects/<slug>.md`, and the most recent 3–5 `decisions/*.md`. The planner uses this to inform plan-v1 — for instance, picking conventions the user has used before.
- **Posting `plan-approval` or `risky-change-confirmation`.** The feedback layer asks the orchestrator to draft a one-line hint by reading the most relevant wiki pages for the current context. If a relevant pattern exists, the hint is attached above the prompt body. If nothing relevant, no hint.

Both points are LLM sub-decisions (D6), validated against a small zod schema before rendering.

### Lint (deferred to v0.2)

`beaver wiki lint` will scan for orphan pages, missing cross-references, contradictions between pages, and stale claims. Not in v0.1.

## On-disk layout

```
<config>/wiki/
├── SCHEMA.md
├── index.md
├── log.md
├── user-profile.md
├── projects/
│   └── <slug>.md
├── decisions/
│   └── <run-id>.md
└── patterns/
    └── <slug>.md
```

Standard markdown. Obsidian-compatible. The user can browse with any editor. Git-versioning the wiki is encouraged — the wiki keeper does not reset existing git state inside the wiki directory.

## Privacy and scope

- The wiki is **machine-scoped**. It never leaves the local machine, is never synced over the network by Beaver, and is bound to the OS-conventional user config path.
- Cross-machine sync is the user's choice (drop the directory in iCloud / Dropbox / a private git repo if desired).
- Sensitive content discipline: the wiki keeper is instructed (via `SCHEMA.md`) never to record secrets, tokens, or credential paths it sees in transcripts. Sandbox policy already blocks reading credential paths (D9), so source contamination is unlikely; the schema rule is belt-and-suspenders.

## What is NOT in v0.1

- `beaver wiki lint` and any other dedicated wiki commands beyond ingest/query.
- Embedding-based search.
- Web UI surface for browsing the wiki (the user uses Obsidian / VS Code / `cat`).
- Automatic conflict resolution between contradicting wiki claims (the keeper flags but does not silently resolve).
- Multi-user sharing.

These are revisited in v0.2 once the wiki shape has been validated by real use.

## Replaces (in v0.1)

The earlier flat-JSON `memory.json` design described in pre-D14 drafts is **not built**. The wiki replaces it entirely. The same trigger (suggest-only hints on `plan-approval` and `risky-change-confirmation`) is delivered, but powered by a richer source.
