// Drizzle-backed query layer for Postgres (Neon). Replaces the v0.1
// better-sqlite3 implementation per docs/plans/_archive/2026-05-12-002-feat-managed-agents-full-migration-plan.md §5.
//
// Every public function preserves its v0.1 signature
//   (studentId: string, input, opts?: { ctx?: TenantContext }) => Promise<…>
// but is now async. When `opts.ctx` is supplied, the function reuses the
// caller's transaction (via `ctx.db`); when omitted, it opens its own
// `withStudent(studentId, …)` envelope. Postgres rejects nested transactions,
// so we never call `withStudent` inside another `withStudent` — the inner
// `*Inner` helpers just take `ctx` and run.
//
// Row-level security enforces `student_id = current_setting('app.student_id')`
// on every tenancy-scoped table. The query layer still keeps explicit
// student_id predicates on reads/updates as a belt-and-suspenders guard for
// local/dev databases whose connection role may own the tables and therefore
// bypass non-FORCE RLS.

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { VipsClaimStrength, VipsContextType } from '~/agents/tools/schemas'
import { getDbForMemoryModule, type TenantContext, withStudent } from './client'
import {
  agentTraces,
  cartographerOutputs,
  connectorOutputs,
  mirrorEntries,
  mirrorEntryTags,
  pathfinderOutputs,
  tags,
  vipsForgetCount,
  vipsPages,
  vipsProposedDiffs,
  vipsTimelineEntries,
} from './schema'

/**
 * Drizzle's `.returning()` and `.select().limit(1)` both yield arrays whose
 * first element is `T | undefined`. Callers that have already proven the row
 * exists (post-insert, or after a `length === 0` early return) use this to
 * narrow the type without a bare `!` non-null assertion.
 */
function requireRow<T>(rows: readonly T[], context: string): T {
  const row = rows[0]
  if (row === undefined) {
    throw new Error(`requireRow: ${context} returned no rows`)
  }
  return row
}

// ---------------------------------------------------------------------------
// Public row types — preserve the v0.1 surface exactly. Call sites depend on
// these field names and string-literal unions.
// ---------------------------------------------------------------------------

export type { VipsClaimStrength, VipsContextType }

export interface MirrorEntryRow {
  id: number
  student_id: string
  transcript: string
  /** Optional short display title (e.g. demo corpus section headings). */
  title?: string | null
  validation: string
  inferred_meaning: string
  story_reframe: string
  /** The un-edited Mirror agent output, preserved for the R20 ablation. */
  raw_output_json: string
  /**
   * U7: VIPS parallax context the student chose at Stop time. Default
   * `'school'` when not supplied; the DB CHECK enforces the closed enum.
   */
  context_type: VipsContextType
  review_status: MirrorReviewStatus
  tags: string[]
  created_at: string
}

export interface MirrorSearchResult {
  id: number
  story_reframe: string
  tags: string[]
  created_at: string
  score: number
}

export interface ConnectorPattern {
  text: string
  strength: 'low' | 'medium' | 'high'
  evidence_reflection_ids: number[]
}

export interface ConnectorOutputRow {
  id: number
  student_id: string
  patterns: ConnectorPattern[]
  still_unclear: string | null
  created_at: string
}

export interface PathfinderPathway {
  label: string
  reasoning: string
  ecg_taxonomy_ids: string[]
}

export interface PathfinderOutputRow {
  id: number
  student_id: string
  trajectory: string
  pathways: PathfinderPathway[]
  disclaimer: string
  connector_output_id: number | null
  created_at: string
}

/**
 * v0.2 (U10/U11): `'cartographer'` is the new agent label and writes into
 * `cartographer_outputs`. The CHECK constraint on `agent_traces.agent` was
 * widened in U10 to admit both `'pathfinder'` (legacy chain) and
 * `'cartographer'` (U11 manual sense-making). Legacy 'pathfinder' rows remain
 * queryable; new Cartographer rows write with `'cartographer'`.
 */
export type AgentName = 'mirror' | 'connector' | 'pathfinder' | 'cartographer'
export type AgentRefTable =
  | 'mirror_entries'
  | 'connector_outputs'
  | 'pathfinder_outputs'
  | 'cartographer_outputs'
export type MirrorEditableField = 'validation' | 'inferred_meaning' | 'story_reframe'
export type MirrorReviewStatus = 'pending' | 'confirmed' | 'forgotten'

const MIRROR_CONFIRMED_TAG = 'system:mirror-confirmed'
const MIRROR_FORGOTTEN_TAG = 'system:mirror-forgotten'
const MIRROR_REVIEW_TAGS = [MIRROR_CONFIRMED_TAG, MIRROR_FORGOTTEN_TAG] as const

// ---------------------------------------------------------------------------
// Internal row shapes — what Drizzle hands back before JSON-blob inflation.
// ---------------------------------------------------------------------------

interface MirrorEntryDbRow {
  id: number
  student_id: string
  transcript: string
  title: string | null
  validation: string
  inferred_meaning: string
  story_reframe: string
  raw_output_json: string
  context_type: VipsContextType
  created_at: string
}

interface ConnectorOutputDbRow {
  id: number
  student_id: string
  patterns_json: string
  still_unclear: string | null
  created_at: string
}

interface PathfinderOutputDbRow {
  id: number
  student_id: string
  trajectory: string
  pathways_json: string
  disclaimer: string
  connector_output_id: number | null
  created_at: string
}

interface VipsTimelineEntryDbRow {
  id: number
  student_id: string
  dimension: string
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id: number | null
  strength: VipsClaimStrength
  parallax_tag_json: string
  reinforces_id: number | null
  forgotten_at: string | null
  committed_at: string
}

interface VipsProposedDiffDbRow {
  id: number
  student_id: string
  mirror_entry_id: number
  payload_json: string
  verifier_result_json: string
  status: VipsProposedDiffStatus
  created_at: string
  reviewed_at: string | null
}

interface CartographerOutputDbRow {
  id: number
  student_id: string
  trajectory_text: string
  pathways_json: string
  open_questions_json: string
  disclaimer: string
  raw_output_json: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Drizzle row → API row translators (JSON blob inflation lives here).
// ---------------------------------------------------------------------------

function rowToMirrorEntry(row: MirrorEntryDbRow, entryTags: string[]): MirrorEntryRow {
  const review_status: MirrorReviewStatus = entryTags.includes(MIRROR_FORGOTTEN_TAG)
    ? 'forgotten'
    : entryTags.includes(MIRROR_CONFIRMED_TAG)
      ? 'confirmed'
      : 'pending'
  return {
    id: row.id,
    student_id: row.student_id,
    transcript: row.transcript,
    title: row.title,
    validation: row.validation,
    inferred_meaning: row.inferred_meaning,
    story_reframe: row.story_reframe,
    raw_output_json: row.raw_output_json,
    context_type: row.context_type,
    review_status,
    tags: entryTags.filter((tag) => !isMirrorReviewTag(tag)),
    created_at: row.created_at,
  }
}

function isMirrorReviewTag(tag: string): boolean {
  return (MIRROR_REVIEW_TAGS as readonly string[]).includes(tag)
}

function rowToVipsTimelineEntry(row: VipsTimelineEntryDbRow): VipsTimelineEntryRow {
  return {
    id: row.id,
    student_id: row.student_id,
    dimension: row.dimension,
    canonical_claim_id: row.canonical_claim_id,
    verbatim_quote: row.verbatim_quote,
    reflection_id: row.reflection_id,
    strength: row.strength,
    parallax_tag: JSON.parse(row.parallax_tag_json) as VipsContextType[],
    reinforces_id: row.reinforces_id,
    forgotten_at: row.forgotten_at,
    committed_at: row.committed_at,
  }
}

function rowToVipsProposedDiff(row: VipsProposedDiffDbRow): VipsProposedDiffRow {
  return {
    id: row.id,
    student_id: row.student_id,
    mirror_entry_id: row.mirror_entry_id,
    payload: JSON.parse(row.payload_json),
    verifier_result: JSON.parse(row.verifier_result_json),
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
  }
}

function rowToCartographerOutput(row: CartographerOutputDbRow): CartographerOutputRow {
  return {
    id: row.id,
    student_id: row.student_id,
    trajectory_text: row.trajectory_text,
    pathways: JSON.parse(row.pathways_json) as CartographerPathway[],
    open_questions: JSON.parse(row.open_questions_json) as string[],
    disclaimer: row.disclaimer,
    raw_output_json: row.raw_output_json,
    created_at: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — operate on an open TenantContext. RLS scopes the tenant;
// explicit student predicates below protect owner-role local/dev databases too.
// ---------------------------------------------------------------------------

async function loadTagsInner(ctx: TenantContext, entryId: number): Promise<string[]> {
  const rows = await ctx.db
    .select({ label: tags.label })
    .from(tags)
    .innerJoin(mirrorEntryTags, eq(mirrorEntryTags.tagId, tags.id))
    .where(and(eq(tags.studentId, ctx.studentId), eq(mirrorEntryTags.entryId, entryId)))
    .orderBy(tags.label)
  return rows.map((r: { label: string }) => r.label)
}

async function upsertTagInner(
  ctx: TenantContext,
  studentId: string,
  label: string,
): Promise<number> {
  // RLS scopes by student already, but the unique index is on
  // (student_id, label) so we must still pass student_id on the insert.
  const existing = await ctx.db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.studentId, studentId), eq(tags.label, label)))
    .limit(1)
  if (existing.length > 0) return requireRow(existing, 'select tag id').id
  const inserted = await ctx.db.insert(tags).values({ studentId, label }).returning({ id: tags.id })
  return requireRow(inserted, 'insert tags').id
}

