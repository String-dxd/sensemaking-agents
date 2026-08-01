import { describe, expect, it } from 'vitest'
import {
  canonicalizeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
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
})
