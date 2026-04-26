# Entry Layer

> Two ways to invoke Beaver — a CLI binary and a library import — sharing one core implementation.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26 (D13 ripple: `beaver run` auto-opens browser by default; `--no-server` for headless)
**See also:** [decisions/locked.md](../decisions/locked.md) (D2, D11, D12, D13), [models/ux-flow.md](../models/ux-flow.md), [models/ui-policy.md](../models/ui-policy.md), [models/app-ui.md](../models/app-ui.md), [reference/module-layout.md](../reference/module-layout.md)

---

## Surfaces

### CLI

Subcommands shipped with the `beaver` binary:

| Command | Purpose |
|---------|---------|
| `beaver init` | Create `.beaver/` in the current repo with default config and an empty SQLite database. |
| `beaver run "<goal>"` | Start a new run. By default starts the local web server and auto-opens the browser (D13). Rejected if a run is already RUNNING or PAUSED (one-active-run rule, D11). |
| `beaver run "<goal>" --no-server` | Headless run; CLI handles checkpoints inline using [ui-policy](../models/ui-policy.md). Required for CI, SSH-only sessions. |
| `beaver run "<goal>" --keep-alive` | Web server stays alive past the run's terminal state until the user kills it. |
| `beaver dashboard [<run-id>]` | (Re-)spawn the web server and open browser for an existing or paused run. |
| `beaver status` | Summarize the active or last run: state, plan version, spent USD, open checkpoints. |
| `beaver logs --follow [<run-id>]` | Pretty-printed tail of the `events` table. |
| `beaver checkpoints` | List pending checkpoints. |
| `beaver answer <id> <response>` | Reply to a pending checkpoint. |
| `beaver review` | Render the latest review document for the current run. |
| `beaver resume <run-id>` | Resume a paused or crashed run by replaying the event log. |
| `beaver abort <run-id>` | Abort the named run; mark ABORTED, optionally clean up worktrees. |

### Library

```ts
import { Beaver, Orchestrator, ProviderRegistry } from 'beaver-ai';

const beaver = new Beaver({ rootPath: process.cwd() });
const run = await beaver.run({ goal: 'Build a TS TODO app' });
for await (const event of run.events()) {
  // observe progress, intercept checkpoints
}
```

The library surface is what the CLI dispatches to internally — they are not two implementations. This guarantees parity between programmatic and human use.

## Invariants

- The CLI is a thin wrapper. Any feature exposed to one surface must be reachable from the other.
- All side effects (sqlite writes, git operations, child-process spawns) go through `core/` modules; `cli/` does I/O formatting only.
- Configuration resolves in this order, last wins: defaults → `.beaver/config.json` → environment variables → CLI flags / library options.
- All terminal output passes through the renderer described in [ui-policy](../models/ui-policy.md); raw `console.log` outside the renderer is forbidden in `cli/`.

## Common output flags

`--verbose` / `--quiet` / `--no-color` / `--no-status` apply to every subcommand that produces ongoing output (`run`, `resume`, `logs --follow`). Their semantics are defined once in [ui-policy](../models/ui-policy.md).

## Module mapping

- `packages/cli/` — the CLI shell. Argument parsing, terminal rendering, calls into `core`.
- `packages/core/` — the shared library, exported by the published `beaver-ai` package.

See [reference/module-layout.md](../reference/module-layout.md) for the full pnpm monorepo structure.