// ---------------------------------------------------------------------------
// mirror_entries — FTS, list, get, insert, update
// ---------------------------------------------------------------------------

/** tsvector-backed search restricted to one student. */
export async function searchMirrors(
  studentId: string,
  query: string,
  opts: { limit?: number; ctx?: TenantContext } = {},
): Promise<MirrorSearchResult[]> {
  if (query.trim().length === 0) return []
  if (opts.ctx) return searchMirrorsInner(opts.ctx, query, opts.limit ?? 5)
  return withStudent(studentId, (ctx) => searchMirrorsInner(ctx, query, opts.limit ?? 5))
}

async function searchMirrorsInner(
  ctx: TenantContext,
  query: string,
  limit: number,
): Promise<MirrorSearchResult[]> {
  // `plainto_tsquery` tolerates arbitrary user input (no need for the old
  // escapeFtsQuery helper). Postgres ranks DESC for relevance.
  const rows = await ctx.db
    .select({
      id: mirrorEntries.id,
      story_reframe: mirrorEntries.storyReframe,
      created_at: mirrorEntries.createdAt,
      score: sql<number>`ts_rank(${mirrorEntries.storyReframeTsv}, plainto_tsquery('english', ${query}))`,
    })
    .from(mirrorEntries)
    .where(
      and(
        eq(mirrorEntries.studentId, ctx.studentId),
        sql`${mirrorEntries.storyReframeTsv} @@ plainto_tsquery('english', ${query})`,
      ),
    )
    .orderBy(
      sql`ts_rank(${mirrorEntries.storyReframeTsv}, plainto_tsquery('english', ${query})) desc`,
    )
    .limit(limit)

  const out: MirrorSearchResult[] = []
  for (const r of rows) {
    out.push({
      id: r.id,
      story_reframe: r.story_reframe,
      created_at: r.created_at,
      score: r.score,
      tags: await loadTagsInner(ctx, r.id),
    })
  }
  return out
}

export interface InsertMirrorEntryInput {
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  /** Raw, un-edited Mirror agent output (JSON-serializable). Preserved for R20 ablation. */
  raw_output: unknown
  /**
   * U7: closed VIPS parallax context for this reflection. Optional in the
   * input shape so v0.1 call sites that did not pass it remain valid; when
   * omitted, the DB column default (`'school'`) applies. New U7 call sites
   * supply it explicitly from the Context-type picker.
   */
  context_type?: VipsContextType
  tags?: string[]
  trace?: unknown
}

export async function insertMirrorEntry(
  studentId: string,
  input: InsertMirrorEntryInput,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow> {
  if (opts.ctx) return insertMirrorEntryInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertMirrorEntryInner(ctx, studentId, input))
}

async function insertMirrorEntryInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertMirrorEntryInput,
): Promise<MirrorEntryRow> {
  const inserted = await ctx.db
    .insert(mirrorEntries)
    .values({
      studentId,
      transcript: input.transcript,
      validation: input.validation,
      inferredMeaning: input.inferred_meaning,
      storyReframe: input.story_reframe,
      rawOutputJson: JSON.stringify(input.raw_output),
      contextType: input.context_type ?? 'school',
    })
    .returning({ id: mirrorEntries.id })
  const id = requireRow(inserted, 'insert').id

  for (const label of input.tags ?? []) {
    const tagId = await upsertTagInner(ctx, studentId, label)
    await ctx.db.insert(mirrorEntryTags).values({ entryId: id, tagId }).onConflictDoNothing()
  }

  if (input.trace !== undefined) {
    await ctx.db.insert(agentTraces).values({
      studentId,
      agent: 'mirror',
      refTable: 'mirror_entries',
      refId: id,
      traceJson: JSON.stringify(input.trace),
    })
  }

  const rows = await ctx.db
    .select()
    .from(mirrorEntries)
    .where(and(eq(mirrorEntries.studentId, ctx.studentId), eq(mirrorEntries.id, id)))
    .limit(1)
  const row = drizzleMirrorRow(requireRow(rows, 'select mirror_entries'))
  return rowToMirrorEntry(row, await loadTagsInner(ctx, id))
}

export async function listMirrorEntries(
  studentId: string,
  opts: { limit?: number | null; includeForgotten?: boolean; ctx?: TenantContext } = {},
): Promise<MirrorEntryRow[]> {
  const limit = opts.limit === null ? undefined : (opts.limit ?? 50)
  if (opts.ctx) return listMirrorEntriesInner(opts.ctx, limit, opts.includeForgotten)
  return withStudent(studentId, (ctx) => listMirrorEntriesInner(ctx, limit, opts.includeForgotten))
}

async function listMirrorEntriesInner(
  ctx: TenantContext,
  limit: number | undefined,
  includeForgotten = false,
): Promise<MirrorEntryRow[]> {
  const baseQuery = ctx.db
    .select()
    .from(mirrorEntries)
    .where(eq(mirrorEntries.studentId, ctx.studentId))
    .orderBy(desc(mirrorEntries.createdAt))
  const rows = limit === undefined ? await baseQuery : await baseQuery.limit(limit)
  const out: MirrorEntryRow[] = []
  for (const r of rows) {
    const row = drizzleMirrorRow(r)
    const entry = rowToMirrorEntry(row, await loadTagsInner(ctx, row.id))
    if (includeForgotten || entry.review_status !== 'forgotten') {
      out.push(entry)
    }
  }
  return out
}

