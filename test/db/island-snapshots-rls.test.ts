// RLS verification for vips_island_snapshots.
//
// Confirms two invariants per the U2 plan-006 test scenarios:
//   1. Same-tenant insert + select round-trips through `withStudent`.
//   2. Cross-tenant insert is rejected by the RLS `WITH CHECK` predicate.
//
// Skipped unless DATABASE_URL is set. CI runs against a Neon dev branch
// where the 0001_island_snapshots migration has been applied.

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { withStudent } from '~/db/client'

const STUDENT_A = `island-snap-a-${process.pid}-${Date.now()}`
const STUDENT_B = `island-snap-b-${process.pid}-${Date.now()}`

describe.skipIf(!process.env.DATABASE_URL)('vips_island_snapshots RLS', () => {
  it('same-tenant insert + select round-trips', async () => {
    const payload = JSON.stringify({ bloomedTrees: [{ id: 't1', species: 'tree' }] })

    await withStudent(STUDENT_A, async (ctx) => {
      await ctx.db.execute(sql`
        insert into vips_island_snapshots (student_id, payload_json)
        values (${STUDENT_A}, ${payload})
      `)
    })

    const rows = await withStudent(STUDENT_A, async (ctx) => {
      const result = await ctx.db.execute<{ student_id: string; payload_json: string }>(sql`
        select student_id, payload_json from vips_island_snapshots
        where student_id = ${STUDENT_A}
      `)
      return result.rows
    })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.student_id === STUDENT_A)).toBe(true)
    expect(rows.some((r) => r.payload_json === payload)).toBe(true)
  })

  it('rejects cross-tenant inserts via RLS WITH CHECK', async () => {
    // Attempt: from STUDENT_B's GUC context, insert a row claiming STUDENT_A
    // as the owner. RLS's WITH CHECK predicate (student_id = GUC) must reject.
    let raised: Error | null = null
    try {
      await withStudent(STUDENT_B, async (ctx) => {
        await ctx.db.execute(sql`
          insert into vips_island_snapshots (student_id, payload_json)
          values (${STUDENT_A}, ${'{}'})
        `)
      })
    } catch (err) {
      raised = err as Error
    }

    expect(raised).not.toBeNull()
    expect(raised?.message ?? '').toMatch(/row-level security|violates row/i)
  })

  it('counselor-style cross-tenant read returns zero rows', async () => {
    // Confirm RLS USING predicate hides STUDENT_A's snapshots from STUDENT_B's
    // session even if STUDENT_B somehow knew the rows existed.
    const rows = await withStudent(STUDENT_B, async (ctx) => {
      const result = await ctx.db.execute<{ student_id: string }>(sql`
        select student_id from vips_island_snapshots
        where student_id = ${STUDENT_A}
      `)
      return result.rows
    })

    expect(rows.length).toBe(0)
    // Belt + suspenders — every row STUDENT_B can see must claim STUDENT_B.
    const allBRows = await withStudent(STUDENT_B, async (ctx) => {
      const result = await ctx.db.execute<{ student_id: string }>(sql`
        select student_id from vips_island_snapshots
      `)
      return result.rows
    })
    expect(allBRows.every((r) => r.student_id === STUDENT_B)).toBe(true)
  })

  it('captured_at defaults to now() on insert', async () => {
    const before = new Date()
    await withStudent(STUDENT_A, async (ctx) => {
      await ctx.db.execute(sql`
        insert into vips_island_snapshots (student_id, payload_json)
        values (${STUDENT_A}, ${'{"bloomedTrees":[]}'})
      `)
    })
    const after = new Date()

    const latest = await withStudent(STUDENT_A, async (ctx) => {
      const result = await ctx.db.execute<{ captured_at: string }>(sql`
        select captured_at from vips_island_snapshots
        where student_id = ${STUDENT_A}
        order by captured_at desc limit 1
      `)
      return result.rows[0]
    })

    expect(latest).toBeDefined()
    if (!latest) throw new Error('unreachable: expect(latest).toBeDefined() failed')
    const capturedAt = new Date(latest.captured_at)
    // Allow 5s slack on either side for any client/server clock skew.
    expect(capturedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000)
    expect(capturedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 5000)
  })
})
