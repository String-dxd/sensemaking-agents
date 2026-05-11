import type { Database as DatabaseInstance } from 'better-sqlite3'
import { openDb } from './client'

export interface MirrorEntryRow {
  id: number
  student_id: string
  transcript: string
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

export type AgentName = 'mirror' | 'connector' | 'pathfinder'
export type AgentRefTable = 'mirror_entries' | 'connector_outputs' | 'pathfinder_outputs'
export type MirrorEditableField = 'validation' | 'inferred_meaning' | 'story_reframe'

interface MirrorEntryDbRow {
  id: number
  student_id: string
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  raw_output_json: string
  context_type: VipsContextType
  created_at: string
}

interface MirrorSearchDbRow {
  id: number
  story_reframe: string
  created_at: string
  score: number
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

interface DbContext {
  db?: DatabaseInstance
}

function getDb(ctx: DbContext): DatabaseInstance {
  return ctx.db ?? openDb()
}

function loadTags(db: DatabaseInstance, entryId: number): string[] {
  const rows = db
    .prepare(
      `SELECT t.label FROM tags t
       JOIN mirror_entry_tags mt ON mt.tag_id = t.id
       WHERE mt.entry_id = ? ORDER BY t.label`,
    )
    .all(entryId) as Array<{ label: string }>
  return rows.map((r) => r.label)
}

function upsertTag(db: DatabaseInstance, studentId: string, label: string): number {
  const existing = db
    .prepare('SELECT id FROM tags WHERE student_id = ? AND label = ?')
    .get(studentId, label) as { id: number } | undefined
  if (existing) return existing.id
  const result = db
    .prepare('INSERT INTO tags (student_id, label) VALUES (?, ?)')
    .run(studentId, label)
  return Number(result.lastInsertRowid)
}

function rowToMirrorEntry(row: MirrorEntryDbRow, tags: string[]): MirrorEntryRow {
  return {
    id: row.id,
    student_id: row.student_id,
    transcript: row.transcript,
    validation: row.validation,
    inferred_meaning: row.inferred_meaning,
    story_reframe: row.story_reframe,
    raw_output_json: row.raw_output_json,
    context_type: row.context_type,
    tags,
    created_at: row.created_at,
  }
}

/** FTS5-backed search restricted to one student. */
export function searchMirrors(
  studentId: string,
  query: string,
  opts: { limit?: number; ctx?: DbContext } = {},
): MirrorSearchResult[] {
  const db = getDb(opts.ctx ?? {})
  const limit = opts.limit ?? 5
  if (query.trim().length === 0) return []
  const rows = db
    .prepare(
      `SELECT m.id, m.story_reframe, m.created_at, bm25(mirror_entries_fts) AS score
       FROM mirror_entries_fts
       JOIN mirror_entries m ON m.id = mirror_entries_fts.rowid
       WHERE mirror_entries_fts MATCH ? AND m.student_id = ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(escapeFtsQuery(query), studentId, limit) as MirrorSearchDbRow[]

  return rows.map((r) => ({
    id: r.id,
    story_reframe: r.story_reframe,
    created_at: r.created_at,
    score: r.score,
    tags: loadTags(db, r.id),
  }))
}

/**
 * FTS5 doesn't accept arbitrary user input — quotes around each token
 * neutralize operators while still allowing token-AND matching.
 */
function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(' ')
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

export function insertMirrorEntry(
  studentId: string,
  input: InsertMirrorEntryInput,
  opts: { ctx?: DbContext } = {},
): MirrorEntryRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO mirror_entries
           (student_id, transcript, validation, inferred_meaning, story_reframe, raw_output_json, context_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        input.transcript,
        input.validation,
        input.inferred_meaning,
        input.story_reframe,
        JSON.stringify(input.raw_output),
        input.context_type ?? 'school',
      )
    const id = Number(result.lastInsertRowid)

    for (const label of input.tags ?? []) {
      const tagId = upsertTag(db, studentId, label)
      db.prepare('INSERT OR IGNORE INTO mirror_entry_tags (entry_id, tag_id) VALUES (?, ?)').run(
        id,
        tagId,
      )
    }

    if (input.trace !== undefined) {
      db.prepare(
        `INSERT INTO agent_traces (student_id, agent, ref_table, ref_id, trace_json)
         VALUES (?, 'mirror', 'mirror_entries', ?, ?)`,
      ).run(studentId, id, JSON.stringify(input.trace))
    }

    const row = db.prepare('SELECT * FROM mirror_entries WHERE id = ?').get(id) as MirrorEntryDbRow
    return rowToMirrorEntry(row, loadTags(db, id))
  })()
}

export function listMirrorEntries(
  studentId: string,
  opts: { limit?: number; ctx?: DbContext } = {},
): MirrorEntryRow[] {
  const db = getDb(opts.ctx ?? {})
  const limit = opts.limit ?? 50
  const rows = db
    .prepare(`SELECT * FROM mirror_entries WHERE student_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(studentId, limit) as MirrorEntryDbRow[]
  return rows.map((row) => rowToMirrorEntry(row, loadTags(db, row.id)))
}

export function getMirrorEntry(
  studentId: string,
  id: number,
  opts: { ctx?: DbContext } = {},
): MirrorEntryRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT * FROM mirror_entries WHERE id = ? AND student_id = ?')
    .get(id, studentId) as MirrorEntryDbRow | undefined
  if (!row) return null
  return rowToMirrorEntry(row, loadTags(db, row.id))
}

export interface InsertConnectorOutputInput {
  patterns: ConnectorPattern[]
  still_unclear: string | null
  trace?: unknown
}

export function insertConnectorOutput(
  studentId: string,
  input: InsertConnectorOutputInput,
  opts: { ctx?: DbContext } = {},
): ConnectorOutputRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO connector_outputs (student_id, patterns_json, still_unclear)
         VALUES (?, ?, ?)`,
      )
      .run(studentId, JSON.stringify(input.patterns), input.still_unclear)
    const id = Number(result.lastInsertRowid)
    if (input.trace !== undefined) {
      db.prepare(
        `INSERT INTO agent_traces (student_id, agent, ref_table, ref_id, trace_json)
         VALUES (?, 'connector', 'connector_outputs', ?, ?)`,
      ).run(studentId, id, JSON.stringify(input.trace))
    }
    return getConnectorOutputById(studentId, id, opts) as ConnectorOutputRow
  })()
}

export function getConnectorOutputById(
  studentId: string,
  id: number,
  opts: { ctx?: DbContext } = {},
): ConnectorOutputRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT * FROM connector_outputs WHERE id = ? AND student_id = ?')
    .get(id, studentId) as ConnectorOutputDbRow | undefined
  if (!row) return null
  return {
    id: row.id,
    student_id: row.student_id,
    patterns: JSON.parse(row.patterns_json) as ConnectorPattern[],
    still_unclear: row.still_unclear,
    created_at: row.created_at,
  }
}

export function latestConnectorOutput(
  studentId: string,
  opts: { ctx?: DbContext } = {},
): ConnectorOutputRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare(
      `SELECT * FROM connector_outputs WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(studentId) as ConnectorOutputDbRow | undefined
  if (!row) return null
  return {
    id: row.id,
    student_id: row.student_id,
    patterns: JSON.parse(row.patterns_json) as ConnectorPattern[],
    still_unclear: row.still_unclear,
    created_at: row.created_at,
  }
}

export interface InsertPathfinderOutputInput {
  trajectory: string
  pathways: PathfinderPathway[]
  disclaimer: string
  connector_output_id?: number | null
  trace?: unknown
}

export function insertPathfinderOutput(
  studentId: string,
  input: InsertPathfinderOutputInput,
  opts: { ctx?: DbContext } = {},
): PathfinderOutputRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO pathfinder_outputs
           (student_id, trajectory, pathways_json, disclaimer, connector_output_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        input.trajectory,
        JSON.stringify(input.pathways),
        input.disclaimer,
        input.connector_output_id ?? null,
      )
    const id = Number(result.lastInsertRowid)
    if (input.trace !== undefined) {
      db.prepare(
        `INSERT INTO agent_traces (student_id, agent, ref_table, ref_id, trace_json)
         VALUES (?, 'pathfinder', 'pathfinder_outputs', ?, ?)`,
      ).run(studentId, id, JSON.stringify(input.trace))
    }
    const row = db
      .prepare('SELECT * FROM pathfinder_outputs WHERE id = ?')
      .get(id) as PathfinderOutputDbRow
    return {
      id: row.id,
      student_id: row.student_id,
      trajectory: row.trajectory,
      pathways: JSON.parse(row.pathways_json) as PathfinderPathway[],
      disclaimer: row.disclaimer,
      connector_output_id: row.connector_output_id,
      created_at: row.created_at,
    }
  })()
}

