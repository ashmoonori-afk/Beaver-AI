# Workflow Personalization

> Layered config across machine and project, and implicit coding-style inheritance from the repo. The learning component is split out as the [Wiki system](wiki-system.md). No goal templates in v0.1.

**Doc type:** model
**Status:** Locked (D14, scoped)
**Last updated:** 2026-04-26 (learning split out to wiki-system.md)
**See also:** [decisions/locked.md](../decisions/locked.md) (D14), [models/wiki-system.md](wiki-system.md), [models/agent-operations.md](agent-operations.md), [models/cost-budget.md](cost-budget.md), [models/ui-policy.md](ui-policy.md), [models/app-ui.md](app-ui.md)

---

## Layered config (4 tiers, last-wins)

```
built-in defaults  →  user-level  →  project-level  →  CLI flags / lib options
   (lib code)         (OS path)      (.beaver/...)
```

Each tier may set the same key; later tiers win. Most knobs (budgets, agent ops, UI prefs) live at all three persisted tiers; the only tier that *must* exist is built-in defaults — user and project files are optional.

## User-level config location

OS-conventional, resolved via `env-paths`:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/beaver/config.json` |
| Linux | `~/.config/beaver/config.json` (XDG) |
| Windows | `%APPDATA%\beaver\config.json` |

The same parent directory hosts the [Wiki system](wiki-system.md) (`<config>/wiki/`).

## v0.1 user-level config keys

```jsonc
{
  "ui": {
    "verbosity": "normal",       // quiet | normal | verbose
    "color": true,
    "statusLine": true,
    "notifications": true,
    "autoOpenBrowser": true      // D13 default; user can disable globally
  },
  "agentOps": {
    "maxParallelAgents": 5,
    "stallThresholdSeconds": 120
    // providerByRole, timeouts also overridable here
  },
  "cost": {
    "defaults": {
      "perAgentUsd": 1.00,
      "perTaskUsd":  3.00,
      "perRunUsd":  20.00
    }
  }
}
```

These are pure default-overrides. Project-level `.beaver/config.json` may set the same keys and wins.

## Coding style — implicit via worktree

Beaver does **not** maintain a separate style policy. Every coder agent runs inside the agent's git worktree, where the repo's existing tooling lives:

- `.editorconfig`, `.eslintrc*`, `.prettierrc*`, `tsconfig.json`
- `pyproject.toml`, `ruff.toml`, `.flake8`, `mypy.ini`
- `rustfmt.toml`, `clippy.toml`
- `package.json` (scripts, deps), `Cargo.toml`, `go.mod`

Coder agents are smart enough to follow what is already there. No `.beaver/style.json` is introduced; if a project's conventions need to change, the user changes the repo's actual config files.

## Learning is the Wiki system

The suggest-only learning loop is **not implemented as flat memory** in this doc. It is delivered by the [Wiki system](wiki-system.md), which Beaver maintains as a structured set of markdown files. Hints rendered above `plan-approval` and `risky-change-confirmation` checkpoints are produced by reading the wiki, not a JSON log.

## Goal templates — deferred

v0.1 has free-text goal entry only (per D11). User-level template folders are deferred to v0.2.

## Priority resolution example

For `ui.verbosity`: built-in `"normal"` → user-level `"verbose"` → project `"quiet"` → flag (none) ⇒ effective `"quiet"`. Later tier wins.
