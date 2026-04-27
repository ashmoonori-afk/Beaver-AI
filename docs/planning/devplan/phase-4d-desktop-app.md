# Phase 4D — Desktop native (Tauri v2)

> Pulls D13's "Tauri/Electron deferred to v0.2" forward. The launcher must ship as a real local program — installable, signed, native window chrome, no browser tab, no localhost server in the foreground path.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-27
**Decision amends:** [decisions/locked.md](../../decisions/locked.md) D13
**Composes with:** [phase-4u-ui-redesign.md](phase-4u-ui-redesign.md) (the React UI lives inside the desktop window)
**Replaces (foreground path):** [phase-4-server.md](phase-4-server.md) — Fastify localhost server demoted to the optional `--server` headless mode for scripting; foreground UI talks to core via Tauri IPC + a Node sidecar
**See also:** [../../models/app-ui.md](../../models/app-ui.md)

---

## Why desktop, not web

The browser-served webapp introduced four real problems that a native shell removes:

1. **Trust dialogs**: every Windows browser warns when a localhost URL auto-opens; users cancel them.
2. **Background drift**: closing the browser tab does not stop the run — confusion, runaway agents.
3. **Permission scope**: a real GUI process can mediate filesystem access through OS dialogs (`SaveFileDialog`, `OpenFolderDialog`) that the web cannot get without server round-trips.
4. **System integration**: tray, jump list, notifications, Windows file-association for `.beaver/` projects — all impossible from a browser tab.

The fix: ship a **single signed desktop binary** that owns its window, its lifecycle, and the filesystem permission surface. The launcher script (`Start-Beaver.{bat,ps1,command,sh}`) becomes a one-liner that just opens this binary.

## Decision: Tauri v2 (primary), Electron (documented fallback)

| | Tauri v2 | Electron |
|---|---|---|
| Binary size (Win64, packed) | ~10–15 MB | ~150 MB |
| Cold start | ~150 ms | ~600 ms |
| Webview | system (Edge WebView2) | bundled Chromium |
| Memory at idle | ~80 MB | ~250 MB |
| Build toolchain | Rust + Node | Node only |
| Node sidecar | first-class | first-class |
| IPC | typed via `invoke` | typed via `ipcMain/Renderer` |
| Auto-updater | built-in (signed manifests) | electron-updater |
| Korean / IME | system webview = perfect | bundled Chromium = perfect |
| WPF / WinUI parity feel | native title bar + menus + tray | native title bar + menus + tray |

**Choice: Tauri v2.** Smaller, faster, and the system webview approach matches how Edge / VS Code / etc. feel on Windows. The Rust toolchain is a build-time concern only — end users get a single `.msi` / `.exe`.

**Fallback to Electron** if any of these block us during 4D.0:
- WebView2 not installable in some target Win10 versions (rare in 2026)
- Tauri sidecar IPC unable to stream SSE-equivalent reliably to the renderer
- Auto-updater signing flow blocks shipping

The decision is captured as **D17** in [decisions/locked.md](../../decisions/locked.md):

> **D17** Desktop shell: Tauri v2 wrapping the React UI from Phase 4U, with a bundled Node sidecar running `@beaver-ai/core`. Electron is the documented fallback if 4D.0 hits a blocker. Ship as Win64 `.msi` (signed) + macOS `.dmg` (notarized) + Linux `.AppImage`.

## Architecture (three processes)

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri main process  (Rust)                                  │
│  - native window chrome, menus, tray, jump list              │
│  - file-system permission dialogs                            │
│  - auto-updater                                              │
│  - spawns + supervises the Node sidecar                      │
│  - relays renderer <-> sidecar messages                      │
└──────────────────────────────────────────────────────────────┘
   │                                              ▲
   │  invoke(...) / Tauri IPC                     │  emit(...)
   ▼                                              │
┌──────────────────────────────────────────────────────────────┐
│  Renderer  (React + Vite, the Phase 4U UI)                   │
│  - GoalBox / bento status / CheckpointCard / WikiSearch ...  │
│  - subscribes to event stream from sidecar via Tauri events  │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │  newline-delimited JSON over stdio
                          │
