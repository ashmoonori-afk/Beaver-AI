-- v0.2 M3.3 — Live log streamer.
--
-- One row per stdout/stderr line emitted by a coder/reviewer. Distinct
-- from `events` (which is the structured FSM/audit log) so the UI can
-- render two independent streams without filtering thousands of audit
-- rows.

CREATE TABLE log_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  ts           TEXT NOT NULL,
  source       TEXT NOT NULL,  -- 'coder' | 'reviewer' | 'orchestrator' | …
  stream       TEXT NOT NULL,  -- 'stdout' | 'stderr'
  text         TEXT NOT NULL
);

CREATE INDEX log_lines_run_idx ON log_lines(run_id);
CREATE INDEX log_lines_run_id_idx ON log_lines(run_id, id);
