import * as THREE from 'three'
import type { TerrainDescriptor } from './vipsWorldMapping'

export function createIsland(terrain: TerrainDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'vips-island'

  const radiusX = 3.1 + terrain.openness * 0.9
  const radiusZ = 1.95 + terrain.shelter * 0.55
  const islandGeometry = new THREE.SphereGeometry(1, 48, 20)
  islandGeometry.scale(radiusX, 0.34, radiusZ)
  const islandMaterial = new THREE.MeshStandardMaterial({
    color:
      terrain.mood === 'open' ? '#9ac77a' : terrain.mood === 'sheltered' ? '#86ad6d' : '#94bf78',
    roughness: 0.86,
    metalness: 0,
  })
  const island = new THREE.Mesh(islandGeometry, islandMaterial)
  island.position.y = -0.18
  island.receiveShadow = true
  group.add(island)

  const shoreGeometry = new THREE.RingGeometry(1.05, 1.21, 64)
  shoreGeometry.scale(radiusX * 1.02, radiusZ * 1.02, 1)
  const shoreMaterial = new THREE.MeshBasicMaterial({
    color: '#f4dfaf',
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  })
  const shore = new THREE.Mesh(shoreGeometry, shoreMaterial)
  shore.rotation.x = -Math.PI / 2
  shore.position.y = -0.46
  group.add(shore)

  const waterGeometry = new THREE.RingGeometry(1.2, 1.45 + terrain.water * 0.2, 72)
  waterGeometry.scale(radiusX * 1.02, radiusZ * 1.02, 1)
  const waterMaterial = new THREE.MeshBasicMaterial({
    color: terrain.mood === 'sheltered' ? '#a8d3ce' : '#b9ddd5',
    transparent: true,
    opacity: 0.38 + terrain.water * 0.18,
    side: THREE.DoubleSide,
  })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.rotation.x = -Math.PI / 2
  water.position.y = -0.5
  group.add(water)

  return group
}

export function positionOnIsland(seed: number, radius = 1): THREE.Vector3 {
  const angle = (seed % 360) * (Math.PI / 180)
  const band = 0.28 + ((seed * 17) % 52) / 100
  return new THREE.Vector3(
    Math.cos(angle) * band * radius * 2.8,
    0.08,
    Math.sin(angle) * band * radius * 1.7,
  )
}