export function latestPathfinderOutput(
  studentId: string,
  opts: { ctx?: DbContext } = {},
): PathfinderOutputRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare(
      `SELECT * FROM pathfinder_outputs WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(studentId) as PathfinderOutputDbRow | undefined
  if (!row) return null
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

export interface InsertAgentTraceInput {
  agent: AgentName
  ref_table: AgentRefTable
  ref_id: number
  trace: unknown
}

export function insertAgentTrace(
  studentId: string,
  input: InsertAgentTraceInput,
  opts: { ctx?: DbContext } = {},
): void {
  const db = getDb(opts.ctx ?? {})
  db.prepare(
    `INSERT INTO agent_traces (student_id, agent, ref_table, ref_id, trace_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(studentId, input.agent, input.ref_table, input.ref_id, JSON.stringify(input.trace))
}

/**
 * Update one of the three editable Mirror fields. The corresponding
 * `raw_output_json` column is left untouched so the un-edited agent output
 * remains queryable by the ablation harness.
 */
export function updateMirrorEntryFields(
  studentId: string,
  id: number,
  patch: Partial<Pick<MirrorEntryRow, 'validation' | 'inferred_meaning' | 'story_reframe'>>,
  opts: { ctx?: DbContext } = {},
): MirrorEntryRow | null {
  const db = getDb(opts.ctx ?? {})
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.validation !== undefined) {
    fields.push('validation = ?')
    values.push(patch.validation)
  }
  if (patch.inferred_meaning !== undefined) {
    fields.push('inferred_meaning = ?')
    values.push(patch.inferred_meaning)
  }
  if (patch.story_reframe !== undefined) {
    fields.push('story_reframe = ?')
    values.push(patch.story_reframe)
  }
  if (fields.length === 0) return getMirrorEntry(studentId, id, opts)
  values.push(id, studentId)
  db.prepare(`UPDATE mirror_entries SET ${fields.join(', ')} WHERE id = ? AND student_id = ?`).run(
    ...values,
  )
  return getMirrorEntry(studentId, id, opts)
}

