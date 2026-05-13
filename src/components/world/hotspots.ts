import * as THREE from 'three'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type {
  ButterflyDescriptor,
  InterestFlowerDescriptor,
  SkillFruitDescriptor,
  ValueTreeDescriptor,
} from './vipsWorldMapping'

export type WorldHotspotKind = 'value' | 'interest' | 'skill' | 'reflection'

export interface WorldHotspot {
  id: string
  kind: WorldHotspotKind
  eyebrow: string
  title: string
  description: string
  href: string
}

export interface WorldHotspotPointer {
  x: number
  y: number
}

interface WorldHitTargetOptions {
  name?: string
  position?: THREE.Vector3
  radius?: number
  scale?: THREE.Vector3
  priority?: number
}

const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

const HIT_TARGET_MATERIAL = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
})

export function attachWorldHotspot<T extends THREE.Object3D>(object: T, hotspot: WorldHotspot): T {
  object.userData.worldHotspot = hotspot
  return object
}

export function addWorldHitTarget(
  parent: THREE.Object3D,
  {
    name = 'world-hit-target',
    position = new THREE.Vector3(),
    radius = 1,
    scale = new THREE.Vector3(1, 1, 1),
    priority = 0,
  }: WorldHitTargetOptions = {},
): THREE.Mesh {
  const target = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), HIT_TARGET_MATERIAL)
  target.name = name
  target.position.copy(position)
  target.scale.copy(scale)
  target.userData.worldHitTarget = true
  target.userData.worldHotspotPriority = priority
  parent.add(target)
  return target
}

export function findWorldHotspot(object: THREE.Object3D | null): WorldHotspot | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const hotspot = current.userData.worldHotspot
    if (isWorldHotspot(hotspot)) return hotspot
    current = current.parent
  }
  return null
}

export function findWorldHotspotPriority(object: THREE.Object3D | null): number {
  let current: THREE.Object3D | null = object
  while (current) {
    const priority = current.userData.worldHotspotPriority
    if (typeof priority === 'number') return priority
    current = current.parent
  }
  return 0
}

export function hotspotForValueTree(tree: ValueTreeDescriptor): WorldHotspot {
  return {
    id: tree.id,
    kind: 'value',
    eyebrow: 'Value tree',
    title: tree.label,
    description: `${entryCount(tree.timelineEntryIds.length)} · ${tree.strength} signal`,
    href: dimensionHref('values', tree.timelineEntryIds),
  }
}

export function hotspotForInterestFlower(flower: InterestFlowerDescriptor): WorldHotspot {
  return {
    id: flower.id,
    kind: 'interest',
    eyebrow: 'Interest bloom',
    title: flower.label,
    description: `${entryCount(flower.timelineEntryIds.length)} · ${flower.strength} signal`,
    href: dimensionHref('interests', flower.timelineEntryIds),
  }
}

export function hotspotForSkillFruit(fruit: SkillFruitDescriptor): WorldHotspot {
  return {
    id: fruit.id,
    kind: 'skill',
    eyebrow: 'Skill fruit',
    title: fruit.label,
    description: `${entryCount(fruit.timelineEntryIds.length)} · ${fruit.strength} signal`,
    href: dimensionHref('skills', fruit.timelineEntryIds),
  }
}

export function hotspotForButterfly(butterfly: ButterflyDescriptor): WorldHotspot {
  const dimension = DIMENSION_LABEL[butterfly.touchedDimension]
  return {
    id: butterfly.id,
    kind: 'reflection',
    eyebrow: `${dimension} butterfly`,
    title: `Reflection #${butterfly.entryId}`,
    description: `${butterfly.evidenceState === 'pending' ? 'Needs review' : 'Confirmed'} · ${
      butterfly.targetClaimLabel
    }`,
    href: `/?sheet=reflections#reflection-${butterfly.entryId}`,
  }
}

function dimensionHref(dimension: VipsDimension, timelineEntryIds: Array<number | string>): string {
  const firstEntryId = timelineEntryIds[0]
  return firstEntryId == null
    ? `/?sheet=${dimension}`
    : `/?sheet=${dimension}#entry-${firstEntryId}`
}

function entryCount(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

function isWorldHotspot(value: unknown): value is WorldHotspot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorldHotspot>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.eyebrow === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.href === 'string'
  )
}
