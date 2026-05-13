import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForInterestFlower } from './hotspots'
import { positionOnIsland } from './island'
import type { InterestFlowerDescriptor } from './vipsWorldMapping'

const STEM_HEIGHT = 0.24
const STEM_R = 0.014
const BLOOM_SIZE = 0.11
const CENTRE_SIZE = 0.07
const STEM_COLOR = 0x6f8a4a
const PETAL_HIGHLIGHT = 0xfff2c4

export function createFlowers(flowers: InterestFlowerDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-interest-flowers'
  for (const flower of flowers) {
    const count = Math.min(12, Math.max(2, flower.count + 1))
    for (let i = 0; i < count; i += 1) {
      const instance = createFlower(flower, i)
      attachWorldHotspot(instance, hotspotForInterestFlower(flower))
      group.add(instance)
    }
  }
  return group
}

export function tickFlowers(root: THREE.Object3D, time: number) {
  root.traverse((object) => {
    const motion = object.userData.flowerMotion as FlowerMotion | undefined
    if (!motion) return
    motion.petalGroup.rotation.z = Math.sin(time * 0.72 + motion.phase) * 0.04
    motion.petalGroup.rotation.x = Math.cos(time * 0.56 + motion.phase) * 0.025
  })
}

function createFlower(flower: InterestFlowerDescriptor, index: number): THREE.Group {
  const group = new THREE.Group()
  group.name = `${flower.id}-${index}`
  const seed = flower.placementSeed + index * 37
  const pos = positionOnIsland(seed, 0.84)
  group.position.set(pos.x, pos.y, pos.z)
  group.rotation.y = ((seed % 360) * Math.PI) / 180
  group.scale.setScalar((flower.evidenceState === 'pending' ? 0.74 : 0.88) + (seed % 5) * 0.035)

  group.add(buildStem(seed))

  const petalGroup = new THREE.Group()
  petalGroup.position.y = STEM_HEIGHT
  petalGroup.add(buildBloom(flower))
  group.add(petalGroup)
  group.userData.flowerMotion = {
    phase: ((seed * 13) % 360) * (Math.PI / 180),
    petalGroup,
  } satisfies FlowerMotion
  addWorldHitTarget(group, {
    name: `${flower.id}-${index}-interest-hit-target`,
    position: new THREE.Vector3(0, STEM_HEIGHT * 0.72, 0),
    scale: new THREE.Vector3(0.38, 0.52, 0.38),
    priority: 30,
  })
  return group
}

function buildStem(seed = 0): THREE.Group {
  const group = new THREE.Group()
  const material = lambert(STEM_COLOR)
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(STEM_R * 0.78, STEM_R, STEM_HEIGHT, 14),
    material,
  )
  stem.position.y = STEM_HEIGHT * 0.5
  group.add(stem)

  const leafMaterial = lambert(0x5d8a46)
  const leafGeometry = buildLeafGeometry(0.12, 0.042)
  for (let i = 0; i < 2; i += 1) {
    const side = i === 0 ? -1 : 1
    const leaf = new THREE.Mesh(leafGeometry.clone(), leafMaterial)
    leaf.position.set(side * 0.012, STEM_HEIGHT * (0.34 + i * 0.18), 0)
    leaf.rotation.z = side * (0.82 + (seed % 5) * 0.025)
    leaf.rotation.y = side * 0.18
    group.add(leaf)
  }
  return group
}

function buildBloom(flower: InterestFlowerDescriptor): THREE.Group {
  const species = {
    id: flower.flower,
    petal: new THREE.Color(flower.color).getHex(),
    centre: flower.flower === 'lily' ? 0xfaf1dc : 0xffd45a,
    face: 0x2b2620,
    opacity: flower.evidenceState === 'pending' ? 0.72 : 1,
  }
  if (species.id === 'daisy') return buildDaisy(species)
  if (species.id === 'tulip') return buildTulip(species)
  if (species.id === 'rose') return buildRose(species)
  if (species.id === 'lily') return buildLily(species)
  if (species.id === 'pansy') return buildPansy(species)
  return buildHyacinth(species)
}

