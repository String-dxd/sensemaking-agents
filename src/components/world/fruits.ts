import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForSkillFruit } from './hotspots'
import { islandHeightAt, positionOnIsland } from './island'
import { getLeafClusterGeometry, makeLeavesMaterial } from './trees'
import type { SkillFruitDescriptor, ValueTreeDescriptor } from './vipsWorldMapping'
import { WORLD_STYLE } from './worldStyle'

const STEM = 0x6a4b2f
const SOURCE_BUSH_PLACEMENTS = [
  { species: 'plum', x: 2.6, z: 0.1, color: 0x7b3f8e },
  { species: 'fig', x: -2.4, z: 0.9, color: 0x6a3f62 },
  { species: 'citrus', x: 0.8, z: -2.6, color: 0xf1a22f },
  { species: 'berry', x: -1, z: -2.4, color: 0xb02a5e },
] as const

export function attachFruitToTrees(
  root: THREE.Group,
  fruit: SkillFruitDescriptor[],
  trees: ValueTreeDescriptor[],
  foliageTexture: THREE.Texture,
) {
  const treeById = new Map(trees.map((tree) => [tree.id, tree]))

  for (const [index, skill] of fruit.entries()) {
    const placement = SOURCE_BUSH_PLACEMENTS[index]
    root.add(
      createFruitBush(skill, foliageTexture, treeById.get(skill.valueTreeId ?? ''), placement),
    )
  }

  const decorativeStart = fruit.length > 0 ? fruit.length : 0
  for (let index = decorativeStart; index < SOURCE_BUSH_PLACEMENTS.length; index += 1) {
    const placement = SOURCE_BUSH_PLACEMENTS[index]
    if (!placement) continue
    root.add(
      createFruitBush(decorativeFruit(placement, index), foliageTexture, undefined, placement),
    )
  }
}

function createFruitBush(
  skill: SkillFruitDescriptor,
  foliageTexture: THREE.Texture,
  relatedTree?: ValueTreeDescriptor,
  placement?: (typeof SOURCE_BUSH_PLACEMENTS)[number],
): THREE.Group {
  const group = new THREE.Group()
  group.name = skill.id
  const isInteractive = skill.timelineEntryIds.length > 0
  if (isInteractive) attachWorldHotspot(group, hotspotForSkillFruit(skill))

  const base = placement
    ? new THREE.Vector3(placement.x, islandHeightAt(placement.x, placement.z), placement.z)
    : relatedTree
      ? positionOnIsland(relatedTree.placementSeed + skill.placementSeed, 0.82)
      : positionOnIsland(skill.placementSeed, 0.7)
  group.position.copy(base)
  group.rotation.y = ((skill.placementSeed % 360) * Math.PI) / 180
  group.scale.setScalar(placement ? 1 : 0.9 + skill.ripeness * 0.32)

  const opacity = skill.evidenceState === 'pending' ? 0.58 : 0.96
  const leafMat = makeLeavesMaterial(
    foliageTexture,
    WORLD_STYLE.foliage.oakColorA,
    WORLD_STYLE.foliage.oakColorB,
  )
  leafMat.uniforms.uOpacity.value = opacity
  leafMat.transparent = skill.evidenceState === 'pending'

  const rnd = mulberry32(hashSeed(group.position.x, group.position.z, skill.id))
  const blobs = [
    {
      dx: 0,
      dz: 0,
      r: 0.32 + rnd() * 0.04,
    },
    {
      dx: (rnd() - 0.5) * 0.42,
      dz: (rnd() - 0.5) * 0.42,
      r: 0.2 + rnd() * 0.05,
    },
  ]

  const bushLeaves = new THREE.InstancedMesh(getLeafClusterGeometry(), leafMat, blobs.length)
  bushLeaves.name = `${skill.id}-student-space-bush-leaves`
  bushLeaves.frustumCulled = false
  bushLeaves.userData.worldLeafMaterial = leafMat
  for (const [index, blob] of blobs.entries()) {
    bushLeaves.setMatrixAt(
      index,
      new THREE.Matrix4().compose(
        new THREE.Vector3(blob.dx, blob.r * 0.88, blob.dz),
        new THREE.Quaternion(),
        new THREE.Vector3(blob.r, blob.r, blob.r),
      ),
    )
  }
  bushLeaves.instanceMatrix.needsUpdate = true
  group.add(bushLeaves)

  const count = isInteractive ? Math.min(6, Math.max(1, skill.count)) : 4
  const colorOverride = isInteractive ? undefined : placement?.color
  for (let i = 0; i < count; i += 1) {
    const blob = blobs[i < blobs.length ? i : Math.floor(rnd() * blobs.length)] ?? {
      dx: 0,
      dz: 0,
      r: 0.32,
    }
    const theta = rnd() * Math.PI * 2
    const phi = Math.acos(2 * rnd() - 1)
    const radius = blob.r * (0.94 + rnd() * 0.12)
    const cluster = createBerryCluster(skill, i, 1, colorOverride)
    cluster.position.set(
      blob.dx + radius * Math.sin(phi) * Math.cos(theta),
      blob.r * 0.88 + radius * Math.cos(phi) - blob.r * 0.05,
      blob.dz + radius * Math.sin(phi) * Math.sin(theta),
    )
    group.add(cluster)
  }

  if (isInteractive) {
    addWorldHitTarget(group, {
      name: `${skill.id}-skill-bush-hit-target`,
      position: new THREE.Vector3(0, 0.25, 0),
      scale: new THREE.Vector3(0.76, 0.56, 0.76),
      priority: 34,
    })
  }

  return group
}

