import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForInterestFlower } from './hotspots'
import { islandHeightAt } from './island'
import type { InterestFlowerDescriptor } from './vipsWorldMapping'

const STEM_HEIGHT = 0.22
const STEM_R = 0.014
const BLOOM_SIZE = 0.1
const CENTRE_SIZE = 0.07
const STEM_COLOR = 0x6f8a4a
const LEAF_COLOR = 0x5e823c
const SOURCE_FLOWER_SEED = 1337
const SOURCE_FLOWER_INSTANCES = 18
const SOURCE_FLOWER_RADIUS_INSET = 0.6
const SOURCE_FLOWER_ORDER = ['daisy', 'tulip', 'rose', 'lily', 'pansy', 'hyacinth'] as const

const SOURCE_FLOWER_PALETTE = {
  daisy: { petal: 0xff8e8e, centre: 0xffd45a },
  tulip: { petal: 0xffb0d5 },
  rose: { petal: 0xf0a86a },
  lily: { petal: 0xffd45a, centre: 0xfaf1dc },
  pansy: { petal: 0xd09ee8, face: 0x2b2620 },
  hyacinth: { petal: 0xfaf1dc },
} as const

type FlowerMotion = {
  phase: number
  petalGroup: THREE.Group
}

type FlowerSpecies = {
  id: InterestFlowerDescriptor['flower']
  petal: number
  centre?: number
  face?: number
  opacity: number
}

export function createFlowers(flowers: InterestFlowerDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-interest-flowers'

  const flowersBySpecies = new Map<InterestFlowerDescriptor['flower'], InterestFlowerDescriptor>()
  for (const flower of flowers) flowersBySpecies.set(flower.flower, flower)

  for (let index = 0; index < SOURCE_FLOWER_INSTANCES; index += 1) {
    const speciesId = SOURCE_FLOWER_ORDER[index % SOURCE_FLOWER_ORDER.length] ?? 'daisy'
    const flower = flowersBySpecies.get(speciesId) ?? decorativeFlower(speciesId, index)
    const instance = createFlower(flower, index)
    if (flower.timelineEntryIds.length > 0) {
      attachWorldHotspot(instance, hotspotForInterestFlower(flower))
    }
    group.add(instance)
  }
  return group
}

export function tickFlowers(root: THREE.Object3D, time: number) {
  root.traverse((object) => {
    const motion = object.userData.flowerMotion as FlowerMotion | undefined
    if (!motion) return
    motion.petalGroup.rotation.z = Math.sin(time * 0.9 + motion.phase) * 0.08
    motion.petalGroup.rotation.x = Math.cos(time * 0.7 + motion.phase) * 0.05
  })
}

function createFlower(flower: InterestFlowerDescriptor, index: number): THREE.Group {
  const group = new THREE.Group()
  group.name = `${flower.id}-${index}`
  const theta = hash(SOURCE_FLOWER_SEED, 1000 + index) * Math.PI * 2
  const radial =
    Math.sqrt(hash(SOURCE_FLOWER_SEED, 2000 + index)) * (5 - SOURCE_FLOWER_RADIUS_INSET)
  const x = Math.cos(theta) * radial
  const z = Math.sin(theta) * radial
  group.position.set(x, islandHeightAt(x, z), z)
  group.rotation.y = hash(SOURCE_FLOWER_SEED, 3000 + index) * Math.PI * 2
  group.scale.setScalar(flower.evidenceState === 'pending' ? 0.72 : 1)

  group.add(buildStem())

  const petalGroup = new THREE.Group()
  petalGroup.position.y = STEM_HEIGHT
  petalGroup.add(buildBloom(flower))
  group.add(petalGroup)
  group.userData.flowerMotion = {
    phase: hash(SOURCE_FLOWER_SEED, 4000 + index) * Math.PI * 2,
    petalGroup,
  } satisfies FlowerMotion
  if (flower.timelineEntryIds.length > 0) {
    addWorldHitTarget(group, {
      name: `${flower.id}-${index}-interest-hit-target`,
      position: new THREE.Vector3(0, STEM_HEIGHT * 0.72, 0),
      scale: new THREE.Vector3(0.38, 0.52, 0.38),
      priority: 30,
    })
  }
  return group
}