export async function getMirrorEntry(
  studentId: string,
  id: number,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow | null> {
  if (opts.ctx) return getMirrorEntryInner(opts.ctx, id)
  return withStudent(studentId, (ctx) => getMirrorEntryInner(ctx, id))
}

export async function listUnconnectedMirrorEntries(
  studentId: string,
  opts: { limit?: number; ctx?: TenantContext } = {},
): Promise<MirrorEntryRow[]> {
  if (opts.ctx) return listUnconnectedMirrorEntriesInner(opts.ctx, opts.limit)
  return withStudent(studentId, (ctx) => listUnconnectedMirrorEntriesInner(ctx, opts.limit))
}

async function listUnconnectedMirrorEntriesInner(
  ctx: TenantContext,
  limit: number | undefined,
): Promise<MirrorEntryRow[]> {
  const entries = await listMirrorEntriesInner(ctx, undefined, false)
  const proposedDiffs = await listVipsProposedDiffsInner(ctx, undefined)
  const attemptedMirrorIds = new Set(proposedDiffs.map((diff) => diff.mirror_entry_id))
  const unconnected = entries.filter(
    (entry) => entry.review_status === 'confirmed' && !attemptedMirrorIds.has(entry.id),
  )
  return limit === undefined ? unconnected : unconnected.slice(0, limit)
}

export async function listAttachedStudentIds(): Promise<string[]> {
  const db = getDbForMemoryModule()
  const rows = await db.execute<{ student_id: string }>(
    sql`select distinct student_id from counselor_students order by student_id asc`,
  )
  return rows.rows.map((row) => row.student_id)
}

async function getMirrorEntryInner(ctx: TenantContext, id: number): Promise<MirrorEntryRow | null> {
  const rows = await ctx.db
    .select()
    .from(mirrorEntries)
    .where(and(eq(mirrorEntries.studentId, ctx.studentId), eq(mirrorEntries.id, id)))
    .limit(1)
  if (rows.length === 0) return null
  const row = drizzleMirrorRow(requireRow(rows, 'select mirror_entries'))
  return rowToMirrorEntry(row, await loadTagsInner(ctx, row.id))
}

/**
 * Update one of the three editable Mirror fields. The corresponding
 * `raw_output_json` column is left untouched so the un-edited agent output
 * remains queryable by the ablation harness.
 */
export async function updateMirrorEntryFields(
  studentId: string,
  id: number,
  patch: Partial<Pick<MirrorEntryRow, 'validation' | 'inferred_meaning' | 'story_reframe'>>,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow | null> {
  if (opts.ctx) return updateMirrorEntryFieldsInner(opts.ctx, id, patch)
  return withStudent(studentId, (ctx) => updateMirrorEntryFieldsInner(ctx, id, patch))
}

async function updateMirrorEntryFieldsInner(
  ctx: TenantContext,
  id: number,
  patch: Partial<Pick<MirrorEntryRow, 'validation' | 'inferred_meaning' | 'story_reframe'>>,
): Promise<MirrorEntryRow | null> {
  const set: Record<string, string> = {}
  if (patch.validation !== undefined) set.validation = patch.validation
  if (patch.inferred_meaning !== undefined) set.inferredMeaning = patch.inferred_meaning
  if (patch.story_reframe !== undefined) set.storyReframe = patch.story_reframe
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(mirrorEntries)
      .set(set)
      .where(and(eq(mirrorEntries.studentId, ctx.studentId), eq(mirrorEntries.id, id)))
  }
  return getMirrorEntryInner(ctx, id)
}

export async function updateMirrorEntryContextType(
  studentId: string,
  id: number,
  contextType: VipsContextType,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow | null> {
  if (opts.ctx) return updateMirrorEntryContextTypeInner(opts.ctx, id, contextType)
  return withStudent(studentId, (ctx) => updateMirrorEntryContextTypeInner(ctx, id, contextType))
}

async function updateMirrorEntryContextTypeInner(
  ctx: TenantContext,
  id: number,
  contextType: VipsContextType,
): Promise<MirrorEntryRow | null> {
  await ctx.db
    .update(mirrorEntries)
    .set({ contextType })
    .where(and(eq(mirrorEntries.studentId, ctx.studentId), eq(mirrorEntries.id, id)))
  return getMirrorEntryInner(ctx, id)
}

export async function updateMirrorEntryReviewStatus(
  studentId: string,
  id: number,
  status: Exclude<MirrorReviewStatus, 'pending'>,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow | null> {
  if (opts.ctx) return updateMirrorEntryReviewStatusInner(opts.ctx, studentId, id, status)
  return withStudent(studentId, (ctx) =>
    updateMirrorEntryReviewStatusInner(ctx, studentId, id, status),
  )
}

async function updateMirrorEntryReviewStatusInner(
  ctx: TenantContext,
  studentId: string,
  id: number,
  status: Exclude<MirrorReviewStatus, 'pending'>,
): Promise<MirrorEntryRow | null> {
  await clearMirrorReviewTagsInner(ctx, id)
  const label = status === 'confirmed' ? MIRROR_CONFIRMED_TAG : MIRROR_FORGOTTEN_TAG
  const tagId = await upsertTagInner(ctx, studentId, label)
  await ctx.db.insert(mirrorEntryTags).values({ entryId: id, tagId }).onConflictDoNothing()
  return getMirrorEntryInner(ctx, id)
}

export async function updatePendingMirrorEntriesReviewStatus(
  studentId: string,
  status: Exclude<MirrorReviewStatus, 'pending'>,
  opts: { ctx?: TenantContext } = {},
): Promise<{ updated: number }> {
  if (opts.ctx) return updatePendingMirrorEntriesReviewStatusInner(opts.ctx, studentId, status)
  return withStudent(studentId, (ctx) =>
    updatePendingMirrorEntriesReviewStatusInner(ctx, studentId, status),
  )
}

async function updatePendingMirrorEntriesReviewStatusInner(
  ctx: TenantContext,
  studentId: string,
  status: Exclude<MirrorReviewStatus, 'pending'>,
): Promise<{ updated: number }> {
  const entries = await listMirrorEntriesInner(ctx, undefined, false)
  const pending = entries.filter((entry) => entry.review_status === 'pending')
  for (const entry of pending) {
    await updateMirrorEntryReviewStatusInner(ctx, studentId, entry.id, status)
  }
  return { updated: pending.length }
}

async function clearMirrorReviewTagsInner(ctx: TenantContext, entryId: number): Promise<void> {
  for (const label of MIRROR_REVIEW_TAGS) {
    const rows = await ctx.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.studentId, ctx.studentId), eq(tags.label, label)))
    for (const row of rows) {
      await ctx.db
        .delete(mirrorEntryTags)
        .where(and(eq(mirrorEntryTags.entryId, entryId), eq(mirrorEntryTags.tagId, row.id)))
    }
  }
}

// ---------------------------------------------------------------------------
// connector_outputs
// ---------------------------------------------------------------------------

export interface InsertConnectorOutputInput {
  patterns: ConnectorPattern[]
  still_unclear: string | null
  trace?: unknown
}

export async function insertConnectorOutput(
  studentId: string,
  input: InsertConnectorOutputInput,
  opts: { ctx?: TenantContext } = {},
): Promise<ConnectorOutputRow> {
  if (opts.ctx) return insertConnectorOutputInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertConnectorOutputInner(ctx, studentId, input))
}

async function insertConnectorOutputInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertConnectorOutputInput,
): Promise<ConnectorOutputRow> {
  const inserted = await ctx.db
    .insert(connectorOutputs)
    .values({
      studentId,
      patternsJson: JSON.stringify(input.patterns),
      stillUnclear: input.still_unclear,
    })
    .returning({ id: connectorOutputs.id })
  const id = requireRow(inserted, 'insert').id

  if (input.trace !== undefined) {
    await ctx.db.insert(agentTraces).values({
      studentId,
      agent: 'connector',
      refTable: 'connector_outputs',
      refId: id,
      traceJson: JSON.stringify(input.trace),
    })
  }

  const row = await getConnectorOutputByIdInner(ctx, id)
  if (!row) throw new Error('insertConnectorOutput: inserted row not found post-insert')
  return row
}

export async function getConnectorOutputById(
  studentId: string,
  id: number,
  opts: { ctx?: TenantContext } = {},
): Promise<ConnectorOutputRow | null> {
  if (opts.ctx) return getConnectorOutputByIdInner(opts.ctx, id)
  return withStudent(studentId, (ctx) => getConnectorOutputByIdInner(ctx, id))
}

