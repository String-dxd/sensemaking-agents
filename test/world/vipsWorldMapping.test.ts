import { describe, expect, it } from 'vitest'
import {
  buildVipsWorldSceneModel,
  type VipsWorldTimelineEntry,
} from '~/components/world/vipsWorldMapping'

function entry(overrides: Partial<VipsWorldTimelineEntry>): VipsWorldTimelineEntry {
  return {
    id: overrides.id ?? 1,
    dimension: overrides.dimension ?? 'values',
    canonical_claim_id: overrides.canonical_claim_id ?? 'values.achievement',
    strength: overrides.strength ?? 'medium',
    committed_at: overrides.committed_at ?? '2026-05-13T08:00:00Z',
    ...overrides,
  }
}

describe('buildVipsWorldSceneModel', () => {
  it('maps confirmed Values to distinct stable tree descriptors', () => {
    const model = buildVipsWorldSceneModel({
      timelineByDimension: {
        values: [
          entry({ id: 1, canonical_claim_id: 'values.achievement' }),
          entry({ id: 2, canonical_claim_id: 'values.tradition' }),
          entry({ id: 3, canonical_claim_id: 'values.independence' }),
        ],
      },
    })
    expect(model.trees.map((tree) => tree.species).sort()).toEqual(['cherry', 'oak', 'palm'])
    expect(new Set(model.trees.map((tree) => tree.placementSeed)).size).toBe(3)
  })

  it('maps Interests to the RIASEC flower vocabulary', () => {
    const model = buildVipsWorldSceneModel({
      timelineByDimension: {
        interests: [
          entry({
            id: 1,
            dimension: 'interests',
            canonical_claim_id: 'interests.investigative',
          }),
          entry({ id: 2, dimension: 'interests', canonical_claim_id: 'interests.social' }),
        ],
      },
    })
    expect(model.flowers.map((flower) => flower.flower).sort()).toEqual(['lily', 'pansy'])
  })

  it('maps all Skills to one shared fruit family while strength affects count', () => {
    const model = buildVipsWorldSceneModel({
      timelineByDimension: {
        values: [entry({ id: 1, canonical_claim_id: 'values.learning' })],
        skills: [
          entry({
            id: 2,
            dimension: 'skills',
            canonical_claim_id: 'skills.analytical',
            strength: 'low',
          }),
          entry({
            id: 3,
            dimension: 'skills',
            canonical_claim_id: 'skills.creative',
            strength: 'high',
          }),
        ],
      },
    })
    expect(new Set(model.fruit.map((fruit) => fruit.fruitFamily))).toEqual(
      new Set(['round-orchard-fruit']),
    )
    expect(model.fruit.find((fruit) => fruit.claimId === 'skills.creative')?.count).toBeGreaterThan(
      model.fruit.find((fruit) => fruit.claimId === 'skills.analytical')?.count ?? 0,
    )
  })

  it('keeps pending evidence tentative and omits forgotten evidence', () => {
    const model = buildVipsWorldSceneModel({
      timelineByDimension: {
        values: [
          entry({
            id: 1,
            canonical_claim_id: 'values.security',
            evidence_state: 'pending',
          }),
          entry({
            id: 2,
            canonical_claim_id: 'values.tradition',
            forgotten_at: '2026-05-13T08:10:00Z',
          }),
        ],
      },
    })
    expect(model.trees).toHaveLength(1)
    expect(model.trees[0]?.claimId).toBe('values.security')
    expect(model.trees[0]?.evidenceState).toBe('pending')
    expect(model.summary.omittedForgottenClaims).toBe(1)
  })

  it('renders recent entries as bounded butterflies', () => {
    const model = buildVipsWorldSceneModel({
      recentLimit: 2,
      recentEntries: [
        { id: 10, review_status: 'confirmed', created_at: '2026-05-13T08:00:00Z' },
        { id: 11, review_status: 'confirmed', created_at: '2026-05-13T09:00:00Z' },
        { id: 12, review_status: 'pending', created_at: '2026-05-13T10:00:00Z' },
      ],
      timelineByDimension: {
        values: [
          entry({ id: 1, reflection_id: 10, committed_at: '2026-05-13T08:00:00Z' }),
          entry({ id: 2, reflection_id: 11, committed_at: '2026-05-13T09:00:00Z' }),
        ],
      },
    })
    expect(model.butterflies).toHaveLength(2)
    expect(model.butterflies[0]?.entryId).toBe(12)
    expect(model.butterflies[0]?.evidenceState).toBe('pending')
    expect(model.butterflies[1]?.entryId).toBe(11)
    expect(model.butterflies[1]?.touchedDimension).toBe('values')
  })
})
