// Drizzle TypeScript schema — source of truth for Postgres (Neon).
// Replaces v0.1 `schema.sql` per docs/plans/_archive/2026-05-12-002-feat-managed-agents-full-migration-plan.md §5.1.
//
// Every table that carries `student_id` enables RLS with a policy that compares
// against the `app.student_id` GUC set inside `withStudent` (see src/db/client.ts).
// Cross-tenant reads require an out-of-band query (none currently exist).

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
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
    /** Optional short display title (e.g. demo corpus section headings). */
    title: text('title'),
    /**
     * Idempotency key from the Student Space client (the engine's local capture
     * id). Present for student-space submits; NULL for seeds, imports, and other
     * insert paths. Unique per student so a retry of the same capture returns the
     * existing row instead of duplicating the reflection.
     */
    localCaptureId: text('local_capture_id'),
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
    uniqueIndex('mirror_entries_student_local_capture_uq').on(t.studentId, t.localCaptureId),
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

// ---------------------------------------------------------------------------
// student_memory_stores — 1:1 mapping of studentId → Anthropic memory_store_id
// (`memstore_...`). No RLS: the handler resolves it before any tenant-scoped
// transaction opens (same posture as `counselor_students`). The mapping is
// effectively immutable — once a store is provisioned for a student, every
// future session binds the same store via `resources[]` so the agent's
// `/mnt/memory/*.md` content carries forward across runs.
// ---------------------------------------------------------------------------

