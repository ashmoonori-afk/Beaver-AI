-- v0.2 M2.1 — PRD-derived task ledger.
--
-- One row per `- [ ]` item parsed out of the frozen prd.md ##
-- Acceptance section. Separate from the v0.1 `tasks` table so the
-- legacy plan-driven path stays untouched (KR5: zero v0.1 regression).

CREATE TABLE prd_tasks (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  prd_run_id      TEXT NOT NULL REFERENCES prd_runs(id),
  idx             INTEGER NOT NULL,
  text            TEXT NOT NULL,
  status          TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT,
  finished_at     TEXT
);

CREATE INDEX prd_tasks_run_idx ON prd_tasks(run_id);
CREATE INDEX prd_tasks_run_status_idx ON prd_tasks(run_id, status);
CREATE UNIQUE INDEX prd_tasks_prd_idx_idx ON prd_tasks(prd_run_id, idx);