// ---------------------------------------------------------------------------
// v0.2 (U1): VIPS storage helpers
// ---------------------------------------------------------------------------

export type VipsContextType = 'school' | 'family' | 'peer' | 'hobby' | 'civic'
export type VipsClaimStrength = 'low' | 'medium' | 'high'
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
  updated_at: string
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

export interface CartographerPathway {
  label: string
  reasoning: string
  ecg_taxonomy_ids: string[]
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

interface VipsTimelineSearchDbRow {
  id: number
  dimension: string
  verbatim_quote: string
  committed_at: string
  score: number
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

// ---- vips_pages -----------------------------------------------------------

export interface UpsertVipsPageInput {
  dimension: string
  compiled_truth: string
  open_question: string
}

/**
 * Upsert one (student_id, dimension) row. Touches `updated_at` on every write
 * so the page surface can render "last refined" in the heading.
 */
export function upsertVipsPage(
  studentId: string,
  input: UpsertVipsPageInput,
  opts: { ctx?: DbContext } = {},
): VipsPageRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    db.prepare(
      `INSERT INTO vips_pages (student_id, dimension, compiled_truth, open_question, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(student_id, dimension) DO UPDATE SET
         compiled_truth = excluded.compiled_truth,
         open_question = excluded.open_question,
         updated_at = datetime('now')`,
    ).run(studentId, input.dimension, input.compiled_truth, input.open_question)
    return getVipsPage(studentId, input.dimension, opts) as VipsPageRow
  })()
}

export function getVipsPage(
  studentId: string,
  dimension: string,
  opts: { ctx?: DbContext } = {},
): VipsPageRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT * FROM vips_pages WHERE student_id = ? AND dimension = ?')
    .get(studentId, dimension) as VipsPageRow | undefined
  return row ?? null
}

export function listVipsPages(studentId: string, opts: { ctx?: DbContext } = {}): VipsPageRow[] {
  const db = getDb(opts.ctx ?? {})
  return db
    .prepare('SELECT * FROM vips_pages WHERE student_id = ? ORDER BY updated_at DESC')
    .all(studentId) as VipsPageRow[]
}

// ---- vips_timeline_entries ------------------------------------------------

export interface InsertVipsTimelineEntryInput {
  dimension: string
  canonical_claim_id: string
  verbatim_quote: string
  reflection_id?: number | null
  strength: VipsClaimStrength
  parallax_tag: VipsContextType[]
  reinforces_id?: number | null
}

export function insertVipsTimelineEntry(
  studentId: string,
  input: InsertVipsTimelineEntryInput,
  opts: { ctx?: DbContext } = {},
): VipsTimelineEntryRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO vips_timeline_entries
           (student_id, dimension, canonical_claim_id, verbatim_quote, reflection_id,
            strength, parallax_tag_json, reinforces_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        input.dimension,
        input.canonical_claim_id,
        input.verbatim_quote,
        input.reflection_id ?? null,
        input.strength,
        JSON.stringify(input.parallax_tag),
        input.reinforces_id ?? null,
      )
    const id = Number(result.lastInsertRowid)
    return getVipsTimelineEntry(studentId, id, opts) as VipsTimelineEntryRow
  })()
}

