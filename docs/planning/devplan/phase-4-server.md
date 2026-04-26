# Phase 4 — Web UI · Server side

> Fastify server with SSE, plus the browser auto-launch and end-to-end integration. Pairs with [phase-4-webapp.md](phase-4-webapp.md) for the React side.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [phase-4-webapp.md](phase-4-webapp.md), [../../models/app-ui.md](../../models/app-ui.md)

---

## Phase 4 goal (shared with phase-4-webapp.md)

Default `beaver run "<goal>"` (no flag) launches the browser, the user sees live status + checkpoints + plan + logs + final review, and `--no-server` still works. Both surfaces read the same SQLite ledger.

---

## Sprint 4.1: Fastify server skeleton + SSE

**Goal.** Local server bound to `127.0.0.1`, port discovered in `7777..7787`, exposes the documented endpoints, streams events via SSE.
**Depends on.** P0.S3, P3.S1.

### Tasks
1. T1 — `packages/server/src/server.ts`: Fastify on `127.0.0.1`, port probe, graceful shutdown → verify: probe falls through if 7777 busy.
2. T2 — `GET /api/runs/:runId` returns the snapshot DTO (state, plan version, agents, costs) → verify: matches [app-ui](../../models/app-ui.md) contract.
3. T3 — `GET /api/runs/:runId/events` SSE: streams new `events` rows; `Last-Event-ID` replay → verify: bug test.
4. T4 — `GET /api/runs/:runId/plan`, `GET /api/runs/:runId/checkpoints`, `POST /api/checkpoints/:id/answer` → verify: round-trip via `core/feedback/checkpoint`.
5. T5 — Lifecycle wired into `beaver run` per D13: starts on run start, lingers 60 s past terminal, `--keep-alive` overrides → verify: linger observable in events.

### Spaghetti test
- Server file does not import any UI/React code.
- Routes typed via Fastify TypeProvider against the same zod schemas the CLI uses (no parallel DTOs).
- No business logic in route handlers — they call `core/` and serialize.

### Bug test
- Two clients on `/events` simultaneously → both receive every event in order.
- Disconnect + reconnect with `Last-Event-ID: <n>` → server replays events `> n`.
- POST to `/checkpoints/<bad-id>/answer` → 404 with the standard error shape.
- Killing the server mid-SSE → CLI run continues; clients reconnect when server resumes.

### Code review checklist
- No `0.0.0.0` bind anywhere (D13 invariant).
- CORS not opened — same-origin only by virtue of localhost.
- Request logging records metadata only; full bodies live in `events`.

---

## Sprint 4.6: Browser launch + integration

**Goal.** `beaver run` (no flag) defaults to launching the browser; fallback prints URL when no graphical browser; `--no-server` and `--keep-alive` honored.
**Depends on.** P4.S1, [phase-4-webapp.md](phase-4-webapp.md) sprint 4.5.

### Tasks
1. T1 — `core/cli/open-browser.ts` calling `open` (mac), `xdg-open` (linux), `start` (win); detect failures → verify: success path on each OS via CI matrix smoke.
2. T2 — Fallback: launcher fails or env is headless → print URL block + the documented one-line guide → verify: bug test.
3. T3 — `BEAVER_NO_OPEN=1` and `--no-open` → suppress launch entirely → verify: env var unit test.
4. T4 — End-to-end: the worked example from P2.S5 also runs via `beaver run` (no flag) and is observable in the web UI from start to COMPLETED → verify: full path.

### Spaghetti test
- Launcher < 80 lines.
- No platform-specific code in `webapp/`; platform-handling lives in `core/cli`.

### Bug test
- SSH session (no `DISPLAY`) → URL printed + guide; server still running.
- `BEAVER_NO_OPEN=1 beaver run "<goal>"` → server starts, browser does not.
- macOS GUI session → browser opens at the right URL with the run id.

### Code review checklist
- Don't rely on `xdg-open` exit codes alone (some distros return 0 without launching). Combine with `DISPLAY` / `WAYLAND_DISPLAY` checks.
- `start` on Windows uses `cmd /c start` to avoid background quoting issues.
- Error messages are actionable: "no graphical browser detected — visit URL above, or rerun with --no-server."
