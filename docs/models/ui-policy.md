# UI Policy (CLI surface)

> How the **secondary CLI surface** presents itself — terminal output, plan rendering, colors, status line, tone. The **primary** v0.1 surface is the web app described in [app-ui.md](app-ui.md) (D13). This doc covers everything the CLI does on its own (`beaver status`, `beaver logs`, `--no-server` runs, CI / headless workflows).

**Doc type:** model
**Status:** Locked (D12)
**Last updated:** 2026-04-26 (D13 ripple: scoped to CLI surface only)
**See also:** [decisions/locked.md](../decisions/locked.md) (D12), [models/ux-flow.md](ux-flow.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md), [architecture/entry-layer.md](../architecture/entry-layer.md)

---

## Verbosity

Three levels; **Normal is default**.

| Level | Shown | Suppressed |
|-------|-------|------------|
| `quiet` | Checkpoints, run start, run final result | State transitions, agent boundaries, cost ticker |
| **`normal` (default)** | State transitions, agent start/complete, checkpoint prompts, cost summary on each transition | Agent stdout streaming |
| `verbose` | Normal + agent stdout streamed inline (dimmed) | — |

Override via `--verbose` / `--quiet` flags or `agentOps.outputLevel` in config. v0.1 ships only the three levels; finer per-source filtering is deferred.

## Live status line

A single bottom-fixed status line is rendered while the run is active in the foreground:

```
[EXECUTING] running 3/8  spent $1.42  elapsed 04:17  ⌛ 2 open
```

| Slot | Source |
|------|--------|
| state | run state from the orchestrator FSM (uppercase) |
| `running/total` | live aggregate of agents and tasks |
| `spent` | rolling USD from the `costs` table |
| `elapsed` | wall-clock since run start |
| `⌛ N open` | count of `pending` checkpoints; suppressed when zero |

The line is redrawn at most once per second; not rendered when stdout is not a TTY (so piped output is plain). Per-agent live blocks are deferred to v0.2 (dashboard).

## Colors

- Semantic palette: `success=green`, `warn=yellow`, `error=red`, `info=cyan`, `prompt=bold`, `dim=gray`.
- Always paired with text or symbol — color never carries meaning alone (color-blind safety): `✓ done`, `× failed`, `… running`, `! warn`.
- TTY-aware: stripped automatically when stdout is not a TTY.
- Honors the `NO_COLOR` env var and the `--no-color` flag.

## Plan rendering

`plan-approval` and `beaver status` render plans as a **compact list**. One line per task with indented metadata when needed.

Example (5-task plan):

```
plan v2 (parent: v1) — modified by planner: "skip auth per user"

  scaffold       [planner→coder]   set up TS + Vite skeleton
                 → no deps · est. $0.40
  ui-list        [coder]           render TODO list view
                 → deps: scaffold · est. $0.80
  ui-form        [coder]           add input form with validation
                 → deps: scaffold · est. $0.60
  storage        [coder]           localStorage persistence layer
                 → deps: scaffold · est. $0.40
  review         [reviewer]        diff vs main, run lint
                 → deps: ui-list, ui-form, storage · est. $0.30

  total est. $2.50  (per-run cap $20.00)
```

Markdown tables are reserved for the dashboard view (v0.2).

## Diff rendering

- `beaver review` shows **stats per file** by default (`+12 / −3 path/to/file.ts`).
- `beaver review --full` invokes `git diff` under the hood with color piped through.
- Inline diffs in checkpoint prompts (e.g., a coder requesting a wide-blast-radius confirmation) are truncated to **the smaller of: 60 lines or 4 KB**, with an "open full diff" pointer.

## Checkpoint prompts

Every checkpoint renders with this skeleton:

```
─── checkpoint: <kind> ───────────────────────────────────────
run: <run-id> · spent: $<usd> · elapsed: <m:ss>
context: <one-line origin: which agent / why posted>

<body — kind-specific>

[ approve | comment <text> | reject ]   (or kind-appropriate options)
> _
```

Body content is owned by the issuing source (planner, reviewer, sandbox hook, …). The frame is owned by the feedback layer for consistency.

When the [Wiki system](wiki-system.md) has a relevant entry for a `plan-approval` or `risky-change-confirmation` checkpoint, a single dimmed `[hint] <one-liner>` line is rendered immediately above the body. The hint is drafted by the orchestrator from the wiki and never blocks the user response.

## Logs

- `beaver logs [<run-id>]` — pretty-printed table: `<HH:MM:SS> <source> <type> · <message>`.
- `beaver logs --follow` — same, tailed.
- `beaver logs --json` — NDJSON, one event per line, for piping into `jq` etc.

## Tone & brand

- Terse and neutral, like `git` / `kubectl`. Avoid chatty preambles.
- No emoji in default output. Symbols are limited to `✓ × … ! ⌛ →`.
- No ASCII logo at startup; only the version line on `--version`.
- All status keywords are lowercase kebab-case (`completed`, `aborted`, `budget-exceeded`).
- Singular/plural respected: "1 checkpoint", "2 checkpoints".

## Notifications

| Mode | On checkpoint | On terminal state |
|------|---------------|-------------------|
| Foreground | terminal bell (`\a`) | bell + headline |
| Background | system notification (macOS `osascript`, Linux `notify-send`, Windows toast via `node-notifier`) | system notification |

System notification text mirrors the terminal headline; clicking is a v0.2 hook.

## Accessibility

- TTY-aware rendering ensures piped or screen-reader-friendly output is always available.
- Color paired with text/symbol (see above).
- No animations beyond the once-per-second status line redraw; an `--no-status` flag disables even that for screen-reader users.

## Internationalization

v0.1 ships English only. All user-facing strings are imported from a single module (`packages/cli/src/i18n/en.ts`); the import indirection reserves the path to add other locales later. No runtime locale negotiation in v0.1.

## Web app surface

The web app is now v0.1 primary. Its policy lives separately in [app-ui.md](app-ui.md). Tech stack and visual design are still open and will be locked next.