function buildDaisy(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  const altPetalMaterial = bloomMaterial(
    mixHex(species.petal, PETAL_HIGHLIGHT, 0.18),
    species.opacity,
  )
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2
    addHorizontalPetal(
      group,
      a,
      BLOOM_SIZE * 1.82,
      BLOOM_SIZE * 0.34,
      i % 2 === 0 ? petalMaterial : altPetalMaterial,
      0.028,
      0.028,
    )
  }
  const centre = new THREE.Mesh(
    new THREE.SphereGeometry(CENTRE_SIZE, 16, 12),
    bloomMaterial(species.centre, species.opacity),
  )
  centre.position.y = 0.055
  centre.scale.set(1, 0.7, 1)
  group.add(centre)
  return group
}

function buildTulip(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  const innerMaterial = bloomMaterial(mixHex(species.petal, PETAL_HIGHLIGHT, 0.12), species.opacity)
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2
    addUprightPetal(group, a, BLOOM_SIZE * 1.9, BLOOM_SIZE * 0.36, petalMaterial, 0.035, 0.0, -0.14)
  }
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.36
    addUprightPetal(
      group,
      a,
      BLOOM_SIZE * 1.35,
      BLOOM_SIZE * 0.26,
      innerMaterial,
      0.018,
      0.025,
      -0.08,
    )
  }
  return group
}

function buildRose(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  const innerMaterial = bloomMaterial(mixHex(species.petal, PETAL_HIGHLIGHT, 0.08), species.opacity)
  for (let layer = 0; layer < 3; layer += 1) {
    const count = layer === 0 ? 8 : layer === 1 ? 6 : 4
    const radius = 0.082 - layer * 0.022
    const y = 0.01 + layer * 0.035
    const length = BLOOM_SIZE * (1.18 - layer * 0.15)
    const width = BLOOM_SIZE * (0.34 - layer * 0.035)
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + layer * 0.42
      addUprightPetal(
        group,
        a,
        length,
        width,
        layer > 1 ? innerMaterial : petalMaterial,
        radius,
        y,
        0.06,
      )
    }
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(BLOOM_SIZE * 0.36, 16, 10), innerMaterial)
  core.position.y = 0.13
  core.scale.set(0.9, 0.75, 0.9)
  group.add(core)
  return group
}

function buildLily(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  const centre = new THREE.Mesh(
    new THREE.SphereGeometry(CENTRE_SIZE * 0.7, 14, 10),
    bloomMaterial(species.centre, species.opacity),
  )
  centre.position.y = 0.075
  group.add(centre)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    addHorizontalPetal(group, a, BLOOM_SIZE * 2.35, BLOOM_SIZE * 0.32, petalMaterial, 0.04, 0.02)
  }
  addStamens(group, species.opacity)
  return group
}

function buildPansy(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  const shadowMaterial = bloomMaterial(mixHex(species.petal, species.face, 0.2), species.opacity)
  const layout = [
    {
      a: Math.PI * 0.5,
      length: 0.17,
      width: 0.07,
      y: 0.034,
      inset: 0.015,
      material: petalMaterial,
    },
    {
      a: Math.PI * 0.18,
      length: 0.16,
      width: 0.064,
      y: 0.03,
      inset: 0.012,
      material: petalMaterial,
    },
    {
      a: Math.PI * 0.82,
      length: 0.16,
      width: 0.064,
      y: 0.03,
      inset: 0.012,
      material: petalMaterial,
    },
    {
      a: Math.PI * 1.2,
      length: 0.15,
      width: 0.07,
      y: 0.026,
      inset: 0.01,
      material: shadowMaterial,
    },
    {
      a: Math.PI * 1.8,
      length: 0.15,
      width: 0.07,
      y: 0.026,
      inset: 0.01,
      material: shadowMaterial,
    },
  ] as const
  for (const petal of layout) {
    addHorizontalPetal(
      group,
      petal.a,
      petal.length,
      petal.width,
      petal.material,
      petal.y,
      petal.inset,
    )
  }
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(CENTRE_SIZE * 0.52, 14, 10),
    bloomMaterial(species.face, species.opacity),
  )
  face.position.y = 0.055
  face.scale.set(1, 0.42, 1)
  group.add(face)
  return group
}

