# Sandbox & Shell Policy

> Four-layer trust model for autonomous shell access. Worktree is the write boundary; risky patterns hit a `risky-change-confirmation` checkpoint; a small set of patterns hard-deny.

**Doc type:** model
**Status:** Locked (D9)
**Last updated:** 2026-04-26 (D10 ripple: Codex shim now blocking for v0.1)
**See also:** [decisions/locked.md](../decisions/locked.md) (D9), [architecture/provider-adapters.md](../architecture/provider-adapters.md), [architecture/agent-runtime.md](../architecture/agent-runtime.md), [architecture/feedback-channel.md](../architecture/feedback-channel.md)

---

## Trust model (four layers)

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: OS-level sandbox (sandbox-exec / bubblewrap)       │  v0.2+ hardening
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Pre-tool-use policy hook                           │  v0.1
│           hard-deny | require-confirmation | allow          │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Worktree as write boundary                         │  v0.1
│           cwd = worktree; writes outside flagged            │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Audit log of every shell call                      │  v0.1
│           events table; reviewable via beaver review        │
└─────────────────────────────────────────────────────────────┘
```

v0.1 implements layers 1–3. OS-level sandboxing (4) is deferred to v0.2 hardening to avoid the cost of cross-platform profile authoring at this stage.

## Policy rules

### Hard-deny (auto-abort, no user prompt)

The run terminates with status `FAILED`, reason `policy-violation`. Not resumable.

| Pattern | Reason |
|---------|--------|
| `sudo`, `su` | Privilege escalation forbidden in autonomous mode. |
| `rm -rf /`, `rm -rf $HOME`, `rm -rf ~` | System-level destruction. |
| Read or write inside `~/.ssh`, `~/.aws`, `~/.gnupg` | Credential protection. |
| Modify `~/.config/beaver` or `<repo>/.beaver/` | Self-modification — recursion risk. |
| `git push`, `git push --force` | Pushing to a remote is reserved to the user. |
| Fork bombs (`:(){ :\|:& };:` and equivalents) | Obvious malice. |

### Require-confirmation (post `risky-change-confirmation` checkpoint)

Execution pauses; the orchestrator awaits user response **indefinitely** (same pattern as `budget-exceeded`). On `approve` the command runs; on `reject` the command is denied and the agent sees the failure.

| Pattern | Reason |
|---------|--------|
| `rm -rf <wildcard>` outside the agent's worktree | Broad blast radius. |
| Any write to a path outside the agent's worktree | Exits the trust boundary. |
| `npm install <pkg>` where the package's publisher is unknown | Supply-chain risk (typosquatting / fresh malicious uploads). |
| `curl` / `wget` whose output is piped to a shell or marked executable | Remote code execution. |
| Database migration commands (`prisma migrate deploy`, `alembic upgrade head`, `rake db:migrate`, etc.) | Persistent DB change. |
| Any single command that touches more than 100 files | Wide blast radius even when within the worktree. |

### Free-pass (allow + audit log)

- All reads and writes inside the agent's own worktree.
- Standard build / test / lint commands inside the worktree (`npm test`, `tsc`, `pytest`, `go test`, `cargo build`, `eslint`, …).
- Git operations on the agent's own branch (`git add`, `git commit`, `git checkout`, `git diff`, `git log`).
- Read-only standard utilities (`ls`, `cat`, `grep`, `find`, `sed`, `awk`, `head`, `tail`, …).
- Network egress — see below.

### Network egress

- **Policy:** allow.
- **Logging:** every outbound destination (host + first request) is recorded as an `agent.network` event.
- **Why no allowlist in v0.1:** legitimate destinations are open-ended (npm, pypi, github, vendor docs, package CDNs, …). Maintaining an allowlist would slow development with diminishing returns. v0.2 may revisit using audit data to narrow.

### Audit logging

Every shell tool call — regardless of layer 3 verdict — is recorded:

```
events  (run_id, ts, source='agent', type='agent.shell',
         payload_json={ cmd, cwd, exit_code, duration_ms, verdict })
```

Network destinations are recorded similarly with `type='agent.network'`. `beaver review` and the dashboard surface these for post-hoc inspection.

## Enforcement per adapter

### `ClaudeCodeAdapter`

Claude Code exposes a **PreToolUse hook** mechanism. Beaver registers a small hook script that:

1. Reads the proposed tool invocation from stdin.
2. Classifies against the policy rules above (hard-deny / require-confirmation / allow).
3. For **hard-deny**: returns deny + emits an `agent.shell.denied` event.
4. For **require-confirmation**: writes a `checkpoints` row of kind `risky-change-confirmation` and polls until status becomes `answered`; returns allow / deny based on the user response.
5. For **allow**: returns allow immediately.

The hook script runs in a separate Node process and communicates with the SQLite database using a thin DAO module shared with `core/`.

### `CodexAdapter`

Required in v0.1 because the `coder` role runs on Codex (per D10).

If Codex does not expose an equivalent PreToolUse hook, the adapter prepends a **shim directory** to `PATH` inside the agent's environment. The shim contains wrapper scripts for sensitive commands (`rm`, `curl`, `wget`, `npm`, `pip`, `sudo`, `git`) that route through the same policy engine before exec'ing the real binary.

The shim is best-effort — it cannot intercept absolute paths (`/bin/rm …`) or `system()` calls. Mitigations:

- The shim covers the highest-volume risky commands; absolute-path bypass is logged as `agent.shell.bypass-attempt` and treated as a `risky-change-confirmation` checkpoint when detected post-hoc by filesystem audit.
- Layer 4 (OS sandbox) is the proper long-term defense and is on the v0.2 roadmap.
- The shim correctness is part of the v0.1 acceptance criteria — see [planning/mvp-scope.md](../planning/mvp-scope.md).

## What v0.2 hardening looks like

- **macOS:** `sandbox-exec` profile that allows reads broadly but restricts writes to the worktree, the npm cache (`~/.npm`), the pip cache, and a few similar directories.
- **Linux:** `bubblewrap` (`bwrap`) with the same boundary.
- **Egress allowlist:** seeded from v0.1 audit logs; default-deny for unfamiliar destinations.
- **Provider routing rule:** prefer `ClaudeCodeAdapter` for coder roles until Codex's adapter is hardened.
