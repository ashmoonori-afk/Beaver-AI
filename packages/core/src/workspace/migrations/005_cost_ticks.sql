-- v0.2 M3.4 — Live cost counter.
--
-- One row per token-usage update from a coder adapter, bucketed at
-- whatever cadence the adapter reports. The renderer aggregates rows
-- on demand so we don't pre-compute totals here.

CREATE TABLE cost_ticks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  ts           TEXT NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  tokens_in    INTEGER NOT NULL,
  tokens_out   INTEGER NOT NULL,
  usd          REAL NOT NULL
);

CREATE INDEX cost_ticks_run_idx ON cost_ticks(run_id);
CREATE INDEX cost_ticks_run_id_idx ON cost_ticks(run_id, id);
