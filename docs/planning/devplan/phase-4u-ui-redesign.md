# Phase 4U — UI redesign (Lovable-referenced)

> Replaces the original Phase 4 webapp plan ([phase-4-webapp.md](phase-4-webapp.md)) with a Lovable-inspired surface. Server side ([phase-4-server.md](phase-4-server.md)) stays as-is — this phase is purely the React webapp layer.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-27
**Supersedes:** phase-4-webapp.md
**See also:** [../../models/app-ui.md](../../models/app-ui.md), [../../models/ui-policy.md](../../models/ui-policy.md), [README.md](README.md)

---

## North star

> "When you double-click `Start-Beaver.bat`, it should feel like Lovable: a single conversational prompt, a live build streaming in front of you, and a small bento of cards that tell you exactly what is happening — no tabs to dig through."

Lovable's design DNA we are lifting:

| Lovable trait | Beaver translation |
|---------------|--------------------|
| Conversational primary input ("What do you want to build?") | A single oversized goal box on `#status` empty state |
| Live preview alongside the prompt | Streaming agent transcript on the right while events tick |
| Bento grid of small focused cards | Agent grid · cost · elapsed · plan version · open checkpoints |
| Vibrant single accent on a near-monochrome canvas | Emerald-500 on slate-900; everything else neutral |
| Generous whitespace, large display type | 1.6 rem hero text, 1rem body, 0.875rem caption |
| Subtle motion, no chrome bling | 200 ms ease-out on every state change; no hover spinners |
| Friendly empty states | "Beaver is idle. What should we build?" with the goal box centered |

The CLI surface ([ui-policy.md](../../models/ui-policy.md)) stays terse and tools-feel; this doc is **only** about the webapp.

## Design principles (rigid)

1. **One primary action per screen.** Empty state = "Run". Run-in-progress = "Open checkpoint" or "Pause". Final review = "Approve" or "Discard".
2. **Bento over tabs.** All run state lives in cards on `#status`. Tabs stay (they are a doc invariant from D16) but the user should not need to switch them to see the next thing they care about.
3. **Streaming first.** Every render targets the SSE event stream — no batched polling, no skeleton loaders past the first 200 ms.
4. **Single accent.** `accent-500` (emerald) marks success / running / approve. Errors get one ring of rose-500. Everything else: neutral slate.
5. **Type hierarchy stronger than color.** Headlines use weight + size, not color, to reduce semantic noise.
6. **Dark default. Light is opt-in (deferred to 4U.7).**

## Component inventory (shadcn/ui primitives + Beaver-flavored)

Reuse from shadcn/ui: `Button` · `Card` · `Dialog` · `Tabs` · `Tooltip` · `ScrollArea` · `Toast` · `Badge` · `Separator` · `Textarea`.

Beaver-specific atoms (own files under `packages/webapp/src/components/`):

| Atom | Role |
|------|------|
| `GoalBox` | Lovable-style oversized textarea + submit; auto-grows; pastes preserved |
| `StateBadge` | One-glyph state badge (PLANNING / EXECUTING / FINAL_REVIEW_PENDING / COMPLETED / FAILED) |
| `CostTicker` | Animated USD spend with thin progress against per-run cap |
| `ElapsedClock` | Live mm:ss; freezes at terminal state |
| `AgentCard` | role · provider · status · spent · brief last-line; emerald ring when running |
| `EventLine` | Single log row in monospace, color-coded by source |
| `CheckpointCard` | Big rounded card with body + 3 inline action buttons |
| `HintLine` | Italic muted line above a CheckpointCard, sourced from the wiki |
| `BranchPill` | `beaver/<run>/<agent>` with copy-on-click |
| `WikiSearch` | One textarea, one citation list — natural-language `askWiki` UI |

## Sprint breakdown

> Sprint IDs prefixed `4U.` to distinguish from the deferred original Phase 4. Each follows the [conventions.md](conventions.md) three-gate exit (spaghetti / bug / review).

### Sprint 4U.0: design tokens + theme

**Goal.** Tailwind config with the locked palette + type scale + motion durations. shadcn/ui themed once, never re-touched.

