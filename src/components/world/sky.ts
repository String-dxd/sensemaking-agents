import * as THREE from 'three'
import type { TerrainDescriptor } from './vipsWorldMapping'

export function createSkyBackdrop(terrain: TerrainDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'soft-sky'
  const geometry = new THREE.SphereGeometry(9, 32, 16)
  const material = new THREE.MeshBasicMaterial({
    color: terrain.mood === 'sheltered' ? '#c8d8e8' : '#c7e3ee',
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.32,
  })
  group.add(new THREE.Mesh(geometry, material))
  return group
}
