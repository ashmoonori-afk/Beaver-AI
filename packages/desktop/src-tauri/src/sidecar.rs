// Sidecar process management for the CLI.
//
// W.12.5 — runs_start spawns `node <bin> run --no-server <goal>` in
// the project directory. The CLI persists state to .beaver/beaver.db
// which the other Tauri commands (W.12.6) read directly via SQLite.
// We deliberately do NOT parse stdout — polling a SQLite ledger is
// simpler and matches how the existing CLI already records state.
//
// In v0.1 the sidecar resolution chain is:
//   1. BEAVER_SIDECAR_NODE override (tests / dev-mode)
//   2. node-sea bundled binary at <resourceDir>/beaver-sidecar(.exe)
//   3. system `node` on PATH + bundled bin.js  (4D.7 may flip the order)
// If none resolve, runs_start returns an actionable error.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

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

/// In-process registry of active sidecar children. The renderer never
/// kills directly — it goes through `runs_abort`. The registry uses a
/// Mutex over a HashMap keyed by run id; entries are removed when the
/// child exits or on explicit abort.
static ACTIVE_RUNS: Lazy<Mutex<HashMap<String, Child>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Resolve which executable + args to use for the sidecar.
///
/// The two production-relevant cases:
///  - `BEAVER_SIDECAR_NODE` env var supplies a `node` path AND
///    `BEAVER_SIDECAR_BIN` supplies the bin.ts (dev mode + tests).
///  - System `node` + `<resourceDir>/sidecar/bin.js` (production once
///    the desktop installer drops dist/cli/bin.js next to the .exe).
///
/// 4D.7 will add the node-sea single-binary case at higher priority.
fn resolve_sidecar_command() -> Result<(PathBuf, Vec<String>), String> {
    // Dev / test override.
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

    // Production placeholder — the 4D.7 sprint will populate this with
    // the bundled node-sea binary or `<resourceDir>/sidecar/bin.js`.
    // For now, surface an actionable error so Tauri shows the user what
    // to install; the dev override above keeps tests green.
    Err(
        "no sidecar configured; set BEAVER_SIDECAR_NODE + BEAVER_SIDECAR_BIN, or wait for the bundled v0.1.0 installer (4D.7).".into(),
    )
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

pub fn spawn_run(workdir: &Path, goal: &str) -> Result<String, String> {
    let goal = validate_goal(goal)?;
    let (cmd, args) = resolve_sidecar_command()?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_id = format!("r-{stamp}");

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
    ACTIVE_RUNS
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?
        .insert(run_id.clone(), child);
    Ok(run_id)
}

#[allow(dead_code)] // wired in W.12.6's runs_abort command
pub fn abort_run(run_id: &str) -> Result<(), String> {
    let mut guard = ACTIVE_RUNS
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    if let Some(mut child) = guard.remove(run_id) {
        let _ = child.kill();
    }
    Ok(())
}

#[allow(dead_code)] // used by tests + future status command
pub fn active_run_count() -> usize {
    ACTIVE_RUNS
        .lock()
        .map(|g| g.len())
        .unwrap_or(0)
}

impl From<ResolveError> for String {
    fn from(e: ResolveError) -> String {
        format!("{e}")
    }
}
