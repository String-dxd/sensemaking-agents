import { describe, expect, it } from 'vitest'
import {
  readMyWorldFaqEditableValue,
  updateMyWorldFaqEditableValue,
} from '~/components/my-world-faq/editor/editor-state'
import { DEFAULT_MY_WORLD_FAQ_CONTENT } from '~/data/my-world-faq'

describe('My World FAQ editor state', () => {
  it('updates a numeric source-author slot without changing other content', () => {
    const base = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    const sourceIndex = base.sources.findIndex((source) => source.authors.length > 1)
    const source = base.sources[sourceIndex]
    if (sourceIndex < 0 || !source) throw new Error('Expected a source with multiple authors')

    const authorIndex = 1
    const originalAuthor = source.authors[authorIndex]
    if (!originalAuthor) throw new Error('Expected a second source author')
    const path = `sources.${source.id}.authors.${authorIndex}`
    const expected = structuredClone(base)
    const expectedSource = expected.sources[sourceIndex]
    if (!expectedSource) throw new Error('Expected the cloned source')
    expectedSource.authors[authorIndex] = 'A. Researcher'

    const updated = updateMyWorldFaqEditableValue(base, path, 'A. Researcher')

    expect(readMyWorldFaqEditableValue(updated, path)).toBe('A. Researcher')
    expect(updated).toEqual(expected)
    expect(source.authors[authorIndex]).toBe(originalAuthor)
  })
})
