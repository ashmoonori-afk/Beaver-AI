// Workspace state — which project folder is currently active.
//
// The user picks a project folder (or it's set via env/CLI). All
// SQLite reads (W.12.6) + sidecar spawns (W.12.5) use this folder's
// `.beaver/beaver.db`. Persisted across runs via a tiny config file
// in the OS app-config dir; W.12.7 wires the picker UI.

use once_cell::sync::Lazy;
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

static ACTIVE_WORKSPACE: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| {
    // Seed from env so dev/tests can launch the desktop with a chosen
    // project without going through the picker.
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
    *ACTIVE_WORKSPACE
        .lock()
        .expect("workspace lock poisoned") = Some(path);
    Ok(())
}

pub fn get_workspace() -> Option<PathBuf> {
    ACTIVE_WORKSPACE
        .lock()
        .ok()
        .and_then(|g| g.clone())
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
        return Err(ResolveError::InvalidPath(
            workspace.display().to_string(),
        ));
    }
    Ok(workspace)
}
