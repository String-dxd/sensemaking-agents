/**
 * U1 smoke — verify the bigFive scaffold seed survives the schema's
 * mergeProfile pass and reaches the engine Profile state singleton through
 * cold-start hydration. Belongs alongside the other engine state tests
 * (test/engine/IdentityStatusOverride.test.ts is the closest neighbour).
 */
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error vendored engine module is intentionally untyped
import { PROFILE_SEED } from '~/engine/student-space/Game/Data/profileSeed.js'
// @ts-expect-error vendored engine module is intentionally untyped
import Profile from '~/engine/student-space/Game/State/Profile.js'
// @ts-expect-error vendored engine module is intentionally untyped
import { mergeProfile, mergeProfileFacet } from '~/engine/student-space/Game/State/schema.js'

describe('profile seed bigFive scaffold', () => {
  it('seeds five traits with two aspects each on the personality facet', () => {
    const seedPersonality = PROFILE_SEED.personality
    expect(seedPersonality?.bigFive).toBeTruthy()

    const traits = seedPersonality.bigFive.traits
    expect(Array.isArray(traits)).toBe(true)
    expect(traits).toHaveLength(5)

    const traitIds = traits.map((t: { id: string }) => t.id)
    expect(traitIds).toEqual([
      'curiosity',
      'social-energy',
      'warmth',
      'follow-through',
      'emotional-sensitivity',
    ])

    for (const trait of traits as Array<{
      name: string
      position: number
      poleLeft: string
      poleRight: string
      schoolReadout: string
      aspects: Array<{ name: string; score: number; blurb: string }>
    }>) {
      expect(typeof trait.name).toBe('string')
      expect(typeof trait.poleLeft).toBe('string')
      expect(typeof trait.poleRight).toBe('string')
      expect(typeof trait.schoolReadout).toBe('string')
      expect(trait.position).toBeGreaterThanOrEqual(0)
      expect(trait.position).toBeLessThanOrEqual(1)
      expect(trait.aspects).toHaveLength(2)
      for (const aspect of trait.aspects) {
        expect(typeof aspect.name).toBe('string')
        expect(aspect.score).toBeGreaterThanOrEqual(0)
        expect(aspect.score).toBeLessThanOrEqual(20)
        expect(typeof aspect.blurb).toBe('string')
      }
    }

    const tldr = seedPersonality.bigFive.tldr
    expect(typeof tldr.headline).toBe('string')
    expect(Array.isArray(tldr.poles)).toBe(true)
  })

  it('mergeProfileFacet passes the bigFive block through opaquely', () => {
    const merged = mergeProfileFacet(PROFILE_SEED.personality, 'personality')
    expect(merged.bigFive).toBe(PROFILE_SEED.personality.bigFive)
    // The known VIPS keys are still copied in.
    expect(merged.paragraph).toBe(PROFILE_SEED.personality.paragraph)
    expect(merged.openQuestion).toBe(PROFILE_SEED.personality.openQuestion)
    expect(Array.isArray(merged.quotes)).toBe(true)
  })

  it('mergeProfile preserves bigFive when running the full seed through hydration', () => {
    const merged = mergeProfile(PROFILE_SEED)
    expect(merged.personality?.bigFive?.traits).toHaveLength(5)
    // Other facets stay clean — bigFive is personality-only by design.
    expect(merged.values?.bigFive).toBeUndefined()
    expect(merged.interests?.bigFive).toBeUndefined()
    expect(merged.skills?.bigFive).toBeUndefined()
  })

  it('drops bigFive when the raw input is not an object', () => {
    const merged = mergeProfileFacet(
      { ...PROFILE_SEED.personality, bigFive: 'not an object' },
      'personality',
    )
    expect(merged.bigFive).toBeUndefined()
  })
})

describe('Profile.hydrate — seed-only field reattachment', () => {
  afterEach(() => {
    // The Profile class is a singleton; reset between tests.
    Profile.instance = null
  })

  it('reattaches bigFive from seed when hydrating a pre-bigFive snapshot', () => {
    const profile = new Profile()
    // Simulate a snapshot persisted before the bigFive scaffold existed:
    // every facet present, but personality has no bigFive field.
    const legacy = {
      facets: {
        values: { paragraph: 'v', openQuestion: '', lastRefinedAt: '', quotes: [] },
        interests: { paragraph: 'i', openQuestion: '', lastRefinedAt: '', quotes: [] },
        personality: { paragraph: 'p', openQuestion: '', lastRefinedAt: '', quotes: [] },
        skills: { paragraph: 's', openQuestion: '', lastRefinedAt: '', quotes: [] },
      },
    }
    profile.hydrate(legacy)
    expect(profile.getFacet('personality')?.bigFive?.traits).toHaveLength(5)
    expect(profile.getFacet('personality')?.bigFive?.tldr?.headline).toBeTruthy()
    // The user's persisted paragraph survives — only bigFive is rebuilt.
    expect(profile.getFacet('personality')?.paragraph).toBe('p')
  })

  it('reattaches bigFive from seed when hydrating a pre-bigFive backend snapshot', () => {
    const profile = new Profile()
    profile.hydrateBackend({
      facets: {
        personality: { paragraph: 'b', openQuestion: '', lastRefinedAt: '', quotes: [] },
      },
    })
    expect(profile.getFacet('personality')?.bigFive?.traits).toHaveLength(5)
  })
})