async function getConnectorOutputByIdInner(
  ctx: TenantContext,
  id: number,
): Promise<ConnectorOutputRow | null> {
  const rows = await ctx.db
    .select()
    .from(connectorOutputs)
    .where(and(eq(connectorOutputs.studentId, ctx.studentId), eq(connectorOutputs.id, id)))
    .limit(1)
  if (rows.length === 0) return null
  const row = drizzleConnectorRow(requireRow(rows, 'select connector_outputs'))
  return {
    id: row.id,
    student_id: row.student_id,
    patterns: JSON.parse(row.patterns_json) as ConnectorPattern[],
    still_unclear: row.still_unclear,
    created_at: row.created_at,
  }
}

export async function latestConnectorOutput(
  studentId: string,
  opts: { ctx?: TenantContext } = {},
): Promise<ConnectorOutputRow | null> {
  if (opts.ctx) return latestConnectorOutputInner(opts.ctx)
  return withStudent(studentId, (ctx) => latestConnectorOutputInner(ctx))
}

async function latestConnectorOutputInner(ctx: TenantContext): Promise<ConnectorOutputRow | null> {
  const rows = await ctx.db
    .select()
    .from(connectorOutputs)
    .where(eq(connectorOutputs.studentId, ctx.studentId))
    .orderBy(desc(connectorOutputs.createdAt))
    .limit(1)
  if (rows.length === 0) return null
  const row = drizzleConnectorRow(requireRow(rows, 'select connector_outputs'))
  return {
    id: row.id,
    student_id: row.student_id,
    patterns: JSON.parse(row.patterns_json) as ConnectorPattern[],
    still_unclear: row.still_unclear,
    created_at: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// pathfinder_outputs — legacy v0.1 path, queryable through cutover.
// ---------------------------------------------------------------------------

export interface InsertPathfinderOutputInput {
  trajectory: string
  pathways: PathfinderPathway[]
  disclaimer: string
  connector_output_id?: number | null
  trace?: unknown
}

export async function insertPathfinderOutput(
  studentId: string,
  input: InsertPathfinderOutputInput,
  opts: { ctx?: TenantContext } = {},
): Promise<PathfinderOutputRow> {
  if (opts.ctx) return insertPathfinderOutputInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertPathfinderOutputInner(ctx, studentId, input))
}

async function insertPathfinderOutputInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertPathfinderOutputInput,
): Promise<PathfinderOutputRow> {
  const inserted = await ctx.db
    .insert(pathfinderOutputs)
    .values({
      studentId,
      trajectory: input.trajectory,
      pathwaysJson: JSON.stringify(input.pathways),
      disclaimer: input.disclaimer,
      connectorOutputId: input.connector_output_id ?? null,
    })
    .returning({ id: pathfinderOutputs.id })
  const id = requireRow(inserted, 'insert').id

  if (input.trace !== undefined) {
    await ctx.db.insert(agentTraces).values({
      studentId,
      // Pathfinder is the legacy agent label; retained per plan §2 (kept
      // through PR 2 cutover so legacy traces remain insertable).
      agent: 'pathfinder',
      refTable: 'pathfinder_outputs',
      refId: id,
      traceJson: JSON.stringify(input.trace),
    })
  }

  const rows = await ctx.db
    .select()
    .from(pathfinderOutputs)
    .where(and(eq(pathfinderOutputs.studentId, ctx.studentId), eq(pathfinderOutputs.id, id)))
    .limit(1)
  const row = drizzlePathfinderRow(requireRow(rows, 'select pathfinder_outputs'))
  return {
    id: row.id,
    student_id: row.student_id,
    trajectory: row.trajectory,
    pathways: JSON.parse(row.pathways_json) as PathfinderPathway[],
    disclaimer: row.disclaimer,
    connector_output_id: row.connector_output_id,
    created_at: row.created_at,
  }
}

export async function latestPathfinderOutput(
  studentId: string,
  opts: { ctx?: TenantContext } = {},
): Promise<PathfinderOutputRow | null> {
  if (opts.ctx) return latestPathfinderOutputInner(opts.ctx)
  return withStudent(studentId, (ctx) => latestPathfinderOutputInner(ctx))
}

async function latestPathfinderOutputInner(
  ctx: TenantContext,
): Promise<PathfinderOutputRow | null> {
  const rows = await ctx.db
    .select()
    .from(pathfinderOutputs)
    .where(eq(pathfinderOutputs.studentId, ctx.studentId))
    .orderBy(desc(pathfinderOutputs.createdAt))
    .limit(1)
  if (rows.length === 0) return null
  const row = drizzlePathfinderRow(requireRow(rows, 'select pathfinder_outputs'))
  return {
    id: row.id,
    student_id: row.student_id,
    trajectory: row.trajectory,
    pathways: JSON.parse(row.pathways_json) as PathfinderPathway[],
    disclaimer: row.disclaimer,
    connector_output_id: row.connector_output_id,
    created_at: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// agent_traces
// ---------------------------------------------------------------------------

export interface InsertAgentTraceInput {
  agent: AgentName
  ref_table: AgentRefTable
  ref_id: number
  trace: unknown
}

export async function insertAgentTrace(
  studentId: string,
  input: InsertAgentTraceInput,
  opts: { ctx?: TenantContext } = {},
): Promise<void> {
  if (opts.ctx) {
    await insertAgentTraceInner(opts.ctx, studentId, input)
    return
  }
  await withStudent(studentId, (ctx) => insertAgentTraceInner(ctx, studentId, input))
}

async function insertAgentTraceInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertAgentTraceInput,
): Promise<void> {
  await ctx.db.insert(agentTraces).values({
    studentId,
    agent: input.agent,
    refTable: input.ref_table,
    refId: input.ref_id,
    traceJson: JSON.stringify(input.trace),
  })
}

// ---------------------------------------------------------------------------
// v0.2 (U1): VIPS storage helpers — public types
// ---------------------------------------------------------------------------

export type VipsProposedDiffStatus = 'pending' | 'confirmed' | 'forgotten'

/**
 * Recursive JSON value — used as the typed surface for blob columns that
 * round-trip through `JSON.stringify` / `JSON.parse`. Narrower than
 * `unknown` so TanStack's `ValidateSerializableMapped` accepts the row
 * when it's returned through a server fn.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export interface VipsPageRow {
  student_id: string
  dimension: string
  compiled_truth: string
  open_question: string
  /**
   * ISO timestamp of last upsert, or `null` for the synthetic stub rows
   * returned by `loadVipsPagesHandler`/`counsellorBriefHandler` when a
   * dimension has no `vips_pages` row yet. Real DB rows always have a
   * string here.
   */
  updated_at: string | null
}

export interface VipsTimelineEntryRow {
  id: number
  student_id: string
  dimension: string
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id: number | null
  strength: VipsClaimStrength
  parallax_tag: VipsContextType[]
  reinforces_id: number | null
  forgotten_at: string | null
  committed_at: string
}

export interface VipsProposedDiffRow {
  id: number
  student_id: string
  mirror_entry_id: number
  /** JSON-shaped blob — agent diff + verifier-annotated entries. */
  payload: JsonValue
  /** JSON-shaped blob — VerifierResult shape. */
  verifier_result: JsonValue
  status: VipsProposedDiffStatus
  created_at: string
  reviewed_at: string | null
}

export interface VipsForgetCountRow {
  student_id: string
  dimension: string
  count: number
}

/**
 * Row-shape mirror of `CartographerPathwayDraft` from `~/agents/schemas`
 * (Finding #8). v0.1 had `reasoning` + `ecg_taxonomy_ids` here; the v0.2
 * column `cartographer_outputs.pathways_json` stores the lead-sheet shape
 * below. Keeping the row type aligned with the schema lets callers drop
 * the three `as unknown as CartographerPathwayDraft[]` casts that
 * previously bridged the mismatch.
 *
 * If the schema in `~/agents/schemas` evolves, mirror it here in the same
 * commit so the DB read path stays honest.
 */
