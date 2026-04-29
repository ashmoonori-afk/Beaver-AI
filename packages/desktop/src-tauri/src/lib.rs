// Beaver desktop shell — Tauri v2 entry point.
//
// Module map:
//   - workspace.rs  — active project folder + .beaver/beaver.db resolution
//   - sidecar.rs    — spawn `beaver run` as a child process (W.12.5)
//   - db.rs         — SQLite read commands (W.12.6)
//   - lib.rs        — Tauri commands + handler registration

mod db;
mod prd;
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
    let run_id = sidecar::spawn_run(&app, &workdir, &args.goal, args.parent_run_id.as_deref())?;
    Ok(sidecar::RunsStartResult { run_id })
}

/// Phase 0 review-pass — explicit pre-relaunch hook for the auto-update
/// flow. The renderer calls this before `process.relaunch()` so we
/// drain the active-runs registry (kill children + wait) instead of
/// orphaning sidecars. Tauri's `RunEvent::Exit` doesn't fire reliably
/// on the relaunch path, so this is the only safe shutdown point.
#[tauri::command]
fn drain_active_runs() {
    sidecar::shutdown_all_runs();
}

/// Phase 1-B — return a unified-diff string for everything that has
/// changed in the active workspace since the last commit. The
/// renderer uses this to show users what the agent did before they
/// approve / reject at FINAL_REVIEW_PENDING.
#[tauri::command]
async fn workspace_diff() -> Result<String, String> {
    let workdir = workspace::resolve_workspace(None).map_err(|e| e.to_string())?;
    sidecar::run_workspace_diff(&workdir).await
}

#[derive(Deserialize)]
struct RunsAbortArgs {
    run_id: String,
}

/// Phase 1-C — kill an active sidecar for the given run id. Used by
/// the Resume UI to abandon a stuck or unwanted run.
#[tauri::command]
fn runs_abort(args: RunsAbortArgs) -> Result<(), String> {
    sidecar::abort_run(&args.run_id)
}

#[derive(Deserialize)]
struct SidecarLogArgs {
    #[serde(default)]
    tail_bytes: Option<usize>,
}

/// Read the tail of the active workspace's sidecar-stderr.log so the
/// renderer can show "your sidecar died silently — here's why" when a
/// run never produces a `runs` row.
#[tauri::command]
fn sidecar_log(args: SidecarLogArgs) -> Result<String, String> {
    let workdir = workspace::resolve_workspace(None).map_err(|e| e.to_string())?;
    let cap = args.tail_bytes.unwrap_or(8192).min(64 * 1024);
    sidecar::read_sidecar_log(&workdir, cap)
}

#[derive(Deserialize)]
struct WikiAskArgs {
    question: String,
}

#[derive(Serialize)]
struct WikiAskResult {
    answer: String,
    source_pages: Vec<String>,
}

