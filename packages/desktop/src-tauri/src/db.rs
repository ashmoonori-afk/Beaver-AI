// SQLite read commands.
//
// W.12.6 — the CLI sidecar (W.12.5) writes to .beaver/beaver.db; the
// desktop app reads from the same DB to populate the renderer. We
// don't add any business logic here — the schema is owned by the
// `@beaver-ai/core` workspace migrations. This file is just a thin
// query layer that maps DB rows into the JSON shapes the webapp
// transports already understand.
//
// review-pass v0.1: every renderer-supplied `project_path` flows
// through `workspace::canonicalize_workspace` (in `resolve_workspace`)
// before becoming a SQLite path. `plans_list` additionally
// canonicalizes the per-row `content_path` and asserts it is inside
// `<workspace>/.beaver/` to defend against an LLM-poisoned ledger
// pointing at /etc/passwd or ~/.ssh/id_rsa.

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::workspace;

#[derive(Debug)]
pub struct DbError(String);

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError(format!("sqlite: {e}"))
    }
}

impl From<DbError> for String {
    fn from(e: DbError) -> Self {
        e.0
    }
}

/// Open the workspace SQLite read-only.
///
/// zero-friction v0.1: returns `Ok(None)` when `.beaver/beaver.db`
/// doesn't exist yet (workspace is brand-new, hasn't had a `run` yet).
/// Callers map the None to an empty result so polling doesn't surface
/// an error before the user even kicks off a run.
fn open_readonly(project_path: Option<&str>) -> Result<Option<Connection>, DbError> {
    let path = match workspace::resolve_db_path(project_path.map(Path::new)) {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    Ok(Some(conn))
}

fn open_readwrite(project_path: Option<&str>) -> Result<Connection, DbError> {
    let path = workspace::resolve_db_path(project_path.map(Path::new))
        .map_err(|e| DbError(e.to_string()))?;
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    Ok(conn)
}

// --- run snapshot -----------------------------------------------------

#[derive(Deserialize)]
pub struct RunsGetArgs {
    pub run_id: String,
    #[serde(default)]
    pub project_path: Option<String>,
}

#[derive(Serialize)]
pub struct RunRow {
    pub id: String,
    pub project_id: String,
    pub goal: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub budget_usd: f64,
    pub spent_usd: f64,
}

/// UX-2 (run history) — list every run in the active project most-
/// recent first. Includes pending and terminal runs so the renderer
/// can surface a checkpoint-pending run that the user closed earlier.
#[derive(Deserialize)]
pub struct RunsListArgs {
    #[serde(default)]
    pub project_path: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
}

pub fn runs_list(args: RunsListArgs) -> Result<Vec<RunRow>, DbError> {
    let Some(conn) = open_readonly(args.project_path.as_deref())? else {
        return Ok(Vec::new());
    };
    let limit = args.limit.unwrap_or(50).min(500);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, goal, status, started_at, ended_at, budget_usd, \
         COALESCE((SELECT SUM(usd) FROM costs WHERE costs.run_id = runs.id), 0) AS spent_usd \
         FROM runs ORDER BY started_at DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([limit], |r| {
            Ok(RunRow {
                id: r.get(0)?,
                project_id: r.get(1)?,
                goal: r.get(2)?,
                status: r.get(3)?,
                started_at: r.get(4)?,
                ended_at: r.get(5)?,
                budget_usd: r.get(6)?,
                spent_usd: r.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn runs_get(args: RunsGetArgs) -> Result<Option<RunRow>, DbError> {
    let Some(conn) = open_readonly(args.project_path.as_deref())? else {
        return Ok(None);
    };
    let mut stmt = conn.prepare(
        "SELECT id, project_id, goal, status, started_at, ended_at, budget_usd, \
         COALESCE((SELECT SUM(usd) FROM costs WHERE run_id = ?1), 0) AS spent_usd \
         FROM runs WHERE id = ?1",
    )?;
    // Distinguish "row not found" (return Ok(None)) from real SQLite
    // errors (propagate). Previously `.ok()` swallowed both.
    match stmt.query_row([&args.run_id], |r| {
        Ok(RunRow {
            id: r.get(0)?,
            project_id: r.get(1)?,
            goal: r.get(2)?,
            status: r.get(3)?,
            started_at: r.get(4)?,
            ended_at: r.get(5)?,
            budget_usd: r.get(6)?,
            spent_usd: r.get(7)?,
        })
    }) {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(DbError::from(e)),
    }
}

// --- checkpoints ------------------------------------------------------

#[derive(Deserialize)]
pub struct CheckpointsListArgs {
    pub run_id: String,
    #[serde(default)]
    pub project_path: Option<String>,
}

#[derive(Serialize)]
pub struct CheckpointRow {
    pub id: String,
    pub run_id: String,
    pub kind: String,
    pub status: String,
    pub prompt: String,
    pub response: Option<String>,
    /// Server-side timestamp from the orchestrator when the checkpoint
    /// was posted. The renderer uses this for "X seconds ago" display
    /// — using `Date.now()` on the client would reset to 0 every poll.
    pub created_at: Option<String>,
}

pub fn checkpoints_list(args: CheckpointsListArgs) -> Result<Vec<CheckpointRow>, DbError> {
    let Some(conn) = open_readonly(args.project_path.as_deref())? else {
        return Ok(Vec::new());
    };
    // The schema's checkpoints table doesn't ship a created_at column
    // in v0.1 — we surface NULL via COALESCE so the renderer can
    // detect "no timestamp" and degrade gracefully. v0.1.x will add
    // the column to the migration.
    let mut stmt = conn.prepare(
        "SELECT id, run_id, kind, status, prompt, response, \
         COALESCE(NULL, NULL) AS created_at \
         FROM checkpoints \
         WHERE run_id = ?1 AND status = 'pending' ORDER BY id",
    )?;
    let rows = stmt
        .query_map([&args.run_id], |r| {
            Ok(CheckpointRow {
                id: r.get(0)?,
                run_id: r.get(1)?,
                kind: r.get(2)?,
                status: r.get(3)?,
                prompt: r.get(4)?,
                response: r.get(5)?,
                created_at: r.get(6).ok(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[derive(Deserialize)]
pub struct CheckpointsAnswerArgs {
    pub id: String,
    pub response: String,
    #[serde(default)]
    pub project_path: Option<String>,
}

pub fn checkpoints_answer(args: CheckpointsAnswerArgs) -> Result<(), DbError> {
    let conn = open_readwrite(args.project_path.as_deref())?;
    conn.execute(
        "UPDATE checkpoints SET response = ?1, status = 'answered' WHERE id = ?2",
        [&args.response, &args.id],
    )?;
    Ok(())
}

// --- events -----------------------------------------------------------

#[derive(Deserialize)]
pub struct EventsListArgs {
    pub run_id: String,
    /// Cursor: only events with id > since.
    #[serde(default)]
    pub since: Option<i64>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub project_path: Option<String>,
}

#[derive(Serialize)]
pub struct EventRow {
    pub id: i64,
    pub run_id: String,
    pub ts: String,
    pub source: String,
    pub kind: String,
    pub payload_json: Option<String>,
}

pub fn events_list(args: EventsListArgs) -> Result<Vec<EventRow>, DbError> {
    let Some(conn) = open_readonly(args.project_path.as_deref())? else {
        return Ok(Vec::new());
    };
    let limit = args.limit.unwrap_or(500).min(2000);
    let since = args.since.unwrap_or(-1);
    let mut stmt = conn.prepare(
        "SELECT id, run_id, ts, source, type, payload_json FROM events \
         WHERE run_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![&args.run_id, since, limit], |r| {
            Ok(EventRow {
                id: r.get(0)?,
                run_id: r.get(1)?,
                ts: r.get(2)?,
                source: r.get(3)?,
                kind: r.get(4)?,
                payload_json: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

// --- plans ------------------------------------------------------------

#[derive(Deserialize)]
pub struct PlansListArgs {
    pub run_id: String,
    #[serde(default)]
    pub project_path: Option<String>,
}

/// Plan row sent to the renderer.
///
/// review-pass v0.1: `content_path` is intentionally NOT serialized —
/// it leaks the user's filesystem layout to the webview and isn't
/// rendered in any UI. The renderer only needs `content` (the parsed
/// JSON body). The path is read internally to fetch `content`.
#[derive(Serialize)]
pub struct PlanRow {
    pub id: String,
    pub run_id: String,
    pub version: i64,
    pub content: Option<String>,
}

pub fn plans_list(args: PlansListArgs) -> Result<Vec<PlanRow>, DbError> {
    // Resolve the workspace's .beaver/ root once so we can sandbox-check
    // every per-row content_path against it. A malicious or corrupt
    // ledger row pointing at /etc/passwd will be rejected here rather
    // than read+leaked to the webview.
    // zero-friction v0.1: graceful empty when .beaver/ doesn't exist yet.
    let beaver_dir =
        match workspace::resolve_beaver_dir(args.project_path.as_deref().map(Path::new)) {
            Ok(p) => p,
            Err(_) => return Ok(Vec::new()),
        };
    let allowed_root = std::fs::canonicalize(&beaver_dir)
        .map_err(|e| DbError(format!("canonicalize beaver_dir: {e}")))?;

    let Some(conn) = open_readonly(args.project_path.as_deref())? else {
        return Ok(Vec::new());
    };
    let mut stmt = conn.prepare(
        "SELECT id, run_id, version, content_path FROM plans \
         WHERE run_id = ?1 ORDER BY version DESC",
    )?;
    let raw_rows: Vec<(String, String, i64, String)> = stmt
        .query_map([&args.run_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut out = Vec::with_capacity(raw_rows.len());
    for (id, run_id, version, content_path) in raw_rows {
        let content = read_plan_content_safely(&content_path, &allowed_root);
        out.push(PlanRow {
            id,
            run_id,
            version,
            content,
        });
    }
    Ok(out)
}

/// Read plan content iff the path canonicalizes to a file inside
/// `allowed_root`. Returns None for any path that's missing,
/// unreadable, OR escapes the project's `.beaver/` directory.
fn read_plan_content_safely(content_path: &str, allowed_root: &Path) -> Option<String> {
    let canon = std::fs::canonicalize(content_path).ok()?;
    if !canon.starts_with(allowed_root) {
        // Reject. We deliberately don't log the rejected path here —
        // doing so would let an attacker probe for what's in our log
        // sink. The renderer just sees content=None.
        return None;
    }
    std::fs::read_to_string(&canon).ok()
}
