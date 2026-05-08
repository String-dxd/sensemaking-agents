-- v0.1 sqlite schema. Every persisted table carries `student_id` as the
-- single tenancy column; v1 promotes this column to a Postgres RLS predicate.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS mirror_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL DEFAULT 'demo',
  summary TEXT NOT NULL,
  transcript TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  caution TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mirror_entries_student ON mirror_entries(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(student_id, label)
);

CREATE TABLE IF NOT EXISTS mirror_entry_tags (
  entry_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES mirror_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connector_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL DEFAULT 'demo',
  patterns_json TEXT NOT NULL,
  still_unclear TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_connector_outputs_student ON connector_outputs(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pathfinder_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL DEFAULT 'demo',
  trajectory TEXT NOT NULL,
  pathways_json TEXT NOT NULL,
  disclaimer TEXT NOT NULL,
  connector_output_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (connector_output_id) REFERENCES connector_outputs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_outputs_student ON pathfinder_outputs(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('mirror', 'connector', 'pathfinder')),
  ref_table TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  trace_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_ref ON agent_traces(ref_table, ref_id);

-- FTS5 contentless mirror over mirror_entries.summary. INSERT/UPDATE/DELETE
-- triggers below keep it in sync. Search is via `MATCH`.
CREATE VIRTUAL TABLE IF NOT EXISTS mirror_entries_fts USING fts5(
  summary,
  content='mirror_entries',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS mirror_entries_ai AFTER INSERT ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(rowid, summary) VALUES (new.id, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS mirror_entries_ad AFTER DELETE ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(mirror_entries_fts, rowid, summary) VALUES ('delete', old.id, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS mirror_entries_au AFTER UPDATE ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(mirror_entries_fts, rowid, summary) VALUES ('delete', old.id, old.summary);
  INSERT INTO mirror_entries_fts(rowid, summary) VALUES (new.id, new.summary);
END;
