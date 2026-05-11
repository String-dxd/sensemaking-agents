import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ECG_TAXONOMY, lookupEcgTaxonomy } from '~/data/ecg-taxonomy'
import { openDb, openInMemoryDb, resetDbForTests } from '~/db/client'
import {
  forgetVipsTimelineEntry,
  getVipsForgetCount,
  getVipsPage,
  getVipsProposedDiff,
  insertCartographerOutput,
  insertConnectorOutput,
  insertMirrorEntry,
  insertPathfinderOutput,
  insertVipsProposedDiff,
  insertVipsTimelineEntry,
  latestCartographerOutput,
  latestConnectorOutput,
  latestPathfinderOutput,
  listMirrorEntries,
  listVipsPages,
  listVipsProposedDiffs,
  listVipsTimelineEntries,
  searchMirrors,
  searchVipsTimelineEntries,
  updateMirrorEntryFields,
  updateVipsProposedDiffStatus,
  upsertVipsPage,
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

  // ── ECG taxonomy crosswalk (U3, R21) ──────────────────────────────────────
  it('every subject entry has ≥1 cluster link (R21)', () => {
    const subjects = ECG_TAXONOMY.filter((e) => e.category === 'subject')
    expect(subjects.length).toBeGreaterThan(0)
    for (const s of subjects) {
      expect(s.links, `subject ${s.id} has no links`).toBeDefined()
      expect((s.links ?? []).length, `subject ${s.id} has 0 links`).toBeGreaterThanOrEqual(1)
      expect((s.links ?? []).every((l) => l.startsWith('cluster.'))).toBe(true)
    }
  })

  it('every cca entry has ≥1 cluster link (R21)', () => {
    const ccas = ECG_TAXONOMY.filter((e) => e.category === 'cca')
    expect(ccas.length).toBeGreaterThan(0)
    for (const c of ccas) {
      expect(c.links, `cca ${c.id} has no links`).toBeDefined()
      expect((c.links ?? []).length, `cca ${c.id} has 0 links`).toBeGreaterThanOrEqual(1)
      expect((c.links ?? []).every((l) => l.startsWith('cluster.'))).toBe(true)
    }
  })

  it('every link target resolves to an existing cluster.* entry — no dangling refs (R21)', () => {
    const clusterIds = new Set(
      ECG_TAXONOMY.filter((e) => e.category === 'cluster').map((e) => e.id),
    )
    expect(clusterIds.size).toBeGreaterThan(0)
    for (const entry of ECG_TAXONOMY) {
      for (const link of entry.links ?? []) {
        expect(
          clusterIds.has(link),
          `entry ${entry.id} links to non-existent cluster ${link}`,
        ).toBe(true)
      }
    }
  })

  it('cluster entries themselves have empty links — clusters do not link to clusters (R21)', () => {
    const clusters = ECG_TAXONOMY.filter((e) => e.category === 'cluster')
    expect(clusters.length).toBeGreaterThan(0)
    for (const c of clusters) {
      expect(c.links ?? []).toEqual([])
    }
  })
})

