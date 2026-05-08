import type { Database as DatabaseInstance } from 'better-sqlite3'
import { openDb } from './client'

export interface MirrorSignal {
  kind: 'observed' | 'inferred' | 'uncertain'
  text: string
  evidence_excerpts?: string[]
}

export interface MirrorEntryRow {
  id: number
  student_id: string
  summary: string
  transcript: string
  signals: MirrorSignal[]
  caution: string
  tags: string[]
  created_at: string
}

export interface MirrorSearchResult {
  id: number
  summary: string
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

interface MirrorEntryDbRow {
  id: number
  student_id: string
  summary: string
  transcript: string
  signals_json: string
  caution: string
  created_at: string
}

interface MirrorSearchDbRow {
  id: number
  summary: string
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

/** FTS5-backed search restricted to one student. Tags are intersected for boosting. */
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
      `SELECT m.id, m.summary, m.created_at, bm25(mirror_entries_fts) AS score
       FROM mirror_entries_fts
       JOIN mirror_entries m ON m.id = mirror_entries_fts.rowid
       WHERE mirror_entries_fts MATCH ? AND m.student_id = ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(escapeFtsQuery(query), studentId, limit) as MirrorSearchDbRow[]

  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
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
  summary: string
  transcript: string
  signals: MirrorSignal[]
  caution: string
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
        `INSERT INTO mirror_entries (student_id, summary, transcript, signals_json, caution)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(studentId, input.summary, input.transcript, JSON.stringify(input.signals), input.caution)
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
    return {
      id: row.id,
      student_id: row.student_id,
      summary: row.summary,
      transcript: row.transcript,
      signals: JSON.parse(row.signals_json) as MirrorSignal[],
      caution: row.caution,
      tags: loadTags(db, id),
      created_at: row.created_at,
    }
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
  return rows.map((row) => ({
    id: row.id,
    student_id: row.student_id,
    summary: row.summary,
    transcript: row.transcript,
    signals: JSON.parse(row.signals_json) as MirrorSignal[],
    caution: row.caution,
    tags: loadTags(db, row.id),
    created_at: row.created_at,
  }))
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
  return {
    id: row.id,
    student_id: row.student_id,
    summary: row.summary,
    transcript: row.transcript,
    signals: JSON.parse(row.signals_json) as MirrorSignal[],
    caution: row.caution,
    tags: loadTags(db, row.id),
    created_at: row.created_at,
  }
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

export function updateMirrorEntryFields(
  studentId: string,
  id: number,
  patch: Partial<Pick<MirrorEntryRow, 'summary' | 'caution' | 'signals'>>,
  opts: { ctx?: DbContext } = {},
): MirrorEntryRow | null {
  const db = getDb(opts.ctx ?? {})
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.summary !== undefined) {
    fields.push('summary = ?')
    values.push(patch.summary)
  }
  if (patch.caution !== undefined) {
    fields.push('caution = ?')
    values.push(patch.caution)
  }
  if (patch.signals !== undefined) {
    fields.push('signals_json = ?')
    values.push(JSON.stringify(patch.signals))
  }
  if (fields.length === 0) return getMirrorEntry(studentId, id, opts)
  values.push(id, studentId)
  db.prepare(`UPDATE mirror_entries SET ${fields.join(', ')} WHERE id = ? AND student_id = ?`).run(
    ...values,
  )
  return getMirrorEntry(studentId, id, opts)
}
