# App UI

> The primary user-facing surface in v0.1: a localhost web app auto-launched on `beaver run`. CLI is preserved as the scripting/headless secondary.

**Doc type:** model
**Status:** Locked (D13 — form, lifecycle, auth · D16 — tech stack, live updates, design, routing, fallback)
**Last updated:** 2026-04-26 (D16 added)
**See also:** [decisions/locked.md](../decisions/locked.md) (D5, D13, D16), [models/ux-flow.md](ux-flow.md), [models/ui-policy.md](ui-policy.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md)

---

## Form (D13)

A **localhost web app**. v0.1 ships no native window. Tauri/Electron desktop packaging is deferred to v0.2 — the same React/JS bundle is wrappable later without a rewrite.

## Server lifecycle (D13)

- `beaver run "<goal>"` (foreground) starts a small local HTTP server bound to `127.0.0.1:<port>` (default port discovered via probe; first free in `7777..7787`) and auto-launches the user's default browser at `http://127.0.0.1:<port>/runs/<id>`.
- Server stays alive while run is `RUNNING` or `PAUSED`.
- After terminal state (`COMPLETED`, `FAILED`, `ABORTED`), server lingers 60 seconds, then shuts down. Override via `--keep-alive` or `--no-server`.
- `beaver dashboard <run-id>` re-spawns the server for a past or paused run.

## Auth (D13, Q4 resolved)

Localhost-only, **no authentication** in v0.1. Server binds to `127.0.0.1` (not `0.0.0.0`). Same trust model as Vite, Storybook, Cypress devservers. v0.2 hardening adds an opt-in token query param for shared-machine setups.

## Tech stack (D16)

| Layer | Choice |
|-------|--------|
| Server framework | **Fastify** (Node 20, TypeScript) |
| Frontend framework | **React + Vite** (TypeScript everywhere) |
| Styling | **Tailwind CSS + shadcn/ui** (dark default; light toggle stays in v0.2 polish) |
| Bundler | Vite (production build serves static assets via Fastify) |
| State (client) | React state + a thin SSE-driven event store; no Redux / Zustand in v0.1 |
| Markdown rendering | `react-markdown` for plan/review render |

The same web bundle wraps cleanly into Tauri / Electron later — no rewrite required.

## Live update mechanism (D16)

**Server-Sent Events (SSE).** A single endpoint streams the run's event tail:

```
GET /api/runs/:runId/events           (SSE; newline-delimited JSON events)
GET /api/runs/:runId                  (snapshot: state, plan version, agents, costs)
GET /api/runs/:runId/plan             (latest plan JSON)
GET /api/runs/:runId/checkpoints      (open checkpoints)
POST /api/checkpoints/:id/answer      (apply user response — D11 actions)
```

Client subscribes to SSE on mount; falls back to a 3-second polling tick on disconnect. WebSockets and polling-only are not used.

## Visual design (D16)

- **Tools-feel** rather than apps-feel — dense, low-chrome, monospace where data is presented.
- **Dark default**, light toggle deferred to v0.2.
- **Tailwind + shadcn/ui** as the primitive layer (Dialog, Tooltip, Toast, ScrollArea, Tabs, Table). Brand has one accent color, otherwise neutral.
- **Tone follows [ui-policy](ui-policy.md)** — terse, no emoji, lowercase kebab-case status keywords.
- **Hint line** above plan-approval and risky-change-confirmation prompts (from the [Wiki system](wiki-system.md)) renders italic-muted with hover revealing the source wiki page.

## Routing (D16)

**Single-page with hash routes.** No server-side wildcard handling, no React Router; native `URL.hash`.

```
/runs/<id>                     →  default = #status
/runs/<id>#status              →  Live status panel
/runs/<id>#checkpoints         →  Checkpoint queue
/runs/<id>#plan                →  Plan view
/runs/<id>#logs                →  Logs / events
/runs/<id>#review              →  Final review (only when state ≥ COMPLETED)
```

## Browser-launch fallback (D16)

`beaver run` attempts to open the user's default browser:

1. macOS: `open <url>`. Linux: `xdg-open <url>`. Windows: `start <url>`.
2. If the launcher exits non-zero or no DISPLAY/`$XDG_*` is detected (SSH session, container, headless server):
   - Print the URL to stderr in a clearly framed block.
   - Print a one-line guide: `no graphical browser detected — visit the URL above, or rerun with --no-server for terminal-only mode.`
   - Continue running the server (the user may still hit the URL from another machine over SSH tunnel).
3. `BEAVER_NO_OPEN=1` env var or `--no-open` flag suppresses launch attempts entirely.

## Surfaces (in priority order)

1. **Live status panel** — state, plan version, agent grid (per-agent: role, task, status, spent), cost summary, elapsed.
2. **Checkpoint queue** — pending checkpoints with kind-specific bodies and the `approve / comment / reject` actions from [ux-flow](ux-flow.md). When the [Wiki system](wiki-system.md) has a relevant entry, a muted `[hint]` line appears above the body, with hover revealing the source wiki page.
3. **Plan view** — current plan with version history; v0.1 read-only render of the [plan format](plan-format.md). Inline editing is a v0.2 polish item.
4. **Logs / events** — chronological event stream filterable by source.
5. **Final review** — the shape from [ux-flow](ux-flow.md): goal, plan history, branch list, diff stats, spend breakdown, link to `final-report.md`.

## Goal entry stays on CLI

`beaver run "<goal>"` is the only entry to start a run. The web UI does not have a "new run" form in v0.1 — keeping a single entry point avoids duplicate validation paths and aligns with "headless still works." v0.2 may add an in-app goal form.

## CLI parity (the secondary surface)

Everything the web UI shows is reachable from the CLI:

| Web UI | CLI equivalent |
|--------|----------------|
| Live status panel | `beaver status`, `beaver logs --follow` |
| Checkpoint queue | `beaver checkpoints`, `beaver answer <id> <response>` |
| Plan view | `beaver plan show` |
| Logs | `beaver logs` |
| Final review | `beaver review` |

CLI follows [ui-policy](ui-policy.md). The web UI follows this doc.

## What stays the same regardless of UI choice

- Orchestrator FSM, sub-decisions, retry/concurrency policy.
- Event-sourced SQLite ledger (web UI reads the same data the CLI reads).
- Sandbox policy, plan schema, cost model, agent operations, agent baseline, wiki system.
- Goal entry happens via CLI.
- Headless / CI workflows function without ever opening a browser.