export interface CartographerPathway {
  label: string
  trait_combination: Array<{
    claim_id: string
    dimension: 'values' | 'interests' | 'personality' | 'skills'
    timeline_entry_id?: number
  }>
  ecg_region_tags: string[]
  risks_tradeoffs: string
  exploration_prompt: string
}

export interface CartographerOutputRow {
  id: number
  student_id: string
  trajectory_text: string
  pathways: CartographerPathway[]
  open_questions: string[]
  disclaimer: string
  raw_output_json: string
  created_at: string
}

export interface VipsTimelineSearchResult {
  id: number
  dimension: string
  verbatim_quote: string
  committed_at: string
  score: number
}

// ---------------------------------------------------------------------------
// vips_pages
// ---------------------------------------------------------------------------

export interface UpsertVipsPageInput {
  dimension: string
  compiled_truth: string
  open_question: string
}

/**
 * Upsert one (student_id, dimension) row. Touches `updated_at` on every write
 * so the page surface can render "last refined" in the heading.
 */
export async function upsertVipsPage(
  studentId: string,
  input: UpsertVipsPageInput,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsPageRow> {
  if (opts.ctx) return upsertVipsPageInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => upsertVipsPageInner(ctx, studentId, input))
}

async function upsertVipsPageInner(
  ctx: TenantContext,
  studentId: string,
  input: UpsertVipsPageInput,
): Promise<VipsPageRow> {
  await ctx.db
    .insert(vipsPages)
    .values({
      studentId,
      dimension: input.dimension,
      compiledTruth: input.compiled_truth,
      openQuestion: input.open_question,
      // updatedAt defaults to now() on insert; we set it explicitly on update
      // via onConflictDoUpdate below so refines reliably bump the timestamp.
    })
    .onConflictDoUpdate({
      target: [vipsPages.studentId, vipsPages.dimension],
      set: {
        compiledTruth: input.compiled_truth,
        openQuestion: input.open_question,
        updatedAt: sql`now()`,
      },
    })
  const page = await getVipsPageInner(ctx, studentId, input.dimension)
  if (!page) throw new Error('upsertVipsPage: row missing after upsert')
  return page
}

export async function getVipsPage(
  studentId: string,
  dimension: string,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsPageRow | null> {
  if (opts.ctx) return getVipsPageInner(opts.ctx, studentId, dimension)
  return withStudent(studentId, (ctx) => getVipsPageInner(ctx, studentId, dimension))
}

async function getVipsPageInner(
  ctx: TenantContext,
  studentId: string,
  dimension: string,
): Promise<VipsPageRow | null> {
  const rows = await ctx.db
    .select()
    .from(vipsPages)
    .where(and(eq(vipsPages.studentId, studentId), eq(vipsPages.dimension, dimension)))
    .limit(1)
  if (rows.length === 0) return null
  const row = drizzleVipsPageRow(requireRow(rows, 'select vips_pages'))
  return row
}

export async function listVipsPages(
  studentId: string,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsPageRow[]> {
  if (opts.ctx) return listVipsPagesInner(opts.ctx)
  return withStudent(studentId, (ctx) => listVipsPagesInner(ctx))
}

async function listVipsPagesInner(ctx: TenantContext): Promise<VipsPageRow[]> {
  const rows = await ctx.db
    .select()
    .from(vipsPages)
    .where(eq(vipsPages.studentId, ctx.studentId))
    .orderBy(desc(vipsPages.updatedAt))
  return rows.map(drizzleVipsPageRow)
}

// ---------------------------------------------------------------------------
// vips_timeline_entries
// ---------------------------------------------------------------------------

export interface InsertVipsTimelineEntryInput {
  dimension: string
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id?: number | null
  strength: VipsClaimStrength
  parallax_tag: VipsContextType[]
  reinforces_id?: number | null
}

export async function insertVipsTimelineEntry(
  studentId: string,
  input: InsertVipsTimelineEntryInput,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsTimelineEntryRow> {
  if (opts.ctx) return insertVipsTimelineEntryInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertVipsTimelineEntryInner(ctx, studentId, input))
}

async function insertVipsTimelineEntryInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertVipsTimelineEntryInput,
): Promise<VipsTimelineEntryRow> {
  const inserted = await ctx.db
    .insert(vipsTimelineEntries)
    .values({
      studentId,
      dimension: input.dimension,
      canonicalClaimId: input.canonical_claim_id,
      verbatimQuote: input.verbatim_quote,
      reflectionId: input.reflection_id ?? null,
      strength: input.strength,
      parallaxTagJson: JSON.stringify(input.parallax_tag),
      reinforcesId: input.reinforces_id ?? null,
    })
    .returning({ id: vipsTimelineEntries.id })
  const id = requireRow(inserted, 'insert').id
  const row = await getVipsTimelineEntryInner(ctx, id)
  if (!row) throw new Error('insertVipsTimelineEntry: inserted row not found')
  return row
}

export async function getVipsTimelineEntry(
  studentId: string,
  id: number,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsTimelineEntryRow | null> {
  if (opts.ctx) return getVipsTimelineEntryInner(opts.ctx, id)
  return withStudent(studentId, (ctx) => getVipsTimelineEntryInner(ctx, id))
}

async function getVipsTimelineEntryInner(
  ctx: TenantContext,
  id: number,
): Promise<VipsTimelineEntryRow | null> {
  const rows = await ctx.db
    .select()
    .from(vipsTimelineEntries)
    .where(and(eq(vipsTimelineEntries.studentId, ctx.studentId), eq(vipsTimelineEntries.id, id)))
    .limit(1)
  if (rows.length === 0) return null
  return rowToVipsTimelineEntry(
    drizzleVipsTimelineRow(requireRow(rows, 'select vips_timeline_entries')),
  )
}

/**
 * List timeline entries for one (student, dimension). By default excludes
 * forgotten rows; pass `includeForgotten: true` to see them (e.g., for an
 * admin / debug view).
 */
export async function listVipsTimelineEntries(
  studentId: string,
  dimension: string,
  opts: { includeForgotten?: boolean; ctx?: TenantContext; limit?: number } = {},
): Promise<VipsTimelineEntryRow[]> {
  if (opts.ctx)
    return listVipsTimelineEntriesInner(opts.ctx, dimension, !!opts.includeForgotten, opts.limit)
  return withStudent(studentId, (ctx) =>
    listVipsTimelineEntriesInner(ctx, dimension, !!opts.includeForgotten, opts.limit),
  )
}

async function listVipsTimelineEntriesInner(
  ctx: TenantContext,
  dimension: string,
  includeForgotten: boolean,
  limit?: number,
): Promise<VipsTimelineEntryRow[]> {
  const where = includeForgotten
    ? and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        eq(vipsTimelineEntries.dimension, dimension),
      )
    : and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        eq(vipsTimelineEntries.dimension, dimension),
        isNull(vipsTimelineEntries.forgottenAt),
      )
  const base = ctx.db
    .select()
    .from(vipsTimelineEntries)
    .where(where)
    .orderBy(desc(vipsTimelineEntries.committedAt))
  const rows = limit != null ? await base.limit(limit) : await base
  return rows.map((r: DrizzleVipsTimelineRow) => rowToVipsTimelineEntry(drizzleVipsTimelineRow(r)))
}

export async function listVipsTimelineEntriesByReflectionId(
  studentId: string,
  reflectionId: number,
  opts: { includeForgotten?: boolean; ctx?: TenantContext } = {},
): Promise<VipsTimelineEntryRow[]> {
  if (opts.ctx) {
    return listVipsTimelineEntriesByReflectionIdInner(
      opts.ctx,
      reflectionId,
      !!opts.includeForgotten,
    )
  }
  return withStudent(studentId, (ctx) =>
    listVipsTimelineEntriesByReflectionIdInner(ctx, reflectionId, !!opts.includeForgotten),
  )
}

