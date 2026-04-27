# Codex PATH-Shim Sandbox (v0.1)

Per-command POSIX shell wrappers that intercept high-risk binaries before
they execute. The Codex adapter prepends `<workdir>/.beaver/shim/` to
`PATH`, saves the original `PATH` into `BEAVER_REAL_PATH`-resolved targets,
and lets the shim consult `classify-cli` to gate the call.

## Bypass Surface (read this before trusting the shim)

A `PATH`-shim is the cheapest sandbox to ship but the easiest to evade.
Known bypasses NOT covered in v0.1:

- **Absolute paths**: `/bin/rm -rf /` skips PATH lookup entirely.
- **`system()` / direct `execve`**: a child program that hard-codes the
  binary path (e.g. `subprocess.run("/usr/bin/curl", ...)`) skips the shim.
- **Shell-builtins-with-the-same-name**: rare, but `command rm`,
  `\rm`, or sourcing a script that re-defines `PATH` mid-run defeats us.
- **Non-POSIX shells / Windows**: see "Why no Windows shim" below.

Mitigations layered on top:

1. **Run-end filesystem audit** (P1.S4 T5) — diff worktree before/after
   each shell call; out-of-worktree writes are flagged regardless of how
   they happened.
2. **OS-level sandbox** (v0.2) — `bwrap` / Seatbelt / Job Objects to enforce
   the policy at the kernel boundary. PATH-shim becomes belt-and-suspenders.

## Exit-Code Contract (classify-cli ↔ shim)

| classify-cli exit        | shim action                                               |
| ------------------------ | --------------------------------------------------------- |
| 0 (allow)                | `exec "$BEAVER_REAL_PATH" "$@"`                           |
| 1 (require-confirmation) | print `policy: require-confirmation: …` to stderr, exit 2 |
| 2 (hard-deny)            | print `policy: hard-deny: …` to stderr, exit 2            |
| anything else            | print error to stderr, exit 2                             |

v0.1 shims do NOT poll for confirmation — `require-confirmation` collapses
to deny at the shim layer. The interactive approve/reject loop runs in the
TS hook (`providers/claude-code/hook.ts`); Codex gets that flow when a
Codex-equivalent hook lands.

## Required Env Vars

| var                   | who sets      | purpose                                                                                                                                                    |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BEAVER_WORKTREE`     | adapter       | absolute path to agent worktree                                                                                                                            |
| `BEAVER_REAL_PATH`    | adapter       | absolute path to the real binary the shim wraps                                                                                                            |
| `BEAVER_CWD`          | adapter (opt) | falls back to `pwd`                                                                                                                                        |
| `BEAVER_CLASSIFY_CLI` | installer     | command line to spawn classify-cli (e.g. `node --import=tsx /…/classify-cli.ts`); falls back to `<shimDir>/.beaver-classify-cmd` written by `installShim`. |

## Why No Windows Shim in v0.1

The shims are POSIX `bash` scripts (`set -euo pipefail`, `exec`, `printf`).
Windows lacks a built-in PATH-search semantic that respects shebangs from
arbitrary directories without WSL or a `.cmd` shim. Rather than ship a
half-broken `.cmd`/`.ps1` pair, `installShim` throws on `win32` and points
operators at the v0.2 OS-level sandbox roadmap.
