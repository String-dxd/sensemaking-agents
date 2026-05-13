import * as THREE from 'three'
import { positionOnIsland } from './island'
import type { InterestFlowerDescriptor } from './vipsWorldMapping'

export function createFlowers(flowers: InterestFlowerDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'interest-flowers'
  for (const flower of flowers) {
    const count = Math.min(9, Math.max(2, flower.count))
    for (let i = 0; i < count; i += 1) {
      const stem = createFlower(flower.color, flower.evidenceState === 'pending')
      const seed = flower.placementSeed + i * 37
      const pos = positionOnIsland(seed, 0.88)
      stem.position.set(pos.x + (i % 3) * 0.08, 0.04, pos.z + Math.floor(i / 3) * 0.08)
      stem.scale.setScalar(0.75 + (seed % 5) * 0.05)
      group.add(stem)
    }
  }
  return group
}

function createFlower(color: string, pending: boolean): THREE.Group {
  const group = new THREE.Group()
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.014, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: '#527e48' }),
  )
  stem.position.y = 0.09
  group.add(stem)
  const bloom = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshStandardMaterial({ color, transparent: pending, opacity: pending ? 0.52 : 0.95 }),
  )
  bloom.position.y = 0.2
  bloom.scale.set(1.2, 0.65, 1.2)
  group.add(bloom)
  return group
}