export const studentMemoryStores = pgTable('student_memory_stores', {
  studentId: text('student_id').primaryKey(),
  memoryStoreId: text('memory_store_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// student_memory_files — per-(studentId, filePath) write counter + cached
// Anthropic `mem_...` id. Drives the "snapshot every 20 ops" cadence in
// `appendStudentMemory` and avoids a `memories.list()` call on every write
// (the cached `memory_id` lets us go straight to retrieve/update).
//
// RLS-enforced: rows here describe a student's memory state and must never
// leak across tenants. The advisory lock used by `appendStudentMemory` only
// serializes concurrent writes — it does NOT exempt this table from RLS.
// ---------------------------------------------------------------------------

export const studentMemoryFiles = pgTable(
  'student_memory_files',
  {
    studentId: text('student_id').notNull(),
    filePath: text('file_path').notNull(),
    // Monotonic count of `appendStudentMemory` writes against this file.
    // Every Nth write (N = 20) inserts a `memory_snapshots` row with
    // `version = opCount` — the snapshot version is the op count it captured.
    opCount: integer('op_count').notNull().default(0),
    // Cached Anthropic memory id (`mem_...`). Null until the first write,
    // populated thereafter so subsequent writes skip a list/lookup.
    memoryId: text('memory_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.filePath] }),
    pgPolicy('student_memory_files_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_share_tokens — public-share token rows. One row per minted link; revoke
// is soft (sets revoked_at). The public route looks up tokens via a hand-
// authored SECURITY DEFINER function (`share_token_resolve`) appended to the
// migration SQL — see docs/plans/2026-05-18-005-feat-profile-redesign-share-plan.md
// U2. Drizzle generates the table + RLS; the function is hand-authored
// because Drizzle Kit does not emit SECURITY DEFINER functions.
//
// No counselor bypass — students-only on insert/update. The RLS policy uses
// the same GUC-equality predicate as every other student-scoped table.
// ---------------------------------------------------------------------------

export const vipsShareTokens = pgTable(
  'vips_share_tokens',
  {
    token: text('token').primaryKey(),
    studentId: text('student_id').notNull(),
    showQuotes: boolean('show_quotes').notNull().default(false),
    // Sanitised display name frozen at insert time, sourced from WorkOS
    // profile fields via `sanitizeNameSnapshot()` in src/lib/share-token.ts.
    // Never updated post-insert — the snapshot is part of the link's identity.
    nameSnapshot: text('name_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [
    index('idx_vips_share_tokens_student').on(t.studentId),
    pgPolicy('vips_share_tokens_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// vips_island_snapshots — periodic server-side snapshots of the engine's
// Sprouts slice payload, for the year-over-year growth timelapse.
//
// Today the engine's `Sprouts.bloomedTrees` lives in localStorage only — wipe
// local state and the island resets to its seed. A timelapse over years
// requires server-authoritative history, so this table starts logging now;
// the growth view falls back to claim-history synthesis for any year before
// snapshotting began. See docs/plans/2026-05-19-001-feat-year-over-year-
// growth-monitoring-plan.md U2 + U5.
//
// `payload_json` is the verbatim output of `Sprouts.serialize()` — slice
// owns the shape, the migration row is a transport container. No projection,
// no per-row tables for individual bloomed trees: that would couple the
// schema to the engine's evolving in-memory model.
// ---------------------------------------------------------------------------

export const vipsIslandSnapshots = pgTable(
  'vips_island_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    payloadJson: text('payload_json').notNull(),
  },
  (t) => [
    index('idx_vips_island_snapshots_student').on(t.studentId, t.capturedAt.desc()),
    pgPolicy('vips_island_snapshots_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()

// ---------------------------------------------------------------------------
// my_world_faq_* — system-scoped public FAQ publication + editor sessions.
//
// These three tables intentionally do not carry student_id and do not use
// student RLS. They are reachable only through the narrow server-only FAQ
// repository; route code must not access them directly.
// ---------------------------------------------------------------------------

export const myWorldFaqRevisions = pgTable(
  'my_world_faq_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageKey: text('page_key').notNull(),
    version: integer('version').notNull(),
    document: jsonb('document').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    structureVersion: integer('structure_version').notNull(),
    canonicalDigest: text('canonical_digest').notNull(),
    attributionKind: text('attribution_kind').notNull(),
    savedByName: text('saved_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    restoredFromRevisionId: uuid('restored_from_revision_id').references(
      (): AnyPgColumn => myWorldFaqRevisions.id,
      { onDelete: 'restrict' },
    ),
    attemptId: uuid('attempt_id').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
  },
  (t) => [
    check('my_world_faq_revisions_page_key_check', sql`${t.pageKey} = 'my-world-faq'`),
    check('my_world_faq_revisions_version_check', sql`${t.version} > 0`),
    check('my_world_faq_revisions_schema_version_check', sql`${t.schemaVersion} > 0`),
    check('my_world_faq_revisions_structure_version_check', sql`${t.structureVersion} > 0`),
    check(
      'my_world_faq_revisions_document_object_check',
      sql`jsonb_typeof(${t.document}) = 'object'`,
    ),
    check('my_world_faq_revisions_digest_check', sql`${t.canonicalDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      'my_world_faq_revisions_fingerprint_check',
      sql`${t.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'my_world_faq_revisions_attribution_check',
      sql`(${t.attributionKind} = 'system-import' and ${t.savedByName} is null)
          or (${t.attributionKind} = 'self-declared'
              and ${t.savedByName} is not null
              and length(btrim(${t.savedByName})) between 1 and 80)`,
    ),
    unique('my_world_faq_revisions_page_version_uq').on(t.pageKey, t.version),
    unique('my_world_faq_revisions_page_attempt_uq').on(t.pageKey, t.attemptId),
    unique('my_world_faq_revisions_head_pointer_uq').on(
      t.pageKey,
      t.id,
      t.version,
      t.canonicalDigest,
    ),
    index('idx_my_world_faq_revisions_page_version').on(t.pageKey, t.version.desc()),
  ],
)

export const myWorldFaqHeads = pgTable(
  'my_world_faq_heads',
  {
    pageKey: text('page_key').primaryKey(),
    currentRevisionId: uuid('current_revision_id').notNull(),
    currentVersion: integer('current_version').notNull(),
    currentDigest: text('current_digest').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('my_world_faq_heads_page_key_check', sql`${t.pageKey} = 'my-world-faq'`),
    check('my_world_faq_heads_version_check', sql`${t.currentVersion} > 0`),
    check('my_world_faq_heads_digest_check', sql`${t.currentDigest} ~ '^[0-9a-f]{64}$'`),
    foreignKey({
      name: 'my_world_faq_heads_revision_fk',
      columns: [t.pageKey, t.currentRevisionId, t.currentVersion, t.currentDigest],
      foreignColumns: [
        myWorldFaqRevisions.pageKey,
        myWorldFaqRevisions.id,
        myWorldFaqRevisions.version,
        myWorldFaqRevisions.canonicalDigest,
      ],
    }).onDelete('restrict'),
  ],
)

export const myWorldFaqEditorSessions = pgTable(
  'my_world_faq_editor_sessions',
  {
    tokenDigest: text('token_digest').primaryKey(),
    auditId: uuid('audit_id').defaultRandom().notNull(),
    displayName: text('display_name').notNull(),
    credentialFingerprint: text('credential_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    mutationWindowStartedAt: timestamp('mutation_window_started_at', {
      withTimezone: true,
      mode: 'string',
    })
      .notNull()
      .defaultNow(),
    mutationCount: integer('mutation_count').notNull().default(0),
  },
  (t) => [
    check(
      'my_world_faq_editor_sessions_token_digest_check',
      sql`${t.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'my_world_faq_editor_sessions_credential_fingerprint_check',
      sql`${t.credentialFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'my_world_faq_editor_sessions_display_name_check',
      sql`length(btrim(${t.displayName})) between 1 and 80`,
    ),
    check(
      'my_world_faq_editor_sessions_time_order_check',
      sql`${t.absoluteExpiresAt} > ${t.createdAt}
          and ${t.lastSeenAt} >= ${t.createdAt}
          and ${t.mutationWindowStartedAt} >= ${t.createdAt}`,
    ),
    check(
      'my_world_faq_editor_sessions_mutation_count_check',
      sql`${t.mutationCount} between 0 and 10`,
    ),
    unique('my_world_faq_editor_sessions_audit_id_uq').on(t.auditId),
    index('idx_my_world_faq_editor_sessions_active_expiry')
      .on(t.absoluteExpiresAt, t.lastSeenAt)
      .where(sql`${t.revokedAt} is null`),
    index('idx_my_world_faq_editor_sessions_revoked')
      .on(t.revokedAt)
      .where(sql`${t.revokedAt} is not null`),
  ],
)

// ---------------------------------------------------------------------------
// my_world_faq_feedback — anonymous questions, concerns, suggestions and compliments.
//
// The public form asks for no name, email or account identifier. Rows are
// published on the FAQ immediately and remain visible in the protected editor
// inbox. A one-time removal token lets the submitting browser delete its own
// row without creating an identity.
// ---------------------------------------------------------------------------

export const myWorldFaqFeedback = pgTable(
  'my_world_faq_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    deleteTokenHash: text('delete_token_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'my_world_faq_feedback_kind_check',
      sql`${t.kind} in ('question', 'concern', 'suggestion', 'compliment')`,
    ),
    check(
      'my_world_faq_feedback_message_check',
      sql`length(btrim(${t.message})) between 1 and 2000`,
    ),
    check(
      'my_world_faq_feedback_delete_token_hash_check',
      sql`${t.deleteTokenHash} is null or length(${t.deleteTokenHash}) = 64`,
    ),
    index('idx_my_world_faq_feedback_created').on(t.createdAt.desc()),
  ],
)
