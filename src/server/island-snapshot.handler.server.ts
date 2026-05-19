/**
 * POST /api/island/snapshot — persist a single Sprouts-slice payload row.
 *
 * Fired by the engine's IslandSnapshotBridge on three coarse triggers (boot
 * throttled to 1/hr, every `bloom`, every `decorMoved`). The point is to
 * accumulate enough server-authoritative state that U5's island timelapse
 * can reconstruct past years with real fidelity — claim-history synthesis
 * is the fallback when no snapshot covers the requested year-end.
 *
 * Auth: WorkOS-only. Demo and dev-bypass sessions are 403'd with
 * `growth_demo_unsupported`. The bridge swallows the 403 silently —
 * snapshotting is fire-and-forget and never user-visible.
 *
 * RLS: insert flows through `withStudent(studentId, ...)`. The shared
 * RLS_STUDENT_PREDICATE rejects any cross-tenant insert via WITH CHECK.
 */

import { sql } from 'drizzle-orm'

import { getDemoBypassAuthFromCookie } from '~/auth/demo-session.server'
import { requireCounselorContext } from '~/auth/identity'
import { getDevBypassAuth } from '~/auth/middleware'
import { withStudent } from '~/db/client'

import { type IslandSnapshotInput, islandSnapshotInputSchema } from './function-schemas'

export class GrowthDemoUnsupportedError extends Error {
  readonly code = 'growth_demo_unsupported'
  constructor() {
    super('Island snapshots are only persisted for signed-in WorkOS accounts.')
    this.name = 'GrowthDemoUnsupportedError'
  }
}

export class GrowthUnknownStudentError extends Error {
  readonly code = 'growth_unknown_student'
  constructor() {
    super('Cannot persist an island snapshot without a resolvable student identity.')
    this.name = 'GrowthUnknownStudentError'
  }
}

function assertWorkosOnly(): void {
  if (getDevBypassAuth()) throw new GrowthDemoUnsupportedError()
  if (getDemoBypassAuthFromCookie()) throw new GrowthDemoUnsupportedError()
}

export async function persistIslandSnapshotHandler(data: IslandSnapshotInput): Promise<void> {
  islandSnapshotInputSchema.parse(data)
  assertWorkosOnly()

  const { studentId } = await requireCounselorContext()
  if (!studentId) throw new GrowthUnknownStudentError()

  await withStudent(studentId, async (ctx) => {
    await ctx.db.execute(sql`
      insert into vips_island_snapshots (student_id, payload_json)
      values (${studentId}, ${data.payload_json})
    `)
  })
}
