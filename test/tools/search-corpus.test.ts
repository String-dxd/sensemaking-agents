/**
 * `executeSearchPastMirrors` — the agent-facing past-mirror search tool.
 *
 * The tool itself is a thin orchestration seam: parse the input, hand the
 * query to `searchMirrors` under the caller's student id, re-parse the rows
 * through the output schema. `searchMirrors` owns the tenancy envelope and
 * the ranking SQL, so this file mocks `~/db/queries` and asserts the
 * orchestration — which student id was used, and that the rows round-trip
 * the output schema. The ranking semantics themselves are Lane B territory
 * (they need a real Postgres); see plans/059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'

const searchMirrorsMock = vi.hoisted(() => vi.fn())

vi.mock('~/db/queries', () => ({
  searchMirrors: (studentId: string, query: string, opts: unknown) =>
    searchMirrorsMock(studentId, query, opts),
}))

beforeEach(() => {
  searchMirrorsMock.mockReset()
})

describe('executeSearchPastMirrors', () => {
  it('returns ranked rows scoped to the calling student', async () => {
    searchMirrorsMock.mockResolvedValue([
      {
        id: 1,
        story_reframe: 'Robotics arm — built it blindfolded.',
        tags: ['robotics'],
        created_at: '2026-05-19T08:00:00.000Z',
        score: 0.91,
      },
    ])

    const out = await executeSearchPastMirrors('demo', { query: 'robotics' })

    // The tool must scope the search to the student id it was handed —
    // tenancy is never taken from the agent's own input payload.
    expect(searchMirrorsMock).toHaveBeenCalledTimes(1)
    expect(searchMirrorsMock).toHaveBeenCalledWith('demo', 'robotics', { limit: undefined })
    expect(out.results.length).toBe(1)
    expect(out.results[0]?.story_reframe).toMatch(/Robotics/)
  })

  it('returns empty results on empty corpus instead of throwing', async () => {
    searchMirrorsMock.mockResolvedValue([])

    const out = await executeSearchPastMirrors('demo', { query: 'anything' })

    expect(out).toEqual({ results: [] })
  })
})