async function listVipsTimelineEntriesByReflectionIdInner(
  ctx: TenantContext,
  reflectionId: number,
  includeForgotten: boolean,
): Promise<VipsTimelineEntryRow[]> {
  const where = includeForgotten
    ? and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        eq(vipsTimelineEntries.reflectionId, reflectionId),
      )
    : and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        eq(vipsTimelineEntries.reflectionId, reflectionId),
        isNull(vipsTimelineEntries.forgottenAt),
      )
  const rows = await ctx.db
    .select()
    .from(vipsTimelineEntries)
    .where(where)
    .orderBy(desc(vipsTimelineEntries.committedAt))
  return rows.map((r: DrizzleVipsTimelineRow) => rowToVipsTimelineEntry(drizzleVipsTimelineRow(r)))
}

/**
 * Soft-forget a timeline entry. Sets `forgotten_at` and increments the
 * per-dimension forget counter (R19). Unlike v0.1 there is no explicit FTS
 * delete: the tsvector column stays populated but `searchVipsTimelineEntries`
 * filters on `forgotten_at IS NULL` so forgotten rows are excluded from
 * hybrid retrieval (plan §16 deferred finding).
 */
export async function forgetVipsTimelineEntry(
  studentId: string,
  id: number,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsTimelineEntryRow | null> {
  if (opts.ctx) return forgetVipsTimelineEntryInner(opts.ctx, studentId, id)
  return withStudent(studentId, (ctx) => forgetVipsTimelineEntryInner(ctx, studentId, id))
}

async function forgetVipsTimelineEntryInner(
  ctx: TenantContext,
  studentId: string,
  id: number,
): Promise<VipsTimelineEntryRow | null> {
  // Atomic UPDATE-with-RETURNING: only flips `forgotten_at` if it was null,
  // returning the row only when this caller is the one that performed the
  // soft-forget. Closes the SELECT-then-UPDATE race where two concurrent
  // forgets would both pass the `forgotten_at IS NULL` check and double-
  // increment the counter (Finding #16).
  const updated = await ctx.db
    .update(vipsTimelineEntries)
    .set({ forgottenAt: sql`now()` })
    .where(
      and(
        eq(vipsTimelineEntries.studentId, studentId),
        eq(vipsTimelineEntries.id, id),
        isNull(vipsTimelineEntries.forgottenAt),
      ),
    )
    .returning()

  if (updated.length === 0) {
    // Either the row doesn't exist OR a concurrent caller already forgot it.
    // Return whatever is currently there (or null for the not-found case).
    return getVipsTimelineEntryInner(ctx, id)
  }

  const updatedRow = drizzleVipsTimelineRow(requireRow(updated, 'update vips_timeline_entries'))

  await ctx.db
    .insert(vipsForgetCount)
    .values({ studentId, dimension: updatedRow.dimension, count: 1 })
    .onConflictDoUpdate({
      target: [vipsForgetCount.studentId, vipsForgetCount.dimension],
      set: { count: sql`${vipsForgetCount.count} + 1` },
    })

  return rowToVipsTimelineEntry(updatedRow)
}

/**
 * tsvector-backed search restricted to one student. Forgotten rows are
 * excluded via the explicit `forgotten_at IS NULL` predicate (plan §16
 * deferred finding) — the generated tsvector column persists on soft-forget,
 * unlike SQLite's FTS5 contentless mirror.
 */
export async function searchVipsTimelineEntries(
  studentId: string,
  query: string,
  opts: { limit?: number; dimension?: string; ctx?: TenantContext } = {},
): Promise<VipsTimelineSearchResult[]> {
  if (query.trim().length === 0) return []
  const limit = opts.limit ?? 5
  if (opts.ctx) return searchVipsTimelineEntriesInner(opts.ctx, query, limit, opts.dimension)
  return withStudent(studentId, (ctx) =>
    searchVipsTimelineEntriesInner(ctx, query, limit, opts.dimension),
  )
}

async function searchVipsTimelineEntriesInner(
  ctx: TenantContext,
  query: string,
  limit: number,
  dimension: string | undefined,
): Promise<VipsTimelineSearchResult[]> {
  const matchClause = sql`${vipsTimelineEntries.verbatimQuoteTsv} @@ plainto_tsquery('english', ${query})`
  const where = dimension
    ? and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        matchClause,
        isNull(vipsTimelineEntries.forgottenAt),
        eq(vipsTimelineEntries.dimension, dimension),
      )
    : and(
        eq(vipsTimelineEntries.studentId, ctx.studentId),
        matchClause,
        isNull(vipsTimelineEntries.forgottenAt),
      )

  const rows = await ctx.db
    .select({
      id: vipsTimelineEntries.id,
      dimension: vipsTimelineEntries.dimension,
      verbatim_quote: vipsTimelineEntries.verbatimQuote,
      committed_at: vipsTimelineEntries.committedAt,
      score: sql<number>`ts_rank(${vipsTimelineEntries.verbatimQuoteTsv}, plainto_tsquery('english', ${query}))`,
    })
    .from(vipsTimelineEntries)
    .where(where)
    .orderBy(
      sql`ts_rank(${vipsTimelineEntries.verbatimQuoteTsv}, plainto_tsquery('english', ${query})) desc`,
    )
    .limit(limit)

  return rows.map(
    (r: {
      id: number
      dimension: string
      verbatim_quote: string
      committed_at: string
      score: number
    }) => ({
      id: r.id,
      dimension: r.dimension,
      verbatim_quote: r.verbatim_quote,
      committed_at: r.committed_at,
      score: r.score,
    }),
  )
}

// ---------------------------------------------------------------------------
// vips_proposed_diffs
// ---------------------------------------------------------------------------

// TODO(v0.3-cutover): `verifier_result_json` and the verifier section embedded
// inside `payload_json` (via U8's resolution-tracking blob) can drift if a
// caller updates one and not the other. The v0.3 cleanup PR collapses one of
// them; for now we keep both as belt-and-suspenders.
export interface InsertVipsProposedDiffInput {
  mirror_entry_id: number
  payload: unknown
  verifier_result: unknown
  status?: VipsProposedDiffStatus
}

export async function insertVipsProposedDiff(
  studentId: string,
  input: InsertVipsProposedDiffInput,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsProposedDiffRow> {
  if (opts.ctx) return insertVipsProposedDiffInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertVipsProposedDiffInner(ctx, studentId, input))
}

async function insertVipsProposedDiffInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertVipsProposedDiffInput,
): Promise<VipsProposedDiffRow> {
  const status = input.status ?? 'pending'
  const inserted = await ctx.db
    .insert(vipsProposedDiffs)
    .values({
      studentId,
      mirrorEntryId: input.mirror_entry_id,
      payloadJson: JSON.stringify(input.payload),
      verifierResultJson: JSON.stringify(input.verifier_result),
      status,
      ...(status === 'pending' ? {} : { reviewedAt: sql`now()` }),
    })
    .returning({ id: vipsProposedDiffs.id })
  const id = requireRow(inserted, 'insert').id
  const row = await getVipsProposedDiffInner(ctx, id)
  if (!row) throw new Error('insertVipsProposedDiff: inserted row not found')
  return row
}
/**
 * Race-safe insert against the `vips_proposed_diffs_pending_per_student`
 * partial unique index. R30 says "at most one pending diff per student"; two
 * concurrent runs can both pass an app-side existence check and race the
 * insert. We push the decision down to the DB:
 *
 *   - INSERT … ON CONFLICT (student_id) WHERE status='pending' DO NOTHING
 *     — Postgres atomically rejects the second insert without aborting the
 *     surrounding transaction (unlike the bare INSERT that raises SQLSTATE
 *     `25P02` and forces a rollback).
 *   - If `.returning()` yields a row, this caller won the race.
 *   - If it yields nothing, fetch the existing pending row and return it as
 *     the `existing` arm of the discriminated union.
 *
 * The previous shape (catch on the unique-constraint violation, then
 * re-query inside the same transaction) cannot work in Postgres: any
 * exception inside a transaction puts it into the `25P02 aborted` state,
 * so the recovery query throws too. `onConflictDoNothing` is the only
 * primitive that keeps the transaction live.
 */