function createBerryCluster(
  skill: SkillFruitDescriptor,
  index: number,
  scale: number,
  colorOverride?: number,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `${skill.id}-${index}-berry-cluster`
  const opacity = skill.evidenceState === 'pending' ? 0.55 : 0.96
  const berryMat = new THREE.MeshLambertMaterial({
    color: colorOverride ?? skill.color,
    emissive: new THREE.Color(colorOverride ?? skill.color).multiplyScalar(0.05),
    transparent: skill.evidenceState === 'pending',
    opacity,
  })
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007 * scale, 0.009 * scale, 0.05 * scale, 6),
    new THREE.MeshLambertMaterial({ color: STEM }),
  )
  stem.position.y = 0.025 * scale
  group.add(stem)

  const berryRadius = (0.022 + skill.ripeness * 0.009) * scale
  for (let i = 0; i < 6; i += 1) {
    const theta = ((skill.placementSeed + index * 37 + i * 71) % 360) * (Math.PI / 180)
    const row = i < 2 ? 0 : i < 5 ? 1 : 2
    const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(berryRadius, 0), berryMat)
    berry.position.set(
      Math.cos(theta) * berryRadius * (row + 0.6),
      -berryRadius * (0.2 + row * 0.62),
      Math.sin(theta) * berryRadius * (row + 0.6),
    )
    berry.scale.setScalar(0.86 + ((skill.placementSeed + i) % 5) * 0.06)
    group.add(berry)
  }

  return group
}

function decorativeFruit(
  placement: (typeof SOURCE_BUSH_PLACEMENTS)[number],
  index: number,
): SkillFruitDescriptor {
  return {
    id: `student-space-decorative-bush-${placement.species}`,
    claimId: `student-space.decorative.${placement.species}`,
    label: placement.species,
    fruitFamily: 'student-space-berry-cluster',
    host: 'bush',
    color: `#${placement.color.toString(16).padStart(6, '0')}`,
    strength: 'medium',
    evidenceState: 'confirmed',
    count: 4,
    ripeness: 0.7,
    valueTreeId: null,
    valueTreeLabel: null,
    placementSeed: 500 + index * 73,
    timelineEntryIds: [],
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 0xffffffff
  }
}

function hashSeed(x: number, z: number, key: string): number {
  let seed = Math.floor(x * 7919) ^ Math.floor(z * 6173)
  for (let index = 0; index < key.length; index += 1) {
    seed = (seed * 31 + key.charCodeAt(index)) >>> 0
  }
  return seed >>> 0
}
