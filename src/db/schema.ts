// Drizzle TypeScript schema — source of truth for Postgres (Neon).
// Replaces v0.1 `schema.sql` per plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md §5.1.
//
// Every table that carries `student_id` enables RLS with a policy that compares
// against the `app.student_id` GUC set inside `withStudent` (see src/db/client.ts).
// Cross-tenant reads require an out-of-band query (none currently exist).

import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// `tsvector` has no built-in Drizzle type; declare via customType.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// Closed VIPS dimension enum used by three tables.
const VIPS_DIMENSION_CHECK = sql.raw("dimension IN ('values','interests','personality','skills')")

// Closed VIPS parallax context enum for mirror_entries.context_type.
const CONTEXT_TYPE_CHECK = sql.raw("context_type IN ('school','family','peer','hobby','civic')")

// RLS predicate: comparison against the per-transaction GUC.
const RLS_STUDENT_PREDICATE = sql`student_id = current_setting('app.student_id', true)`

// ---------------------------------------------------------------------------
// counselor_students — many-to-many counselor↔student mapping.
// Authoritative source for "does this counselor have access to this student"
// before setting the RLS GUC. No RLS on this table: the handler queries it
// without a student_id in scope (it's the gate to setting one).
// ---------------------------------------------------------------------------

export const counselorStudents = pgTable(
  'counselor_students',
  {
    counselorId: text('counselor_id').notNull(),
    studentId: text('student_id').notNull(),
    attachedAt: timestamp('attached_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.counselorId, t.studentId] })],
)

// ---------------------------------------------------------------------------
// mirror_entries — one row per recorded reflection.
// ---------------------------------------------------------------------------

export const mirrorEntries = pgTable(
  'mirror_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // No default — RLS + withStudent envelope always supplies student_id; missing-studentId should fail loud, not silently land in 'demo'.
    studentId: text('student_id').notNull(),
    transcript: text('transcript').notNull(),
    validation: text('validation').notNull(),
    inferredMeaning: text('inferred_meaning').notNull(),
    storyReframe: text('story_reframe').notNull(),
    rawOutputJson: text('raw_output_json').notNull(),
    contextType: text('context_type').notNull().default('school'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    storyReframeTsv: tsvector('story_reframe_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', story_reframe)`,
    ),
  },
  (t) => [
    check('mirror_entries_context_type_check', CONTEXT_TYPE_CHECK),
    index('idx_mirror_entries_student').on(t.studentId, t.createdAt.desc()),
    index('idx_mirror_entries_story_reframe_tsv').using('gin', t.storyReframeTsv),
    pgPolicy('mirror_entries_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// tags + mirror_entry_tags — preserved across v0.1→v0.2 even though the new
// Mirror agent does not produce tags.
// ---------------------------------------------------------------------------

export const tags = pgTable(
  'tags',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    label: text('label').notNull(),
  },
  (t) => [
    uniqueIndex('tags_student_label_uq').on(t.studentId, t.label),
    pgPolicy('tags_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

export const mirrorEntryTags = pgTable(
  'mirror_entry_tags',
  {
    entryId: bigint('entry_id', { mode: 'number' })
      .notNull()
      .references(() => mirrorEntries.id, { onDelete: 'cascade' }),
    tagId: bigint('tag_id', { mode: 'number' })
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] })],
)

// ---------------------------------------------------------------------------
// connector_outputs — one row per Connector synthesis.
// ---------------------------------------------------------------------------

export const connectorOutputs = pgTable(
  'connector_outputs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // No default — RLS + withStudent envelope always supplies student_id; missing-studentId should fail loud, not silently land in 'demo'.
    studentId: text('student_id').notNull(),
    patternsJson: text('patterns_json').notNull(),
    stillUnclear: text('still_unclear'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_connector_outputs_student').on(t.studentId, t.createdAt.desc()),
    pgPolicy('connector_outputs_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// pathfinder_outputs — legacy v0.1 table, kept queryable through cutover.
// ---------------------------------------------------------------------------

export const pathfinderOutputs = pgTable(
  'pathfinder_outputs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // No default — RLS + withStudent envelope always supplies student_id; missing-studentId should fail loud, not silently land in 'demo'.
    studentId: text('student_id').notNull(),
    trajectory: text('trajectory').notNull(),
    pathwaysJson: text('pathways_json').notNull(),
    disclaimer: text('disclaimer').notNull(),
    connectorOutputId: bigint('connector_output_id', { mode: 'number' }).references(
      () => connectorOutputs.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_pathfinder_outputs_student').on(t.studentId, t.createdAt.desc()),
    pgPolicy('pathfinder_outputs_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// agent_traces — per-agent execution trace blobs.
// ---------------------------------------------------------------------------

export const agentTraces = pgTable(
  'agent_traces',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    agent: text('agent').notNull(),
    refTable: text('ref_table').notNull(),
    refId: bigint('ref_id', { mode: 'number' }).notNull(),
    traceJson: text('trace_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'agent_traces_agent_check',
      sql.raw("agent IN ('mirror','connector','pathfinder','cartographer')"),
    ),
    index('idx_agent_traces_ref').on(t.refTable, t.refId),
    pgPolicy('agent_traces_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_pages — one compiled-truth row per (student_id, dimension).
// ---------------------------------------------------------------------------

export const vipsPages = pgTable(
  'vips_pages',
  {
    studentId: text('student_id').notNull(),
    dimension: text('dimension').notNull(),
    compiledTruth: text('compiled_truth').notNull(),
    openQuestion: text('open_question').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.dimension] }),
    check('vips_pages_dimension_check', VIPS_DIMENSION_CHECK),
    index('idx_vips_pages_student').on(t.studentId, t.updatedAt.desc()),
    pgPolicy('vips_pages_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_timeline_entries — many timeline rows per (student_id, dimension).
// `parallax_tag_json` round-trips through JSON; `forgotten_at` is soft-forget.
// ---------------------------------------------------------------------------

export const vipsTimelineEntries = pgTable(
  'vips_timeline_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    dimension: text('dimension').notNull(),
    canonicalClaimId: text('canonical_claim_id').notNull(),
    verbatimQuote: text('verbatim_quote').notNull(),
    reflectionId: bigint('reflection_id', { mode: 'number' }).references(() => mirrorEntries.id, {
      onDelete: 'set null',
    }),
    strength: text('strength').notNull(),
    parallaxTagJson: text('parallax_tag_json').notNull(),
    // Self-reference: the FK target is the same table, so we declare the
    // constraint via `foreignKey` in the table-modifier callback below
    // (column-level `.references` cannot name its own table at column-init
    // time). v0.1 SQL was `FOREIGN KEY (reinforces_id) REFERENCES
    // vips_timeline_entries(id) ON DELETE SET NULL`.
    reinforcesId: bigint('reinforces_id', { mode: 'number' }),
    forgottenAt: timestamp('forgotten_at', { withTimezone: true, mode: 'string' }),
    committedAt: timestamp('committed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    verbatimQuoteTsv: tsvector('verbatim_quote_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', verbatim_quote)`,
    ),
  },
  (t) => [
    check('vips_timeline_dimension_check', VIPS_DIMENSION_CHECK),
    check('vips_timeline_strength_check', sql.raw("strength IN ('low','medium','high')")),
    index('idx_vips_timeline_student_dim').on(t.studentId, t.dimension, t.committedAt.desc()),
    index('idx_vips_timeline_verbatim_quote_tsv').using('gin', t.verbatimQuoteTsv),
    foreignKey({
      columns: [t.reinforcesId],
      foreignColumns: [t.id],
      name: 'vips_timeline_entries_reinforces_id_fkey',
    }).onDelete('set null'),
    pgPolicy('vips_timeline_entries_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_proposed_diffs — staging table for Connector-emitted diffs.
// Partial unique index enforces at-most-one pending row per student (R30).
// ---------------------------------------------------------------------------

export const vipsProposedDiffs = pgTable(
  'vips_proposed_diffs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    mirrorEntryId: bigint('mirror_entry_id', { mode: 'number' })
      .notNull()
      .references(() => mirrorEntries.id, { onDelete: 'cascade' }),
    payloadJson: text('payload_json').notNull(),
    verifierResultJson: text('verifier_result_json').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [
    check(
      'vips_proposed_diffs_status_check',
      sql.raw("status IN ('pending','confirmed','forgotten')"),
    ),
    index('idx_vips_proposed_diffs_student_status').on(t.studentId, t.status, t.createdAt.desc()),
    uniqueIndex('vips_proposed_diffs_pending_per_student')
      .on(t.studentId)
      .where(sql`status = 'pending'`),
    pgPolicy('vips_proposed_diffs_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_forget_count — per-(student, dimension) forget counter (R20).
// ---------------------------------------------------------------------------

export const vipsForgetCount = pgTable(
  'vips_forget_count',
  {
    studentId: text('student_id').notNull(),
    dimension: text('dimension').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.dimension] }),
    check('vips_forget_count_dimension_check', VIPS_DIMENSION_CHECK),
    pgPolicy('vips_forget_count_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// cartographer_outputs — long-horizon synthesis from Cartographer.
// ---------------------------------------------------------------------------

export const cartographerOutputs = pgTable(
  'cartographer_outputs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    trajectoryText: text('trajectory_text').notNull(),
    pathwaysJson: text('pathways_json').notNull(),
    openQuestionsJson: text('open_questions_json').notNull(),
    disclaimer: text('disclaimer').notNull(),
    rawOutputJson: text('raw_output_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_cartographer_outputs_student').on(t.studentId, t.createdAt.desc()),
    pgPolicy('cartographer_outputs_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// agent_sessions — every Managed Agents session, recorded for nightly sweep
// + PDPA audit. counselor_id captures who triggered the session.
// ---------------------------------------------------------------------------

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    counselorId: text('counselor_id'),
    agentId: text('agent_id').notNull(),
    agentVersion: text('agent_version').notNull(),
    envVersion: text('env_version'),
    anthropicSessionId: text('anthropic_session_id').notNull(),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [
    check(
      'agent_sessions_status_check',
      sql.raw("status IN ('running','idle','archived','failed')"),
    ),
    index('idx_agent_sessions_status_started').on(t.status, t.startedAt.desc()),
    uniqueIndex('agent_sessions_anthropic_session_id_uq').on(t.anthropicSessionId),
    pgPolicy('agent_sessions_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// memory_snapshots — periodic snapshot of /mnt/memory/*.md per student
// (insurance against 30-day Anthropic retention).
// ---------------------------------------------------------------------------

export const memorySnapshots = pgTable(
  'memory_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    filePath: text('file_path').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // (student_id, file_path, version) must be unique — duplicate snapshots
    // from botched retries would corrupt the rolling-version invariant.
    uniqueIndex('idx_memory_snapshots_student_file_version').on(t.studentId, t.filePath, t.version),
    pgPolicy('memory_snapshots_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()
