// Workspace state — which project folder is currently active.
//
// The user picks a project folder (or it's set via env/CLI). All
// SQLite reads (W.12.6) + sidecar spawns (W.12.5) use this folder's
// `.beaver/beaver.db`. Persisted across runs via a tiny config file
// in the OS app-config dir.
//
// review-pass v0.1: every renderer-supplied path is canonicalized
// before use to remove the `..`/symlink path-traversal vector. Mutex
// poison is propagated as a typed error rather than a panic.

use once_cell::sync::Lazy;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug)]
pub enum ResolveError {
    NoWorkspaceSelected,
    InvalidPath(String),
    NotABeaverProject(PathBuf),
    /// Mutex poisoned by a panic in another thread; the renderer
    /// should treat this as a transient state and retry / restart.
    LockPoisoned,
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
            ResolveError::LockPoisoned => write!(
                f,
                "workspace state lock poisoned; please restart the desktop app"
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

/// Hard cap on persisted path length so a malicious or corrupt
/// `active_workspace.txt` can't be a 1 MB blob that we pointlessly
/// load on every launch.
const MAX_WORKSPACE_PATH_LEN: usize = 4096;

static ACTIVE_WORKSPACE: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| {
    // Seed from env so dev/tests can launch the desktop with a chosen
    // project without going through the picker. Persistence (load from
    // app-config dir) is wired in `restore_persisted_workspace` which
    // the Tauri setup() hook calls once it has the AppHandle.
    let seed = std::env::var("BEAVER_WORKSPACE")
        .ok()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .and_then(|p| canonicalize_workspace(&p).ok());
    Mutex::new(seed)
});

/// Canonicalize a renderer-supplied workspace path. This is the
/// single chokepoint that:
///  - resolves `..` and symlinks (CRITICAL — removes path traversal),
///  - verifies the path exists and is a directory,
///  - rejects paths longer than `MAX_WORKSPACE_PATH_LEN`.
///
/// Every entry point that accepts a workspace path must funnel through
/// this. `set_workspace`, `resolve_workspace`, and `resolve_db_path`
/// all rely on it.
pub fn canonicalize_workspace(path: &Path) -> Result<PathBuf, ResolveError> {
    let raw = path.as_os_str();
    if raw.len() > MAX_WORKSPACE_PATH_LEN {
        return Err(ResolveError::InvalidPath(format!(
            "path exceeds {MAX_WORKSPACE_PATH_LEN} chars"
        )));
    }
    let canon = fs::canonicalize(path)
        .map_err(|e| ResolveError::InvalidPath(format!("{e}: {}", path.display())))?;
    if !canon.is_dir() {
        return Err(ResolveError::InvalidPath(canon.display().to_string()));
    }
    Ok(canon)
}

pub fn set_workspace(path: PathBuf) -> Result<PathBuf, ResolveError> {
    let canon = canonicalize_workspace(&path)?;
    let mut guard = ACTIVE_WORKSPACE
        .lock()
        .map_err(|_| ResolveError::LockPoisoned)?;
    *guard = Some(canon.clone());
    Ok(canon)
}

pub fn get_workspace() -> Option<PathBuf> {
    // Lock poisoning here is reported as "no workspace selected" so
    // the renderer surfaces the picker rather than dying. The
    // `set_workspace` path is the one that should propagate poison.
    ACTIVE_WORKSPACE.lock().ok().and_then(|g| g.clone())
}

/// Resolve the SQLite path under `<workspace>/.beaver/beaver.db`.
/// Errors when no workspace is selected or when it's missing `.beaver/`.
pub fn resolve_db_path(override_workspace: Option<&Path>) -> Result<PathBuf, ResolveError> {
    let workspace = resolve_workspace(override_workspace)?;
    let beaver_dir = workspace.join(".beaver");
    if !beaver_dir.is_dir() {
        return Err(ResolveError::NotABeaverProject(workspace));
    }
    Ok(beaver_dir.join("beaver.db"))
}

/// Like `resolve_db_path` but doesn't require `.beaver/` to exist —
/// used by the sidecar spawn so the CLI lands in a place where it
/// can create `.beaver/` if needed.
pub fn resolve_workspace(override_workspace: Option<&Path>) -> Result<PathBuf, ResolveError> {
    if let Some(p) = override_workspace {
        // Renderer-supplied override — canonicalize before trusting.
        return canonicalize_workspace(p);
    }
    get_workspace().ok_or(ResolveError::NoWorkspaceSelected)
}

/// True iff the path points at a folder containing a `.beaver/` subdir.
/// Used by the picker to validate the user's selection before we
/// commit it to the in-memory + on-disk state. Caller is responsible
/// for canonicalizing first (use `canonicalize_workspace`).
pub fn is_beaver_project(canonical_path: &Path) -> bool {
    canonical_path.is_dir() && canonical_path.join(".beaver").is_dir()
}

/// Resolve `<workspace>/.beaver/` for the active workspace. Used by
/// `plans_list` to assert that `content_path` rows from the database
/// can't escape the project root.
pub fn resolve_beaver_dir(override_workspace: Option<&Path>) -> Result<PathBuf, ResolveError> {
    let workspace = resolve_workspace(override_workspace)?;
    let beaver_dir = workspace.join(".beaver");
    if !beaver_dir.is_dir() {
        return Err(ResolveError::NotABeaverProject(workspace));
    }
    Ok(beaver_dir)
}

/// Persist `path` to `<config_dir>/active_workspace.txt`. Best-effort —
/// failure is logged via the returned error so the picker UI can warn,
/// but the in-memory selection is still honoured for the current run.
/// Path is length-capped to defend against corrupt/adversarial config
/// files on the next restore.
pub fn write_persisted_workspace(config_dir: &Path, path: &Path) -> std::io::Result<()> {
    let display = path.display().to_string();
    if display.len() > MAX_WORKSPACE_PATH_LEN {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("path exceeds {MAX_WORKSPACE_PATH_LEN} chars"),
        ));
    }
    fs::create_dir_all(config_dir)?;
    fs::write(config_dir.join(CONFIG_FILENAME), display)
}

/// Read the persisted workspace path if the config file exists, the
/// path is still a valid Beaver project folder, and nothing already
/// seeded the in-memory state from `BEAVER_WORKSPACE`. Returns the
/// path that was loaded (or None when nothing valid was found).
pub fn restore_persisted_workspace(config_dir: &Path) -> Option<PathBuf> {
    // Don't clobber an env-seeded selection.
    if get_workspace().is_some() {
        return None;
    }
    let raw = fs::read_to_string(config_dir.join(CONFIG_FILENAME)).ok()?;
    if raw.len() > MAX_WORKSPACE_PATH_LEN {
        return None;
    }
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(trimmed);
    let canon = canonicalize_workspace(&candidate).ok()?;
    if !is_beaver_project(&canon) {
        // Stale path — leave the file alone (user may remount their
        // project later) but don't seed an invalid selection.
        return None;
    }
    set_workspace(canon.clone()).ok()?;
    Some(canon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversize_path() {
        let huge = PathBuf::from("a".repeat(MAX_WORKSPACE_PATH_LEN + 1));
        let err = canonicalize_workspace(&huge).unwrap_err();
        match err {
            ResolveError::InvalidPath(_) => {}
            _ => panic!("expected InvalidPath, got {err:?}"),
        }
    }

    #[test]
    fn rejects_nonexistent_path() {
        let bogus = PathBuf::from("/this/path/does/not/exist/anywhere");
        let err = canonicalize_workspace(&bogus).unwrap_err();
        assert!(matches!(err, ResolveError::InvalidPath(_)));
    }
}