describe('VIPS schema (U1)', () => {
  it('vips_pages round-trips and is keyed by (student_id, dimension)', () => {
    const db = openInMemoryDb()
    upsertVipsPage(
      'demo',
      {
        dimension: 'interests',
        compiled_truth: 'You are drawn to making physical things work.',
        open_question: 'Does the pull hold outside mechanical assembly?',
      },
      { ctx: { db } },
    )
    const got = getVipsPage('demo', 'interests', { ctx: { db } })
    expect(got?.compiled_truth).toMatch(/physical things/)

    // Upsert replaces compiled_truth and bumps updated_at.
    upsertVipsPage(
      'demo',
      {
        dimension: 'interests',
        compiled_truth: 'Refined truth.',
        open_question: 'Refined question?',
      },
      { ctx: { db } },
    )
    const after = getVipsPage('demo', 'interests', { ctx: { db } })
    expect(after?.compiled_truth).toBe('Refined truth.')

    // Other dimensions for the same student are independent.
    upsertVipsPage(
      'demo',
      {
        dimension: 'values',
        compiled_truth: 'Values truth.',
        open_question: 'Values question?',
      },
      { ctx: { db } },
    )
    expect(listVipsPages('demo', { ctx: { db } }).length).toBe(2)
  })

  it('vips_timeline_entries round-trips and FTS5 AI/AU triggers fire on verbatim_quote', () => {
    const db = openInMemoryDb()
    const inserted = insertVipsTimelineEntry(
      'demo',
      {
        dimension: 'interests',
        canonical_claim_id: 'claim.mechatronics',
        verbatim_quote: 'I rebuilt the robot arm three times until it gripped.',
        strength: 'medium',
        parallax_tag: ['school'],
      },
      { ctx: { db } },
    )
    expect(inserted.parallax_tag).toEqual(['school'])

    // AI trigger -> search finds the new row.
    const hits = searchVipsTimelineEntries('demo', 'robot arm', { ctx: { db } })
    expect(hits.length).toBe(1)
    expect(hits[0]?.id).toBe(inserted.id)

    // Direct UPDATE fires the AU trigger and re-indexes.
    db.prepare(
      `UPDATE vips_timeline_entries SET verbatim_quote = ? WHERE id = ?`,
    ).run('I rebuilt the gripper three times until it held a marble.', inserted.id)
    expect(searchVipsTimelineEntries('demo', 'robot arm', { ctx: { db } }).length).toBe(0)
    expect(searchVipsTimelineEntries('demo', 'gripper', { ctx: { db } }).length).toBe(1)
  })

  it('forgetVipsTimelineEntry excludes the row from FTS and from default listings', () => {
    const db = openInMemoryDb()
    const a = insertVipsTimelineEntry(
      'demo',
      {
        dimension: 'interests',
        canonical_claim_id: 'claim.mechatronics',
        verbatim_quote: 'The mechatronics workshop was the best part of term.',
        strength: 'high',
        parallax_tag: ['school'],
      },
      { ctx: { db } },
    )
    insertVipsTimelineEntry(
      'demo',
      {
        dimension: 'interests',
        canonical_claim_id: 'claim.mechatronics',
        verbatim_quote: 'I keep doodling mechatronics linkages in my notebook.',
        strength: 'medium',
        parallax_tag: ['hobby'],
      },
      { ctx: { db } },
    )
    expect(searchVipsTimelineEntries('demo', 'mechatronics', { ctx: { db } }).length).toBe(2)

    forgetVipsTimelineEntry('demo', a.id, { ctx: { db } })

    // FTS excludes the forgotten row.
    const hits = searchVipsTimelineEntries('demo', 'mechatronics', { ctx: { db } })
    expect(hits.length).toBe(1)
    expect(hits[0]?.id).not.toBe(a.id)

    // Default list excludes the forgotten row; explicit opt-in includes it.
    expect(
      listVipsTimelineEntries('demo', 'interests', { ctx: { db } }).length,
    ).toBe(1)
    expect(
      listVipsTimelineEntries('demo', 'interests', { includeForgotten: true, ctx: { db } }).length,
    ).toBe(2)

    // Forget counter incremented.
    expect(getVipsForgetCount('demo', 'interests', { ctx: { db } })).toBe(1)
  })

  it('vips_proposed_diffs transitions pending -> confirmed and stamps reviewed_at', () => {
    const db = openInMemoryDb()
    const mirror = insertMirrorEntry('demo', baseEntry, { ctx: { db } })
    const diff = insertVipsProposedDiff(
      'demo',
      {
        mirror_entry_id: mirror.id,
        payload: { dimension: 'interests', new_entries: [{ q: 'quote' }] },
        verifier_result: { admitted: 1, dropped: 0 },
      },
      { ctx: { db } },
    )
    expect(diff.status).toBe('pending')
    expect(diff.reviewed_at).toBeNull()

    const confirmed = updateVipsProposedDiffStatus('demo', diff.id, 'confirmed', {
      ctx: { db },
    })
    expect(confirmed?.status).toBe('confirmed')
    expect(confirmed?.reviewed_at).not.toBeNull()

    // payload + verifier_result round-trip as JSON.
    const fetched = getVipsProposedDiff('demo', diff.id, { ctx: { db } })
    expect((fetched?.payload as { dimension: string }).dimension).toBe('interests')
    expect((fetched?.verifier_result as { admitted: number }).admitted).toBe(1)
  })

  it('vips_proposed_diffs status CHECK rejects unknown values', () => {
    const db = openInMemoryDb()
    const mirror = insertMirrorEntry('demo', baseEntry, { ctx: { db } })
    expect(() =>
      db
        .prepare(
          `INSERT INTO vips_proposed_diffs
             (student_id, mirror_entry_id, payload_json, verifier_result_json, status)
           VALUES ('demo', ?, '{}', '{}', 'bogus')`,
        )
        .run(mirror.id),
    ).toThrow()
  })

  it('cartographer_outputs round-trips trajectory + pathways + open_questions', () => {
    const db = openInMemoryDb()
    const out = insertCartographerOutput(
      'demo',
      {
        trajectory_text: 'A drift toward applied, hands-on engineering.',
        pathways: [
          {
            label: 'Mechatronics-leaning engineering',
            reasoning: 'Recurring mechatronics curiosity across school + hobby.',
            ecg_taxonomy_ids: ['cluster.engineering'],
          },
        ],
        open_questions: ['Does the pull hold outside mechanical assembly?'],
        disclaimer: 'Pathways are explorations, not prescriptions.',
        raw_output: { ok: true },
      },
      { ctx: { db } },
    )
    expect(out.pathways[0]?.ecg_taxonomy_ids).toEqual(['cluster.engineering'])
    expect(out.open_questions.length).toBe(1)
    expect(latestCartographerOutput('demo', { ctx: { db } })?.id).toBe(out.id)
  })

  it('mirror_entries.context_type CHECK rejects values outside the closed enum', () => {
    const db = openInMemoryDb()
    expect(() =>
      db
        .prepare(
          `INSERT INTO mirror_entries
             (student_id, transcript, validation, inferred_meaning, story_reframe,
              raw_output_json, context_type)
           VALUES ('demo', 't', 'v', 'i', 's', '{}', 'offcampus')`,
        )
        .run(),
    ).toThrow()
  })

  it('mirror_entries.context_type defaults to school when not provided (legacy callers)', () => {
    const db = openInMemoryDb()
    insertMirrorEntry('demo', baseEntry, { ctx: { db } })
    const row = db
      .prepare('SELECT context_type FROM mirror_entries WHERE student_id = ? LIMIT 1')
      .get('demo') as { context_type: string }
    expect(row.context_type).toBe('school')
  })

  it('cross-student isolation holds across all VIPS tables', () => {
    const db = openInMemoryDb()
    upsertVipsPage(
      'a',
      { dimension: 'interests', compiled_truth: 'A truth.', open_question: 'A?' },
      { ctx: { db } },
    )
    upsertVipsPage(
      'b',
      { dimension: 'interests', compiled_truth: 'B truth.', open_question: 'B?' },
      { ctx: { db } },
    )
    expect(getVipsPage('a', 'interests', { ctx: { db } })?.compiled_truth).toBe('A truth.')
    expect(getVipsPage('b', 'interests', { ctx: { db } })?.compiled_truth).toBe('B truth.')

    insertVipsTimelineEntry(
      'a',
      {
        dimension: 'interests',
        canonical_claim_id: 'c',
        verbatim_quote: 'Aardvark unique-A token quote.',
        strength: 'medium',
        parallax_tag: ['school'],
      },
      { ctx: { db } },
    )
    insertVipsTimelineEntry(
      'b',
      {
        dimension: 'interests',
        canonical_claim_id: 'c',
        verbatim_quote: 'Aardvark unique-B token quote.',
        strength: 'medium',
        parallax_tag: ['school'],
      },
      { ctx: { db } },
    )
    const hitsA = searchVipsTimelineEntries('a', 'aardvark', { ctx: { db } })
    expect(hitsA.length).toBe(1)
    expect(hitsA[0]?.verbatim_quote).toMatch(/unique-A/)
  })

  it('full F1-like sequence: mirror -> proposed_diff(pending) -> confirmed -> timeline -> page', () => {
    const db = openInMemoryDb()
    const mirror = insertMirrorEntry(
      'demo',
      { ...baseEntry, story_reframe: 'You rebuilt the gripper three times.' },
      { ctx: { db } },
    )
    const diff = insertVipsProposedDiff(
      'demo',
      {
        mirror_entry_id: mirror.id,
        payload: {
          dimension: 'interests',
          new_entries: [
            { canonical_claim_id: 'claim.mechatronics', quote: 'rebuilt gripper' },
          ],
          compiled_truth: 'You are drawn to making physical things work.',
        },
        verifier_result: { admitted: 1, dropped: 0 },
      },
      { ctx: { db } },
    )
    updateVipsProposedDiffStatus('demo', diff.id, 'confirmed', { ctx: { db } })
    const tle = insertVipsTimelineEntry(
      'demo',
      {
        dimension: 'interests',
        canonical_claim_id: 'claim.mechatronics',
        verbatim_quote: 'You rebuilt the gripper three times.',
        reflection_id: mirror.id,
        strength: 'medium',
        parallax_tag: ['school'],
      },
      { ctx: { db } },
    )
    upsertVipsPage(
      'demo',
      {
        dimension: 'interests',
        compiled_truth: 'You are drawn to making physical things work.',
        open_question: 'Does the pull hold outside mechanical assembly?',
      },
      { ctx: { db } },
    )

    expect(listVipsProposedDiffs('demo', { ctx: { db } })[0]?.status).toBe('confirmed')
    expect(listVipsTimelineEntries('demo', 'interests', { ctx: { db } }).length).toBe(1)
    expect(getVipsPage('demo', 'interests', { ctx: { db } })?.compiled_truth).toMatch(
      /physical things/,
    )

    // Another student sees nothing.
    expect(listVipsTimelineEntries('other', 'interests', { ctx: { db } }).length).toBe(0)
    expect(listVipsProposedDiffs('other', { ctx: { db } }).length).toBe(0)
    expect(getVipsPage('other', 'interests', { ctx: { db } })).toBeNull()
    void tle
  })
})

describe('SCHEMA_VERSION mismatch drop-and-reseed', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sense-db-test-'))
    dbPath = join(tmpDir, 'app.db')
    resetDbForTests()
  })

  afterEach(() => {
    resetDbForTests()
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  })

  it('drops and recreates the db when the on-disk schema_version does not match', () => {
    // Boot once with the current schema, write a marker row.
    const db1 = openDb({ path: dbPath })
    insertMirrorEntry('demo', baseEntry, { ctx: { db: db1 } })
    expect(listMirrorEntries('demo', { ctx: { db: db1 } }).length).toBe(1)
    resetDbForTests()

    // Pretend a future schema version landed by stamping _meta with a bogus value.
    // openDb caches handles, so we have to re-open to a fresh handle that
    // bypasses the cache via path.
    const Database = require('better-sqlite3')
    const probe = new Database(dbPath)
    probe.prepare(`UPDATE _meta SET value = '999' WHERE key = 'schema_version'`).run()
    probe.close()

    // Re-open via the cached client: it should detect the mismatch and
    // drop+recreate the file. The previously-seeded row is gone.
    const db2 = openDb({ path: dbPath })
    expect(listMirrorEntries('demo', { ctx: { db: db2 } }).length).toBe(0)
  })
})
