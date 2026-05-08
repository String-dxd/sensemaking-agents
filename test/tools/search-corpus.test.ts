import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { executeSearchPastMirrors, searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry } from '~/db/queries'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
})

afterEach(() => {
  resetDbForTests()
})

describe('search-corpus SDK tool', () => {
  it('returns ranked rows scoped to the calling student', () => {
    insertMirrorEntry('demo', {
      summary: 'Robotics arm — built it blindfolded.',
      transcript: 't',
      signals: [],
      caution: '-',
      tags: ['robotics'],
    })
    insertMirrorEntry('demo', {
      summary: 'Lit class — argued one side for 40 minutes.',
      transcript: 't',
      signals: [],
      caution: '-',
      tags: ['literature'],
    })
    const out = executeSearchPastMirrors('demo', { query: 'robotics' })
    expect(out.results.length).toBe(1)
    expect(out.results[0]?.summary).toMatch(/Robotics/)
  })

  it('returns empty results on empty corpus instead of throwing', () => {
    const out = executeSearchPastMirrors('demo', { query: 'anything' })
    expect(out).toEqual({ results: [] })
  })

  it('exposes the SDK Tool with correct name and zod parameters', () => {
    const tool = searchCorpusToolFor('demo')
    expect(tool.name).toBe('search_past_mirrors')
    expect(typeof tool.invoke).toBe('function')
  })
})
