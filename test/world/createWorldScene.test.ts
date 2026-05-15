import { describe, expect, it } from 'vitest'
import { withStudentSpaceBaseline } from '~/components/world/createWorldScene'
import { STUDENT_SPACE_TREE_PLACEMENTS } from '~/components/world/trees'
import {
  buildVipsWorldSceneModel,
  type VipsWorldTimelineEntry,
} from '~/components/world/vipsWorldMapping'

function entry(
  id: number,
  canonical_claim_id: string,
  dimension: VipsWorldTimelineEntry['dimension'] = 'values',
): VipsWorldTimelineEntry {
  return {
    id,
    dimension,
    canonical_claim_id,
    strength: 'medium',
    committed_at: '2026-05-13T08:00:00Z',
  }
}

describe('withStudentSpaceBaseline', () => {
  it('preserves every real value tree before adding decorative baseline trees', () => {
    const valueClaimIds = [
      'values.contribution',
      'values.achievement',
      'values.tradition',
      'values.security',
      'values.independence',
      'values.relationships',
      'values.wellbeing',
      'values.learning',
    ]
    const model = buildVipsWorldSceneModel({
      timelineByDimension: {
        values: valueClaimIds.map((claimId, index) => entry(index + 1, claimId)),
      },
    })

    const sceneModel = withStudentSpaceBaseline(model)
    const realTrees = sceneModel.trees.filter(
      (tree) => !tree.claimId.startsWith('student-space.decorative'),
    )

    expect(realTrees).toHaveLength(valueClaimIds.length)
    expect(realTrees.map((tree) => tree.claimId).sort()).toEqual([...valueClaimIds].sort())
    expect(new Set(realTrees.map((tree) => tree.id)).size).toBe(valueClaimIds.length)
  })

  it('fills empty scenes with decorative Student Space baseline trees', () => {
    const sceneModel = withStudentSpaceBaseline(buildVipsWorldSceneModel())

    expect(sceneModel.trees).toHaveLength(STUDENT_SPACE_TREE_PLACEMENTS.length)
    expect(
      sceneModel.trees.every((tree) => tree.claimId.startsWith('student-space.decorative')),
    ).toBe(true)
  })
})
