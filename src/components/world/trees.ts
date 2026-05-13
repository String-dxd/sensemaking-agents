import * as THREE from 'three'
import type { WorldAssetEntry } from './assets'
import { positionOnIsland } from './island'
import type { ValueTreeDescriptor } from './vipsWorldMapping'

export function createValueTree(
  tree: ValueTreeDescriptor,
  foliageTexture?: THREE.Texture,
): THREE.Group {
  const group = new THREE.Group()
  group.name = tree.id
  group.position.copy(positionOnIsland(tree.placementSeed, 1))
  group.scale.setScalar(tree.evidenceState === 'pending' ? 0.72 : 0.82 + tree.evidenceCount * 0.08)

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.12, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: '#73543c', roughness: 0.9 }),
  )
  trunk.position.y = 0.28
  trunk.castShadow = true
  group.add(trunk)

  for (const canopy of canopyLayout(tree)) {
    const geometry =
      tree.species === 'pine'
        ? new THREE.ConeGeometry(canopy.radius, canopy.height, 10)
        : new THREE.SphereGeometry(canopy.radius, 16, 12)
    const material = new THREE.MeshStandardMaterial({
      color: tree.color,
      roughness: 0.82,
      transparent: tree.evidenceState === 'pending',
      opacity: tree.evidenceState === 'pending' ? 0.55 : 0.94,
      alphaMap: foliageTexture,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(canopy.x, canopy.y, canopy.z)
    mesh.scale.set(canopy.scaleX, canopy.scaleY, canopy.scaleZ)
    mesh.castShadow = true
    group.add(mesh)
  }

  return group
}

export function approvedTreeAssetFor(tree: ValueTreeDescriptor): WorldAssetEntry | null {
  if (tree.species === 'oak') {
    return {
      url: '/world/trees/oakTreesVisual.glb',
      source: 'student-space-v1/public/trees/oakTreesVisual.glb',
      usage: 'approved-student-space-asset',
    }
  }
  if (tree.species === 'cherry') {
    return {
      url: '/world/trees/cherryTreesVisual.glb',
      source: 'student-space-v1/public/trees/cherryTreesVisual.glb',
      usage: 'approved-student-space-asset',
    }
  }
  return null
}

function canopyLayout(tree: ValueTreeDescriptor) {
  if (tree.species === 'pine') {
    return [
      { x: 0, y: 0.86, z: 0, radius: 0.42, height: 0.8, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { x: 0, y: 1.18, z: 0, radius: 0.3, height: 0.64, scaleX: 1, scaleY: 1, scaleZ: 1 },
    ]
  }
  if (tree.species === 'palm') {
    return [
      { x: -0.16, y: 1.02, z: 0, radius: 0.3, height: 0.4, scaleX: 1.8, scaleY: 0.35, scaleZ: 0.7 },
      { x: 0.18, y: 1.03, z: 0, radius: 0.3, height: 0.4, scaleX: 1.8, scaleY: 0.35, scaleZ: 0.7 },
    ]
  }
  if (tree.species === 'willow') {
    return [
      { x: 0, y: 0.86, z: 0, radius: 0.48, height: 0.5, scaleX: 1.1, scaleY: 1.35, scaleZ: 0.95 },
    ]
  }
  return [
    { x: 0, y: 0.92, z: 0, radius: 0.46, height: 0.5, scaleX: 1, scaleY: 0.86, scaleZ: 1 },
    { x: -0.2, y: 0.82, z: 0.05, radius: 0.3, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
    { x: 0.22, y: 0.84, z: -0.04, radius: 0.28, height: 0.4, scaleX: 1, scaleY: 0.8, scaleZ: 1 },
  ]
}
