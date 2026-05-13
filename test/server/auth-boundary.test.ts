import { describe, expect, it, vi } from 'vitest'
import type { TenantContext } from '~/db/client'
import type { VipsProposedDiffRow } from '~/db/queries'
import type { ConfirmDiffDeps } from '~/server/confirm-diff.handler.server'
import { confirmDiffHandler } from '~/server/confirm-diff.handler.server'

const pendingDiff = {
  id: 42,
  status: 'pending',
  payload: {
    diffs: {
      values: {
        compiled_truth_rewrite: 'Practices self-direction in school.',
        open_question: 'Where else does this show up?',
        new_timeline_entries: [],
      },
      interests: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
      personality: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
      skills: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
    },
    admitted: [
      {
        dimension: 'values',
        canonical_claim_id: 'values.self_direction',
        verbatim_quote: 'i hated when teacher told us',
        reflection_id: 7,
        strength: 'medium',
        parallax_tag: ['school'],
        reinforces_id: null,
        partial_match: false,
        aspirational: false,
        parallax_cap_reason: null,
      },
    ],
    downgraded: [],
    dropped: [],
  },
} as unknown as VipsProposedDiffRow

describe('server handler auth boundary', () => {
  it('uses the auth-derived student id for review mutations', async () => {
    const requireContext = vi.fn(async () => ({ counselorId: 'user_123', studentId: 'demo-c' }))
    const ctx = { tx: true } as unknown as TenantContext
    const withStudentCalls: string[] = []
    const getVipsProposedDiffCalls: Array<[string, number, { ctx?: TenantContext } | undefined]> =
      []
    const insertVipsTimelineEntryCalls: Array<
      Parameters<NonNullable<ConfirmDiffDeps['insertVipsTimelineEntry']>>
    > = []

    const withStudent: NonNullable<ConfirmDiffDeps['withStudent']> = async (studentId, fn) => {
      withStudentCalls.push(studentId)
      return fn(ctx)
    }
    const getVipsProposedDiff: NonNullable<ConfirmDiffDeps['getVipsProposedDiff']> = async (
      studentId,
      diffId,
      opts,
    ) => {
      getVipsProposedDiffCalls.push([studentId, diffId, opts])
      return pendingDiff
    }
    const insertVipsTimelineEntry: NonNullable<ConfirmDiffDeps['insertVipsTimelineEntry']> = async (
      studentId,
      input,
      opts,
    ) => {
      insertVipsTimelineEntryCalls.push([studentId, input, opts])
      return {} as Awaited<ReturnType<NonNullable<ConfirmDiffDeps['insertVipsTimelineEntry']>>>
    }
    const updateVipsProposedDiffPayload: NonNullable<
      ConfirmDiffDeps['updateVipsProposedDiffPayload']
    > = async () => pendingDiff
    const updateVipsProposedDiffStatus: NonNullable<
      ConfirmDiffDeps['updateVipsProposedDiffStatus']
    > = async () => pendingDiff
    const upsertVipsPage: NonNullable<ConfirmDiffDeps['upsertVipsPage']> = async () =>
      ({}) as Awaited<ReturnType<NonNullable<ConfirmDiffDeps['upsertVipsPage']>>>

    await confirmDiffHandler(
      { diffId: 42, entryId: 'values::values.self_direction' },
      {
        requireContext,
        withStudent,
        getVipsProposedDiff,
        insertVipsTimelineEntry,
        updateVipsProposedDiffPayload,
        updateVipsProposedDiffStatus,
        upsertVipsPage,
      },
    )

    expect(withStudentCalls).toEqual(['demo-c'])
    expect(getVipsProposedDiffCalls).toEqual([['demo-c', 42, { ctx }]])
    expect(insertVipsTimelineEntryCalls[0]).toEqual([
      'demo-c',
      expect.objectContaining({ canonical_claim_id: 'values.self_direction' }),
      { ctx },
    ])
  })

  it('does not open the tenant query path when auth rejects', async () => {
    const requireContext = vi.fn(async () => {
      throw new Error('not authenticated')
    })
    const withStudent: NonNullable<ConfirmDiffDeps['withStudent']> = vi.fn()

    await expect(
      confirmDiffHandler(
        { diffId: 42, entryId: 'values::values.self_direction' },
        { requireContext, withStudent },
      ),
    ).rejects.toThrow('not authenticated')

    expect(withStudent).not.toHaveBeenCalled()
  })
})