export function getVipsTimelineEntry(
  studentId: string,
  id: number,
  opts: { ctx?: DbContext } = {},
): VipsTimelineEntryRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT * FROM vips_timeline_entries WHERE id = ? AND student_id = ?')
    .get(id, studentId) as VipsTimelineEntryDbRow | undefined
  if (!row) return null
  return rowToVipsTimelineEntry(row)
}

/**
 * List timeline entries for one (student, dimension). By default excludes
 * forgotten rows; pass `includeForgotten: true` to see them (e.g., for an
 * admin / debug view).
 */
export function listVipsTimelineEntries(
  studentId: string,
  dimension: string,
  opts: { includeForgotten?: boolean; ctx?: DbContext } = {},
): VipsTimelineEntryRow[] {
  const db = getDb(opts.ctx ?? {})
  const where = opts.includeForgotten
    ? 'student_id = ? AND dimension = ?'
    : 'student_id = ? AND dimension = ? AND forgotten_at IS NULL'
  const rows = db
    .prepare(`SELECT * FROM vips_timeline_entries WHERE ${where} ORDER BY committed_at DESC`)
    .all(studentId, dimension) as VipsTimelineEntryDbRow[]
  return rows.map(rowToVipsTimelineEntry)
}

/**
 * Soft-forget a timeline entry. Sets `forgotten_at` and removes the row from
 * the FTS5 mirror so future searches do not return it (R19). Increments the
 * per-dimension forget counter. All in one transaction.
 */
export function forgetVipsTimelineEntry(
  studentId: string,
  id: number,
  opts: { ctx?: DbContext } = {},
): VipsTimelineEntryRow | null {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const existing = db
      .prepare('SELECT * FROM vips_timeline_entries WHERE id = ? AND student_id = ?')
      .get(id, studentId) as VipsTimelineEntryDbRow | undefined
    if (!existing) return null
    if (existing.forgotten_at) return rowToVipsTimelineEntry(existing)

    db.prepare(
      `UPDATE vips_timeline_entries SET forgotten_at = datetime('now')
       WHERE id = ? AND student_id = ?`,
    ).run(id, studentId)
    // The AU trigger above re-indexes on UPDATE; remove the row explicitly so
    // forgotten rows are excluded from hybrid retrieval.
    db.prepare(
      `INSERT INTO vips_timeline_entries_fts(vips_timeline_entries_fts, rowid, verbatim_quote)
       VALUES ('delete', ?, ?)`,
    ).run(id, existing.verbatim_quote)
    db.prepare(
      `INSERT INTO vips_forget_count (student_id, dimension, count)
       VALUES (?, ?, 1)
       ON CONFLICT(student_id, dimension) DO UPDATE SET count = count + 1`,
    ).run(studentId, existing.dimension)

    return getVipsTimelineEntry(studentId, id, opts)
  })()
}

/** FTS5-backed search restricted to one student. Forgotten rows are excluded
 *  because they have been removed from the FTS5 mirror. */
export function searchVipsTimelineEntries(
  studentId: string,
  query: string,
  opts: { limit?: number; dimension?: string; ctx?: DbContext } = {},
): VipsTimelineSearchResult[] {
  const db = getDb(opts.ctx ?? {})
  const limit = opts.limit ?? 5
  if (query.trim().length === 0) return []
  const dimensionFilter = opts.dimension ? 'AND t.dimension = ?' : ''
  const stmt = db.prepare(
    `SELECT t.id, t.dimension, t.verbatim_quote, t.committed_at,
            bm25(vips_timeline_entries_fts) AS score
     FROM vips_timeline_entries_fts
     JOIN vips_timeline_entries t ON t.id = vips_timeline_entries_fts.rowid
     WHERE vips_timeline_entries_fts MATCH ? AND t.student_id = ? ${dimensionFilter}
     ORDER BY score
     LIMIT ?`,
  )
  const params: unknown[] = [escapeFtsQuery(query), studentId]
  if (opts.dimension) params.push(opts.dimension)
  params.push(limit)
  const rows = stmt.all(...params) as VipsTimelineSearchDbRow[]
  return rows.map((r) => ({
    id: r.id,
    dimension: r.dimension,
    verbatim_quote: r.verbatim_quote,
    committed_at: r.committed_at,
    score: r.score,
  }))
}

// ---- vips_proposed_diffs --------------------------------------------------