function decorativeFlower(
  flower: InterestFlowerDescriptor['flower'],
  index: number,
): InterestFlowerDescriptor {
  return {
    id: `student-space-decorative-${flower}`,
    claimId: `student-space.decorative.${flower}`,
    label: flower,
    flower,
    color: '#ffffff',
    strength: 'medium',
    evidenceState: 'confirmed',
    count: 1,
    placementSeed: SOURCE_FLOWER_SEED + index,
    timelineEntryIds: [],
  }
}

function buildBloom(flower: InterestFlowerDescriptor): THREE.Group {
  const source = SOURCE_FLOWER_PALETTE[flower.flower]
  const species = {
    id: flower.flower,
    petal: source.petal,
    centre: 'centre' in source ? source.centre : undefined,
    face: 'face' in source ? source.face : undefined,
    opacity: flower.evidenceState === 'pending' ? 0.72 : 1,
  }
  if (species.id === 'daisy') return buildDaisy(species)
  if (species.id === 'tulip') return buildTulip(species)
  if (species.id === 'rose') return buildRose(species)
  if (species.id === 'lily') return buildLily(species)
  if (species.id === 'pansy') return buildPansy(species)
  return buildHyacinth(species)
}

function buildStem(): THREE.Group {
  const group = new THREE.Group()
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(STEM_R * 0.85, STEM_R, STEM_HEIGHT, 6, 1),
    lambert(STEM_COLOR),
  )
  stem.position.y = STEM_HEIGHT * 0.5
  group.add(stem)

  for (let b = 0; b < 5; b += 1) {
    const angle = (b / 5) * Math.PI * 2 + 0.6
    const tilt = 0.55 + (b % 2) * 0.12
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.2 + (b % 2) * 0.04, 4),
      lambert(LEAF_COLOR),
    )
    blade.position.set(Math.cos(angle) * 0.025, 0.07, Math.sin(angle) * 0.025)
    blade.scale.set(1, 1, 0.32)
    blade.rotation.y = angle
    blade.rotation.z = Math.cos(angle) * tilt
    blade.rotation.x = Math.sin(angle) * tilt
    group.add(blade)
  }
  return group
}

function buildDaisy(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  const centreMaterial = lambert(species.centre ?? 0xffd45a, species.opacity)
  const centre = new THREE.Mesh(new THREE.SphereGeometry(CENTRE_SIZE, 10, 8), centreMaterial)
  centre.position.y = 0.04
  group.add(centre)
  for (let p = 0; p < 6; p += 1) {
    const angle = (p / 6) * Math.PI * 2
    const petal = new THREE.Mesh(new THREE.SphereGeometry(BLOOM_SIZE, 10, 8), petalMaterial)
    petal.position.set(Math.cos(angle) * 0.13, 0.03, Math.sin(angle) * 0.13)
    petal.scale.set(1.1, 0.42, 1.1)
    group.add(petal)
  }
  return group
}

function buildTulip(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  for (let p = 0; p < 3; p += 1) {
    const angle = (p / 3) * Math.PI * 2
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(BLOOM_SIZE * 0.95, 10, 8, 0, Math.PI),
      petalMaterial,
    )
    petal.position.set(Math.cos(angle) * 0.045, 0.1, Math.sin(angle) * 0.045)
    petal.scale.set(0.78, 1.7, 0.95)
    petal.rotation.y = -angle + Math.PI / 2
    petal.rotation.x = -0.18
    group.add(petal)
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(BLOOM_SIZE * 0.55, 10, 8), petalMaterial)
  cap.position.y = 0.2
  cap.scale.set(0.85, 0.45, 0.85)
  group.add(cap)
  return group
}