- **Tasks**: extend `tailwind.config.js` with `accent` (emerald 500), `surface` (slate 900/800/700), `text` (slate 50/300/500). Add font sizes per the principles list. Wire shadcn/ui CLI generator with these.
- **Spaghetti**: tokens live in one config file; no per-component overrides.
- **Bug**: visual regression snapshot of `App.tsx` shell across light/dark.
- **Review**: < 80 lines of Tailwind config; no inline `bg-[#abc]` hex anywhere in components.

### Sprint 4U.1: empty state — `GoalBox` (the Lovable moment)

**Goal.** Hash-route `#status` when no run exists shows an oversized centered `<GoalBox>`. Submitting starts a run via `POST /api/runs` (server already exists per [phase-4-server.md](phase-4-server.md)).

- **Tasks**: `GoalBox.tsx` (200 ms appear, focus-on-mount, Cmd/Ctrl+Enter submit, paste-preserves-newlines); empty-state copy `Beaver is idle. What should we build?`.
- **Bug**: paste a 3 KB goal → submits unmodified.
- **Bug**: enter without Cmd → newline only, no accidental submit.
- **Review**: no `useEffect` without cleanup; no duplicate auto-focus.

### Sprint 4U.2: live status — bento grid

**Goal.** Run-in-progress `#status` swaps the empty state for a 4-card bento: `StateBadge` + `CostTicker` + `ElapsedClock` + `AgentCard` grid. SSE-driven; updates without remount.

- **Tasks**: `useRunSnapshot(runId)` hook (initial fetch + SSE merge per [phase-4-server.md](phase-4-server.md) sprint 4.3); bento layout via CSS grid (no library); per-`AgentCard` motion when its status changes.
- **Spaghetti**: one hook per data shape (`useRunSnapshot`, `useCheckpoints`, `useEvents`); no global store.
- **Bug**: 100 events in 200 ms → smooth ticker, no React warnings.
- **Bug**: terminal state → ticker freezes, badge changes color, no further fetches.
- **Review**: Lighthouse a11y ≥ 90 on the bento; keyboard tab order matches visual order.

### Sprint 4U.3: checkpoint approval — `CheckpointCard`

**Goal.** Pending checkpoints render as full-width cards on `#checkpoints`, one card per row, kind-specific body. Big inline action buttons (`approve` / `comment` / `reject`); `comment` opens an in-card textarea before submit. `[hint]` slot above the body when the wiki returns one.

- **Tasks**: per-kind body renderers (`plan-approval`, `risky-change-confirmation`, `merge-conflict`, `escalation`, `final-review`, `budget-exceeded`, `goal-clarification`); shared `answerCheckpoint(id, response)` POST helper; `HintLine` consumes the wiki sourcePages metadata.
- **Spaghetti**: one file per kind under `webapp/src/checkpoints/<kind>.tsx`; no `if (kind === 'X')` cascades.
- **Bug**: approve → card removes within 1 s of the SSE event.
- **Bug**: rejected POST → button re-enables, toast shows reason, no double-submit on retry.
- **Review**: 44 px minimum hit area on every action button; visible focus ring.

### Sprint 4U.4: plan view + logs view + final review

**Goal.** Three remaining panels per [phase-4-webapp.md](phase-4-webapp.md) sprint 4.5 — but with the redesigned look.

- **Plan**: latest-plan card + thin version dropdown; no separate "history" tab — selecting an older version dims the rest of the screen. Same compact-list as the CLI render so they stay synced.
- **Logs**: virtualized event list (one library, e.g. `@tanstack/react-virtual`); filter chips above; `--json` toggle pipes raw NDJSON into a code block.
- **Final review**: rendered in `FINAL_REVIEW_PENDING` and `COMPLETED`. Hero card: branch list with `BranchPill`, diff-stat sparklines, link to `final-report.md` (markdown via `react-markdown`, sanitized). Two big actions: `approve` (emerald) / `discard` (rose, with confirmation modal).
- **Spaghetti**: virtualization is a library, not hand-rolled. Diff stats come from server, not git invocations on the client.
- **Bug**: 10 000-event log scrolls smoothly. Markdown with `<script>` renders as text.
- **Review**: no `dangerouslySetInnerHTML`; no client git calls.

### Sprint 4U.5: wiki Q&A — `WikiSearch`

**Goal.** New `#wiki` hash route. Single `<textarea>` ("Ask the wiki anything…") + a citations panel beneath the answer. Calls `askWiki({ wikiRoot, question, adapter })` from `@beaver-ai/core`.

