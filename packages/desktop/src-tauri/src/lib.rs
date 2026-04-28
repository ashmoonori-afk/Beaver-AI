// Beaver desktop shell — Tauri v2 entry point.
//
// Module map:
//   - workspace.rs  — active project folder + .beaver/beaver.db resolution
//   - sidecar.rs    — spawn `beaver run` as a child process (W.12.5)
//   - db.rs         — SQLite read commands (W.12.6)
//   - lib.rs        — Tauri commands + handler registration

mod db;
mod sidecar;
mod workspace;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct DesktopInfo {
    version: &'static str,
    target_os: &'static str,
    debug: bool,
    workspace: Option<String>,
}

#[tauri::command]
fn desktop_info() -> DesktopInfo {
    DesktopInfo {
        version: env!("CARGO_PKG_VERSION"),
        target_os: std::env::consts::OS,
        debug: cfg!(debug_assertions),
        workspace: workspace::get_workspace().map(|p| p.display().to_string()),
    }
}

#[derive(Deserialize)]
struct WorkspaceSetArgs {
    path: String,
}

#[derive(Serialize)]
struct WorkspaceSetResult {
    path: String,
}

#[tauri::command]
fn workspace_set(
    app: tauri::AppHandle,
    args: WorkspaceSetArgs,
) -> Result<WorkspaceSetResult, String> {
    let path = PathBuf::from(args.path);
    // zero-friction v0.1: accept any directory. The first `runs_start`
    // triggers the sidecar's `Beaver.run()` which calls `init()` and
    // creates `.beaver/` + SQLite schema if missing. Pre-empting that
    // here would require Node-side migrations from Rust, which is the
    // wrong layer. Path canonicalization still runs to defend against
    // `..` traversal.
    let canon = workspace::set_workspace(path).map_err(|e| e.to_string())?;
    persist_active_workspace(&app, &canon);
    Ok(WorkspaceSetResult {
        path: canon.display().to_string(),
    })
}

#[tauri::command]
fn workspace_get() -> Option<String> {
    workspace::get_workspace().map(|p| p.display().to_string())
}

#[derive(Serialize)]
struct WorkspacePickResult {
    path: Option<String>,
}

/// Open the OS folder picker; on selection, validate `.beaver/`, set
/// the in-memory workspace, and persist the path. Returns the chosen
/// path (or None when the user cancelled the dialog).
#[tauri::command]
async fn workspace_pick(app: tauri::AppHandle) -> Result<WorkspacePickResult, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select a Beaver project folder")
        .blocking_pick_folder();
    let Some(file_path) = picked else {
        return Ok(WorkspacePickResult { path: None });
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("invalid folder path: {e}"))?;
    // zero-friction v0.1: accept any directory. `.beaver/` is created
    // lazily by the sidecar's `Beaver.run()` on first goal submission.
    let canon = workspace::set_workspace(path).map_err(|e| e.to_string())?;
    persist_active_workspace(&app, &canon);
    Ok(WorkspacePickResult {
        path: Some(canon.display().to_string()),
    })
}

/// Best-effort persist; failures are logged but do not bubble up
/// because the in-memory selection is already honoured for this run.
fn persist_active_workspace(app: &tauri::AppHandle, path: &std::path::Path) {
    let Ok(config_dir) = app.path().app_config_dir() else {
        log::warn!("workspace persist: no app_config_dir resolvable");
        return;
    };
    if let Err(err) = workspace::write_persisted_workspace(&config_dir, path) {
        log::warn!(
            "workspace persist: failed to write to {}: {err}",
            config_dir.display()
        );
    }
}

#[tauri::command]
fn runs_start(
    app: tauri::AppHandle,
    args: sidecar::RunsStartArgs,
) -> Result<sidecar::RunsStartResult, String> {
    let workdir =
        workspace::resolve_workspace(args.project_path.as_deref().map(std::path::Path::new))
            .map_err(|e| e.to_string())?;
    let run_id = sidecar::spawn_run(&app, &workdir, &args.goal)?;
    Ok(sidecar::RunsStartResult { run_id })
}

// --- W.12.6 SQLite-backed read commands -------------------------------

#[tauri::command]
fn runs_get(args: db::RunsGetArgs) -> Result<Option<db::RunRow>, String> {
    db::runs_get(args).map_err(Into::into)
}

#[tauri::command]
fn runs_list(args: db::RunsListArgs) -> Result<Vec<db::RunRow>, String> {
    db::runs_list(args).map_err(Into::into)
}

#[tauri::command]
fn checkpoints_list(args: db::CheckpointsListArgs) -> Result<Vec<db::CheckpointRow>, String> {
    db::checkpoints_list(args).map_err(Into::into)
}

#[tauri::command]
fn checkpoints_answer(args: db::CheckpointsAnswerArgs) -> Result<(), String> {
    db::checkpoints_answer(args).map_err(Into::into)
}

#[tauri::command]
fn events_list(args: db::EventsListArgs) -> Result<Vec<db::EventRow>, String> {
    db::events_list(args).map_err(Into::into)
}

#[tauri::command]
fn plans_list(args: db::PlansListArgs) -> Result<Vec<db::PlanRow>, String> {
    db::plans_list(args).map_err(Into::into)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // review-pass v0.1: enable structured logging in BOTH debug
            // and release builds so post-incident investigation has an
            // audit trail. Release builds log at Warn to avoid noisy
            // disks; debug at Info for development feedback. We
            // deliberately do NOT log goal text or file paths here to
            // keep PII out of the log sink.
            let level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            app.handle()
                .plugin(tauri_plugin_log::Builder::default().level(level).build())?;
            // W.12.7 — restore the previously-selected workspace from
            // the app config dir (if any). Failure is non-fatal; the
            // picker UI handles the empty case.
            if let Ok(config_dir) = app.handle().path().app_config_dir() {
                let restored = workspace::restore_persisted_workspace(&config_dir);
                if restored.is_some() {
                    log::info!("workspace restored from config");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            workspace_set,
            workspace_get,
            workspace_pick,
            runs_start,
            runs_get,
            runs_list,
            checkpoints_list,
            checkpoints_answer,
            events_list,
            plans_list,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // review-pass v0.1: drain ACTIVE_RUNS on app exit so closing the
    // window doesn't leave orphaned sidecar processes. RunEvent::Exit
    // fires after all windows are gone but before the process returns.
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            sidecar::shutdown_all_runs();
        }
    });
}