┌──────────────────────────────────────────────────────────────┐
│  Node sidecar  (the existing @beaver-ai/core)                │
│  - Beaver class, runOrchestrator, ClaudeCodeAdapter, ...     │
│  - SQLite ledger, wiki, sandbox classifier — all unchanged   │
└──────────────────────────────────────────────────────────────┘
```

**Why a sidecar instead of `napi-rs` bindings?** The whole orchestrator + adapters + DAOs are TypeScript. Bridging that to Rust would be a rewrite; a Node sidecar reuses 100% of what we built.

**Sidecar lifecycle**: spawned on Tauri startup with `tauri::api::process::Command`, killed on window close or app quit. Single-instance lock at the Tauri layer — second launch focuses the existing window.

## Windows-specific design

The native shell unlocks specific Windows features that the web cannot:

| Feature | Plan |
|---------|------|
| Title bar | Native chrome (frame: `true`) — matches Windows 11 mica style |
| Window state | Remembered (size + position) via Tauri's `windowState` plugin |
| System tray | Always-running icon: "Open Beaver" / "Active runs: N" / "Quit" |
| Jump list | Recent runs (right-click on taskbar icon) |
| Taskbar progress | Show progress thumbnail when a run is `EXECUTING` (overall plan progress) |
| Native notifications | Run-completed / checkpoint-pending toasts via `tauri-plugin-notification` |
| File associations | `.beaver/` folder right-click → "Open with Beaver" (registry entry in installer) |
| Single-instance | second double-click of `Start-Beaver.bat` focuses the existing window instead of spawning a new one |
| OS dialogs | "Save final-report.md as…" uses native Windows save dialog |
| Dark/light | Follows Windows theme by default (`prefers-color-scheme`); explicit toggle in Settings |
| IME / Hangul | System webview handles Korean composition correctly out of the box |

macOS adds menu bar items + Dock badge; Linux adds `.desktop` file. Both paths handled by Tauri plugins; no per-OS source code beyond the `tauri.conf.json` matrix.

## Composition with Phase 4U

Phase 4U's React/Tailwind/shadcn UI ships **inside** this desktop window. The visual design (Lovable-referenced GoalBox / bento / CheckpointCard / WikiSearch) is reused unchanged. The only renderer-side delta:

- replace `fetch('/api/runs/:id')` with `invoke('beaver:get_run', { runId })`
- replace SSE EventSource with `listen('beaver:event', handler)` (Tauri event bus)
- add a thin transport layer (`packages/webapp/src/transport/tauri.ts`) so the components stay framework-agnostic

If 4U is built first against the Fastify server, swapping the transport in 4D is one file.

## Sprint breakdown

> Sprint IDs `4D.*`. All exit through the [conventions.md](conventions.md) three-gate (spaghetti / bug / review).

### Sprint 4D.0: scaffold + Hello World

**Goal.** Tauri v2 project under `apps/desktop/` opens a window that renders the existing 4U.0/4U.1 UI; sidecar boots and answers a `ping` IPC.

- Tasks: `pnpm create tauri-app` into `apps/desktop/`; wire the existing `packages/webapp/dist/` as the renderer source; add the Node sidecar binary path to `tauri.conf.json` (`tauri.bundle.externalBin`); implement `beaver:ping` round-trip.
- Spaghetti: only one Rust file beyond the scaffold (`src/sidecar.rs`) — IPC handlers live there, nowhere else.
- Bug: cold double-click of the dev binary opens a window in < 600 ms on a baseline Win11 laptop.
- Review: no `unwrap()` / `expect()` in the sidecar supervisor — every error path returns a typed `Result` to the renderer.

### Sprint 4D.1: sidecar IPC contract

**Goal.** Define every renderer → sidecar message and its response type. zod-validated on both sides (the sidecar reuses the existing core schemas; the Rust side accepts opaque JSON and returns opaque JSON, gated only by message-name allowlist).

- Tasks: command set: `runs.start` · `runs.snapshot(id)` · `runs.events(id, lastEventId?)` (streaming) · `runs.answerCheckpoint(id, response)` · `runs.abort(id)` · `wiki.ask({question})` · `dialog.openWorkdir` (delegates to native dialog).
- Spaghetti: command names live in one shared TS file (`apps/desktop/shared/ipc.ts`) imported by both sides — no string drift.
- Bug: invoking an undefined command name → typed error, no panic.
- Review: every command has a TS test that round-trips through a stub sidecar (no Tauri runtime needed).

### Sprint 4D.2: live event streaming (replaces SSE)

**Goal.** The bento status panel updates in real time from sidecar events — no polling, no perceptible lag.

- Tasks: sidecar emits NDJSON to stdout; Tauri main multiplexes onto the renderer event bus (`event.emit('beaver:event', payload)`); renderer hook `useEventStream(runId)` replaces the Phase 4U SSE hook.
- Spaghetti: the multiplexer is one Rust function; renderer hook reuses the same merge/dedupe logic as the SSE hook (single `mergeEvents` utility).
- Bug: 1000 events in 200 ms → smooth ticker, no React warnings, no dropped events.
- Bug: sidecar crash → main respawns once + emits `beaver:sidecar_restarted`; renderer shows a quiet warning toast.

### Sprint 4D.3: native shell features

**Goal.** Tray icon · jump list · taskbar progress · native notifications · single-instance lock.

- Tasks: `tauri-plugin-single-instance`, `tauri-plugin-notification`, `tauri-plugin-window-state`. Custom menu via `tauri::Menu` (File / Edit / View / Help). Tray menu items: "Open Beaver" / "Pause active run" / "Quit".
- Spaghetti: tray menu actions all dispatch the same IPC commands as renderer buttons — no parallel "tray-only" code path.
- Bug: closing the window minimizes to tray; "Quit" from tray actually exits.
- Bug: a second `Start-Beaver` invocation focuses the existing window within 200 ms.
- Review: notifications include Beaver's icon (`assets/icons/beaver.ico`); no fallback to Tauri's default icon.

### Sprint 4D.4: file system bridge

**Goal.** "Save final-report.md as…", "Open run folder in Explorer", "Choose project root" all use OS-native dialogs, not browser-style file inputs.

- Tasks: `tauri-plugin-dialog`; commands `dialog.saveFile(defaultName, content)` · `dialog.openFolder(label)` · `shell.openPath(path)` (opens explorer.exe / Finder / xdg-open). Permission allowlist: only the project `.beaver/` and the user-chosen workspace can be written.
- Spaghetti: file paths flowing renderer → sidecar are validated against the allowlist in the Rust main, not the sidecar — the sidecar trusts what the main hands it.
- Bug: a renderer attempt to write outside the allowlist → typed `permission_denied` error, no crash.
- Review: no `tauri-plugin-fs` exposed to the renderer (we wrap it through main only, so the security boundary stays in Rust).

### Sprint 4D.5: installer + signing + auto-update

**Goal.** Ship `Beaver-AI-0.1.0-x64.msi` (Win), `Beaver-AI-0.1.0.dmg` (mac), `Beaver-AI-0.1.0.AppImage` (Linux). All signed, Windows installer registers the `.beaver/` file-association.

- Tasks: GitHub Actions matrix (windows-latest / macos-latest / ubuntu-latest); EV-class code signing on Win (or self-signed for v0.1 with documented "smartscreen warning OK" footnote); Apple Developer ID + notarization on mac; Tauri's built-in updater pointing at GitHub Releases.
- Spaghetti: one `release.yml` workflow drives all three platforms; per-OS config diffs are only in `tauri.conf.json` matrix entries, never in CI scripts.
- Bug: cold install on a fresh Win11 VM → first launch under 3 s, no SmartScreen block once signed.
- Bug: an in-place upgrade from 0.1.0 → 0.1.1 retains the user's `.beaver/` data and `wiki/` directory.
- Review: installer size on disk ≤ 30 MB Win64, ≤ 25 MB Linux, ≤ 35 MB mac. Auto-update prompt shows release notes pulled from the GitHub release body (no parallel hand-written list — drift gate).

### Sprint 4D.6: polish (Windows mica · macOS vibrancy · Linux GTK)

**Goal.** Final visual pass per OS so the app feels native, not Electron-with-an-icon.

- Tasks: Win11 mica via `tauri::WindowBuilder::transparent_decorations`; macOS vibrancy effect on the sidebar; Linux Adwaita-friendly title bar. System theme follows OS (`prefers-color-scheme` + `tauri::api::os::theme`). Korean font stack: `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif` (matches platform defaults; no font shipped).
- Spaghetti: per-OS visual differences land entirely in `tauri.conf.json` + a single CSS variable file; component code is platform-blind.
- Bug: switching OS theme with the app open updates within 200 ms.
- Review: take three screenshots (Win11 / macOS / Ubuntu GNOME) and they all look like first-class citizens, not a port.

## Repo additions

```
apps/
└── desktop/                       # NEW — Tauri shell
    ├── src-tauri/                 # Rust main + sidecar supervisor
    │   ├── src/
    │   │   ├── main.rs
    │   │   ├── sidecar.rs         # spawn / kill / IPC relay
    │   │   ├── menus.rs
    │   │   ├── tray.rs
    │   │   └── allowlist.rs       # filesystem permission check
    │   ├── tauri.conf.json
    │   └── icons/
    ├── shared/
    │   └── ipc.ts                 # command name + payload types (TS) shared with renderer
    └── package.json               # devDeps only (tauri-cli)