- **Tasks**: `useAskWiki(question)` (debounced 250 ms); answer pane streams text; citations rendered as `Card` with file path + first 3 lines + click-to-open. Empty state: "Beaver remembers your past runs. Try 'what did we decide last about auth?'"
- **Spaghetti**: the hook never builds prompts itself — server endpoint wraps `askWiki`.
- **Bug**: empty wiki → "no relevant entry yet" without firing the LLM.
- **Bug**: hint > 200 chars → server-side truncation; UI shows "(truncated)" not raw clipped JSON.
- **Review**: source pages render as plain markdown; no XSS via crafted page filenames.

### Sprint 4U.6: motion + a11y polish

**Goal.** Final pass of the small details that separate Lovable from "another React dashboard".

- **Tasks**: 200 ms ease-out on every state change; reduced-motion media query disables transitions; focus rings on every interactive; `aria-live="polite"` on the cost ticker and event log; tab order matches visual order; keyboard shortcut `?` opens a help dialog with the documented shortcuts (`r` = run, `c` = checkpoints, `w` = wiki, `Esc` = close modal).
- **Bug**: `prefers-reduced-motion: reduce` honored — no spring animations.
- **Bug**: every interactive element passes axe-core in CI.
- **Review**: Lighthouse a11y ≥ 95 on every panel.

### Sprint 4U.7: light mode (opt-in, deferred-to-tail)

**Goal.** A second theme toggled by header switch. Tailwind dark-class strategy already in place; tokens just remap.

- **Tasks**: `useTheme()` hook persisting to localStorage; respects `prefers-color-scheme` for first paint; switcher in the header.
- **Spaghetti**: tokens are the only place that varies; no per-component theme branches.
- **Review**: every component visual snapshot under both themes.

## Tech additions on top of the locked stack

D16 already pinned: Vite + React + TS + Tailwind + shadcn/ui + SSE.

Additions allowed by this redesign (each one a single dep, justified per spaghetti rule):

| Addition | Reason |
|----------|--------|
| `@tanstack/react-virtual` | Logs panel — only library for virtualization (sprint 4U.4) |
| `react-markdown` + `rehype-sanitize` | Final-review report rendering (sprint 4U.4) |
| `framer-motion` | One library for the 200 ms ease-out transitions (sprint 4U.6); reduced-motion-aware out of the box |
| `axe-core` (devDep) | a11y CI check (sprint 4U.6) |

No state library (Redux / Zustand) — hooks + URL hash are the entire client state model.

## Cross-cutting expectations

- Every component is < 150 lines or it gets split.
- No file-level `any`; props always typed via `interface`.
- Snapshot tests for every panel under both themes once 4U.7 lands; until then dark-only.
- Bundle target (gzipped, runtime only): **≤ 250 KB** (matches phase-4-webapp.md sprint 4.2 bug-test).
- SSE reconnect on disconnect within 3 s; no UI flicker.
- Build artifact under `packages/webapp/dist/` served by `@beaver-ai/server` so the launcher's `--server` flag opens the redesigned UI in the browser.

## Sequencing

```
4U.0 (tokens) -> 4U.1 (GoalBox) -> 4U.2 (bento status)
                                       |
                                       +--> 4U.3 (CheckpointCard)
                                       |
                                       +--> 4U.4 (plan / logs / review)
                                       |
                                       +--> 4U.5 (WikiSearch)

                       4U.6 (a11y polish) // pull in once any sprint above lands
                       4U.7 (light mode)  // tail; opt-in
```

Sprints 4U.3 / 4U.4 / 4U.5 can be parallelized via sub-agents once 4U.0–4U.2 land — they touch disjoint files and the design tokens are stable.

## DoD for Phase 4U

- All hash routes (`#status`, `#checkpoints`, `#plan`, `#logs`, `#review`, `#wiki`) render with the redesigned look on the worked example from [phase-6-mvp-exit.md](phase-6-mvp-exit.md) sprint 6.1.
- The launcher's `Start-Beaver.{bat, command, sh, ps1}` opens the browser to `#status` and the user can complete the worked example through to `COMPLETED` without ever switching to the CLI.
- Bundle ≤ 250 KB gzipped; first contentful paint ≤ 200 ms on a cold load.
- Lighthouse a11y ≥ 95 across all panels.
- 0 React warnings in production console for the worked example.