export type InsertVipsProposedDiffIfNoPendingResult =
  | { inserted: true; row: VipsProposedDiffRow }
  | { inserted: false; existing: VipsProposedDiffRow }

export async function insertVipsProposedDiffIfNoPending(
  studentId: string,
  input: InsertVipsProposedDiffInput,
  opts: { ctx?: TenantContext } = {},
): Promise<InsertVipsProposedDiffIfNoPendingResult> {
  if (opts.ctx) return insertVipsProposedDiffIfNoPendingInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) =>
    insertVipsProposedDiffIfNoPendingInner(ctx, studentId, input),
  )
}

async function insertVipsProposedDiffIfNoPendingInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertVipsProposedDiffInput,
): Promise<InsertVipsProposedDiffIfNoPendingResult> {
  const inserted = await ctx.db
    .insert(vipsProposedDiffs)
    .values({
      studentId,
      mirrorEntryId: input.mirror_entry_id,
      payloadJson: JSON.stringify(input.payload),
      verifierResultJson: JSON.stringify(input.verifier_result),
      status: 'pending',
    })
    .onConflictDoNothing({
      // Partial unique index `vips_proposed_diffs_pending_per_student` is
      // `UNIQUE (student_id) WHERE status='pending'`; the `where` field below
      // emits the index-predicate clause so Postgres matches the right index.
      target: vipsProposedDiffs.studentId,
      where: sql`status = 'pending'`,
    })
    .returning({ id: vipsProposedDiffs.id })

  if (inserted.length > 0) {
    const id = requireRow(inserted, 'insert').id
    const row = await getVipsProposedDiffInner(ctx, id)
    if (!row) throw new Error('insertVipsProposedDiffIfNoPending: inserted row not found')
    return { inserted: true, row }
  }

  // No row inserted ⇒ a prior pending row exists for this student. Fetch it
  // so the caller can surface its id as the `queued` outcome's pending_diff_id.
  const existingRows = await ctx.db
    .select()
    .from(vipsProposedDiffs)
    .where(and(eq(vipsProposedDiffs.studentId, studentId), eq(vipsProposedDiffs.status, 'pending')))
    .orderBy(desc(vipsProposedDiffs.createdAt))
    .limit(1)
  if (existingRows.length === 0) {
    // Defensive — the partial unique index rejected our insert but no pending
    // row is visible. Most likely a between-statements commit elsewhere; treat
    // as an unrecoverable race.
    throw new Error(
      'insertVipsProposedDiffIfNoPending: insert rejected by partial unique index but no pending row is visible',
    )
  }
  return {
    inserted: false,
    existing: rowToVipsProposedDiff(
      drizzleVipsProposedDiffRow(requireRow(existingRows, 'select vips_proposed_diffs')),
    ),
  }
}

export async function getVipsProposedDiff(
  studentId: string,
  id: number,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsProposedDiffRow | null> {
  if (opts.ctx) return getVipsProposedDiffInner(opts.ctx, id)
  return withStudent(studentId, (ctx) => getVipsProposedDiffInner(ctx, id))
}

async function getVipsProposedDiffInner(
  ctx: TenantContext,
  id: number,
): Promise<VipsProposedDiffRow | null> {
  const rows = await ctx.db
    .select()
    .from(vipsProposedDiffs)
    .where(and(eq(vipsProposedDiffs.studentId, ctx.studentId), eq(vipsProposedDiffs.id, id)))
    .limit(1)
  if (rows.length === 0) return null
  return rowToVipsProposedDiff(
    drizzleVipsProposedDiffRow(requireRow(rows, 'select vips_proposed_diffs')),
  )
}

export async function listVipsProposedDiffs(
  studentId: string,
  opts: { status?: VipsProposedDiffStatus; ctx?: TenantContext; limit?: number } = {},
): Promise<VipsProposedDiffRow[]> {
  if (opts.ctx) return listVipsProposedDiffsInner(opts.ctx, opts.status, opts.limit)
  return withStudent(studentId, (ctx) => listVipsProposedDiffsInner(ctx, opts.status, opts.limit))
}

async function listVipsProposedDiffsInner(
  ctx: TenantContext,
  status: VipsProposedDiffStatus | undefined,
  limit?: number,
): Promise<VipsProposedDiffRow[]> {
  const base = status
    ? ctx.db
        .select()
        .from(vipsProposedDiffs)
        .where(
          and(eq(vipsProposedDiffs.studentId, ctx.studentId), eq(vipsProposedDiffs.status, status)),
        )
        .orderBy(desc(vipsProposedDiffs.createdAt))
    : ctx.db
        .select()
        .from(vipsProposedDiffs)
        .where(eq(vipsProposedDiffs.studentId, ctx.studentId))
        .orderBy(desc(vipsProposedDiffs.createdAt))
  const rows = limit != null ? await base.limit(limit) : await base
  return rows.map((r: DrizzleVipsProposedDiffRow) =>
    rowToVipsProposedDiff(drizzleVipsProposedDiffRow(r)),
  )
}

/**
 * Transition a proposed diff to `confirmed` or `forgotten`. Stamps
 * `reviewed_at` so the review surface can show "decided just now" vs older
 * pending rows.
 */
export async function updateVipsProposedDiffStatus(
  studentId: string,
  id: number,
  status: Exclude<VipsProposedDiffStatus, 'pending'>,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsProposedDiffRow | null> {
  if (opts.ctx) return updateVipsProposedDiffStatusInner(opts.ctx, id, status)
  return withStudent(studentId, (ctx) => updateVipsProposedDiffStatusInner(ctx, id, status))
}

async function updateVipsProposedDiffStatusInner(
  ctx: TenantContext,
  id: number,
  status: Exclude<VipsProposedDiffStatus, 'pending'>,
): Promise<VipsProposedDiffRow | null> {
  await ctx.db
    .update(vipsProposedDiffs)
    .set({ status, reviewedAt: sql`now()` })
    .where(and(eq(vipsProposedDiffs.studentId, ctx.studentId), eq(vipsProposedDiffs.id, id)))
  return getVipsProposedDiffInner(ctx, id)
}

/**
 * Overwrite the `payload_json` column of a staged diff row. Used by the
 * U8 review surface to track per-entry `resolved: 'pending' | 'confirmed'
 * | 'forgotten'` flags without adding a new column. Tenancy-scoped by RLS so
 * a stray diffId from another student is a no-op.
 */
export async function updateVipsProposedDiffPayload(
  studentId: string,
  id: number,
  payload: unknown,
  opts: { ctx?: TenantContext } = {},
): Promise<VipsProposedDiffRow | null> {
  if (opts.ctx) return updateVipsProposedDiffPayloadInner(opts.ctx, id, payload)
  return withStudent(studentId, (ctx) => updateVipsProposedDiffPayloadInner(ctx, id, payload))
}

async function updateVipsProposedDiffPayloadInner(
  ctx: TenantContext,
  id: number,
  payload: unknown,
): Promise<VipsProposedDiffRow | null> {
  await ctx.db
    .update(vipsProposedDiffs)
    .set({ payloadJson: JSON.stringify(payload) })
    .where(and(eq(vipsProposedDiffs.studentId, ctx.studentId), eq(vipsProposedDiffs.id, id)))
  return getVipsProposedDiffInner(ctx, id)
}

// ---------------------------------------------------------------------------
// vips_forget_count
// ---------------------------------------------------------------------------

export async function getVipsForgetCount(
  studentId: string,
  dimension: string,
  opts: { ctx?: TenantContext } = {},
): Promise<number> {
  if (opts.ctx) return getVipsForgetCountInner(opts.ctx, studentId, dimension)
  return withStudent(studentId, (ctx) => getVipsForgetCountInner(ctx, studentId, dimension))
}

async function getVipsForgetCountInner(
  ctx: TenantContext,
  studentId: string,
  dimension: string,
): Promise<number> {
  const rows = await ctx.db
    .select({ count: vipsForgetCount.count })
    .from(vipsForgetCount)
    .where(and(eq(vipsForgetCount.studentId, studentId), eq(vipsForgetCount.dimension, dimension)))
    .limit(1)
  return rows[0]?.count ?? 0
}

// ---------------------------------------------------------------------------
// cartographer_outputs
// ---------------------------------------------------------------------------

export interface InsertCartographerOutputInput {
  trajectory_text: string
  pathways: CartographerPathway[]
  open_questions: string[]
  disclaimer: string
  /** Raw, un-edited Cartographer agent output (JSON-serializable). */
  raw_output: unknown
  trace?: unknown
}

export async function insertCartographerOutput(
  studentId: string,
  input: InsertCartographerOutputInput,
  opts: { ctx?: TenantContext } = {},
): Promise<CartographerOutputRow> {
  if (opts.ctx) return insertCartographerOutputInner(opts.ctx, studentId, input)
  return withStudent(studentId, (ctx) => insertCartographerOutputInner(ctx, studentId, input))
}

async function insertCartographerOutputInner(
  ctx: TenantContext,
  studentId: string,
  input: InsertCartographerOutputInput,
): Promise<CartographerOutputRow> {
  const inserted = await ctx.db
    .insert(cartographerOutputs)
    .values({
      studentId,
      trajectoryText: input.trajectory_text,
      pathwaysJson: JSON.stringify(input.pathways),
      openQuestionsJson: JSON.stringify(input.open_questions),
      disclaimer: input.disclaimer,
      rawOutputJson: JSON.stringify(input.raw_output),
    })
    .returning({ id: cartographerOutputs.id })
  const id = requireRow(inserted, 'insert').id

  if (input.trace !== undefined) {
    await ctx.db.insert(agentTraces).values({
      studentId,
      agent: 'cartographer',
      refTable: 'cartographer_outputs',
      refId: id,
      traceJson: JSON.stringify(input.trace),
    })
  }

  const rows = await ctx.db
    .select()
    .from(cartographerOutputs)
    .where(and(eq(cartographerOutputs.studentId, ctx.studentId), eq(cartographerOutputs.id, id)))
    .limit(1)
  return rowToCartographerOutput(
    drizzleCartographerRow(requireRow(rows, 'select cartographer_outputs')),
  )
}

export async function latestCartographerOutput(
  studentId: string,
  opts: { ctx?: TenantContext } = {},
): Promise<CartographerOutputRow | null> {
  if (opts.ctx) return latestCartographerOutputInner(opts.ctx)
  return withStudent(studentId, (ctx) => latestCartographerOutputInner(ctx))
}

async function latestCartographerOutputInner(
  ctx: TenantContext,
): Promise<CartographerOutputRow | null> {
  const rows = await ctx.db
    .select()
    .from(cartographerOutputs)
    .where(eq(cartographerOutputs.studentId, ctx.studentId))
    .orderBy(desc(cartographerOutputs.createdAt))
    .limit(1)
  if (rows.length === 0) return null
  return rowToCartographerOutput(
    drizzleCartographerRow(requireRow(rows, 'select cartographer_outputs')),
  )
}

// ---------------------------------------------------------------------------
// Drizzle camelCase → snake_case row adapters. These exist solely to bridge
// the schema's camelCase TS column accessors and the snake_case public row
// shapes that v0.1 call sites depend on. Each adapter is a pure rename — no
// JSON parsing or type narrowing happens here. tsvector generated columns are
// dropped on the way through (they are write-side artefacts only).
// ---------------------------------------------------------------------------

type DrizzleMirrorRow = {
  id: number
  studentId: string
  transcript: string
  title?: string | null
  validation: string
  inferredMeaning: string
  storyReframe: string
  rawOutputJson: string
  contextType: string
  createdAt: string
  storyReframeTsv?: string | null
}

function drizzleMirrorRow(r: DrizzleMirrorRow): MirrorEntryDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    transcript: r.transcript,
    title: r.title ?? null,
    validation: r.validation,
    inferred_meaning: r.inferredMeaning,
    story_reframe: r.storyReframe,
    raw_output_json: r.rawOutputJson,
    context_type: r.contextType as VipsContextType,
    created_at: r.createdAt,
  }
}

