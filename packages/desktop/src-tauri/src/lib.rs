// Beaver desktop shell — Tauri v2 entry point.
//
// 4D.1 ships the window + a stable IPC seam (`desktop_info`). 4D.2
// will add `runs_start`, `runs_subscribe`, `checkpoints_answer`, etc.
// that wrap the existing @beaver-ai/core CLI as a sidecar process.

use serde::Serialize;

#[derive(Serialize)]
struct DesktopInfo {
    version: &'static str,
    target_os: &'static str,
    debug: bool,
}

/// Smoke-test command — proves the renderer can `invoke('desktop_info')`
/// and that the Tauri context is healthy. The 4D.2 transport replacements
/// will follow the same shape.
#[tauri::command]
fn desktop_info() -> DesktopInfo {
    DesktopInfo {
        version: env!("CARGO_PKG_VERSION"),
        target_os: std::env::consts::OS,
        debug: cfg!(debug_assertions),
    }
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
        .invoke_handler(tauri::generate_handler![desktop_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
