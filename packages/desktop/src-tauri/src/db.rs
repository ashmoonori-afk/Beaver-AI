// SQLite read-only commands.
//
// W.12.6 — the CLI sidecar (W.12.5) writes to .beaver/beaver.db; the
// desktop app reads from the same DB to populate the renderer. We
// don't add any business logic here — the schema is owned by the
// `@beaver-ai/core` workspace migrations. This file is just a thin
// query layer that maps DB rows into the JSON shapes the webapp
// transports already understand.

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

fn open_readonly(project_path: Option<&str>) -> Result<Connection, DbError> {
    let path = workspace::resolve_db_path(project_path.map(Path::new))
        .map_err(|e| DbError(e.to_string()))?;
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    Ok(conn)
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

pub fn runs_get(args: RunsGetArgs) -> Result<Option<RunRow>, DbError> {
    let conn = open_readonly(args.project_path.as_deref())?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, goal, status, started_at, ended_at, budget_usd, \
         COALESCE((SELECT SUM(usd) FROM costs WHERE run_id = ?1), 0) AS spent_usd \
         FROM runs WHERE id = ?1",
    )?;
    let row = stmt
        .query_row([&args.run_id], |r| {
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
        })
        .ok();
    Ok(row)
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
}

pub fn checkpoints_list(args: CheckpointsListArgs) -> Result<Vec<CheckpointRow>, DbError> {
    let conn = open_readonly(args.project_path.as_deref())?;
    let mut stmt = conn.prepare(
        "SELECT id, run_id, kind, status, prompt, response FROM checkpoints \
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
    let conn = open_readonly(args.project_path.as_deref())?;
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

#[derive(Serialize)]
pub struct PlanRow {
    pub id: String,
    pub run_id: String,
    pub version: i64,
    pub content_path: String,
    pub content: Option<String>,
}

pub fn plans_list(args: PlansListArgs) -> Result<Vec<PlanRow>, DbError> {
    let conn = open_readonly(args.project_path.as_deref())?;
    let mut stmt = conn.prepare(
        "SELECT id, run_id, version, content_path FROM plans \
         WHERE run_id = ?1 ORDER BY version DESC",
    )?;
    let rows = stmt
        .query_map([&args.run_id], |r| {
            let content_path: String = r.get(3)?;
            // Best-effort read of plan-vN.json; failures fall through to None.
            let content = std::fs::read_to_string(&content_path).ok();
            Ok(PlanRow {
                id: r.get(0)?,
                run_id: r.get(1)?,
                version: r.get(2)?,
                content_path,
                content,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
