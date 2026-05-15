import { describe, expect, it } from 'vitest'
import { mirrorMoodTag, moodFromMirrorTags } from '~/server/mood-tags'

describe('mirror mood tags', () => {
  it('round-trips closed mood labels through mirror-entry tags', () => {
    expect(mirrorMoodTag('anxiety')).toBe('mood:anxiety')
    expect(moodFromMirrorTags(['topic:school', 'mood:anxiety'])).toBe('anxiety')
  })

  it('ignores unknown mood tags', () => {
    expect(moodFromMirrorTags(['mood:curious', 'topic:peer'])).toBeNull()
  })
})
