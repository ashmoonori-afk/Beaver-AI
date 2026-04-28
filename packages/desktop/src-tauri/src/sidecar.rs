// Sidecar process management for the CLI.
//
// W.12.5 — runs_start spawns `node <bin> run --no-server <goal>` in
// the project directory. The CLI persists state to .beaver/beaver.db
// which the other Tauri commands (W.12.6) read directly via SQLite.
// We deliberately do NOT parse stdout — polling a SQLite ledger is
// simpler and matches how the existing CLI already records state.
//
// 4D.7 — production resolution chain (highest priority first):
//   1. BEAVER_SIDECAR_NODE + BEAVER_SIDECAR_BIN env (DEBUG BUILD ONLY)
//   2. Bundled `<resourceDir>/sidecar/bin.mjs` + system `node` on PATH
//   3. Otherwise → actionable error (caught by W.12.8 ErrorBanner).
//
// review-pass v0.1: env override is gated on `cfg!(debug_assertions)`
// so a release-build install can't be redirected to an arbitrary node
// binary by an attacker who can write to the user's environment. Run
// IDs use a per-process atomic counter so rapid-fire starts can't
// collide on the same millisecond. ACTIVE_RUNS reaps finished
// children on every spawn so the map can't grow without bound.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::workspace::ResolveError;

/// Windows CreateProcess flag: don't allocate a console for the child.
/// Without this, spawning `node.exe` from a GUI Tauri app pops a black
/// cmd window every time the user submits a goal — the child inherits
/// no console handle from the GUI parent so Windows creates a new one.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Normalise a path for use in argv passed to a spawned Node process
/// on Windows. Two transforms:
///
///  1. Strip the `\\?\` verbatim-path prefix that `fs::canonicalize`
///     adds. Node 22+ tolerates UNC prefixes, but external tooling
///     downstream (npm scripts, claude/codex CLIs) does not.
///  2. Replace backslashes with forward slashes. **Node 24's
///     `realpathSync` regressed on Windows drive-letter paths** —
///     when the main-module resolver walks `C:\foo\bar\bin.mjs`, it
///     calls `lstat('C:')` which throws EISDIR. Forward slashes side-
///     step the broken decomposition.
///
/// Used for every path that crosses the Rust → Node boundary as argv.
fn normalize_path_for_node_argv(p: &Path) -> String {
    let s = p.to_string_lossy();
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    stripped.replace('\\', "/")
}

#[derive(Deserialize)]
pub struct RunsStartArgs {
    pub goal: String,
    /// Absolute path to the project directory whose `.beaver/beaver.db`
    /// the sidecar should read/write. Defaults to the workspace
    /// configured at startup if absent.
    #[serde(default)]
    pub project_path: Option<String>,
}

#[derive(Serialize)]
pub struct RunsStartResult {
    pub run_id: String,
}

const MAX_GOAL_LEN: usize = 4096;
const BUNDLED_BIN_REL: &str = "sidecar/bin.mjs";

/// In-process registry of active sidecar children. The renderer never
/// kills directly — it goes through `runs_abort`. Every spawn first
/// reaps any entries whose `Child::try_wait` reports termination, so
/// the map can't grow unbounded over a long session.
static ACTIVE_RUNS: Lazy<Mutex<HashMap<String, Child>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Per-process counter appended to the millisecond timestamp so two
/// `runs_start` calls in the same ms can't generate the same id.
static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Resolve which executable + args to use for the sidecar.
fn resolve_sidecar_command(app: &AppHandle) -> Result<(PathBuf, Vec<String>), String> {
    // (1) Dev / test override — DEBUG BUILDS ONLY. In a release build
    // a malicious / compromised shell environment must not be able to
    // redirect the sidecar to an arbitrary executable.
    #[cfg(debug_assertions)]
    {
        if let (Ok(node), Ok(bin)) = (
            std::env::var("BEAVER_SIDECAR_NODE"),
            std::env::var("BEAVER_SIDECAR_BIN"),
        ) {
            let node_path = PathBuf::from(node);
            if !node_path.exists() {
                return Err(format!(
                    "BEAVER_SIDECAR_NODE points at non-existent file: {}",
                    node_path.display()
                ));
            }
            let bin_path = PathBuf::from(&bin);
            if !bin_path.exists() {
                return Err(format!(
                    "BEAVER_SIDECAR_BIN points at non-existent file: {}",
                    bin_path.display()
                ));
            }
            // For dev mode the CLI source is .ts — node needs --import=tsx.
            let mut args = Vec::new();
            if bin.ends_with(".ts") {
                args.push("--import=tsx".to_string());
            }
            // Normalise so Node 24's realpathSync regression doesn't
            // bite the BEAVER_SIDECAR_BIN env-override path either.
            args.push(normalize_path_for_node_argv(&bin_path));
            return Ok((node_path, args));
        }
    }

    // (2) Production — bundled bin.mjs in the resource dir + system node.
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("could not resolve resource dir: {e}"))?;
    let bundled_bin = resource_dir.join(BUNDLED_BIN_REL);
    if bundled_bin.is_file() {
        let node = which_node().ok_or_else(|| {
            "Node.js was not found on PATH. Install Node 22+ from https://nodejs.org \
             (a bundled Node binary is coming in v0.1.x)."
                .to_string()
        })?;
        // Node 24 regression workaround — see normalize_path_for_node_argv.
        return Ok((node, vec![normalize_path_for_node_argv(&bundled_bin)]));
    }

    Err(format!(
        "no sidecar configured; expected bundled {}",
        bundled_bin.display()
    ))
}

