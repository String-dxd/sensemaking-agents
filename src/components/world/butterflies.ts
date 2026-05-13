import * as THREE from 'three'
import { positionOnIsland } from './island'
import type { ButterflyDescriptor } from './vipsWorldMapping'

export function createButterflies(butterflies: ButterflyDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'recent-entry-butterflies'
  for (const butterfly of butterflies) {
    const mesh = createButterfly(butterfly)
    const pos = positionOnIsland(butterfly.placementSeed, 0.98)
    mesh.position.set(pos.x, 0.85 + butterfly.recencyWeight * 0.45, pos.z)
    group.add(mesh)
  }
  return group
}

function createButterfly(butterfly: ButterflyDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = butterfly.id
  const opacity = butterfly.evidenceState === 'pending' ? 0.45 : 0.88
  const material = new THREE.MeshBasicMaterial({
    color: butterfly.color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  })
  const wingGeometry = new THREE.CircleGeometry(0.055 + butterfly.recencyWeight * 0.035, 12)
  const left = new THREE.Mesh(wingGeometry, material)
  left.rotation.y = Math.PI / 5
  left.position.x = -0.04
  group.add(left)
  const right = new THREE.Mesh(wingGeometry, material.clone())
  right.rotation.y = -Math.PI / 5
  right.position.x = 0.04
  group.add(right)
  return group
}
