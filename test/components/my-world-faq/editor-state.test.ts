import { describe, expect, it } from 'vitest'
import {
  deriveMyWorldFaqDirtyPaths,
  readMyWorldFaqEditableValue,
  updateMyWorldFaqEditableValue,
} from '~/components/my-world-faq/editor/editor-state'
import {
  addTeamFaqQuestion,
  buildMyWorldFaqEditableFields,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
} from '~/data/my-world-faq'

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

    const updated = updateMyWorldFaqEditableValue(base, base, path, 'A. Researcher')

    expect(readMyWorldFaqEditableValue(updated, path)).toBe('A. Researcher')
    expect(updated).toEqual(expected)
    expect(source.authors[authorIndex]).toBe(originalAuthor)
  })

  it('treats every editable field on an appended question as dirty without reading past the base', () => {
    const base = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    const questionId = 'team-99999999-9999-4999-8999-999999999999'
    const working = addTeamFaqQuestion(base, {
      id: questionId,
      clusterId: 'evidence-next-decision',
      displayedQuestion: 'How will the team decide whether this question is answered?',
      shortAnswer:
        'The team will review product evidence, research limits, student feedback, and unresolved risks before changing this working answer or treating it as settled.',
      detailedAnswer:
        'This added question remains a working team response until its claims, evidence, and limitations have been reviewed.',
      limitations:
        'The review owner, evidence threshold, and decision date have not yet been confirmed.',
      reviewDate: '2026-07-30',
    })
    const appendedPaths = buildMyWorldFaqEditableFields(working)
      .map((field) => field.path)
      .filter((path) => path.startsWith(`questions.${questionId}.`))

    expect(appendedPaths).toHaveLength(7)
    expect(() => deriveMyWorldFaqDirtyPaths(base, working, appendedPaths)).not.toThrow()
    expect(deriveMyWorldFaqDirtyPaths(base, working, appendedPaths)).toEqual(appendedPaths)

    const questionPath = `questions.${questionId}.displayedQuestion`
    const updated = updateMyWorldFaqEditableValue(
      base,
      working,
      questionPath,
      'How will the team decide when this question is answered?',
    )
    expect(readMyWorldFaqEditableValue(updated, questionPath)).toBe(
      'How will the team decide when this question is answered?',
    )
    expect(updated.questions.at(-1)?.title).toBe(
      'How will the team decide when this question is answered?',
    )
  })
})
