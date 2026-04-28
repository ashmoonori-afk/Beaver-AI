// Beaver desktop shell — Tauri v2 entry point.
//
// 4D.1 shipped the window + the `desktop_info` smoke test.
// 4D.2 adds `runs_start` — spawns the Node CLI sidecar with the user's
// goal and assigns a run id back to the renderer. NDJSON forwarding
// to `run.snapshot.<runId>` events is wired in 4D.2.x once the CLI's
// `--json` output mode is stable.

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct DesktopInfo {
    version: &'static str,
    target_os: &'static str,
    debug: bool,
}

/// Smoke-test command — proves the renderer can `invoke('desktop_info')`
/// and that the Tauri context is healthy.
#[tauri::command]
fn desktop_info() -> DesktopInfo {
    DesktopInfo {
        version: env!("CARGO_PKG_VERSION"),
        target_os: std::env::consts::OS,
        debug: cfg!(debug_assertions),
    }
}

#[derive(Deserialize)]
struct RunsStartArgs {
    #[allow(dead_code)] // wired in 4D.2.x once sidecar streaming lands.
    goal: String,
}

#[derive(Serialize)]
struct RunsStartResult {
    run_id: String,
}

/// Phase 4D.2 entry — assigns a run id and (in 4D.2.x) spawns the
/// `node packages/cli/src/bin.ts run` sidecar with the goal as a
/// positional arg. The sidecar's stdout stream is forwarded as
/// `run.snapshot.<runId>` Tauri events.
///
/// For 4D.2 the command returns a fresh id so the renderer's existing
/// flow runs end-to-end against the (still-mock) tauri transports.
/// The actual sidecar spawn is gated on a follow-up sprint that
/// finalizes the CLI's NDJSON contract + node-sea binary.
#[tauri::command]
fn runs_start(_args: RunsStartArgs) -> RunsStartResult {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    RunsStartResult {
        run_id: format!("r-{stamp}"),
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
        .invoke_handler(tauri::generate_handler![desktop_info, runs_start])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
