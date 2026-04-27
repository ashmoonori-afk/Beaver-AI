# Beaver AI

> Fully autonomous local development orchestrator. Drives **Claude Code + Codex** agents through `plan → execute → review → integrate` loops with strong policy guardrails (sandbox, USD budget, hooks). Pauses only at well-defined human checkpoints.

[![ci](https://github.com/ashmoonori-afk/Beaver-AI-Dev/actions/workflows/ci.yml/badge.svg)](https://github.com/ashmoonori-afk/Beaver-AI-Dev/actions/workflows/ci.yml) · 388 tests · 81 source files · MIT

---

## Why Beaver?

Most "AI agents" are fragile chat wrappers. Beaver is a deterministic **state machine** that spawns specialized LLM agents (planner / coder / reviewer / summarizer) inside isolated git worktrees, gates every shell call through a sandbox classifier, and writes every transition to a WAL-mode SQLite ledger so runs survive crashes.

**Bias:** strong, lightweight guardrails. Hallucination-resistant by construction — agents can only see their own worktree, can only spend a fixed USD cap, and can only run shell commands that pass the policy classifier.

## Purpose (Definition of Done — v0.1)

A user types one goal:

```
node packages/cli/src/bin.ts run --no-server "Build a TypeScript TODO app with auth"
```

…and Beaver:

1. Plans the work as a versioned DAG of tasks
2. Spawns specialized agents (each in its own git worktree, on its own branch)
3. Drives them through coding / patching / review loops automatically
4. Surfaces progress at well-defined checkpoints (plan approval, budget exceeded, merge conflict, final review)
5. Reports completion with a `final-report.md` and the merged repository

The 5 v0.1 exit criteria — all satisfiable on a fresh checkout:

- ✅ `beaver init && beaver run "<goal>"` succeeds end-to-end
- ✅ The run produces a valid plan (passes `PlanSchema.safeParse`) and ≥1 committed branch
- ✅ Aborting + `beaver resume <run-id>` recovers the run from disk
- ✅ A run that exceeds the per-run USD cap **pauses** with a `budget-exceeded` checkpoint (never silently overspends)
- ✅ Every state transition is visible as a row in the `events` table

---

## Architecture (six layers)

```
┌──────────────────────────────────────────────────────────────┐
│  Entry Layer            beaver CLI    │    import { Beaver } │
│                         /beaver slash command (plugin)       │
├──────────────────────────────────────────────────────────────┤
│  Orchestrator           PLANNING → EXECUTING → REVIEWING     │
│  (the "meta-agent")     → FINAL_REVIEW_PENDING → COMPLETED   │
│                         FSM-driven, LLM sub-decisions        │
├──────────────────────────────────────────────────────────────┤
│  Agent Runtime          Lifecycle · Worktree binding         │
│                         Stall watchdog · Cost/budget guard   │
├──────────────────────────────────────────────────────────────┤
│  Provider Adapters      ClaudeCodeAdapter │ CodexAdapter     │
│                         Unified ProviderAdapter interface    │
├──────────────────────────────────────────────────────────────┤
│  Workspace & State      Git worktrees · SQLite (WAL)         │
│                         10 tables · 9 typed DAOs             │
├──────────────────────────────────────────────────────────────┤
│  Feedback Channel       Terminal prompts · Web dashboard*    │
│                         Notifications · Wiki hints           │
└──────────────────────────────────────────────────────────────┘
                                              * web UI deferred to v0.2
```

Full layer docs: [`docs/architecture/overview.md`](./docs/architecture/overview.md).

### Locked decisions (D1–D16)

See [`docs/decisions/locked.md`](./docs/decisions/locked.md). Highlights:

- **D1** TypeScript on Node ≥ 22.6 LTS (built-in `node:sqlite` + `--experimental-strip-types`)
- **D4** Workspace = git worktrees + SQLite. `events` is the system of record; everything else is a materialized view
- **D6** Deterministic top-level FSM + LLM sub-decisions inside each state
- **D9** Sandbox: hard-deny / require-confirmation / allow + worktree write boundary
- **D10** Bounded parallel (5) · max 2 retries · CLI-only providers · 120 s stall watchdog
- **D14** Wiki system: LLM-maintained markdown KB at `<config>/wiki/`, suggest-only
- **D15** Agent baseline: bundled `AGENT_BASELINE.md` injected as the first layer of every agent's system prompt
- **D16** App UI tech stack (Fastify + React) — built but not wired into v0.1

---

## Installation

Prerequisites:

- **Node ≥ 22.6** ([nodejs.org](https://nodejs.org/))
- **pnpm ≥ 10** ([pnpm.io](https://pnpm.io/))
- **git**
- **Claude Code CLI** (`npm i -g @anthropic-ai/claude-code`)
- **Codex CLI** (`npm i -g @openai/codex`)

```bash
git clone https://github.com/ashmoonori-afk/Beaver-AI-Dev.git
cd Beaver-AI-Dev
pnpm install
```

---

## Execution

Three equivalent ways to run a goal — pick whichever fits your workflow.

### 1. Double-click launcher (no terminal)

| Platform | File                                         |
| -------- | -------------------------------------------- |
| Windows  | `Start-Beaver.bat`                           |
| macOS    | `Start-Beaver.command` (chmod +x first time) |
| Linux    | `Start-Beaver.sh` (chmod +x first time)      |

Each launcher: auto-installs deps if missing → `beaver init` if `.beaver/` is absent → prompts you for a goal → runs it.

### 2. Claude Code plugin

```
.claude-plugin/
├── plugin.json
├── skills/
│   ├── beaver-runner.md       # auto-discovered when user asks Claude to "run beaver"
│   └── beaver-wiki-ask.md     # natural-language wiki Q&A
└── commands/
    └── beaver.md              # /beaver <goal> slash command
```

Drop the `.claude-plugin/` directory into Claude Code's plugin path. Then in any Claude Code session:

```
/beaver Build a TypeScript TODO app with auth
```

Or just ask Claude in plain English ("can you run beaver on this?") and the `beaver-runner` skill auto-activates.

### 3. CLI (terminal)

```bash
node --import=tsx packages/cli/src/bin.ts <subcommand>
```

| Subcommand                                    | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `init`                                        | Set up `.beaver/` (refuses non-git directories; pings claude + codex) |
| `run --no-server "<goal>"`                    | Start a new run (one active run per project)                          |
| `status`                                      | Current state + plan version + spent USD + open checkpoints           |
| `logs --follow`                               | Tail the events table                                                 |
| `checkpoints`                                 | List pending checkpoints                                              |
| `answer <id> approve\|reject\|comment <text>` | Reply to a checkpoint                                                 |
| `resume <run-id>`                             | Recover a paused / crashed run from disk                              |
| `abort <run-id>`                              | Stop a run                                                            |

---

## Wiki — natural-language Q&A across runs

Beaver maintains a structured markdown knowledge base at `<userConfigDir>/wiki/` that compounds across runs. Page set: `index.md`, `log.md`, `user-profile.md`, `projects/<slug>.md`, `decisions/<run-id>.md`, `patterns/<slug>.md`.

Programmatic:

```ts
import { askWiki, ClaudeCodeAdapter, openDb } from '@beaver-ai/core';

const db = openDb({ path: '.beaver/beaver.db' });
const adapter = new ClaudeCodeAdapter({ db });

const { answer, sourcePages } = await askWiki({
  wikiRoot: '~/.config/beaver/wiki',
  question: 'what did we decide last about auth?',
  adapter,
});
```

From inside Claude Code (via the bundled skill): just ask in English. The `beaver-wiki-ask` skill returns the answer + the `decisions/*.md` page citations.

Two entry points:

- `queryWiki({ wikiRoot, kind, context })` — structured (used internally to attach `[hint]` lines above `plan-approval` / `risky-change-confirmation` checkpoints)
- `askWiki({ wikiRoot, question, adapter })` — free-form natural language with citation grounding

---

## Guardrails (always on)

| Layer                     | Mechanism                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell call classification | 16 named regex patterns + path-aware `cd / && rm -rf .` resolver. Hard-deny / require-confirmation / allow before every `agent.shell` event                                   |
| Per-agent USD cap         | Default $1; soft-warn at 70 %, hard-kill at 100 %                                                                                                                             |
| Per-task USD cap          | Default $3; refuses to spawn next agent if a retry would exceed                                                                                                               |
| Per-run USD cap           | Default $20; hard-cap pauses run + posts `budget-exceeded` checkpoint (`stop` / `increase` / `continue-once`)                                                                 |
| Worktree write boundary   | Agent writes outside its `git worktree` flagged → require-confirmation. Codex shim bypass (absolute paths) caught by post-run filesystem audit (`agent.shell.bypass-attempt`) |
| Crash recovery            | WAL-mode SQLite. Every state transition is an append-only event. `beaver resume <run-id>` replays                                                                             |
| Hang detection            | Wall-clock per role (planner 5 min … coder 30 min) + 120 s output-stall watchdog                                                                                              |
| Hook fail-closed          | Sandbox hook errors (DB unreachable, etc.) return `deny` — never fail-open                                                                                                    |

---

## Repo structure

```
.
├── .claude-plugin/             # Claude Code plugin manifest + skills + commands
├── Start-Beaver.{bat,command,sh}  # double-click launchers
├── docs/                       # architecture + decisions + models + planning
│   ├── INDEX.md                # documentation map
│   ├── architecture/           # 6-layer architecture
│   ├── decisions/locked.md     # D1–D16
│   ├── models/                 # cost-budget, plan-format, sandbox-policy, ...
│   └── planning/devplan/       # phase 0–6 sprint specs + sprint-log.md
└── packages/
    ├── core/                   # @beaver-ai/core (private workspace)
    │   └── src/
    │       ├── types/          # zod schemas (provider, plan, budget, ...)
    │       ├── plan/           # PlanSchema + DAG cycle helper
    │       ├── budget/         # USD cap schema + cost helper
    │       ├── workspace/      # SQLite + 9 DAOs
    │       ├── sandbox/        # classifier + classify-cli
    │       ├── providers/
    │       │   ├── _shared/    # spawn + kill (reused by both adapters)
    │       │   ├── claude-code/  # adapter + parse + protocol + hook
    │       │   ├── codex/      # adapter + parse + protocol + shim + audit
    │       │   └── _test/      # mock-cli + JSON fixtures
    │       ├── orchestrator/   # FSM + loop + LLM sub-decisions
    │       ├── agent-runtime/  # worktree + lifecycle + stall watchdog
    │       ├── agent-baseline/ # AGENT_BASELINE.md + role addenda + render
    │       ├── feedback/       # checkpoint primitive + wiki-query
    │       └── wiki/           # bootstrap + ingest + askWiki / queryWiki
    ├── cli/                    # @beaver-ai/cli — bin.ts + commands + renderers
    └── beaver-ai/              # the published meta-package (Beaver class)
```

---

## Development

```bash
pnpm install
pnpm test                                 # 388 tests
pnpm lint                                 # eslint flat config
pnpm format:check                         # prettier
pnpm -r exec tsc --noEmit                 # strict TS
pnpm dlx madge@latest --circular packages/core/src --extensions ts
```

Sprint conventions in [`docs/planning/devplan/conventions.md`](./docs/planning/devplan/conventions.md). Every sprint must pass three exit gates: **spaghetti** (architectural integrity) · **bug** (functional verification) · **review** (D15 baseline applied to ourselves).

Sprint history in [`docs/planning/devplan/sprint-log.md`](./docs/planning/devplan/sprint-log.md).

---

## What's not in v0.1 (carried to v0.2)

- **Web UI** (Fastify + React) — manifests + tech stack locked (D13/D16) but the bundle isn't wired in v0.1. CLI surface is sufficient for the launcher.
- **Adapter base-class refactor** — ClaudeCodeAdapter and CodexAdapter share ~80 lines of run-loop structure. Will extract `runProviderLoop(adapter, providerSpec)` once a 3rd adapter exists.
- **Real-LLM integration test gate** — current tests use mock-cli for determinism; CI does not spend USD.
- **Bundled hook / classify-cli** — currently spawned via `tsx`; production publish should bundle into a single .js per script.
- **OS-level sandbox** (`sandbox-exec` on macOS, `bubblewrap` on Linux) — Codex shim is "audited policy boundary, not a hard sandbox" (per D9). v0.2 hardening adds the OS layer.

---

## License

MIT — see commit history for contributor list (Co-Authored-By Claude Opus 4.7).
