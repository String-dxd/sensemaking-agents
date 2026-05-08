import { describe, expect, it } from 'vitest'
import { ECG_TAXONOMY, lookupEcgTaxonomy } from '~/data/ecg-taxonomy'
import { openInMemoryDb } from '~/db/client'
import {
  insertConnectorOutput,
  insertMirrorEntry,
  insertPathfinderOutput,
  latestConnectorOutput,
  latestPathfinderOutput,
  listMirrorEntries,
  searchMirrors,
  updateMirrorEntryFields,
} from '~/db/queries'
import { seed } from '~/db/seed'

const baseEntry = {
  transcript: 'long transcript',
  validation: 'You stayed with the moment.',
  inferred_meaning: 'Maybe there is something here worth marking.',
  story_reframe: 'You did the thing and you noticed it.',
  raw_output: { validation: 'v', inferred_meaning: 'i', story_reframe: 's' },
}

describe('schema + queries', () => {
  it('insertMirrorEntry then searchMirrors round-trips through FTS5', () => {
    const db = openInMemoryDb()
    insertMirrorEntry(
      'demo',
      {
        ...baseEntry,
        story_reframe: 'Physics test on circular motion went poorly today.',
        tags: ['physics', 'sec-4'],
      },
      { ctx: { db } },
    )
    const hits = searchMirrors('demo', 'physics', { ctx: { db } })
    expect(hits.length).toBe(1)
    expect(hits[0]?.story_reframe).toMatch(/Physics test/)
    expect(hits[0]?.tags).toEqual(['physics', 'sec-4'])
  })

  it('searchMirrors does not return rows from a different student', () => {
    const db = openInMemoryDb()
    insertMirrorEntry(
      'demo',
      { ...baseEntry, story_reframe: 'Mine: physics test today.' },
      { ctx: { db } },
    )
    insertMirrorEntry(
      'other',
      { ...baseEntry, story_reframe: 'Theirs: physics test today.' },
      { ctx: { db } },
    )
    const hits = searchMirrors('demo', 'physics', { ctx: { db } })
    expect(hits.length).toBe(1)
    expect(hits[0]?.story_reframe).toMatch(/Mine/)
  })

  it('FTS5 trigger fires on update — search returns the new story_reframe text', () => {
    const db = openInMemoryDb()
    const inserted = insertMirrorEntry(
      'demo',
      { ...baseEntry, story_reframe: 'Walking home from school today.' },
      { ctx: { db } },
    )
    updateMirrorEntryFields(
      'demo',
      inserted.id,
      { story_reframe: 'Walking home and thinking about robotics arm.' },
      { ctx: { db } },
    )
    const hits = searchMirrors('demo', 'robotics', { ctx: { db } })
    expect(hits.length).toBe(1)
    expect(hits[0]?.id).toBe(inserted.id)
  })

  it('updates to validation/inferred_meaning leave raw_output_json untouched (R8)', () => {
    const db = openInMemoryDb()
    const inserted = insertMirrorEntry('demo', baseEntry, { ctx: { db } })
    const originalRaw = inserted.raw_output_json
    updateMirrorEntryFields(
      'demo',
      inserted.id,
      { validation: 'edited validation' },
      { ctx: { db } },
    )
    const after = listMirrorEntries('demo', { ctx: { db } })[0]
    expect(after?.validation).toBe('edited validation')
    expect(after?.raw_output_json).toBe(originalRaw)
  })

  it('queries return empty result on empty query string instead of throwing', () => {
    const db = openInMemoryDb()
    expect(searchMirrors('demo', '', { ctx: { db } })).toEqual([])
    expect(searchMirrors('demo', '   ', { ctx: { db } })).toEqual([])
  })

  it('persists Connector + Pathfinder outputs scoped to the student', () => {
    const db = openInMemoryDb()
    const c = insertConnectorOutput(
      'demo',
      {
        patterns: [
          {
            text: 'Spatial reasoning recurs as a pattern.',
            strength: 'medium',
            evidence_reflection_ids: [1, 6],
          },
        ],
        still_unclear: 'Whether spatial reasoning generalizes outside mechanical assembly.',
      },
      { ctx: { db } },
    )
    expect(c.patterns[0]?.evidence_reflection_ids).toEqual([1, 6])

    const p = insertPathfinderOutput(
      'demo',
      {
        trajectory: 'A drift toward applied, hands-on engineering.',
        pathways: [
          {
            label: 'Mechatronics-leaning engineering',
            reasoning:
              'Reflections 1, 6, and 7 cluster around hands-on assembly and curiosity in mechatronics.',
            ecg_taxonomy_ids: ['cluster.engineering', 'pathway.uni-sutd'],
          },
        ],
        disclaimer: 'Pathways are explorations, not prescriptions.',
        connector_output_id: c.id,
      },
      { ctx: { db } },
    )
    expect(p.connector_output_id).toBe(c.id)
    expect(latestConnectorOutput('demo', { ctx: { db } })?.id).toBe(c.id)
    expect(latestPathfinderOutput('demo', { ctx: { db } })?.id).toBe(p.id)
  })
})

describe('seed loader', () => {
  it('produces 8 rows with deterministic IDs 1..8 against an empty DB', () => {
    const db = openInMemoryDb()
    const result = seed({ db })
    expect(result).toEqual({ inserted: 8, skipped: false })
    const rows = listMirrorEntries('demo', { ctx: { db } })
    expect(rows.length).toBe(8)
    const ids = rows.map((r) => r.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('is idempotent — re-running over a populated DB is a no-op', () => {
    const db = openInMemoryDb()
    seed({ db })
    const second = seed({ db })
    expect(second).toEqual({ inserted: 0, skipped: true })
    expect(listMirrorEntries('demo', { ctx: { db } }).length).toBe(8)
  })
})

describe('ECG taxonomy fixture', () => {
  it('contains at least 30 entries spanning all four categories', () => {
    expect(ECG_TAXONOMY.length).toBeGreaterThanOrEqual(30)
    const categories = new Set(ECG_TAXONOMY.map((e) => e.category))
    expect(categories).toEqual(new Set(['subject', 'cca', 'pathway', 'cluster']))
  })

  it('lookupEcgTaxonomy filters by category and matches against label/description', () => {
    const eng = lookupEcgTaxonomy({ query: 'engineering', category: 'cluster' })
    expect(eng.length).toBeGreaterThan(0)
    expect(eng.every((e) => e.category === 'cluster')).toBe(true)

    const robotics = lookupEcgTaxonomy({ query: 'robotics' })
    expect(robotics.length).toBeGreaterThan(0)
    expect(robotics.some((e) => /robotics/i.test(e.label))).toBe(true)

    const empty = lookupEcgTaxonomy({ query: '__no_such_thing__' })
    expect(empty).toEqual([])
  })
})