/// Find a `node` executable on PATH. Returns None when missing so the
/// caller can render an actionable "install Node" message.
fn which_node() -> Option<PathBuf> {
    let exe = if cfg!(windows) { "node.exe" } else { "node" };
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(exe);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn validate_goal(goal: &str) -> Result<&str, String> {
    let trimmed = goal.trim();
    if trimmed.is_empty() {
        return Err("goal: empty after trim".into());
    }
    if trimmed.len() > MAX_GOAL_LEN {
        return Err(format!(
            "goal: {} chars exceeds {}-char cap",
            trimmed.len(),
            MAX_GOAL_LEN
        ));
    }
    Ok(trimmed)
}

/// Walk the active-runs registry and remove (with `wait` to reclaim
/// the OS handle) any child that has already exited. Called before
/// every spawn so a long session can't accumulate zombie entries.
fn reap_finished_runs(map: &mut HashMap<String, Child>) {
    let exited: Vec<String> = map
        .iter_mut()
        .filter_map(|(id, child)| match child.try_wait() {
            Ok(Some(_status)) => Some(id.clone()),
            _ => None,
        })
        .collect();
    for id in exited {
        if let Some(mut child) = map.remove(&id) {
            // try_wait already reaped on POSIX, but call wait() to be
            // explicit and to also release the handle on Windows.
            let _ = child.wait();
        }
    }
}

/// Build a unique run id of the form `r-{millis}-{counter}`.
fn make_run_id() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("r-{stamp}-{n}")
}

/// Strip the Windows `\\?\` verbatim-path prefix if present, so the
/// child process's cwd is a regular drive-letter path. Some external
/// tools and Node APIs trip over UNC paths.
fn strip_unc_prefix(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p.to_path_buf(),
    }
}

pub fn spawn_run(app: &AppHandle, workdir: &Path, goal: &str) -> Result<String, String> {
    let goal = validate_goal(goal)?;
    let (cmd, args) = resolve_sidecar_command(app)?;
    let run_id = make_run_id();

    // Workdir from canonicalize() carries `\\?\` on Windows. Strip it
    // so child processes (Node, claude CLI, codex CLI) get a normal
    // drive-letter cwd.
    let workdir_clean = strip_unc_prefix(workdir);

    // Capture stdout + stderr to files inside `<workdir>/.beaver/` so
    // the user (and we) can diagnose silent failures. `Beaver.run()`
    // creates `.beaver/` itself when it bootstraps the SQLite schema,
    // but we need the directory NOW for the log file destinations.
    let beaver_dir = workdir_clean.join(".beaver");
    fs::create_dir_all(&beaver_dir)
        .map_err(|e| format!("failed to create {}: {e}", beaver_dir.display()))?;
    let stdout_log = beaver_dir.join("sidecar-stdout.log");
    let stderr_log = beaver_dir.join("sidecar-stderr.log");
    let spawn_log = beaver_dir.join("sidecar-spawn.log");

    // Diagnostic — write the exact (cmd, args, cwd) we're about to
    // spawn. If something downstream fails silently the user can mail
    // us this file rather than us having to add ad-hoc logging.
    let _ = fs::write(
        &spawn_log,
        format!(
            "cmd: {}\nargs: {:?}\ncwd: {}\n",
            cmd.display(),
            args,
            workdir_clean.display()
        ),
    );

    let stdout_file = fs::File::create(&stdout_log)
        .map_err(|e| format!("failed to create {}: {e}", stdout_log.display()))?;
    let stderr_file = fs::File::create(&stderr_log)
        .map_err(|e| format!("failed to create {}: {e}", stderr_log.display()))?;

    // The CLI uses cwd to find .beaver/. workdir = the user's project.
    let mut command = Command::new(&cmd);
    command
        .args(&args)
        .arg("run")
        .arg("--no-server")
        .arg(goal)
        .current_dir(&workdir_clean)
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        // BEAVER_REFINER + _PLANNER drive the W.12.4 auto-injection.
        // Setting both here means desktop spawns always use real LLMs.
        .env("BEAVER_REFINER", "llm")
        .env("BEAVER_PLANNER", "llm");

    // On Windows: hide the cmd window that would otherwise flash for
    // every spawned `node.exe`. The Tauri GUI parent has no console,
    // so without this Windows creates a fresh console for the child.
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(|e| {
        format!(
            "failed to spawn sidecar {}: {}. See {} for details.",
            cmd.display(),
            e,
            stderr_log.display()
        )
    })?;
    let mut guard = ACTIVE_RUNS
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    reap_finished_runs(&mut guard);
    guard.insert(run_id.clone(), child);
    log::info!(
        "sidecar spawned (run_id={run_id}, log={})",
        stderr_log.display()
    );
    Ok(run_id)
}