```

The renderer is still `packages/webapp/` (Phase 4U). The Node sidecar is the existing `packages/beaver-ai/` published as a Node binary (`pkg`-bundled or `node-sea` single-file executable, decided in 4D.0 spike).

## Tech additions on top of locked stack

| Addition | Reason | Layer |
|----------|--------|-------|
| `@tauri-apps/cli` v2 | build the desktop binary | devDep, repo-root |
| `@tauri-apps/api` v2 | renderer ↔ main IPC | webapp dep |
| `tauri-plugin-dialog` | native open/save dialogs | Rust dep |
| `tauri-plugin-notification` | native toasts | Rust dep |
| `tauri-plugin-window-state` | remember size/position | Rust dep |
| `tauri-plugin-single-instance` | focus existing window | Rust dep |
| `tauri-plugin-updater` | auto-update from GitHub Releases | Rust dep |
| `node-sea` (or `pkg`) | bundle the Node sidecar to a single binary | build-only, repo-root |

No additional renderer libraries beyond the Phase 4U set.

## Sequencing (Phase 4U + 4D combined)

```
4U.0 (tokens) ─┐
4U.1 (GoalBox) ┴─→ 4D.0 (Tauri scaffold + sidecar Hello)
                       ↓
4U.2 (bento status) ┐  4D.1 (IPC contract)
4U.3 (checkpoint) ──┼─→ 4D.2 (event streaming)
4U.4 (plan/logs/review) ┘     ↓
                              4D.3 (tray / jump list / notifications)
