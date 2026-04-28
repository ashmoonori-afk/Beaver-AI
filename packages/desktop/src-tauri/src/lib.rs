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
fn workspace_set(args: WorkspaceSetArgs) -> Result<WorkspaceSetResult, String> {
    let path = PathBuf::from(args.path);
    workspace::set_workspace(path.clone()).map_err(|e| e.to_string())?;
    Ok(WorkspaceSetResult {
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn workspace_get() -> Option<String> {
    workspace::get_workspace().map(|p| p.display().to_string())
}

#[tauri::command]
fn runs_start(args: sidecar::RunsStartArgs) -> Result<sidecar::RunsStartResult, String> {
    let workdir =
        workspace::resolve_workspace(args.project_path.as_deref().map(std::path::Path::new))
            .map_err(|e| e.to_string())?;
    let run_id = sidecar::spawn_run(&workdir, &args.goal)?;
    Ok(sidecar::RunsStartResult { run_id })
}

// --- W.12.6 SQLite-backed read commands -------------------------------

#[tauri::command]
fn runs_get(args: db::RunsGetArgs) -> Result<Option<db::RunRow>, String> {
    db::runs_get(args).map_err(Into::into)
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
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            workspace_set,
            workspace_get,
            runs_start,
            runs_get,
            checkpoints_list,
            checkpoints_answer,
            events_list,
            plans_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