type DrizzleConnectorRow = {
  id: number
  studentId: string
  patternsJson: string
  stillUnclear: string | null
  createdAt: string
}

function drizzleConnectorRow(r: DrizzleConnectorRow): ConnectorOutputDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    patterns_json: r.patternsJson,
    still_unclear: r.stillUnclear,
    created_at: r.createdAt,
  }
}

type DrizzlePathfinderRow = {
  id: number
  studentId: string
  trajectory: string
  pathwaysJson: string
  disclaimer: string
  connectorOutputId: number | null
  createdAt: string
}

function drizzlePathfinderRow(r: DrizzlePathfinderRow): PathfinderOutputDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    trajectory: r.trajectory,
    pathways_json: r.pathwaysJson,
    disclaimer: r.disclaimer,
    connector_output_id: r.connectorOutputId,
    created_at: r.createdAt,
  }
}

type DrizzleVipsPageRow = {
  studentId: string
  dimension: string
  compiledTruth: string
  openQuestion: string
  updatedAt: string
}

function drizzleVipsPageRow(r: DrizzleVipsPageRow): VipsPageRow {
  return {
    student_id: r.studentId,
    dimension: r.dimension,
    compiled_truth: r.compiledTruth,
    open_question: r.openQuestion,
    updated_at: r.updatedAt,
  }
}

type DrizzleVipsTimelineRow = {
  id: number
  studentId: string
  dimension: string
  canonicalClaimId: string
  verbatimQuote: string
  reflectionId: number | null
  strength: string
  parallaxTagJson: string
  reinforcesId: number | null
  forgottenAt: string | null
  committedAt: string
  verbatimQuoteTsv?: string | null
}

function drizzleVipsTimelineRow(r: DrizzleVipsTimelineRow): VipsTimelineEntryDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    dimension: r.dimension,
    canonical_claim_id: r.canonicalClaimId,
    verbatim_quote: r.verbatimQuote,
    reflection_id: r.reflectionId,
    strength: r.strength as VipsClaimStrength,
    parallax_tag_json: r.parallaxTagJson,
    reinforces_id: r.reinforcesId,
    forgotten_at: r.forgottenAt,
    committed_at: r.committedAt,
  }
}

type DrizzleVipsProposedDiffRow = {
  id: number
  studentId: string
  mirrorEntryId: number
  payloadJson: string
  verifierResultJson: string
  status: string
  createdAt: string
  reviewedAt: string | null
}

function drizzleVipsProposedDiffRow(r: DrizzleVipsProposedDiffRow): VipsProposedDiffDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    mirror_entry_id: r.mirrorEntryId,
    payload_json: r.payloadJson,
    verifier_result_json: r.verifierResultJson,
    status: r.status as VipsProposedDiffStatus,
    created_at: r.createdAt,
    reviewed_at: r.reviewedAt,
  }
}

type DrizzleCartographerRow = {
  id: number
  studentId: string
  trajectoryText: string
  pathwaysJson: string
  openQuestionsJson: string
  disclaimer: string
  rawOutputJson: string
  createdAt: string
}

function drizzleCartographerRow(r: DrizzleCartographerRow): CartographerOutputDbRow {
  return {
    id: r.id,
    student_id: r.studentId,
    trajectory_text: r.trajectoryText,
    pathways_json: r.pathwaysJson,
    open_questions_json: r.openQuestionsJson,
    disclaimer: r.disclaimer,
    raw_output_json: r.rawOutputJson,
    created_at: r.createdAt,
  }
}
