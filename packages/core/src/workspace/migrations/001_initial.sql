-- Beaver AI ledger v1.
-- Schema source-of-truth: docs/architecture/workspace-state.md.
-- Applied once and tracked in the _migrations table by the runner.

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  root_path    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  config_json  TEXT
);

CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  goal        TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  budget_usd  REAL NOT NULL,
  spent_usd   REAL NOT NULL DEFAULT 0
);

CREATE INDEX runs_project_idx ON runs(project_id);
CREATE INDEX runs_status_idx ON runs(status);

CREATE TABLE plans (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  version         INTEGER NOT NULL,
  parent_version  INTEGER,
  modified_by     TEXT,
  content_path    TEXT NOT NULL,
  UNIQUE(run_id, version)
);

CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL REFERENCES runs(id),
  parent_id        TEXT REFERENCES tasks(id),
  role             TEXT NOT NULL,
  status           TEXT NOT NULL,
  depends_on_json  TEXT NOT NULL DEFAULT '[]',
  budget_usd       REAL,
  spent_usd        REAL NOT NULL DEFAULT 0
);

CREATE INDEX tasks_run_idx ON tasks(run_id);
CREATE INDEX tasks_status_idx ON tasks(status);

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  provider       TEXT NOT NULL,
  worktree_path  TEXT NOT NULL,
  branch         TEXT NOT NULL,
  status         TEXT NOT NULL,
  budget_usd     REAL NOT NULL,
  spent_usd      REAL NOT NULL DEFAULT 0
);

CREATE INDEX agents_task_idx ON agents(task_id);

CREATE TABLE artifacts (
  id        TEXT PRIMARY KEY,
  task_id   TEXT NOT NULL REFERENCES tasks(id),
  kind      TEXT NOT NULL,
  path      TEXT NOT NULL,
  sha       TEXT,
  summary   TEXT
);

CREATE INDEX artifacts_task_idx ON artifacts(task_id);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  ts            TEXT NOT NULL,
  source        TEXT NOT NULL,
  type          TEXT NOT NULL,
  payload_json  TEXT
);

CREATE INDEX events_run_idx ON events(run_id);
CREATE INDEX events_run_ts_idx ON events(run_id, ts);
CREATE INDEX events_type_idx ON events(type);

CREATE TABLE checkpoints (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id),
  kind      TEXT NOT NULL,
  status    TEXT NOT NULL,
  prompt    TEXT NOT NULL,
  response  TEXT
);

CREATE INDEX checkpoints_run_status_idx ON checkpoints(run_id, status);

CREATE TABLE costs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  agent_id    TEXT REFERENCES agents(id),
  provider    TEXT NOT NULL,
  tokens_in   INTEGER NOT NULL,
  tokens_out  INTEGER NOT NULL,
  usd         REAL NOT NULL,
  model       TEXT NOT NULL,
  ts          TEXT NOT NULL
);

CREATE INDEX costs_run_idx ON costs(run_id);
CREATE INDEX costs_agent_idx ON costs(agent_id);

CREATE TABLE rate_table (
  provider             TEXT NOT NULL,
  model                TEXT NOT NULL,
  tokens_in_per_usd    REAL NOT NULL,
  tokens_out_per_usd   REAL NOT NULL,
  effective_from       TEXT NOT NULL,
  PRIMARY KEY (provider, model, effective_from)
);