/// v0.1.1-D — query the active workspace's wiki via the LLM.
/// Spawns `beaver wiki ask <question>`, parses its JSON stdout,
/// returns the answer + cited pages to the renderer.
#[tauri::command]
async fn wiki_ask(app: tauri::AppHandle, args: WikiAskArgs) -> Result<WikiAskResult, String> {
    let workdir = workspace::resolve_workspace(None).map_err(|e| e.to_string())?;
    let stdout = sidecar::run_wiki_ask(&app, &workdir, &args.question).await?;
    // The CLI prints a single JSON object on the last non-empty line.
    let last_line = stdout
        .lines()
        .rfind(|l| !l.trim().is_empty())
        .ok_or_else(|| "wiki ask: empty stdout".to_string())?;
    #[derive(Deserialize)]
    struct Raw {
        answer: String,
        #[serde(rename = "sourcePages")]
        source_pages: Vec<String>,
    }
    let raw: Raw = serde_json::from_str(last_line)
        .map_err(|e| format!("wiki ask: stdout was not JSON: {e} ({last_line})"))?;
    Ok(WikiAskResult {
        answer: raw.answer,
        source_pages: raw.source_pages,
    })
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

/// Phase 1-D — per-phase cost breakdown for a run.
#[tauri::command]
fn costs_breakdown(
    args: db::CostsBreakdownArgs,
) -> Result<Vec<db::CostsBreakdownRow>, String> {
    db::costs_breakdown(args).map_err(Into::into)
}

/// v0.2 M1.3a — read the active workspace's PRD draft markdown.
#[tauri::command]
fn prd_get_draft() -> Result<prd::PrdDraftResult, String> {
    prd::prd_get_draft()
}

/// v0.2 M1.3a — overwrite the active workspace's PRD draft markdown.
#[tauri::command]
fn prd_save_draft(args: prd::PrdSaveArgs) -> Result<prd::PrdSaveResult, String> {
    prd::prd_save_draft(args)
}

/// v0.2 M3.3 — tail the live log streamer for the LivePane.
#[tauri::command]
fn log_lines_list(args: db::LogLinesListArgs) -> Result<Vec<db::LogLineRow>, String> {
    db::log_lines_list(args).map_err(Into::into)
}

/// v0.2 M3.4 — pre-aggregated token + USD totals for the LivePane
/// cost counter.
#[tauri::command]
fn cost_ticks_totals(args: db::CostTickTotalsArgs) -> Result<db::CostTickTotalsRow, String> {
    db::cost_ticks_totals(args).map_err(Into::into)
}

#[derive(Serialize)]
struct WikiPageEntry {
    /// Path relative to `<workspace>/.beaver/wiki/` (forward slashes).
    path: String,
    /// First non-empty line of the page (markdown heading or first
    /// paragraph). Falls back to the filename when the file is empty.
    title: String,
    /// Top-level directory under `.beaver/wiki/` ("" for root files
    /// like `index.md` / `log.md`). Lets the renderer group pages.
    section: String,
    /// Last-modified time as milliseconds-since-epoch. The renderer
    /// formats this with `Date(ms).toISOString()` so the Rust side
    /// doesn't need a date crate.
    modified_unix_ms: u64,
    bytes: u64,
}

#[derive(Serialize)]
struct WikiPagesResult {
    pages: Vec<WikiPageEntry>,
    /// Absolute path to the wiki directory (used by the
    /// "Open in file explorer" button).
    wiki_path: String,
    /// False when `.beaver/wiki/` does not exist yet (zero-friction
    /// case before the first run); the renderer shows an explanatory
    /// empty state instead of an error.
    exists: bool,
}

/// Phase 2-C — list pages in `.beaver/wiki/` for the browse UI.
/// Returns an empty list when the directory is missing rather than
/// erroring, so a brand-new workspace's wiki tab still loads.
#[tauri::command]
fn wiki_list_pages() -> Result<WikiPagesResult, String> {
    let workdir = workspace::resolve_workspace(None).map_err(|e| e.to_string())?;
    let wiki_dir = workdir.join(".beaver").join("wiki");
    let wiki_path = wiki_dir.display().to_string();
    if !wiki_dir.is_dir() {
        return Ok(WikiPagesResult {
            pages: Vec::new(),
            wiki_path,
            exists: false,
        });
    }
    let mut out = Vec::new();
    walk_wiki_dir(&wiki_dir, &wiki_dir, &mut out).map_err(|e| format!("walk wiki: {e}"))?;
    out.sort_by(|a, b| b.modified_unix_ms.cmp(&a.modified_unix_ms));
    Ok(WikiPagesResult {
        pages: out,
        wiki_path,
        exists: true,
    })
}

const MAX_WIKI_PAGES: usize = 1000;
const MAX_TITLE_LEN: usize = 120;

fn walk_wiki_dir(
    root: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<WikiPageEntry>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        if out.len() >= MAX_WIKI_PAGES {
            return Ok(());
        }
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            walk_wiki_dir(root, &path, out)?;
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_unix_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/");
        let section = rel.split_once('/').map(|(s, _)| s.to_string()).unwrap_or_default();
        let title = read_page_title(&path).unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });
        out.push(WikiPageEntry {
            path: rel,
            title,
            section,
            modified_unix_ms,
            bytes: metadata.len(),
        });
    }
    Ok(())
}

/// Best-effort: read the first ~4 KB and return the first non-empty
/// non-frontmatter line, stripping leading `# ` so a markdown H1 reads
/// as a clean string. Returns None on read error so the caller can
/// fall back to the filename.
fn read_page_title(path: &std::path::Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = [0u8; 4096];
    let n = file.read(&mut buf).ok()?;
    let text = std::str::from_utf8(&buf[..n]).ok()?;
    let mut in_frontmatter = false;
    for (idx, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if idx == 0 && trimmed == "---" {
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if trimmed == "---" {
                in_frontmatter = false;
            }
            continue;
        }
        if trimmed.is_empty() {
            continue;
        }
        let stripped = trimmed.trim_start_matches('#').trim();
        let mut chars = stripped.chars().take(MAX_TITLE_LEN).collect::<String>();
        if stripped.chars().count() > MAX_TITLE_LEN {
            chars.push('…');
        }
        return Some(chars);
    }
    None
}

/// Phase 2-C — open `<workspace>/.beaver/wiki/` in the OS file
/// explorer. Lets users edit wiki pages with their preferred markdown
/// editor without us shipping an in-app one. Takes no arguments — the
/// path is fixed so there's no command-injection vector.
#[tauri::command]
fn wiki_reveal_in_explorer() -> Result<(), String> {
    let workdir = workspace::resolve_workspace(None).map_err(|e| e.to_string())?;
    let wiki_dir = workdir.join(".beaver").join("wiki");
    if !wiki_dir.is_dir() {
        // Create on demand so the user gets a useful folder rather
        // than an error. The post-run ingest expects `.beaver/wiki/`
        // anyway, so creating it eagerly is a no-op.
        std::fs::create_dir_all(&wiki_dir)
            .map_err(|e| format!("create wiki dir: {e}"))?;
    }
    open_in_os_explorer(&wiki_dir)
}

#[cfg(target_os = "windows")]
fn open_in_os_explorer(path: &std::path::Path) -> Result<(), String> {
    // `explorer.exe <path>` reliably opens a folder in a new Explorer
    // window. The exit code is non-zero if the path is invalid; we
    // surface that to the renderer.
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|e| format!("spawn explorer: {e}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_in_os_explorer(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| format!("spawn open: {e}"))?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_os_explorer(path: &std::path::Path) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|e| format!("spawn xdg-open: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            costs_breakdown,
            wiki_list_pages,
            wiki_reveal_in_explorer,
            sidecar_log,
            wiki_ask,
            drain_active_runs,
            workspace_diff,
            runs_abort,
            prd_get_draft,
            prd_save_draft,
            log_lines_list,
            cost_ticks_totals,
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
