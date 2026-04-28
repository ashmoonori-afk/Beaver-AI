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
    goal: String,
}

#[derive(Serialize)]
struct RunsStartResult {
    run_id: String,
}

/// Hard cap on goal-string length. 4 KB is generous for a free-text
/// project goal but bounds the IPC argument before the 4D.2.x sidecar
/// path turns it into a positional argv element.
const MAX_GOAL_LEN: usize = 4096;

/// Phase 4D.2 entry — validates the goal and assigns a run id. The
/// 4D.2.x follow-up will spawn `node packages/cli/src/bin.ts run`
/// as a sidecar with the goal as a positional argument; locking the
/// length + non-empty invariants here keeps that path safe even when
/// the sidecar shell-out lands.
#[tauri::command]
fn runs_start(args: RunsStartArgs) -> Result<RunsStartResult, String> {
    let trimmed = args.goal.trim();
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
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(RunsStartResult {
        run_id: format!("r-{stamp}"),
    })
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
