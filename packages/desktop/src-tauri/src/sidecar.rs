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
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::workspace::ResolveError;

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
            args.push(bin);
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
        return Ok((node, vec![bundled_bin.display().to_string()]));
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

pub fn spawn_run(app: &AppHandle, workdir: &Path, goal: &str) -> Result<String, String> {
    let goal = validate_goal(goal)?;
    let (cmd, args) = resolve_sidecar_command(app)?;
    let run_id = make_run_id();

    // The CLI uses cwd to find .beaver/. workdir = the user's project.
    let mut command = Command::new(&cmd);
    command
        .args(&args)
        .arg("run")
        .arg("--no-server")
        .arg(goal)
        .current_dir(workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // BEAVER_REFINER + _PLANNER drive the W.12.4 auto-injection.
        // Setting both here means desktop spawns always use real LLMs.
        .env("BEAVER_REFINER", "llm")
        .env("BEAVER_PLANNER", "llm");

    let child = command
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar {}: {}", cmd.display(), e))?;
    let mut guard = ACTIVE_RUNS
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    reap_finished_runs(&mut guard);
    guard.insert(run_id.clone(), child);
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
}
