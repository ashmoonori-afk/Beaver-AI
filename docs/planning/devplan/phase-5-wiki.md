# Phase 5 — Wiki system

> Bootstrap the wiki directory, post-run ingest, and pre-checkpoint query / hint generation. Replaces the `WikiQuery` no-op stub used in earlier sprints.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../../models/wiki-system.md](../../models/wiki-system.md)

---

## Phase goal

After every COMPLETED / FAILED / ABORTED run, the user-level wiki at `<config>/wiki/` is updated. Before every `plan-approval` and `risky-change-confirmation`, the wiki is consulted and a relevant `hint` is attached when found. The wiki compounds across runs.

## Phase exit criteria

- A first run on a fresh machine creates the documented wiki page set.
- A second run on the same machine adds a new `decisions/<run-id>.md` and updates `index.md` and `log.md`.
- A `plan-approval` checkpoint following a prior plan-approval with a comment shows a `[hint]` referencing that comment.
- The wiki ingest sub-step has its own budget cap of $0.10 by default (separate from the run's budget).

---

## Sprint 5.1: Wiki bootstrap + SCHEMA

**Goal.** First-run discovery: when no `<config>/wiki/` exists, create the directory and seed `SCHEMA.md`, `index.md` (empty catalog), `log.md` (empty), `user-profile.md` (empty stub).
**Depends on.** P0.S2.

### Tasks
1. T1 — `core/wiki/bootstrap.ts`: `ensureWiki(configDir)` — idempotent → verify: creates files on first run, no-op on second.
2. T2 — Bundled `SCHEMA.md` template (in `packages/core/wiki/templates/`) describing page types, link conventions, ingest rules — synced verbatim with [wiki-system](../../models/wiki-system.md) → verify: file equality test against the doc snapshot.
3. T3 — Stub pages: `index.md` with empty catalog headers, `log.md` empty, `user-profile.md` empty → verify: each page parses as valid markdown.
4. T4 — Fail-soft: if `<config>` is unwritable, log a warning and continue without the wiki rather than crashing the run → verify: simulated EACCES does not break the run.

### Spaghetti test
- Bootstrap is a single module; not split across `init/` and `bootstrap/` etc.
- Templates live as `.md` files in the bundle, not as TS string literals.

### Bug test
- First run on empty `<config>` → wiki tree present after.
- Second run → no template overwrites (e.g., the user has hand-edited SCHEMA.md and our bootstrap respects that).
- Read-only filesystem → run still completes; an `events` row records the wiki bootstrap failure.

### Code review checklist
- Bootstrap < 100 lines.
- All paths constructed via `path.join`; no string concatenation.
- Wiki failure is a warning, never an error stopping the run.

---

## Sprint 5.2: Post-run ingest

**Goal.** After a terminal state and `final-review`, the orchestrator runs a wiki-ingest sub-step that updates pages per [wiki-system](../../models/wiki-system.md).
**Depends on.** P5.S1, P2.S5.

### Tasks
1. T1 — `core/wiki/ingest.ts`: `ingest(runId, configDir)` — drives a Claude Code CLI call with a tightly scoped prompt that reads the run's events and existing wiki, returns a structured edit list → verify: snapshot test of the edit list for a fixture run.
2. T2 — Edit application: each edit is `{ file, action: 'create'|'update', content }`; the applier is the one place that writes wiki files → verify: writes are atomic (write-to-temp + rename).
3. T3 — `index.md` regeneration: catalog all pages with one-line summaries and inbound link counts → verify: catalog matches the actual wiki tree.
4. T4 — `log.md` append: one `## [<date>] ingest | <run-id> · <repo>` line → verify: grep `^## \[` returns chronological order.
5. T5 — Budget cap: ingest gets $0.10 by default, separate from the run's budget → verify: cost row has `source = 'wiki-ingest'`.

### Spaghetti test
- Ingest is one prompt + one applier; no per-page handler functions.
- Edits are computed in one LLM call, applied in one transaction (best-effort: sequential renames; on error halfway, rollback prior renames).
- Ingest does not read the orchestrator's in-memory state — only `events` + the existing wiki.

### Bug test
- Two consecutive runs on the same project → second updates `projects/<slug>.md` rather than creating a duplicate.
- ABORTED run → still produces `decisions/<run-id>.md` recording the abort reason.
- Ingest budget exceeded → ingest aborts mid-stream, partial edits rolled back, `events` records `wiki.ingest.budget_exceeded`.

### Code review checklist
- Atomic write helper used everywhere; no direct `fs.writeFileSync` to wiki paths.
- Edit list zod-validated before any disk write.
- Wiki schema compliance check (e.g., required headers in each page) runs before commit.

---

## Sprint 5.3: Pre-checkpoint query + hint generation

**Goal.** Replace the no-op `WikiQuery` from P3.S1 with the real implementation: read relevant pages, ask Claude Code CLI to draft a one-line hint, validate, attach.
**Depends on.** P5.S1, P3.S1.

### Tasks
1. T1 — `core/wiki/query.ts`: given `(kind, context)`, return `{ hint?: string, sourcePages: string[] }` → verify: snapshot tests for fixture wikis.
2. T2 — Pages consulted: `user-profile.md`, current `projects/<slug>.md`, recent 3 `decisions/*.md`, matching `patterns/*.md` → verify: file IO is bounded by wall-clock < 200 ms p95 on a 100-page wiki.
3. T3 — Hint drafting prompt template under `core/wiki/prompts/hint.md` → verify: snapshot.
4. T4 — Validation: hint zod schema (`{ text: string }`, max 200 chars). Validation failure → no hint attached, log only → verify: bug test.

### Spaghetti test
- One module owns the query; no cross-call into orchestrator state.
- File reads are streamed where pages are large; no `readFileSync` of the whole wiki.
- The query returns either `{ hint, sourcePages }` or `{}`; never throws to the caller.

### Bug test
- Empty wiki → no hint.
- Wiki with one prior `comment "skip auth"` on a similar plan → hint includes "previously" wording.
- Hint > 200 chars from the LLM → rejected, fallback to no hint, warning event.

### Code review checklist
- Hint generation budget is small (≤ $0.02) per checkpoint, configurable.
- Hint never includes secrets-like patterns (block list of token-shaped strings).
- The web UI's hover-to-reveal source page (P4.S4) reads `sourcePages` from the API DTO, not from the file system directly.
