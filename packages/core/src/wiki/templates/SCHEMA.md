# Wiki Schema (v0.1)

> Conventions Beaver follows when writing this wiki. The user may hand-edit
> this file; Beaver re-reads it on every ingest.

## Page set

| File                    | Purpose                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.md`              | Catalog of every page with a one-line summary. Updated on every ingest.                                                                         |
| `log.md`                | Append-only chronological log. Each entry: `## [<date>] ingest \| <run-id> · <repo>`.                                                           |
| `SCHEMA.md`             | This file. Co-evolved between user and Beaver.                                                                                                  |
| `user-profile.md`       | Observed user attributes: preferred languages, frameworks, tone, recurring rejections. Updated only when new signal materially changes a claim. |
| `projects/<slug>.md`    | One per repo: domain summary, conventions, recurring decisions, last-known state.                                                               |
| `decisions/<run-id>.md` | One per terminal-state run: goal, plan history, key decisions, verdict, links to `.beaver/runs/<run-id>/`.                                      |
| `patterns/<slug>.md`    | Recurring patterns (created when ≥ 2 runs confirm). Linked from user-profile and decisions.                                                     |

## Link conventions

- Use relative links: `[run abc](decisions/abc.md)`, `[my-repo](projects/my-repo.md)`.
- Cross-reference `patterns/*` from `user-profile.md` and from each decision page that confirmed the pattern.
- Source artifacts live under `.beaver/runs/<run-id>/` in the project repo. Reference by absolute path inside decision pages: `[events](/abs/path/to/.beaver/runs/<run-id>/events.jsonl)`.

## Frontmatter

Optional YAML frontmatter is permitted but not required. When present:

```
---
runId: <id>
repo: <slug>
status: <ok|failed|aborted|discarded>
---
```

## Ingest rules

1. Always create or update `decisions/<run-id>.md`.
2. Always update `projects/<slug>.md` (failures are signal).
3. Update `user-profile.md` only when a new claim contradicts or strengthens an existing one.
4. Create or update `patterns/<slug>.md` only when ≥ 2 confirming runs exist.
5. Always update `index.md` and append one line to `log.md`.
6. Never record secrets, tokens, or credential paths.
7. Writes are staged to a temp file and renamed into place per file. Partial ingest must not corrupt an existing page.

## Privacy

- This wiki is machine-scoped. It never leaves the local machine via Beaver.
- The user may sync the directory themselves (Dropbox, iCloud, private git).
- The wiki keeper must never write secrets even if encountered in transcripts.
