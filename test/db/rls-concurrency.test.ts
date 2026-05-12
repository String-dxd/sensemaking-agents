// RLS concurrency integration test (Step 2e of the managed-agents migration).
//
// Asserts that two `withStudent` envelopes running in parallel against the same
// pool see only their own tenant's rows. Backstop against an RLS regression
// where `SET LOCAL app.student_id = …` leaks across transactions (which
// happens if it's mistakenly issued as `SET` instead of `SET LOCAL`, or if
// PgBouncer session-mode sticks the GUC to a backend across pool returns).
//
// Skipped unless `DATABASE_URL` is set. CI runs against a Neon dev branch
// where the initial Drizzle migration has been applied.

import { describe, expect, it } from 'vitest'

import { withStudent } from '~/db/client'
import { insertMirrorEntry, listMirrorEntries } from '~/db/queries'

const STUDENT_A = `rls-test-a-${process.pid}-${Date.now()}`
const STUDENT_B = `rls-test-b-${process.pid}-${Date.now()}`

describe.skipIf(!process.env.DATABASE_URL)('withStudent + RLS concurrency', () => {
  it('parallel withStudent envelopes do not leak rows across tenants', async () => {
    // Race two inserts in parallel. If the GUC bleeds, one of these will see
    // the other tenant's row when it lists.
    const [aId, bId] = await Promise.all([
      insertMirrorEntry(STUDENT_A, {
        transcript: 'A says hello',
        validation: 'a',
        inferred_meaning: 'a',
        story_reframe: 'a',
        raw_output: {},
      }).then((r) => r.id),
      insertMirrorEntry(STUDENT_B, {
        transcript: 'B says hello',
        validation: 'b',
        inferred_meaning: 'b',
        story_reframe: 'b',
        raw_output: {},
      }).then((r) => r.id),
    ])

    // Now list under each tenant in parallel — each should see only its own row.
    const [aList, bList] = await Promise.all([
      listMirrorEntries(STUDENT_A, { limit: 100 }),
      listMirrorEntries(STUDENT_B, { limit: 100 }),
    ])

    expect(aList.map((r) => r.id)).toContain(aId)
    expect(aList.map((r) => r.id)).not.toContain(bId)
    expect(bList.map((r) => r.id)).toContain(bId)
    expect(bList.map((r) => r.id)).not.toContain(aId)

    // Belt + suspenders: every row visible to A must claim A as its owner.
    expect(aList.every((r) => r.student_id === STUDENT_A)).toBe(true)
    expect(bList.every((r) => r.student_id === STUDENT_B)).toBe(true)
  })

  it('GUC is set BEFORE any user query — query inside the envelope can read its own write', async () => {
    // Regression guard against `SET LOCAL` being issued after a query in the
    // same tx: if `set_config` were called second, the prior query would run
    // unconfigured and RLS would return zero rows.
    const id = await insertMirrorEntry(STUDENT_A, {
      transcript: 'guc-order check',
      validation: 'x',
      inferred_meaning: 'x',
      story_reframe: 'x',
      raw_output: {},
    }).then((r) => r.id)

    await withStudent(STUDENT_A, async (ctx) => {
      const rows = await listMirrorEntries(STUDENT_A, { ctx, limit: 100 })
      expect(rows.map((r) => r.id)).toContain(id)
    })
  })

  it('withStudent rejects empty studentId', async () => {
    await expect(withStudent('', async () => null)).rejects.toThrow(/studentId is required/)
    await expect(withStudent('   ', async () => null)).rejects.toThrow(/studentId is required/)
  })
})
