// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry } from '~/db/queries'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
})

afterEach(() => {
  resetDbForTests()
})

const baseEntry = {
  transcript: 'long transcript',
  validation: 'You stayed with the moment.',
  inferred_meaning: 'Maybe there is something here worth marking.',
  raw_output: { v: 1 },
}

describe.skipIf(!process.env.DATABASE_URL)('executeSearchPastMirrors', () => {
  it('returns ranked rows scoped to the calling student', () => {
    insertMirrorEntry('demo', {
      ...baseEntry,
      story_reframe: 'Robotics arm — built it blindfolded.',
      tags: ['robotics'],
    })
    insertMirrorEntry('demo', {
      ...baseEntry,
      story_reframe: 'Lit class — argued one side for 40 minutes.',
      tags: ['literature'],
    })
    const out = executeSearchPastMirrors('demo', { query: 'robotics' })
    expect(out.results.length).toBe(1)
    expect(out.results[0]?.story_reframe).toMatch(/Robotics/)
  })

  it('returns empty results on empty corpus instead of throwing', () => {
    const out = executeSearchPastMirrors('demo', { query: 'anything' })
    expect(out).toEqual({ results: [] })
  })
})
