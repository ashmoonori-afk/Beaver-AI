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

> **Type a goal. Walk away. Come back to working code.**

Beaver is a local desktop app that runs your AI coder on autopilot. You hand it a goal — _"add a login flow"_, _"port this Express server to Fastify"_, _"fix the failing test in cart.test.ts"_ — and it plans, codes, reviews, and pauses for your approval at the end.

No babysitting prompts every 30 seconds. No cloud account. No SaaS dashboard. Just an installer, your existing AI coder CLI (Claude Code or Codex), and a folder.

---

## Why use Beaver instead of Cursor / Claude directly?

If you've used those, you know the loop: prompt, edit, prompt, edit. For small changes it's fine. For _"build me X"_ it's exhausting — every step is a new prompt and you're the one stitching results together.

Beaver is for _"build me X."_ You give it the goal once. It:

1. Turns your one-liner into a **structured PRD** (goals, scope, acceptance criteria) so the plan is concrete.
2. **Drafts a plan** with agent tasks and a USD budget cap.
3. **Codes** in an isolated git worktree using your coder CLI.
4. **Reviews** the diff.
5. **Pauses for your approval** before merging anything.

Every step is logged to a SQLite ledger inside `<your project>/.beaver/`, so you can audit, resume, or replay any run.

---

## Try it in 2 minutes

### 1. Download the installer

Get the matching file from [**Releases**](https://github.com/ashmoonori-afk/Beaver-AI/releases/latest):

| OS          | File                                                            |
| ----------- | --------------------------------------------------------------- |
| **Windows** | `Beaver_0.1.0_x64-setup.exe` (recommended) or `…_x64_en-US.msi` |
| **macOS**   | `Beaver_0.1.0_x64.dmg`                                          |
| **Linux**   | `beaver-ai_0.1.0_amd64.deb` or `beaver-ai_0.1.0_amd64.AppImage` |

### 2. Make sure your AI coder is set up

Beaver delegates the actual file-editing to a CLI you already use. Pick **one**:

- [**Claude Code CLI**](https://claude.com/code) — `pnpm add -g @anthropic-ai/claude-code` then `claude /login`
- [**OpenAI Codex CLI**](https://github.com/openai/codex) — `pnpm add -g @openai/codex` then `codex login`
- **Direct API** — `export ANTHROPIC_API_KEY=sk-ant-...` in your shell

You also need [**Node.js 22+**](https://nodejs.org) on `PATH`. (Bundling Node into the installer is on the roadmap.)

### 3. Launch Beaver and ship something

1. Open Beaver.
2. Click **Pick folder…** — choose anything. Empty folder, existing project, doesn't matter. Beaver creates a `.beaver/` subfolder there for its state.
3. Type a goal in the box. Try something concrete like _"Add an Express server with /health and /version endpoints"_ — submit.
4. Watch the **Phase Timeline** on the Status panel. It shows what Beaver is doing right now: refining → planning → coding → reviewing.
5. When it pauses at the final-review checkpoint, look at the diff and **Approve** (or **Reject** to discard).

That's it. The folder now has working code, and `.beaver/` has the full audit trail.

---

## What it can't do yet (v0.1)

Honest list:

- **Multi-task plans run as a single task.** The planner can split a goal into multiple tasks, but v0.1 only dispatches the first. The rest are logged so you can see what got skipped. Full multi-task scheduling is v0.2.
- **No bundled Node.** You need Node 22+ on PATH yourself for now.
- **Wiki tab is a stub.** v0.1.x will add the project knowledge base.
- **Always-accept reviewer.** v0.1 doesn't block on review verdicts; v0.2 adds a real reviewer agent.

If any of those land your show-stopper, hold off on v0.1 and watch the [milestones on Beaver-AI-Dev](https://github.com/ashmoonori-afk/Beaver-AI-Dev/milestones).

---

## When something doesn't work

If you submit a goal and Beaver shows the **"Sidecar didn't start"** card, the orchestrator process died before recording the run. The card shows the tail of `<workspace>/.beaver/sidecar-stderr.log`. Map it to a fix:

| What the log says              | What to do                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `claude: command not found`    | Install Claude Code (`pnpm add -g @anthropic-ai/claude-code`) and run `claude /login` |
| `ANTHROPIC_API_KEY is not set` | `export ANTHROPIC_API_KEY=sk-ant-...` then restart Beaver                             |
| `429`, `rate limit`, `quota`   | Wait a few minutes — Beaver also auto-fails over once between Claude Code and Codex   |
| `ENOTFOUND`, `ECONNREFUSED`    | Check your network or VPN                                                             |
| `node: command not found`      | Install Node 22+ from [nodejs.org](https://nodejs.org)                                |

For other errors, the banner at the top of the app classifies the most common failures and offers a one-click action.

---

## License

[MIT](./LICENSE) — use it, fork it, ship it.

## Found a bug?

Open an issue at [**Beaver-AI-Dev**](https://github.com/ashmoonori-afk/Beaver-AI-Dev/issues) with:

- Your OS + `node --version`
- The text from the **Sidecar diagnostic** card (or `<workspace>/.beaver/sidecar-stderr.log`)
- The exact goal you typed

This repo is **release artifacts only** — source, sprint history, and active development live at [Beaver-AI-Dev](https://github.com/ashmoonori-afk/Beaver-AI-Dev).
