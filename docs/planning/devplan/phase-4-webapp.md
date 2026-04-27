# Phase 4 — Web UI · Webapp side

> React + Vite + Tailwind + shadcn/ui scaffold and the four panels (live status, checkpoint queue, plan, logs, final review). Pairs with [phase-4-server.md](phase-4-server.md) for Fastify and browser launch.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [phase-4-server.md](phase-4-server.md), [../../models/app-ui.md](../../models/app-ui.md), [../../models/ui-policy.md](../../models/ui-policy.md)

---

## Sprint 4.2: Webapp scaffold + hash routing

**Goal.** Vite + React + TS + Tailwind + shadcn/ui, dark default, hash routing for `#status`, `#checkpoints`, `#plan`, `#logs`, `#review`. Empty panels OK in this sprint.
**Depends on.** P4.S1.

### Tasks
1. T1 — `packages/webapp/` Vite scaffold; build outputs to `packages/webapp/dist/`; server serves it → verify: `beaver dashboard <run-id>` shows a non-empty page.
2. T2 — Tailwind + shadcn/ui setup; one accent color in config; dark default via `<html>` class → verify: tokens visible.
3. T3 — Hash router (custom, ~30 lines): map `URL.hash` to a `Panel` → verify: changing `#section` swaps panels without remounting layout.
4. T4 — `App.tsx` shell: header (run id, state badge, spent, elapsed) + nav + outlet → verify: snapshot per panel slot.

### Spaghetti test
- No client routing library; the hash router is local code.
- Components import shadcn/ui primitives only.
- Tailwind classes not abstracted ("Stack", "HStack" etc.) until a real second use case appears.

### Bug test
- Build size of webapp (gzipped) under 250 KB.
- Lighthouse accessibility ≥ 90 on the empty shell.
- Reloading on `#plan` lands directly on the Plan panel.

### Code review checklist
- No `dangerouslySetInnerHTML`.
- No client-side fetching yet (deferred to next sprint).
- Strict mode + `noUnusedLocals` clean.

---

## Sprint 4.3: Live status panel + SSE client

**Goal.** Status panel renders state, agent grid, cost, elapsed, refreshing live via SSE.
**Depends on.** P4.S1, P4.S2.

### Tasks
1. T1 — `useRunSnapshot(runId)`: initial fetch + SSE merge → verify: 100 rapid events produce a stable final state.
2. T2 — `useEventStream(runId)` SSE hook with `Last-Event-ID` reconnect → verify: kill server, restart → no duplicate events.
3. T3 — Status components: header badge, agent grid, cost summary, elapsed ticker → verify: visual snapshot.
4. T4 — Empty / error states ("server not reachable", "no run with this id") → verify: bug test.

### Spaghetti test
- One hook per data shape (`useRunSnapshot`, `useCheckpoints`, …); no global store.
- SSE handler does not parse `events` JSON twice (single parse at the boundary).
- Panel components are pure functions of props.

### Bug test
- Server temporarily unreachable → "reconnecting…" then recovers.
- Run id not found → "no such run" with link back to `beaver dashboard`.
- Cost ticker stops at terminal state (does not keep ticking elapsed).

### Code review checklist
- No `useEffect` without cleanup.
- No `setInterval` for elapsed; derive from `Date.now()` re-rendered on event tick.
- Tailwind classes follow the documented palette; no ad-hoc `#hex`.

---

## Sprint 4.4: Checkpoint queue panel + answer

**Goal.** Pending checkpoints rendered with kind-specific bodies, action buttons, and the `[hint]` slot when the wiki query returns one (Phase 5 wires the real wiki; this sprint uses the no-op stub from P3.S1).
**Depends on.** P4.S1, P4.S3.

### Tasks
1. T1 — `useCheckpoints(runId)` → verify: new checkpoint within 1 s.
2. T2 — Per-kind body renderers (plan-approval, risky-change-confirmation, merge-conflict, escalation, final-review, budget-exceeded, goal-clarification) → verify: snapshot per kind.
3. T3 — Action UI: buttons map to documented response shapes; `comment` opens textarea before submit → verify: bug test.
4. T4 — Hint slot above body when `body.hint` present → verify: empty when stub returns null.

### Spaghetti test
- One file per kind body in `webapp/src/checkpoints/<kind>.tsx`.
- The `answer` POST is one helper used by every action button.
- Dispatch by mapping object, not `if (kind === 'X')` cascades.

### Bug test
- `plan-approval` `approve` → POST 200 → checkpoint disappears within 1 s.
- `plan-approval` `comment "skip auth"` → POST with body, planner spawns, new plan-approval appears.
- Network error during POST → button re-enables, error toast, no double-submit on retry.

### Code review checklist
- Buttons disabled while POST in flight; no double-click race.
- `[hint]` rendering uses the documented italic-muted style.
- Comment textarea uses `<textarea>`, not contenteditable.

---

## Sprint 4.5: Plan view + Logs view + Final review

**Goal.** The remaining three panels: plan version history (read-only), logs filterable by source, final review with diff stats.
**Depends on.** P4.S1, P4.S2.

### Tasks
1. T1 — Plan panel: latest plan + version dropdown → verify: render matches `cli/render/plan` output.
2. T2 — Logs panel: virtualized event list, filter by `source`, `--json` toggle → verify: 10 000 events scroll smoothly.
3. T3 — Final review panel: rendered in `FINAL_REVIEW_PENDING` and `COMPLETED`; pulls `final-report.md`, branch list, diff stats → verify: bug test.
4. T4 — Markdown via `react-markdown`, sanitized → verify: no XSS via crafted markdown.

### Spaghetti test
- Logs virtualization uses one library, not hand-rolled.
- Diff stats computed server-side; client does not invoke git.

### Bug test
- Plan with 3 versions → switching versions re-renders correctly.
- Final review on a discarded run → shows "discarded" state, no diff link.
- Markdown with a `<script>` tag → rendered as text.

### Code review checklist
- Long-press / right-click defaults preserved (no global `preventDefault`).
- Markdown CSS scoped to the panel.
- No fetching inside the markdown renderer.
