import { describe, expect, it } from 'vitest'
import {
  buildMyWorldFaqEditableFields,
  canonicalizeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  DEFAULT_MY_WORLD_FAQ_POSTURE_STORY,
  materializeMyWorldFaqPostureStory,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'

describe('My World FAQ posture story', () => {
  it('accepts old documents without posture copy and keeps their canonical body unchanged', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    delete historical.page.posture
    const before = JSON.stringify(historical)

    expect(validateMyWorldFaqDocument(historical).success).toBe(true)
    expect(canonicalizeMyWorldFaqDocument(historical)).toBe(before)
  })

  it('materializes defaults without mutating a historical document', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    delete historical.page.posture

    const projected = materializeMyWorldFaqPostureStory(historical)

    expect(historical.page).not.toHaveProperty('posture')
    expect(projected.page.posture).toEqual(DEFAULT_MY_WORLD_FAQ_POSTURE_STORY)
    expect(projected).not.toBe(historical)
  })

  it('includes posture fields only after the optional story is materialized', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    delete historical.page.posture

    const historicalPaths = buildMyWorldFaqEditableFields(historical).map((field) => field.path)
    const projectedPaths = buildMyWorldFaqEditableFields(
      materializeMyWorldFaqPostureStory(historical),
    ).map((field) => field.path)

    expect(historicalPaths).not.toContain('page.posture.heading')
    expect(projectedPaths).toEqual(
      expect.arrayContaining([
        'page.posture.eyebrow',
        'page.posture.heading',
        'page.posture.introduction',
        'page.posture.decisionNote',
      ]),
    )
  })
})