#[allow(dead_code)] // wired in W.12.6's runs_abort command
pub fn abort_run(run_id: &str) -> Result<(), String> {
    let mut guard = ACTIVE_RUNS
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    if let Some(mut child) = guard.remove(run_id) {
        // Kill, then wait to reclaim the handle. wait() blocks but
        // the post-kill window is short; without it POSIX leaves a
        // zombie.
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

/// Read the most recent sidecar-stderr.log from the active workspace,
/// truncated to the last `tail_bytes` so a runaway log doesn't blow up
/// the IPC payload. Used by the renderer to surface "your sidecar died
/// silently — here's what it said" diagnostics.
pub fn read_sidecar_log(workdir: &Path, tail_bytes: usize) -> Result<String, String> {
    let path = workdir.join(".beaver").join("sidecar-stderr.log");
    let bytes = fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let start = bytes.len().saturating_sub(tail_bytes);
    Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

/// Drain ACTIVE_RUNS, killing every remaining child and waiting on
/// it. Called on application exit so closing the window doesn't leave
/// orphaned sidecar processes.
pub fn shutdown_all_runs() {
    let mut guard = match ACTIVE_RUNS.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    for (_id, mut child) in guard.drain() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[allow(dead_code)] // used by tests + future status command
pub fn active_run_count() -> usize {
    ACTIVE_RUNS.lock().map(|g| g.len()).unwrap_or(0)
}

impl From<ResolveError> for String {
    fn from(e: ResolveError) -> String {
        format!("{e}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_goal() {
        assert!(validate_goal("").is_err());
        assert!(validate_goal("   \n\t").is_err());
    }

    #[test]
    fn trims_and_accepts_short_goal() {
        let out = validate_goal("  build a thing  ").unwrap();
        assert_eq!(out, "build a thing");
    }

    #[test]
    fn rejects_oversize_goal() {
        let huge = "x".repeat(MAX_GOAL_LEN + 1);
        let err = validate_goal(&huge).unwrap_err();
        assert!(err.contains("exceeds"));
    }

    #[test]
    fn run_ids_are_unique_under_rapid_fire() {
        // Generate many IDs in tight succession and assert no
        // collisions — guards against the previous millis-only scheme.
        let mut seen = std::collections::HashSet::new();
        for _ in 0..1000 {
            let id = make_run_id();
            assert!(seen.insert(id), "run_id collision under rapid-fire");
        }
    }

    #[test]
    fn which_node_returns_path_when_found() {
        if which_node().is_some() {
            assert!(which_node().unwrap().is_file());
        }
    }

    #[test]
    fn normalize_strips_unc_prefix_and_forward_slashes() {
        let p = PathBuf::from(r"\\?\C:\Program Files\Beaver\resources\sidecar\bin.mjs");
        let norm = normalize_path_for_node_argv(&p);
        assert!(!norm.starts_with(r"\\?\"));
        assert!(!norm.contains('\\'));
        assert_eq!(norm, "C:/Program Files/Beaver/resources/sidecar/bin.mjs");
    }

    #[test]
    fn normalize_handles_plain_drive_path() {
        let p = PathBuf::from(r"C:\Users\me\bin.mjs");
        let norm = normalize_path_for_node_argv(&p);
        assert_eq!(norm, "C:/Users/me/bin.mjs");
    }

    #[test]
    fn normalize_handles_posix_path() {
        let p = PathBuf::from("/home/me/bin.mjs");
        let norm = normalize_path_for_node_argv(&p);
        assert_eq!(norm, "/home/me/bin.mjs");
    }

    #[test]
    fn strip_unc_prefix_normal_path_passthrough() {
        let p = PathBuf::from(r"C:\foo\bar");
        let stripped = strip_unc_prefix(&p);
        assert_eq!(stripped, PathBuf::from(r"C:\foo\bar"));
    }

    #[test]
    fn strip_unc_prefix_removes_verbatim_prefix() {
        let p = PathBuf::from(r"\\?\C:\foo\bar");
        let stripped = strip_unc_prefix(&p);
        assert_eq!(stripped, PathBuf::from(r"C:\foo\bar"));
    }
}