4U.5 (wiki) ─────────────→    4D.4 (file system bridge)
                              ↓
                              4D.5 (installer + signing + updater)
                              ↓
4U.6 (a11y polish) ─→ 4D.6 (per-OS visual polish)
                              ↓
                              v0.1 ship
```

Phase 4U ships the React components against the Fastify dev server first (faster iteration). 4D.0 swaps the transport when the components are stable.

## DoD for Phase 4D

- `Beaver-AI-0.1.0-x64.msi` installs on a fresh Win11 VM, launches in < 3 s, completes the [phase-6-mvp-exit.md](phase-6-mvp-exit.md) worked example end-to-end without ever opening a browser tab.
- macOS `.dmg` (notarized) and Linux `.AppImage` builds pass the same worked example in CI matrix.
- App-level memory at idle ≤ 100 MB on Win11; ≤ 80 MB on macOS / Linux.
- Single-instance + tray + jump list + notifications all observable in a recorded demo session.
- Auto-update from 0.1.0-rc1 → 0.1.0 succeeds; user data preserved.
- 0 Rust `unwrap` / `expect` in production paths (`#[deny(clippy::unwrap_used)]`).

## Open questions to lock before 4D.0

1. **Code signing certificate** — EV (~$300/yr) vs self-signed for v0.1 (SmartScreen warning OK)? *Proposed: self-signed for v0.1, EV before v1.0.*
2. **Auto-update channel** — GitHub Releases vs a private S3 bucket? *Proposed: GitHub Releases for v0.1; opt-out via env var `BEAVER_NO_AUTOUPDATE=1`.*
3. **Sidecar bundling** — `node-sea` (Node 22 native) vs `pkg`? *Proposed: `node-sea` since we're already on Node 22.6+ (D1).*
4. **Window chrome** — Win11 mica from day one, or plain frame and add mica in 4D.6? *Proposed: plain frame in 4D.0, mica in 4D.6 polish.*

## What this kills from earlier plans

- `phase-4-server.md` foreground path (the Fastify localhost server). The CLI `--server` flag stays as a power-user / scripting / remote-access option.
- `Start-Beaver.{bat,ps1,command,sh}` complexity: launchers become a one-liner that calls the installed binary (or the dev binary during development).
- The "open browser to localhost:7777" UX moment.