export interface InsertVipsProposedDiffInput {
  mirror_entry_id: number
  payload: unknown
  verifier_result: unknown
}

export function insertVipsProposedDiff(
  studentId: string,
  input: InsertVipsProposedDiffInput,
  opts: { ctx?: DbContext } = {},
): VipsProposedDiffRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO vips_proposed_diffs
           (student_id, mirror_entry_id, payload_json, verifier_result_json, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      )
      .run(
        studentId,
        input.mirror_entry_id,
        JSON.stringify(input.payload),
        JSON.stringify(input.verifier_result),
      )
    const id = Number(result.lastInsertRowid)
    return getVipsProposedDiff(studentId, id, opts) as VipsProposedDiffRow
  })()
}

export function getVipsProposedDiff(
  studentId: string,
  id: number,
  opts: { ctx?: DbContext } = {},
): VipsProposedDiffRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT * FROM vips_proposed_diffs WHERE id = ? AND student_id = ?')
    .get(id, studentId) as VipsProposedDiffDbRow | undefined
  if (!row) return null
  return rowToVipsProposedDiff(row)
}

export function listVipsProposedDiffs(
  studentId: string,
  opts: { status?: VipsProposedDiffStatus; ctx?: DbContext } = {},
): VipsProposedDiffRow[] {
  const db = getDb(opts.ctx ?? {})
  const where = opts.status ? 'student_id = ? AND status = ?' : 'student_id = ?'
  const params: unknown[] = opts.status ? [studentId, opts.status] : [studentId]
  const rows = db
    .prepare(`SELECT * FROM vips_proposed_diffs WHERE ${where} ORDER BY created_at DESC`)
    .all(...params) as VipsProposedDiffDbRow[]
  return rows.map(rowToVipsProposedDiff)
}

/**
 * Transition a proposed diff to `confirmed` or `forgotten`. Stamps
 * `reviewed_at` so the review surface can show "decided just now" vs older
 * pending rows.
 */
export function updateVipsProposedDiffStatus(
  studentId: string,
  id: number,
  status: Exclude<VipsProposedDiffStatus, 'pending'>,
  opts: { ctx?: DbContext } = {},
): VipsProposedDiffRow | null {
  const db = getDb(opts.ctx ?? {})
  db.prepare(
    `UPDATE vips_proposed_diffs
       SET status = ?, reviewed_at = datetime('now')
     WHERE id = ? AND student_id = ?`,
  ).run(status, id, studentId)
  return getVipsProposedDiff(studentId, id, opts)
}

// ---- vips_forget_count ----------------------------------------------------

export function getVipsForgetCount(
  studentId: string,
  dimension: string,
  opts: { ctx?: DbContext } = {},
): number {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare('SELECT count FROM vips_forget_count WHERE student_id = ? AND dimension = ?')
    .get(studentId, dimension) as { count: number } | undefined
  return row?.count ?? 0
}

// ---- cartographer_outputs -------------------------------------------------

export interface InsertCartographerOutputInput {
  trajectory_text: string
  pathways: CartographerPathway[]
  open_questions: string[]
  disclaimer: string
  /** Raw, un-edited Cartographer agent output (JSON-serializable). */
  raw_output: unknown
  trace?: unknown
}

export function insertCartographerOutput(
  studentId: string,
  input: InsertCartographerOutputInput,
  opts: { ctx?: DbContext } = {},
): CartographerOutputRow {
  const db = getDb(opts.ctx ?? {})
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO cartographer_outputs
           (student_id, trajectory_text, pathways_json, open_questions_json,
            disclaimer, raw_output_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        input.trajectory_text,
        JSON.stringify(input.pathways),
        JSON.stringify(input.open_questions),
        input.disclaimer,
        JSON.stringify(input.raw_output),
      )
    const id = Number(result.lastInsertRowid)
    // agent_traces' `agent` column CHECK only allows 'mirror' | 'connector' |
    // 'pathfinder' today. U10 widens the enum during the Pathfinder →
    // Cartographer rename; until then, cartographer traces are not written
    // here to avoid CHECK violations.
    void input.trace
    const row = db
      .prepare('SELECT * FROM cartographer_outputs WHERE id = ?')
      .get(id) as CartographerOutputDbRow
    return rowToCartographerOutput(row)
  })()
}

export function latestCartographerOutput(
  studentId: string,
  opts: { ctx?: DbContext } = {},
): CartographerOutputRow | null {
  const db = getDb(opts.ctx ?? {})
  const row = db
    .prepare(
      `SELECT * FROM cartographer_outputs WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(studentId) as CartographerOutputDbRow | undefined
  if (!row) return null
  return rowToCartographerOutput(row)
}
