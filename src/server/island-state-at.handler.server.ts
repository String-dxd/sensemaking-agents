/**
 * Hybrid historical island reconstruction for the year-over-year growth
 * timelapse.
 *
 *   1. Try the latest `vips_island_snapshots` row with `captured_at <=
 *      end-of-year-SGT`. If found, return its bloomedTrees as
 *      `{ source: 'snapshot', capturedAt, bloomedTrees }`.
 *
 *   2. Otherwise synthesise a coarse stand-in from the student's
 *      `vips_timeline_entries` (claims committed by end-of-year and not
 *      forgotten by then). Map dimension → species via the same constant
 *      the engine uses (Sprouts.DIMENSION_TO_SPECIES), and derive a
 *      deterministic `placementSeed` from the row's id so reloads see a
 *      stable layout.
 *
 * Honest UX: the UI labels which mode is in use ("snapshot from June
 * 2026" vs "reconstructed from your claims"). Years older than the
 * snapshotting era (started by U3) always fall into mode 2; new
 * students see mode 1 from the day this ships.
 *
 * Returns no DB writes; this is a pure read.
 */

import { sql } from 'drizzle-orm'

import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import { endOfSgtYearIso } from '~/lib/year-buckets'

import { type IslandStateAtInput, islandStateAtInputSchema } from './function-schemas'

export type IslandBloomedTree = {
  id: string
  species: 'tree' | 'flower' | 'butterfly' | 'fruit'
  treeSpecies?: 'oak' | 'cherry'
  placementSeed: number
  bloomedAt: string
  dimension: 'values' | 'interests' | 'personality' | 'skills' | null
  position: { x: number; z: number } | null
}

export type IslandStateAtResult = {
  source: 'snapshot' | 'reconstructed' | 'empty'
  capturedAt: string | null
  year: number
  bloomedTrees: IslandBloomedTree[]
}

// Engine-side mapping (Sprouts.DIMENSION_TO_SPECIES). Mirrored here so the
// server can produce engine-compatible BloomedTree shapes for the
// reconstructed mode without importing engine JS into the server bundle.
const DIMENSION_TO_SPECIES = {
  values: 'tree',
  interests: 'flower',
  personality: 'butterfly',
  skills: 'fruit',
} as const

const TREE_SPECIES_ROTATION = ['oak', 'cherry'] as const

/** djb2 over a string — fast, deterministic, no crypto dep. */
function stableHash(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

type SnapshotRow = { payload_json: string; captured_at: string } & Record<string, unknown>

type TimelineRow = {
  id: number
  dimension: 'values' | 'interests' | 'personality' | 'skills'
  canonical_claim_id: string
  committed_at: string
} & Record<string, unknown>

/**
 * Parse a snapshot payload row safely. The payload is a JSON string of
 * `{ v, sprouts: { bloomedTrees, ... } }` — we read `sprouts.bloomedTrees`
 * and tolerate malformed shapes by returning an empty array.
 */
function readSnapshotBloomedTrees(payloadJson: string): IslandBloomedTree[] {
  try {
    const parsed = JSON.parse(payloadJson) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const sprouts = (parsed as { sprouts?: unknown }).sprouts
    if (!sprouts || typeof sprouts !== 'object') return []
    const bloomed = (sprouts as { bloomedTrees?: unknown }).bloomedTrees
    if (!Array.isArray(bloomed)) return []
    return bloomed.filter((tree): tree is IslandBloomedTree => {
      return Boolean(
        tree && typeof tree === 'object' && typeof (tree as { id: unknown }).id === 'string',
      )
    })
  } catch {
    return []
  }
}

function reconstructBloomedTree(row: TimelineRow): IslandBloomedTree {
  const species = DIMENSION_TO_SPECIES[row.dimension]
  const seed = stableHash(`${row.id}:${row.canonical_claim_id}`)
  const tree: IslandBloomedTree = {
    id: `reconstructed-${row.id}`,
    species,
    placementSeed: seed,
    bloomedAt: row.committed_at,
    dimension: row.dimension,
    position: null,
  }
  if (species === 'tree') {
    tree.treeSpecies = TREE_SPECIES_ROTATION[seed % TREE_SPECIES_ROTATION.length]
  }
  return tree
}

export async function getIslandStateAtHandler(
  data: IslandStateAtInput,
): Promise<IslandStateAtResult> {
  islandStateAtInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  if (!studentId) {
    return { source: 'empty', capturedAt: null, year: data.year, bloomedTrees: [] }
  }

  const at = endOfSgtYearIso(data.year)

  return withStudent(studentId, async (ctx) => {
    // Path 1 — latest snapshot at or before the year-end timestamp.
    const snapResult = await ctx.db.execute<SnapshotRow>(sql`
      select payload_json, captured_at from vips_island_snapshots
      where captured_at <= ${at}
      order by captured_at desc
      limit 1
    `)
    const snapshot = snapResult.rows[0]
    if (snapshot) {
      const bloomedTrees = readSnapshotBloomedTrees(snapshot.payload_json)
      return {
        source: 'snapshot' as const,
        capturedAt: snapshot.captured_at,
        year: data.year,
        bloomedTrees,
      }
    }

    // Path 2 — reconstruct from claims committed by `at` and not forgotten
    // by then. Forgets that fall AFTER `at` are still visible at `at`.
    const timelineResult = await ctx.db.execute<TimelineRow>(sql`
      select id, dimension, canonical_claim_id, committed_at from vips_timeline_entries
      where committed_at <= ${at}
        and (forgotten_at is null or forgotten_at > ${at})
      order by committed_at asc
    `)
    const bloomedTrees = timelineResult.rows.map(reconstructBloomedTree)
    if (bloomedTrees.length === 0) {
      return {
        source: 'empty' as const,
        capturedAt: null,
        year: data.year,
        bloomedTrees: [],
      }
    }
    return {
      source: 'reconstructed' as const,
      capturedAt: null,
      year: data.year,
      bloomedTrees,
    }
  })
}
