// Class-aware face-atlas selection + bird placement (plan 022). Birds wear the
// AC bird-eye sets; mammals keep their personality-authored atlas; bird
// placement is bigger/wider-set than the mammal default.

import { describe, expect, it } from 'vitest'
import { ATLAS_REGISTRY, resolveFaceAtlasId } from '../../../src/core/face/atlasRegistry'
import { BIRD_PLACEMENT, DEFAULT_PLACEMENT } from '../../../src/core/face/faceComposite'

describe('resolveFaceAtlasId (class-aware selection)', () => {
  it('maps a bird + proud to the bird proud set', () => {
    expect(resolveFaceAtlasId('bird', 'proud', 'face-proud')).toBe('face-bird-proud')
  })

  it('keeps a mammal + proud on its stored personality atlas', () => {
    expect(resolveFaceAtlasId('biped-round', 'proud', 'face-proud')).toBe('face-proud')
  })

  it('falls back a bird with an un-authored personality to face-bird-v1', () => {
    expect(resolveFaceAtlasId('bird', 'stoic', 'face-v1')).toBe('face-bird-v1')
  })

  it('resolves every authored personality to a registered bird set', () => {
    for (const personality of ['gentle', 'cheerful', 'proud', 'gruff', 'calm', 'mischievous']) {
      const id = resolveFaceAtlasId('bird', personality, 'face-v1')
      expect(id).toBe(`face-bird-${personality}`)
      expect(ATLAS_REGISTRY[id]).toBeDefined()
    }
  })

  it('registers face-bird-v1 plus every bird personality set', () => {
    expect(ATLAS_REGISTRY['face-bird-v1']).toBeDefined()
  })
})

describe('BIRD_PLACEMENT', () => {
  it('enlarges and re-anchors the eye fields vs the mammal default', () => {
    expect(BIRD_PLACEMENT.eyeWidth).toBeGreaterThan(DEFAULT_PLACEMENT.eyeWidth)
    expect(BIRD_PLACEMENT.eyeHeight).toBeGreaterThan(DEFAULT_PLACEMENT.eyeHeight)
    expect(BIRD_PLACEMENT.eyeAzimuth).toBeGreaterThan(DEFAULT_PLACEMENT.eyeAzimuth)
    expect(BIRD_PLACEMENT.eyeElevation).toBeGreaterThan(DEFAULT_PLACEMENT.eyeElevation)
  })

  it('produces a valid full placement when merged over the default', () => {
    const merged = { ...DEFAULT_PLACEMENT, ...BIRD_PLACEMENT }
    for (const value of Object.values(merged)) {
      expect(Number.isFinite(value)).toBe(true)
    }
    // mouth fields untouched by the bird override
    expect(merged.mouthWidth).toBe(DEFAULT_PLACEMENT.mouthWidth)
    expect(merged.mouthElevation).toBe(DEFAULT_PLACEMENT.mouthElevation)
  })
})
