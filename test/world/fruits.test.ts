import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { attachFruitToTrees } from '~/components/world/fruits'
import type { SkillFruitDescriptor, ValueTreeDescriptor } from '~/components/world/vipsWorldMapping'

function skillFruit(index: number): SkillFruitDescriptor {
  return {
    id: `fruit-skills.test-${index}`,
    claimId: `skills.test-${index}`,
    label: `Skill ${index}`,
    fruitFamily: 'student-space-berry-cluster',
    host: 'bush',
    color: '#cc7aa8',
    strength: 'medium',
    evidenceState: 'confirmed',
    count: index + 1,
    ripeness: 0.7,
    valueTreeId: 'tree-values.learning',
    valueTreeLabel: 'Learning',
    placementSeed: 100 + index,
    timelineEntryIds: [index],
  }
}

const learningTree: ValueTreeDescriptor = {
  id: 'tree-values.learning',
  claimId: 'values.learning',
  label: 'Learning',
  species: 'banyan',
  color: '#7b9c63',
  shape: 'root-complex',
  strength: 'medium',
  evidenceState: 'confirmed',
  evidenceCount: 1,
  placementSeed: 42,
  timelineEntryIds: [1],
}

describe('attachFruitToTrees', () => {
  it('renders every real skill bush once before adding decorative bushes', () => {
    const root = new THREE.Group()
    const fruit = Array.from({ length: 6 }, (_, index) => skillFruit(index))

    attachFruitToTrees(root, fruit, [learningTree], new THREE.Texture())

    const realBushes = root.children.filter((child) => child.name.startsWith('fruit-skills.test-'))
    expect(realBushes).toHaveLength(fruit.length)
    expect(realBushes.map((child) => child.name).sort()).toEqual(
      fruit.map((item) => item.id).sort(),
    )
    expect(realBushes.every((child) => child.userData.worldHotspot?.kind === 'skill')).toBe(true)
  })
})
