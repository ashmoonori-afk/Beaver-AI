-- v0.2 M1.5 — PRD freeze ledger.
--
-- One row per ConfirmGate click. Records that the user approved the
-- refiner's draft and the orchestrator copied it to <workspace>/.beaver/prd.md
-- (and the static Ralph prompt to <workspace>/.beaver/PROMPT.md).
-- Forward-only: no v0.1 table is touched.

CREATE TABLE prd_runs (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  frozen_at    TEXT NOT NULL,
  prd_path     TEXT NOT NULL,
  prompt_path  TEXT NOT NULL
);

CREATE INDEX prd_runs_run_idx ON prd_runs(run_id);
