-- v0.1 sqlite schema. Every persisted table carries `student_id` as the
-- single tenancy column; v1 promotes this column to a Postgres RLS predicate.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Schema version sentinel. Bumped when the table shape changes incompatibly.
-- The client reads this on boot and drops + recreates the demo db on mismatch
-- (acceptable for v0.1; production migration is out of scope).
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO _meta (key, value) VALUES ('schema_version', '3');

CREATE TABLE IF NOT EXISTS mirror_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL DEFAULT 'demo',
  transcript TEXT NOT NULL,
  validation TEXT NOT NULL,
  inferred_meaning TEXT NOT NULL,
  story_reframe TEXT NOT NULL,
  raw_output_json TEXT NOT NULL,
  -- v0.2 (U1): closed-enum parallax context tag. Defaults to 'school' so existing
  -- call sites in src/db/seed.ts and src/server/persist-mirror.handler.server.ts
  -- keep working through the cutover. U7 (auto-Connector / persistMirror reshape)
  -- and U13 (multi-student seed) should pass an explicit context_type per row.
  context_type TEXT NOT NULL DEFAULT 'school'
    CHECK (context_type IN ('school','family','peer','hobby','civic')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mirror_entries_student ON mirror_entries(student_id, created_at DESC);

-- Tags machinery preserved across the v0.1 -> v0.2 schema bump even though
-- the new Mirror agent does not produce tags. v0.2 may reintroduce
-- agent-driven or user-supplied tags without a migration.
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

-- FTS5 contentless mirror over mirror_entries.story_reframe (the narrative
-- field most useful for past-reflection search). INSERT/UPDATE/DELETE
-- triggers keep it in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS mirror_entries_fts USING fts5(
  story_reframe,
  content='mirror_entries',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS mirror_entries_ai AFTER INSERT ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(rowid, story_reframe) VALUES (new.id, new.story_reframe);
END;

CREATE TRIGGER IF NOT EXISTS mirror_entries_ad AFTER DELETE ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(mirror_entries_fts, rowid, story_reframe) VALUES ('delete', old.id, old.story_reframe);
END;

CREATE TRIGGER IF NOT EXISTS mirror_entries_au AFTER UPDATE ON mirror_entries BEGIN
  INSERT INTO mirror_entries_fts(mirror_entries_fts, rowid, story_reframe) VALUES ('delete', old.id, old.story_reframe);
  INSERT INTO mirror_entries_fts(rowid, story_reframe) VALUES (new.id, new.story_reframe);
END;

-- v0.2 (U1): VIPS storage layer ---------------------------------------------
-- One compiled-truth row per (student_id, dimension). The dimension enum is a
-- closed set per R2; the canonical taxonomy fixture (U2) carries the labels.
CREATE TABLE IF NOT EXISTS vips_pages (
  student_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  compiled_truth TEXT NOT NULL,
  open_question TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_vips_pages_student ON vips_pages(student_id, updated_at DESC);

-- Many timeline entries per (student_id, dimension). `parallax_tag_json` is a
-- JSON array of context_type strings; decoded + Zod-validated on read.
-- `forgotten_at` is the soft-forget marker; R19 excludes forgotten rows from
-- hybrid retrieval via a DELETE from the FTS5 mirror below (contentless tables
-- cannot use a WHERE predicate to filter).
CREATE TABLE IF NOT EXISTS vips_timeline_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  canonical_claim_id TEXT NOT NULL,
  verbatim_quote TEXT NOT NULL,
  reflection_id INTEGER,
  strength TEXT NOT NULL CHECK (strength IN ('low','medium','high')),
  parallax_tag_json TEXT NOT NULL,
  reinforces_id INTEGER,
  forgotten_at TEXT,
  committed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reflection_id) REFERENCES mirror_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (reinforces_id) REFERENCES vips_timeline_entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vips_timeline_student_dim
  ON vips_timeline_entries(student_id, dimension, committed_at DESC);

-- Staging table for Connector-emitted diffs awaiting student confirm.
-- The row is the source of truth between Connector emission and confirm/forget.
CREATE TABLE IF NOT EXISTS vips_proposed_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  mirror_entry_id INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  verifier_result_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','forgotten')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  FOREIGN KEY (mirror_entry_id) REFERENCES mirror_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vips_proposed_diffs_student_status
  ON vips_proposed_diffs(student_id, status, created_at DESC);

-- Separate from vips_pages so updates don't touch the compiled-truth row's
-- updated_at — R20 records the forget count without surfacing it to agents.
CREATE TABLE IF NOT EXISTS vips_forget_count (
  student_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, dimension)
);

CREATE TABLE IF NOT EXISTS cartographer_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  trajectory_text TEXT NOT NULL,
  pathways_json TEXT NOT NULL,
  open_questions_json TEXT NOT NULL,
  disclaimer TEXT NOT NULL,
  raw_output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cartographer_outputs_student
  ON cartographer_outputs(student_id, created_at DESC);

-- FTS5 contentless mirror over vips_timeline_entries.verbatim_quote. AI/AD/AU
-- triggers mirror the mirror_entries_fts pattern above. The forget path issues
-- a DELETE from the timeline row, which fires the AD trigger and removes the
-- row from the FTS index — that's how R19 ("excluded from hybrid retrieval")
-- is implemented. Soft-forget (setting forgotten_at) issues an additional
-- explicit FTS5 'delete' command from code; see queries.ts forgetVipsTimelineEntry.
CREATE VIRTUAL TABLE IF NOT EXISTS vips_timeline_entries_fts USING fts5(
  verbatim_quote,
  content='vips_timeline_entries',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS vips_timeline_entries_ai AFTER INSERT ON vips_timeline_entries BEGIN
  INSERT INTO vips_timeline_entries_fts(rowid, verbatim_quote) VALUES (new.id, new.verbatim_quote);
END;

CREATE TRIGGER IF NOT EXISTS vips_timeline_entries_ad AFTER DELETE ON vips_timeline_entries BEGIN
  INSERT INTO vips_timeline_entries_fts(vips_timeline_entries_fts, rowid, verbatim_quote) VALUES ('delete', old.id, old.verbatim_quote);
END;

CREATE TRIGGER IF NOT EXISTS vips_timeline_entries_au AFTER UPDATE ON vips_timeline_entries BEGIN
  INSERT INTO vips_timeline_entries_fts(vips_timeline_entries_fts, rowid, verbatim_quote) VALUES ('delete', old.id, old.verbatim_quote);
  INSERT INTO vips_timeline_entries_fts(rowid, verbatim_quote) VALUES (new.id, new.verbatim_quote);
END;
