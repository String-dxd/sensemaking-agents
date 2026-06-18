import * as THREE from 'three'
import type { BuildPlan } from '../../bird/buildPlan'
import { addOutline } from './util'

// Unified chibi body+head, parametrized per archetype. The body is a SphereGeometry
// deformed into a bottom-heavy egg (breast forward, belly bulge, flattened
// posterior, per-archetype X/Z scale). The head is a second sphere intersecting the
// body top — OR, for the tall (ostrich) archetype, sitting atop a visible neck
// column. A single inverted-hull outline over each volume merges them into one mass.

export interface BodyHead {
  group: THREE.Group
  headGroup: THREE.Group
  shoulderY: number
  shoulderR: number
  bodyBottomY: number
}

export function buildBodyHead(
  plan: BuildPlan,
  mats: { body: THREE.Material; belly: THREE.Material; head: THREE.Material },
  outlineMat: THREE.Material,
): BodyHead {
  const group = new THREE.Group()
  const B = plan.body

  // ── Body: deformed egg ──
  const bodyGeo = new THREE.SphereGeometry(B.r, 40, 30)
  const yScale = B.h / (2 * B.r)
  const pos = bodyGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * B.scaleX
    const y = pos.getY(i) * yScale
    let z = pos.getZ(i) * B.scaleZ
    const ny = y / (B.r * yScale)
    const bulge = B.bulge * Math.exp(-(((ny + 0.25) / 0.5) ** 2))
    x *= 1 + bulge
    z *= 1 + bulge
    if (ny > 0) x += B.breast * ny ** 1.4 * B.r
    if (x < 0 && ny > -0.1) x *= 1 - B.flatten * Math.max(0, ny)
    pos.setXYZ(i, x, y, z)
  }
  bodyGeo.computeVertexNormals()
  const body = new THREE.Mesh(bodyGeo, mats.body)
  body.position.y = B.cy
  body.castShadow = true
  group.add(body)
  addOutline(body, group, outlineMat)

  // ── Belly patch ──
  const bellyGeo = new THREE.SphereGeometry(B.r, 24, 18)
  bellyGeo.scale(0.34 * B.scaleZ, 0.6 * yScale, 0.5 * B.scaleZ)
  const belly = new THREE.Mesh(bellyGeo, mats.belly)
  belly.position.set(B.r * B.scaleX * 0.6 + B.breast * 0.4 * B.r, B.cy - B.r * 0.1, 0)
  group.add(belly)

  // ── Neck column (tall archetype only) ──
  if (plan.neck.enabled) {
    const neckGeo = new THREE.CylinderGeometry(plan.neck.topR, plan.neck.botR, plan.neck.h, 16)
    const neck = new THREE.Mesh(neckGeo, mats.body)
    neck.position.set(plan.head.forward * 0.5, plan.neck.y, 0)
    neck.castShadow = true
    group.add(neck)
    addOutline(neck, group, outlineMat)
  }

  // ── Head ──
  const headGroup = new THREE.Group()
  headGroup.position.set(plan.head.forward, plan.head.cy, 0)
  const headGeo = new THREE.SphereGeometry(plan.head.r, 36, 26)
  const head = new THREE.Mesh(headGeo, mats.head)
  head.scale.y = plan.head.squashY
  head.castShadow = true
  headGroup.add(head)
  addOutline(head, headGroup, outlineMat)
  group.add(headGroup)

  return { group, headGroup, shoulderY: plan.shoulderY, shoulderR: plan.shoulderOut, bodyBottomY: plan.bodyBottomY }
}
