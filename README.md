<p align="center">
  <img src="Beaverdam.png" alt="Beaverdam — a beaver building its dam" width="320" />
</p>

```

 ▄▄▄▄▄
 █    █  ▄▄▄    ▄▄▄   ▄   ▄   ▄▄▄    ▄ ▄▄
 █▄▄▄▄▀ █▀  █  ▀   █  ▀▄ ▄▀  █▀  █   █▀  ▀
 █    █ █▀▀▀▀  ▄▀▀▀█   █▄█   █▀▀▀▀   █
 █▄▄▄▄▀ ▀█▄▄▀  ▀▄▄▀█    █    ▀█▄▄▀   █

```

# Beaver AI

> Fully autonomous local development orchestrator. Drives **Claude Code + Codex** agents through `plan → execute → review → integrate` loops with strong policy guardrails (sandbox, USD budget, hooks). Pauses only at well-defined human checkpoints.

[![release](https://github.com/ashmoonori-afk/Beaver-AI/actions/workflows/release.yml/badge.svg)](https://github.com/ashmoonori-afk/Beaver-AI/releases/latest) · MIT

---

## What's new in v0.2

v0.2 turns the v0.1 "type a goal, get code" loop into a **PRD-driven** flow you can review before coding starts, with a Lovable-style 3-panel UI that streams progress in real time. Strictly additive — every v0.1 happy path still works untouched (KR5: zero v0.1 regression).

### Headline features

- **PRD Composer + Confirm Gate** — Refiner output renders as an 8-section markdown PRD inside the app. You read it, edit it, hit Approve. Only then does coding start. Frozen as `<workspace>/.beaver/prd.md` + `PROMPT.md` so any external coder agent can pick up where Beaver left off.
- **Multi-task dispatcher driven by the PRD checklist.** Every `- [ ]` item in your `## Acceptance` becomes one task; the dispatcher walks them in order, calls the coder, runs the reviewer, toggles `[ ]` → `[x]` in `prd.md` on pass. Caps at 3 attempts per task before escalating.
- **Real reviewer with strict JSON contract** (`pass` / `fail` + `retry_hint`). The hint feeds the next coder attempt's prompt so the agent knows what the reviewer wanted. Drop the reviewer with `--always-accept` for v0.1 parity.
- **3-panel Lovable layout.** Chat (left) | PRD (center) | Live (right). Drag-resizable, widths persist. Live pane carries the Phase Timeline, virtualized log streamer, and a running tokens / USD counter against your budget cap.
- **Local-only KR metrics.** `<workspace>/.beaver/metrics.jsonl` tracks PRD-confirm latency (KR1), confirm-to-finish latency (KR2), and v0.1 regression flag (KR5). No telemetry, no network calls.

### What stayed the same

- v0.1 sequential / parallel-worktree dispatch, sandbox classifier, reviewer escalation, plan-approval checkpoint (Sprint A), and the wiki-hint surface (Sprint C). Sidecar still spawns `claude` / `codex` CLIs; no new auth, no new LLM client.

### Migration from v0.1

Forward-only SQLite migrations 002–005 add `prd_runs`, `prd_tasks`, `log_lines`, `cost_ticks`. They are idempotent — pointing v0.2 at an existing `.beaver/beaver.db` just adds the new tables. **No v0.1 table is touched.**

### v0.2 quickstart

1. Install the v0.2 desktop bundle (Win MSI / NSIS, mac DMG, Linux AppImage from the Releases page).
2. Open the app, pick your project folder, type a one-line goal in the Chat pane.
3. Watch the PRD pane fill in. Edit it (saved every 500 ms) until you're happy.
4. Approve the goal-refinement card. The dispatcher takes over — task by task, you'll see `- [ ]` flip to `- [x]` in real time.
5. Approve the final-review card when you're done.

To run from the CLI:

```bash
beaver run --no-server "add /health and /version endpoints"
# or, to skip the reviewer (v0.1 parity):
beaver run --no-server --always-accept "..."
```

---

## What's new in v0.1.1

A focused polish pass that turned v0.1's "it works" into a Lovable-grade desktop experience while landing the multi-task execution model we'd been deferring.

### Headline features

- **Multi-task INTEGRATING with parallel worktrees.** `BEAVER_MAX_PARALLEL_TASKS=5` by default. Each task runs in `.beaver/worktrees/<runId>/<taskId>` on its own branch, with strict `dependsOn` (a child waits until its parents have _integrated_, not just finished). Sequential mode (`=1`) keeps the v0.1 single-worktree path bit-for-bit.
- **Real reviewer agent** with three verdicts: `accept` / `retry` (capped at 1) / `escalate` (posts a checkpoint).
- **Live diff preview** before final-review approval — see what the agent did in unified-diff form.
- **Resume UI** — runs left mid-flight on app close are surfaced in a banner so you can pick them up or abort.
- **Spend-by-phase breakdown** in the Bento. SQLite `json_extract` correlates each cost row with the most recent `state.transition` event, so you see exactly how much each FSM phase cost.
- **Strengthened sandbox classifier**: 22 patterns total. New: `dd of=/dev/sd*`, `> /etc/`, `mkfs|fdisk|parted|wipefs`, `chmod 777`, `eval $(curl …)`, `base64 -d | sh`.

### UI polish

- **First-run onboarding** — 3-step welcome dialog (explain → pick workspace → first goal). Skipped on subsequent launches.
- **Live progress indicators** — pulsing accent dot on the StateBadge for non-terminal states and on AgentCard rows that are currently running.
- **Skeleton primitives + lovable empty states** — reusable `<SkeletonLine />` / `<SkeletonBlock />` / `<SkeletonParagraph />`; new empty states for the runs sidebar and the checkpoint panel.
- **Cmd / Ctrl + K** — universal "jump to wiki" that works even from inside the goal box.
- **Terminal-state animations** — celebrate-bounce on `COMPLETED`, shake on `FAILED` / `ABORTED`. `motion-safe:` only.
- **Wiki Browse tab** — page tree + reveal-in-explorer (opens `.beaver/wiki/` in the OS file manager so you can edit pages with your preferred markdown editor).
- **Privacy-first telemetry consent** — toggle in the Help dialog. Off by default; v0.1.x doesn't send anything yet.
- **Korean i18n** — onboarding renders in Korean for users on a Korean browser. Override toggle in the Help dialog (English / 한국어).

### Sprint trail

| Sprint | Headline                                        |
| ------ | ----------------------------------------------- |
| 1-A    | Real reviewer agent (accept / retry / escalate) |
| 1-B    | Diff preview UI on the final-review panel       |
| 1-C    | Resume UI for crashed / closed-mid-run flows    |
| 1-D    | Cost dashboard breakdown by phase               |
| 2-A    | Multi-task INTEGRATING with parallel worktrees  |
| 2-B    | Sandbox classifier strengthening (+6 patterns)  |
| 2-C    | Wiki browse + reveal-in-explorer                |
| 3-A    | First-run onboarding                            |
| 3-B    | Live progress indicators                        |
| 3-C    | Skeleton primitives + empty states              |
| 3-D    | Keyboard UX (Cmd/Ctrl+K)                        |
| 3-E    | Terminal-state animations                       |
| 4-A    | Telemetry consent scaffold                      |
| 4-B    | i18n Korean (onboarding + help dialog)          |

Every sprint passed the same gate suite: `tsc --noEmit` · `eslint` · `prettier --check` · `vitest run` · `cargo fmt --check` · `cargo clippy -- -D warnings` · `cargo test`. `main` was kept green via fast-forward merges from `dev/phase*` branches.

---

## Why Beaver?

Most "AI agents" are fragile chat wrappers. Beaver is a deterministic **state machine** that spawns specialized LLM agents (planner / coder / reviewer / summarizer) inside isolated git worktrees, gates every shell call through a sandbox classifier, and writes every transition to a WAL-mode SQLite ledger so runs survive crashes.

**Bias:** strong, lightweight guardrails. Hallucination-resistant by construction — agents can only see their own worktree, can only spend a fixed USD cap, and can only run shell commands that pass the policy classifier.

## Purpose (Definition of Done — v0.1)

A user types one goal:

```
node --import=tsx packages/cli/src/bin.ts run --no-server "Build a TypeScript TODO app with auth"
```

…or **double-clicks the desktop launcher**, and Beaver:

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

## Architecture (seven layers)

```
┌──────────────────────────────────────────────────────────────┐
│  Entry Layer            beaver CLI    │   Desktop (Tauri)*   │
│                         /beaver slash command (plugin)       │
├──────────────────────────────────────────────────────────────┤
│  Renderer (React)       Bento status · Checkpoints · Plan    │
│                         Logs · Final review · Wiki · Help    │
├──────────────────────────────────────────────────────────────┤
│  Orchestrator           PLANNING → EXECUTING → REVIEWING     │
│  (the "meta-agent")     → FINAL_REVIEW_PENDING → COMPLETED   │
│                         FSM-driven, LLM sub-decisions        │
├──────────────────────────────────────────────────────────────┤
│  Agent Runtime          Lifecycle · Worktree binding         │
│                         Stall watchdog · Cost/budget guard   │
├──────────────────────────────────────────────────────────────┤
│  Provider Adapters      ClaudeCodeAdapter │ CodexAdapter     │
│                         Auto-fallback on usage-limit         │
├──────────────────────────────────────────────────────────────┤
│  Workspace & State      Git worktrees · SQLite (WAL)         │
│                         10 tables · 9 typed DAOs             │
├──────────────────────────────────────────────────────────────┤
│  Feedback Channel       Terminal prompts · Desktop UI        │
│                         Notifications · Wiki hints           │
└──────────────────────────────────────────────────────────────┘
                                              * Tauri shell: 4D.1 in progress
```

Full layer docs: [`docs/architecture/overview.md`](./docs/architecture/overview.md).

### Locked decisions (D1–D17)

See [`docs/decisions/locked.md`](./docs/decisions/locked.md). Highlights:

- **D1** TypeScript on Node ≥ 22.6 LTS (built-in `node:sqlite` + `--experimental-strip-types`)
- **D4** Workspace = git worktrees + SQLite. `events` is the system of record; everything else is a materialized view
- **D6** Deterministic top-level FSM + LLM sub-decisions inside each state
- **D9** Sandbox: hard-deny / require-confirmation / allow + worktree write boundary
- **D10** Bounded parallel (5) · max 2 retries · CLI-only providers · 120 s stall watchdog
- **D14** Wiki system: LLM-maintained markdown KB at `<config>/wiki/`, suggest-only
- **D15** Agent baseline: bundled `AGENT_BASELINE.md` injected as the first layer of every agent's system prompt
- **D16** App UI tech stack: React + Vite + Tailwind, hash-routed SPA
- **D17** Desktop shell: **Tauri v2** wrapping the React UI from Phase 4U, with a bundled Node sidecar. Self-signed cert, GitHub Releases, `node-sea` sidecar (Phase 4D.0 lock)

---

## Installation

Prerequisites:

- **Node ≥ 22.6** ([nodejs.org](https://nodejs.org/))
- **pnpm ≥ 10** ([pnpm.io](https://pnpm.io/))
- **git**
- **Claude Code CLI** (`npm i -g @anthropic-ai/claude-code`)
- **Codex CLI** (`npm i -g @openai/codex`)
- **Rust + Cargo** (only for desktop builds — [rustup.rs](https://rustup.rs/))

```bash
git clone https://github.com/ashmoonori-afk/Beaver-AI-Dev.git
cd Beaver-AI-Dev
pnpm install
```

---

## Execution

Four equivalent ways to run a goal — pick whichever fits your workflow.

### 1. Desktop app (Phase 4D — replaces the .bat launcher)

The Tauri-based desktop shell wraps the redesigned bento UI in a native Win64 / macOS / Linux executable. Double-click to launch — no terminal, no browser tab.

```bash
# Dev mode (auto-reloads on file change):
pnpm --filter @beaver-ai/desktop tauri dev

# Production build (Win64 .msi + .exe / macOS .dmg / Linux .AppImage):
pnpm --filter @beaver-ai/desktop tauri build
```

The 4D.1 sprint scaffolds the shell + Windows installer. The 4D.2 sprint replaces the in-process mock transports with real Tauri `invoke` commands (CLI sidecar). Until 4D.2 lands the desktop UI runs against the demo fixtures.

### 2. Double-click launcher (legacy, terminal)

The Phase 0 launcher scripts are kept while 4D rolls out — they prompt for a goal in a terminal and shell out to the CLI. Once the Tauri build is signed and shipped, these will be replaced.

| Platform | File                                         |
| -------- | -------------------------------------------- |
| Windows  | `Start-Beaver.bat`                           |
| macOS    | `Start-Beaver.command` (chmod +x first time) |
| Linux    | `Start-Beaver.sh` (chmod +x first time)      |

### 3. Claude Code plugin

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

### 4. CLI (terminal)

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

## UI surface (Phase 4U — shipped)

Six panels behind hash routes (`#status`, `#checkpoints`, `#plan`, `#logs`, `#review`, `#wiki`). React + Vite + Tailwind, dark by default, single-accent palette (emerald), 4U.6 a11y polish (axe-core gated):

| Panel              | Purpose                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status (Bento)** | 4-card grid (state · spent vs cap · elapsed · open checkpoints) + agents row. Empty state shows the GoalBox                                                                                                                                        |
| **Checkpoints**    | Per-kind cards: plan-approval / risky-change / final-review (Approve/Comment/Reject), goal-clarification / merge-conflict / escalation (free-form), budget-exceeded (Stop / Increase / Continue once). Wiki `[hint]` line above body when relevant |
| **Plan**           | Latest-version card + version dropdown; older versions dim the rest of the screen                                                                                                                                                                  |
| **Logs**           | Virtualized event list (`@tanstack/react-virtual`) + level filter chips + `--json` NDJSON toggle                                                                                                                                                   |
| **Review**         | Hero card: branches (BranchPill, copy-on-click) + diff-stat sparklines + `final-report.md` (sanitized via `react-markdown` + `rehype-sanitize`). Approve / Discard with confirm modal                                                              |
| **Wiki**           | Single textarea Q&A — `useAskWiki` hook (debounced 250 ms) + citations panel. Empty-wiki short-circuit                                                                                                                                             |

Keyboard shortcuts: `r` status · `c` checkpoints · `p` plan · `l` logs · `v` review · `w` wiki · `?` help dialog · `Esc` close any modal.

Per-run snapshot flow uses 6 single-shape data hooks (`useRunSnapshot`, `useCheckpoints`, `useEvents`, `usePlanList`, `useFinalReview`, `useAskWiki`) each with an injectable transport. Browser builds use mock transports; the Tauri shell (4D.2) swaps them for `invoke()` calls without touching components.

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
| Provider fallback         | Claude usage-limit / rate-limit / quota → auto-retry on Codex (and vice-versa). Anti-loop guard. `BEAVER_NO_FALLBACK=1` to opt out                                            |
| Crash recovery            | WAL-mode SQLite. Every state transition is an append-only event. `beaver resume <run-id>` replays                                                                             |
| Hang detection            | Wall-clock per role (planner 5 min … coder 30 min) + 120 s output-stall watchdog                                                                                              |
| Hook fail-closed          | Sandbox hook errors (DB unreachable, etc.) return `deny` — never fail-open                                                                                                    |
| UI a11y                   | axe-core gated in CI on every panel + dialog (4U.6 review gate)                                                                                                               |

---

## Repo structure

```
.
├── .claude-plugin/                # Claude Code plugin manifest + skills + commands
├── Start-Beaver.{bat,command,sh}  # legacy launcher scripts (replaced by Tauri shell in 4D.1)
├── docs/                          # architecture + decisions + models + planning
│   ├── INDEX.md                   # documentation map
│   ├── architecture/              # 7-layer architecture
│   ├── decisions/locked.md        # D1–D17
│   ├── models/                    # cost-budget, plan-format, sandbox-policy, ...
│   └── planning/devplan/          # phase 0–4D sprint specs + sprint-log.md
└── packages/
    ├── core/                      # @beaver-ai/core
    │   └── src/
    │       ├── types/             # zod schemas (provider, plan, budget, ...)
    │       ├── plan/              # PlanSchema + DAG cycle helper
    │       ├── budget/            # USD cap schema + cost helper
    │       ├── workspace/         # SQLite + 9 DAOs
    │       ├── sandbox/           # classifier + classify-cli
    │       ├── providers/
    │       │   ├── _shared/       # spawn + kill (reused by both adapters)
    │       │   ├── claude-code/   # adapter + parse + protocol + hook
    │       │   ├── codex/         # adapter + parse + protocol + shim + audit
    │       │   └── _test/         # mock-cli + JSON fixtures
    │       ├── orchestrator/      # FSM + loop + LLM sub-decisions + provider fallback
    │       ├── agent-runtime/     # worktree + lifecycle + stall watchdog
    │       ├── agent-baseline/    # AGENT_BASELINE.md + role addenda + render
    │       ├── feedback/          # checkpoint primitive + wiki-query
    │       └── wiki/              # bootstrap + ingest + askWiki / queryWiki
    ├── cli/                       # @beaver-ai/cli — bin.ts + commands + renderers
    ├── server/                    # @beaver-ai/server (Fastify, --server mode)
    ├── webapp/                    # @beaver-ai/webapp — Phase 4U React UI
    │   └── src/
    │       ├── components/        # Bento, AgentCard, Cost/State/Elapsed,
    │       │                      # CheckpointCard, CheckpointPanel,
    │       │                      # PlanPanel, LogsPanel, ReviewPanel,
    │       │                      # WikiSearch, HelpDialog, ModalShell, ...
    │       ├── checkpoints/       # per-kind body modules + actions + registry + HintLine
    │       ├── hooks/             # 6 single-shape data hooks + 6 mock transports
    │       ├── lib/               # buttonClasses + cn() utility
    │       └── styles/            # tokens + reduced-motion media query
    ├── desktop/                   # @beaver-ai/desktop — Phase 4D Tauri shell (4D.1)
    │   └── src-tauri/             # Rust crate + tauri.conf.json + capabilities
    └── beaver-ai/                 # the published meta-package (Beaver class)
```

---

## Development

```bash
pnpm install
pnpm lint                                                         # eslint flat config
pnpm format:check                                                 # prettier
pnpm -r exec tsc --noEmit                                         # strict TS
pnpm dlx madge@latest --circular packages --extensions ts,tsx     # 0 cycles
pnpm --filter @beaver-ai/webapp build                             # ≤ 250 KB gz

# Rust gates (desktop crate):
( cd packages/desktop/src-tauri && cargo fmt --check )
( cd packages/desktop/src-tauri && cargo clippy --all-targets -- -D warnings )
( cd packages/desktop/src-tauri && cargo test )
```

Sprint conventions in [`docs/planning/devplan/conventions.md`](./docs/planning/devplan/conventions.md). Every sprint must pass three exit gates: **spaghetti** (architectural integrity) · **bug** (functional verification) · **review** (D15 baseline applied to ourselves).

Phase 4U review pass (W.8) ran 5 parallel multi-perspective reviews (spaghetti, security, bug/edge, test coverage, architecture) and applied the HIGH/MEDIUM findings before proceeding to 4D. DoD verified by 5x consecutive `pnpm test` runs (0 flakes).

Sprint history in [`docs/planning/devplan/sprint-log.md`](./docs/planning/devplan/sprint-log.md).

---

## Phase status

| Phase              | Status     | Notes                                                                    |
| ------------------ | ---------- | ------------------------------------------------------------------------ |
| 0 — Foundations    | ✅ shipped | repo · core types · DAO · sandbox                                        |
| 1 — Providers      | ✅ shipped | Claude Code adapter + Codex adapter + auto-fallback + PreToolUse hook    |
| 2 — Orchestrator   | ✅ shipped | FSM + agent runtime + budget guard                                       |
| 3 — CLI            | ✅ shipped | `init` / `run` / `status` / `logs` / `checkpoints` / `answer` / `resume` |
| 4 — Server         | ✅ shipped | Fastify + SSE (legacy `--server` mode)                                   |
| 4U — UI redesign   | ✅ shipped | W.1–W.7 + W.8 review pass                                                |
| 4D — Desktop shell | ✅ shipped | 4D.1 scaffold + W.12 transports + 4D.7 bundled Node + 4D.8 GA            |
| 5 — Wiki           | ✅ shipped | bootstrap + ingest + askWiki + queryWiki + browse UI (v0.1.1 2-C)        |
| 6 — MVP exit       | ✅ shipped | integration loop + audit + packaging (Claude plugin manifest)            |
| v0.1.1             | ✅ shipped | 14 sprints — see "What's new in v0.1.1" above                            |

---

## What's deferred to v0.2

- **Tauri 4D.2–4D.5** — invoke wiring for the 6 transports, signed Win64 .msi installer, macOS .dmg notarization, Linux .AppImage, file association
- **Light-mode theme** (4U.7) — Tailwind tokens are dark-only by default; light theme deferred to tail
- **Adapter base-class refactor** — ClaudeCodeAdapter and CodexAdapter share ~80 lines of run-loop structure. Will extract `runProviderLoop(adapter, providerSpec)` once a 3rd adapter exists
- **Real-LLM integration test gate** — current tests use mock-cli for determinism; CI does not spend USD
- **OS-level sandbox** (`sandbox-exec` on macOS, `bubblewrap` on Linux) — Codex shim is "audited policy boundary, not a hard sandbox" (per D9). v0.2 hardening adds the OS layer

---

## License

MIT — see commit history for contributor list (Co-Authored-By Claude Opus 4.7).
