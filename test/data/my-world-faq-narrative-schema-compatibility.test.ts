import { describe, expect, it } from 'vitest'
import {
  canonicalizeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY,
  MY_WORLD_FAQ_FREQUENCY_QUESTION_ID,
  materializeMyWorldFaqEditorDocument,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'
import { DEFAULT_MY_WORLD_FAQ_BUILD_STORY } from '~/data/my-world-faq/build-story'
import { DEFAULT_MY_WORLD_FAQ_POSTURE_STORY } from '~/data/my-world-faq/posture-story'
import { DEFAULT_MY_WORLD_FAQ_WHY_STORY } from '~/data/my-world-faq/why-story'

describe('My World FAQ narrative schema compatibility', () => {
  it('accepts both the current document and optional narrative sections', () => {
    const current = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    delete current.page.build
    delete current.page.why
    delete current.page.posture
    const currentCanonical = canonicalizeMyWorldFaqDocument(current)
    const expanded = {
      ...current,
      page: {
        ...current.page,
        build: { ...DEFAULT_MY_WORLD_FAQ_BUILD_STORY },
        why: { ...DEFAULT_MY_WORLD_FAQ_WHY_STORY },
        posture: { ...DEFAULT_MY_WORLD_FAQ_POSTURE_STORY },
      },
    }

    expect(validateMyWorldFaqDocument(current).success).toBe(true)
    expect(canonicalizeMyWorldFaqDocument(current)).toBe(currentCanonical)
    expect(validateMyWorldFaqDocument(expanded).success).toBe(true)
  })

  it('materialises the new Why story without rewriting a historical revision', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    historical.page.why = {
      eyebrow: 'Legacy label',
      heading: 'Legacy heading',
      introduction: 'Legacy introduction',
    }
    const canonical = canonicalizeMyWorldFaqDocument(historical)

    expect(validateMyWorldFaqDocument(historical).success).toBe(true)
    const projected = materializeMyWorldFaqEditorDocument(historical)
    expect(projected.page.why?.frequencyHeading).toBe(
      DEFAULT_MY_WORLD_FAQ_WHY_STORY.frequencyHeading,
    )
    expect(projected.page.why?.researchBody).toBe(DEFAULT_MY_WORLD_FAQ_WHY_STORY.researchBody)
    expect(canonicalizeMyWorldFaqDocument(historical)).toBe(canonical)
  })

  it('upgrades untouched research-card copy while preserving colleague edits', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    const legacyQuestion = historical.questions.find(
      (question) => question.id === MY_WORLD_FAQ_FREQUENCY_QUESTION_ID,
    )
    if (!legacyQuestion) throw new Error('Reflection research question is missing')
    legacyQuestion.displayedQuestion = 'What research supports reflection?'
    legacyQuestion.shortAnswer =
      'Research suggests structured reflection can help adolescents, but findings are small and not decisive. It does not show that voice beats writing, AI improves reflection or My World works in Singapore.'
    const canonical = canonicalizeMyWorldFaqDocument(historical)

    const projected = materializeMyWorldFaqEditorDocument(historical)
    const projectedQuestion = projected.questions.find(
      (question) => question.id === MY_WORLD_FAQ_FREQUENCY_QUESTION_ID,
    )
    expect(projectedQuestion?.displayedQuestion).toBe(
      MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY.displayedQuestion,
    )
    expect(projectedQuestion?.shortAnswer).toBe(MY_WORLD_FAQ_FREQUENCY_QUESTION_COPY.shortAnswer)
    expect(canonicalizeMyWorldFaqDocument(historical)).toBe(canonical)

    legacyQuestion.displayedQuestion = 'A colleague rewrote this question'
    legacyQuestion.shortAnswer = 'A colleague supplied a complete custom answer for this card.'
    const colleagueProjection = materializeMyWorldFaqEditorDocument(historical)
    const colleagueQuestion = colleagueProjection.questions.find(
      (question) => question.id === MY_WORLD_FAQ_FREQUENCY_QUESTION_ID,
    )
    expect(colleagueQuestion?.displayedQuestion).toBe('A colleague rewrote this question')
    expect(colleagueQuestion?.shortAnswer).toBe(
      'A colleague supplied a complete custom answer for this card.',
    )
  })
})
