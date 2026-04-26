# Devplan Conventions

> Sprint structure, the three exit-tests every sprint must pass, and how to record progress. Read this once before working any phase.

**Doc type:** planning
**Status:** Stable
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [../../models/agent-baseline.md](../../models/agent-baseline.md)

---

## Sprint structure

Every sprint document follows this skeleton:

```markdown
## Sprint <Phase>.<N>: <Title>

**Goal.** One-sentence outcome.
**Depends on.** Sprint IDs that must be complete first.

### Tasks
1. T1 — <action> → verify: <check>
2. T2 — <action> → verify: <check>
…

### Spaghetti test
- <architectural / structural check 1>
- <architectural / structural check 2>

### Bug test
- <concrete scenario, expected outcome>
- <concrete scenario, expected outcome>

### Code review checklist
- <surgical / simplicity / clarity item>
- <surgical / simplicity / clarity item>

### Exit
All three test sections pass. Outstanding follow-ups recorded in sprint-log.md.
```

## The three sprint-exit tests

A sprint cannot be marked complete until **all three** pass. The order matters: spaghetti first (cheapest to fix), bugs second, review last (cosmetic / enforcement).

### 1. Spaghetti code test — *architectural integrity*

Surface complexity that does not trace to the user's request. Sprint-specific checks plus these always-on rules:

- **No circular imports** between workspaces or sibling modules. Verify via `pnpm exec madge --circular packages/`.
- **Layering respected.** entry → orchestrator → agent-runtime → providers → workspace; lower layers never import upper.
- **Single-responsibility per file.** A file that does two unrelated things gets split.
- **No speculative abstraction.** If an interface has one implementation in v0.1 and no concrete second use case in scope, drop the interface and use the concrete type directly (D15: simplicity first).

### 2. Bug test — *functional verification*

Each sprint lists 1–4 concrete scenarios with expected outcomes. The scenarios must:

- Run on a fresh checkout (no environment pollution from prior sprints).
- Cover the happy path **and** at least one explicit failure mode.
- Be executable without the live LLM CLIs where possible — use the mock CLI harness from sprint 1.4.
- Live as code under `packages/<workspace>/src/__bug-tests__/` and run via `pnpm test:bugs`.

### 3. Code review checklist — *D15 baseline applied to ourselves*

Same four principles we ask agents to follow:

- **Think before coding.** Were assumptions stated in the sprint task or commit message? If a tradeoff was made, is it captured?
- **Simplicity first.** Lines added vs lines necessary. Anything > 1.5× expected scope is a smell.
- **Surgical changes.** Diffs touch only files traceable to the sprint's tasks. Adjacent reformatting / unrelated dead-code removal is a flag.
- **Goal-driven.** Does each task close with a verification, not a "looks good"?

## Recording progress

A single growing file:

```
docs/planning/devplan/sprint-log.md
```

One entry per sprint, appended on completion. Format:

```
## [<date>] P<phase>.S<n> — <title>
- exit tests: spaghetti ✓ · bug ✓ · review ✓
- followups: <bullets, or "none">
- notes: <bullets, optional>
```

`sprint-log.md` is created on the first sprint start; the devplan does not pre-populate it. Grep with `grep "^## \[" sprint-log.md` for a timeline.

## Blocker handling

If a sprint can't pass an exit test:

1. Stop. Don't open the next sprint.
2. Record the blocker in `sprint-log.md` under the sprint's entry, status `blocked`.
3. If the blocker reveals a missing decision, surface it in [../../decisions/open-questions.md](../../decisions/open-questions.md) and resolve there before resuming.
4. Re-run all three exit tests after fixing — partial re-run hides regressions.

## Commit / branch conventions

- Branch per sprint: `dev/p<phase>.s<n>-<short-title>` (e.g., `dev/p0.s2-core-types`).
- Commit message prefix: `[P<phase>.S<n>.T<task>] <verb> <object>`.
- One PR per sprint. The PR description copies the sprint's three test sections, with each item checked.