function buildHyacinth(species: FlowerSpecies): THREE.Group {
  const group = new THREE.Group()
  const petalMaterial = bloomMaterial(species.petal, species.opacity)
  for (let level = 0; level < 5; level += 1) {
    const y = 0.03 + level * 0.062
    const r = 0.07 - level * 0.01
    const count = level > 2 ? 3 : 4
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + level * 0.42
      const floret = buildTinyFloret(petalMaterial, BLOOM_SIZE * (0.26 - level * 0.014))
      floret.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      floret.rotation.y = -a
      group.add(floret)
    }
  }
  return group
}

function addStamens(group: THREE.Group, opacity: number) {
  const filamentMaterial = bloomMaterial(0xfaf1dc, opacity)
  const pollenMaterial = bloomMaterial(0xd4833d, opacity)
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.24
    const filament = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6),
      filamentMaterial,
    )
    filament.position.set(Math.cos(a) * 0.018, 0.09, Math.sin(a) * 0.018)
    filament.rotation.z = Math.cos(a) * 0.22
    filament.rotation.x = Math.sin(a) * -0.22
    const pollen = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pollenMaterial)
    pollen.position.set(Math.cos(a) * 0.036, 0.13, Math.sin(a) * 0.036)
    group.add(filament, pollen)
  }
}

function buildTinyFloret(material: THREE.Material, size: number): THREE.Group {
  const group = new THREE.Group()
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2
    addHorizontalPetal(group, a, size * 1.6, size * 0.62, material, 0, 0)
  }
  const centre = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 8, 6), material)
  centre.position.y = 0.012
  group.add(centre)
  return group
}

function addHorizontalPetal(
  group: THREE.Group,
  angle: number,
  length: number,
  width: number,
  material: THREE.Material,
  y: number,
  inset: number,
) {
  const petal = new THREE.Mesh(buildHorizontalPetalGeometry(length, width), material)
  petal.position.set(Math.cos(angle) * inset, y, Math.sin(angle) * inset)
  petal.rotation.y = Math.PI / 2 - angle
  group.add(petal)
}

function addUprightPetal(
  group: THREE.Group,
  angle: number,
  length: number,
  width: number,
  material: THREE.Material,
  radius: number,
  y: number,
  lean: number,
) {
  const petal = new THREE.Mesh(buildPetalGeometry(length, width), material)
  petal.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  petal.rotation.y = Math.PI / 2 - angle
  petal.rotation.x = lean
  group.add(petal)
}

function buildPetalGeometry(length: number, width: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(width * 0.9, length * 0.24, width * 0.86, length * 0.72, 0, length)
  shape.bezierCurveTo(-width * 0.86, length * 0.72, -width * 0.9, length * 0.24, 0, 0)
  return new THREE.ShapeGeometry(shape, 18)
}

function buildHorizontalPetalGeometry(length: number, width: number): THREE.ShapeGeometry {
  const geometry = buildPetalGeometry(length, width)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function buildLeafGeometry(length: number, width: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(width * 1.1, length * 0.28, width * 0.9, length * 0.72, 0, length)
  shape.bezierCurveTo(-width * 0.9, length * 0.72, -width * 1.1, length * 0.28, 0, 0)
  return new THREE.ShapeGeometry(shape, 12)
}

function bloomMaterial(color: number, opacity: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.08),
    flatShading: false,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
  })
}

function mixHex(color: number, target: number, amount: number): number {
  return new THREE.Color(color).lerp(new THREE.Color(target), amount).getHex()
}

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: false, side: THREE.DoubleSide })
}

interface FlowerSpecies {
  id: InterestFlowerDescriptor['flower']
  petal: number
  centre: number
  face: number
  opacity: number
}

interface FlowerMotion {
  phase: number
  petalGroup: THREE.Group
}
