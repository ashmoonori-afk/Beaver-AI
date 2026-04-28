// Workspace state — which project folder is currently active.
//
// The user picks a project folder (or it's set via env/CLI). All
// SQLite reads (W.12.6) + sidecar spawns (W.12.5) use this folder's
// `.beaver/beaver.db`. Persisted across runs via a tiny config file
// in the OS app-config dir; W.12.7 wires the picker UI + persistence.

use once_cell::sync::Lazy;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug)]
pub enum ResolveError {
    NoWorkspaceSelected,
    InvalidPath(String),
    NotABeaverProject(PathBuf),
}

impl std::fmt::Display for ResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResolveError::NoWorkspaceSelected => write!(
                f,
                "no project folder selected; pick one from the desktop app's project picker"
            ),
            ResolveError::InvalidPath(p) => {
                write!(f, "invalid workspace path: {p}")
            }
            ResolveError::NotABeaverProject(p) => write!(
                f,
                "{} doesn't look like a Beaver project (no .beaver/ subdir); run `beaver init` there first",
                p.display()
            ),
        }
    }
}

impl std::error::Error for ResolveError {}

/// Persisted-config filename, written under the app config dir
/// (resolved by Tauri at runtime). Plain text so a user can audit /
/// hand-edit it without booting a parser. The file holds exactly one
/// absolute path — newline-trimmed on read.
const CONFIG_FILENAME: &str = "active_workspace.txt";

static ACTIVE_WORKSPACE: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| {
    // Seed from env so dev/tests can launch the desktop with a chosen
    // project without going through the picker. Persistence (load from
    // app-config dir) is wired in `restore_persisted_workspace` which
    // the Tauri setup() hook calls once it has the AppHandle.
    let seed = std::env::var("BEAVER_WORKSPACE")
        .ok()
        .map(PathBuf::from)
        .filter(|p| p.is_dir());
    Mutex::new(seed)
});

pub fn set_workspace(path: PathBuf) -> Result<(), ResolveError> {
    if !path.is_dir() {
        return Err(ResolveError::InvalidPath(path.display().to_string()));
    }
    *ACTIVE_WORKSPACE.lock().expect("workspace lock poisoned") = Some(path);
    Ok(())
}

pub fn get_workspace() -> Option<PathBuf> {
    ACTIVE_WORKSPACE.lock().ok().and_then(|g| g.clone())
}

/// Resolve the SQLite path under `<workspace>/.beaver/beaver.db`.
/// Errors when no workspace is selected or when it's missing `.beaver/`.
/// Wired in W.12.6 by the SQLite-backed transport commands.
#[allow(dead_code)]
pub fn resolve_db_path(override_workspace: Option<&Path>) -> Result<PathBuf, ResolveError> {
    let workspace = override_workspace
        .map(Path::to_path_buf)
        .or_else(get_workspace)
        .ok_or(ResolveError::NoWorkspaceSelected)?;
    let beaver_dir = workspace.join(".beaver");
    if !beaver_dir.is_dir() {
        return Err(ResolveError::NotABeaverProject(workspace));
    }
    Ok(beaver_dir.join("beaver.db"))
}

/// Like `resolve_db_path` but also verifies the cwd has the project
/// structure — used by the sidecar spawn so the CLI lands in a place
/// where `.beaver/` exists.
pub fn resolve_workspace(override_workspace: Option<&Path>) -> Result<PathBuf, ResolveError> {
    let workspace = override_workspace
        .map(Path::to_path_buf)
        .or_else(get_workspace)
        .ok_or(ResolveError::NoWorkspaceSelected)?;
    if !workspace.is_dir() {
        return Err(ResolveError::InvalidPath(workspace.display().to_string()));
    }
    Ok(workspace)
}

/// True iff the path points at a folder containing a `.beaver/` subdir.
/// Used by the picker to validate the user's selection before we
/// commit it to the in-memory + on-disk state.
pub fn is_beaver_project(path: &Path) -> bool {
    path.is_dir() && path.join(".beaver").is_dir()
}

/// Persist `path` to `<config_dir>/active_workspace.txt`. Best-effort —
/// failure is logged via the returned error so the picker UI can warn,
/// but the in-memory selection is still honoured for the current run.
pub fn write_persisted_workspace(config_dir: &Path, path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(config_dir)?;
    fs::write(config_dir.join(CONFIG_FILENAME), path.display().to_string())
}

/// Read the persisted workspace path if the config file exists, the path
/// is still a valid Beaver project folder, and nothing already seeded
/// the in-memory state from `BEAVER_WORKSPACE`. Returns the path that
/// was loaded (or None when nothing valid was found).
pub fn restore_persisted_workspace(config_dir: &Path) -> Option<PathBuf> {
    // Don't clobber an env-seeded selection.
    if get_workspace().is_some() {
        return None;
    }
    let raw = fs::read_to_string(config_dir.join(CONFIG_FILENAME)).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(trimmed);
    if !is_beaver_project(&candidate) {
        // Stale path — leave the file alone (user may remount their
        // project later) but don't seed an invalid selection.
        return None;
    }
    set_workspace(candidate.clone()).ok()?;
    Some(candidate)
}
