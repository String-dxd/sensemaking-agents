/**
 * Unit coverage for U5 — `getIslandStateAt` server function.
 *
 * Exercises the snapshot-parsing helpers and the deterministic
 * reconstruction shape directly. The full RLS-scoped query path is
 * exercised via the existing DB-test suite when DATABASE_URL is set
 * (mirrors how plan-005's load-public-profile leaves DB-against-real-
 * data to the integration suite).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { islandStateAtInputSchema } from '~/server/function-schemas'
import { getIslandStateAtHandler } from '~/server/island-state-at.handler.server'

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

beforeEach(() => {
  requireCounselorContextMock.mockReset()
  withStudentMock.mockReset()
  requireCounselorContextMock.mockResolvedValue({
    counselorId: 'demo-counselor',
    studentId: 'demo-a',
  })
})

describe('islandStateAtInputSchema', () => {
  it('accepts plausible calendar years', () => {
    expect(islandStateAtInputSchema.parse({ year: 2026 })).toEqual({ year: 2026 })
  })

  it('rejects out-of-range years', () => {
    expect(() => islandStateAtInputSchema.parse({ year: 1900 })).toThrow()
    expect(() => islandStateAtInputSchema.parse({ year: 3000 })).toThrow()
  })

  it('rejects non-integer years', () => {
    expect(() => islandStateAtInputSchema.parse({ year: 2026.5 })).toThrow()
  })
})

describe('getIslandStateAtHandler snapshot fallback', () => {
  // The handler first probes for the snapshot table with `to_regclass`, which
  // returns NULL (never errors) for an absent relation. So the first `execute`
  // call is the probe, and the snapshot select is skipped entirely when the
  // table is missing — leaving the surrounding transaction healthy for Path 2.
  const tableAbsent = { rows: [{ oid: null }] }
  const tablePresent = { rows: [{ oid: 'vips_island_snapshots' }] }

  it('reconstructs from timeline rows when the snapshot table is absent', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(tableAbsent)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            dimension: 'skills',
            canonical_claim_id: 'skills.analytical',
            committed_at: '2026-05-19T08:00:00.000Z',
          },
        ],
      })
    withStudentMock.mockImplementation(async (_studentId, fn) => fn({ db: { execute } }))

    const result = await getIslandStateAtHandler({ year: 2026 })

    expect(result).toMatchObject({
      source: 'reconstructed',
      capturedAt: null,
      year: 2026,
    })
    expect(result.bloomedTrees).toEqual([
      expect.objectContaining({
        id: 'reconstructed-7',
        species: 'fruit',
        dimension: 'skills',
      }),
    ])
    // probe + timeline reconstruction — the snapshot select is never issued.
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('returns empty when the snapshot table is absent and no claims exist yet', async () => {
    const execute = vi.fn().mockResolvedValueOnce(tableAbsent).mockResolvedValueOnce({ rows: [] })
    withStudentMock.mockImplementation(async (_studentId, fn) => fn({ db: { execute } }))

    await expect(getIslandStateAtHandler({ year: 2026 })).resolves.toEqual({
      source: 'empty',
      capturedAt: null,
      year: 2026,
      bloomedTrees: [],
    })
  })

  it('returns the latest snapshot when the table exists', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(tablePresent)
      .mockResolvedValueOnce({
        rows: [
          {
            payload_json: JSON.stringify({
              sprouts: { bloomedTrees: [{ id: 'snap-1', species: 'tree', dimension: 'values' }] },
            }),
            captured_at: '2026-06-30T15:59:59.000Z',
          },
        ],
      })
    withStudentMock.mockImplementation(async (_studentId, fn) => fn({ db: { execute } }))

    const result = await getIslandStateAtHandler({ year: 2026 })

    expect(result).toMatchObject({
      source: 'snapshot',
      capturedAt: '2026-06-30T15:59:59.000Z',
      year: 2026,
    })
    expect(result.bloomedTrees).toEqual([expect.objectContaining({ id: 'snap-1' })])
    // probe confirmed the table, then the snapshot select ran.
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('propagates non-schema DB failures during the snapshot lookup', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error('connection closed'))
    withStudentMock.mockImplementation(async (_studentId, fn) => fn({ db: { execute } }))

    await expect(getIslandStateAtHandler({ year: 2026 })).rejects.toThrow('connection closed')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
