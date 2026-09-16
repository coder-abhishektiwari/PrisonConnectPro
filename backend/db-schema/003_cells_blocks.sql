CREATE TABLE cells (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_cells_prison ON cells (prison_id);

CREATE TABLE blocks (
  id            TEXT PRIMARY KEY,
  prison_id     TEXT REFERENCES prisons(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_blocks_prison ON blocks (prison_id);