function buildRose(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(BLOOM_SIZE * 0.6, 0), petalMaterial)
  core.position.y = 0.08
  group.add(core)
  for (let layer = 0; layer < 2; layer += 1) {
    const count = layer === 0 ? 6 : 4
    const radius = layer === 0 ? 0.11 : 0.07
    const y = layer === 0 ? 0.06 : 0.1
    for (let p = 0; p < count; p += 1) {
      const angle = (p / count) * Math.PI * 2 + layer * 0.4
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(BLOOM_SIZE * 0.85, 10, 8),
        petalMaterial,
      )
      petal.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      petal.scale.set(0.95, 0.62, 0.95)
      group.add(petal)
    }
  }
  return group
}

function buildLily(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  const centre = new THREE.Mesh(
    new THREE.SphereGeometry(CENTRE_SIZE * 0.55, 8, 6),
    lambert(species.centre ?? 0xfaf1dc, species.opacity),
  )
  centre.position.y = 0.1
  group.add(centre)
  for (let p = 0; p < 6; p += 1) {
    const angle = (p / 6) * Math.PI * 2
    const petal = new THREE.Mesh(
      new THREE.ConeGeometry(BLOOM_SIZE * 0.5, BLOOM_SIZE * 2, 6),
      petalMaterial,
    )
    petal.position.set(Math.cos(angle) * 0.12, 0.085, Math.sin(angle) * 0.12)
    petal.rotation.z = -Math.PI / 2
    petal.rotation.y = -angle
    petal.scale.set(1, 1, 0.65)
    group.add(petal)
  }
  const stamenMaterial = lambert(0xc58a36, species.opacity)
  for (let s = 0; s < 5; s += 1) {
    const angle = (s / 5) * Math.PI * 2 + 0.3
    const filament = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4),
      stamenMaterial,
    )
    filament.position.set(Math.cos(angle) * 0.02, 0.135, Math.sin(angle) * 0.02)
    filament.rotation.z = Math.cos(angle) * 0.45
    filament.rotation.x = Math.sin(angle) * 0.45
    const anther = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), stamenMaterial)
    anther.position.set(Math.cos(angle) * 0.045, 0.175, Math.sin(angle) * 0.045)
    group.add(filament, anther)
  }
  return group
}

function buildPansy(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  const faceMaterial = lambert(species.face ?? 0x2b2620, species.opacity)
  const eyeMaterial = lambert(0xffd45a, species.opacity)
  const layout = [
    { x: -0.5, z: 0.7, s: 1.05 },
    { x: 0.5, z: 0.7, s: 1.05 },
    { x: -0.95, z: -0.1, s: 1.05 },
    { x: 0.95, z: -0.1, s: 1.05 },
    { x: 0, z: -0.85, s: 1.25 },
  ]
  for (const petalSpec of layout) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(BLOOM_SIZE * 1.05, 12, 8), petalMaterial)
    petal.position.set(petalSpec.x * 0.12, 0.05, petalSpec.z * 0.12)
    petal.scale.set(petalSpec.s, 0.26, petalSpec.s)
    group.add(petal)
  }
  const face = new THREE.Mesh(new THREE.SphereGeometry(CENTRE_SIZE * 0.65, 12, 8), faceMaterial)
  face.position.set(0, 0.072, 0.005)
  face.scale.set(0.95, 0.22, 0.95)
  const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.015, 0), eyeMaterial)
  eye.position.set(0, 0.1, 0)
  group.add(face, eye)
  return group
}

function buildHyacinth(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = lambert(species.petal, species.opacity)
  for (let level = 0; level < 5; level += 1) {
    const y = 0.04 + level * 0.075
    const radius = 0.08 - level * 0.012
    for (let p = 0; p < 4; p += 1) {
      const angle = (p / 4) * Math.PI * 2 + level * 0.35
      const blob = new THREE.Mesh(
        new THREE.IcosahedronGeometry(BLOOM_SIZE * 0.55, 0),
        petalMaterial,
      )
      blob.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      group.add(blob)
    }
  }
  return group
}

function lambert(color: number, opacity = 1): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent: opacity < 1,
    opacity,
  })
}

function hash(seed: number, n: number): number {
  let h = seed | 0
  h = Math.imul(h ^ n, 2654435761)
  h ^= h >>> 16
  return ((h >>> 0) % 10_000) / 10_000
}
