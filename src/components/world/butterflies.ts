import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForButterfly } from './hotspots'
import { positionOnIsland } from './island'
import type { ButterflyDescriptor } from './vipsWorldMapping'

const BODY_INK = 0x2b2620
const WING_HIGHLIGHT = 0xfff6ce

const SPECIES = [
  { id: 'common', w: 0.36, h: 0.28, spotR: 0.042, spotPos: 0.66, tail: false },
  { id: 'tiger', w: 0.32, h: 0.34, spotR: 0.036, spotPos: 0.58, tail: false },
  { id: 'swallowtail', w: 0.42, h: 0.24, spotR: 0.034, spotPos: 0.74, tail: true },
] as const

export function createButterflies(butterflies: ButterflyDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-recent-entry-butterflies'
  butterflies.forEach((butterfly, index) => {
    const mesh = createButterfly(butterfly, index)
    group.add(mesh)
  })
  return group
}

export function tickButterflies(root: THREE.Object3D, time: number) {
  root.traverse((object) => {
    const motion = object.userData.butterflyMotion as ButterflyMotion | undefined
    if (!motion) return
    const a = time * motion.orbitSpeed + motion.phase
    object.position.set(
      motion.anchor.x + Math.cos(a) * motion.orbitRadius,
      motion.anchor.y + Math.sin(a * 0.7) * 0.06,
      motion.anchor.z + Math.sin(a) * motion.orbitRadius * 0.56,
    )

    const velocityX = -Math.sin(a) * motion.orbitRadius
    const velocityZ = Math.cos(a) * motion.orbitRadius * 0.56
    object.rotation.y = Math.atan2(velocityX, velocityZ)

    const flap = Math.sin(time * 9.2 + motion.phase) * 0.46
    motion.rightWing.rotation.y = flap
    motion.leftWing.rotation.y = Math.PI - flap
    motion.visualRoot.rotation.z = Math.sin(time * 1.8 + motion.phase) * 0.08
    object.position.y += Math.sin(time * 1.4 + motion.phase) * 0.018
  })
}

function createButterfly(butterfly: ButterflyDescriptor, index: number): THREE.Group {
  const group = new THREE.Group()
  group.name = butterfly.id
  attachWorldHotspot(group, hotspotForButterfly(butterfly))
  const visualRoot = new THREE.Group()
  visualRoot.name = `${butterfly.id}-horizontal-flight`
  visualRoot.rotation.x = Math.PI * 0.5
  group.add(visualRoot)

  const base = positionOnIsland(butterfly.placementSeed, 0.72)
  const anchor = new THREE.Vector3(base.x, base.y + 0.82 + butterfly.recencyWeight * 0.52, base.z)
  group.position.copy(anchor)
  group.scale.setScalar(0.62 + butterfly.recencyWeight * 0.26)
  addWorldHitTarget(group, {
    name: `${butterfly.id}-reflection-hit-target`,
    position: new THREE.Vector3(0, 0.02, 0),
    scale: new THREE.Vector3(0.66, 0.5, 0.66),
    priority: 45,
  })

  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: BODY_INK,
    flatShading: false,
    shininess: 36,
    transparent: true,
    opacity: butterfly.evidenceState === 'pending' ? 0.55 : 1,
  })
  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.09, 4, 12), bodyMaterial)
  abdomen.position.y = -0.005
  abdomen.scale.x = 0.72
  visualRoot.add(abdomen)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), bodyMaterial)
  head.position.y = 0.075
  visualRoot.add(head)
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), bodyMaterial)
  thorax.position.y = 0.035
  thorax.scale.set(0.8, 1.15, 0.86)
  visualRoot.add(thorax)

  const antennaL = buildAntenna(-1, bodyMaterial)
  const antennaR = buildAntenna(1, bodyMaterial)
  visualRoot.add(antennaL, antennaR)

  const species = SPECIES[index % SPECIES.length] ?? SPECIES[0]
  const rightWing = buildWing(species, butterfly)
  const leftWing = buildWing(species, butterfly)
  leftWing.rotation.y = Math.PI
  visualRoot.add(leftWing, rightWing)

  group.userData.butterflyMotion = {
    anchor,
    orbitRadius: 0.13 + butterfly.recencyWeight * 0.1,
    orbitSpeed: 0.54 + (butterfly.placementSeed % 9) * 0.024,
    phase: ((butterfly.placementSeed + index * 31) % 360) * (Math.PI / 180),
    leftWing,
    rightWing,
    visualRoot,
  } satisfies ButterflyMotion
  return group
}

function buildAntenna(side: -1 | 1, material: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.012, 0.09, 0.002),
    new THREE.Vector3(side * 0.035, 0.13, 0.004),
    new THREE.Vector3(side * 0.052, 0.17, 0.01),
  ])
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0035, 6), material)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), material)
  tip.position.copy(curve.points[curve.points.length - 1] ?? new THREE.Vector3())
  group.add(stalk, tip)
  return group
}

function buildWing(species: (typeof SPECIES)[number], butterfly: ButterflyDescriptor): THREE.Group {
  const wing = new THREE.Group()
  const opacity = butterfly.evidenceState === 'pending' ? 0.58 : 0.96
  const base = new THREE.Color(butterfly.color)
  const edge = base.clone().multiplyScalar(0.34)
  const shadow = base.clone().multiplyScalar(0.7)

  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: edge,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: opacity * 0.82,
    depthWrite: false,
  })
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: base,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const veinMaterial = new THREE.LineBasicMaterial({
    color: shadow,
    transparent: true,
    opacity: opacity * 0.42,
    depthWrite: false,
  })
  const spotMaterial = new THREE.MeshBasicMaterial({
    color: shadow,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: opacity * 0.74,
    depthWrite: false,
  })
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: WING_HIGHLIGHT,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: opacity * 0.74,
    depthWrite: false,
  })

  const edgeMesh = new THREE.Mesh(
    buildWingGeometry(species.w * 1.045, species.h * 1.06),
    edgeMaterial,
  )
  edgeMesh.position.z = -0.003
  const mainWing = new THREE.Mesh(buildWingGeometry(species.w, species.h), wingMaterial)
  mainWing.position.z = 0.001
  wing.add(edgeMesh, mainWing, buildWingVeins(species.w, species.h, veinMaterial))

  addWingSpot(wing, species.w * species.spotPos, species.h * 0.06, species.spotR, spotMaterial)
  addWingSpot(wing, species.w * 0.48, -species.h * 0.16, species.spotR * 0.66, highlightMaterial)
  addWingSpot(wing, species.w * 0.78, -species.h * 0.28, species.spotR * 0.48, highlightMaterial)

  if (species.id === 'tiger') {
    addWingStripe(wing, species.w * 0.46, species.h * 0.22, -0.46, species.h * 0.48, edgeMaterial)
    addWingStripe(wing, species.w * 0.62, species.h * 0.02, -0.36, species.h * 0.42, edgeMaterial)
    addWingStripe(wing, species.w * 0.72, -species.h * 0.17, -0.18, species.h * 0.32, edgeMaterial)
  }

  if (species.tail) {
    const tail = new THREE.Mesh(buildTailGeometry(species.w, species.h), edgeMaterial)
    tail.position.z = -0.001
    const tailTip = new THREE.Mesh(
      new THREE.CircleGeometry(species.spotR * 0.42, 14),
      highlightMaterial,
    )
    tailTip.position.set(species.w * 0.93, -species.h * 0.54, 0.004)
    wing.add(tail, tailTip)
  }

  return wing
}

function buildWingGeometry(w: number, h: number): THREE.ShapeGeometry {
  const top = h * 0.55
  const bot = h * 0.45
  const shape = new THREE.Shape()
  shape.moveTo(0, top * 0.15)
  shape.bezierCurveTo(w * 0.18, top * 1.25, w * 0.72, top * 1.08, w * 1.0, top * 0.34)
  shape.bezierCurveTo(w * 1.08, top * 0.02, w * 1.0, -bot * 0.35, w * 0.78, -bot * 0.74)
  shape.bezierCurveTo(w * 0.54, -bot * 1.0, w * 0.22, -bot * 0.84, w * 0.04, -bot * 0.22)
  shape.lineTo(0, top * 0.15)
  return new THREE.ShapeGeometry(shape, 20)
}

function buildTailGeometry(w: number, h: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(w * 0.7, -h * 0.22)
  shape.bezierCurveTo(w * 0.86, -h * 0.38, w * 0.94, -h * 0.52, w * 0.98, -h * 0.72)
  shape.bezierCurveTo(w * 0.84, -h * 0.62, w * 0.73, -h * 0.45, w * 0.62, -h * 0.26)
  shape.closePath()
  return new THREE.ShapeGeometry(shape, 12)
}

function buildWingVeins(w: number, h: number, material: THREE.Material): THREE.LineSegments {
  const z = 0.006
  const segments: Array<[number, number, number, number]> = [
    [0.03, h * 0.03, w * 0.7, h * 0.34],
    [0.04, h * 0.01, w * 0.82, h * 0.02],
    [0.03, -h * 0.03, w * 0.58, -h * 0.22],
    [w * 0.28, h * 0.2, w * 0.42, h * 0.03],
    [w * 0.34, -h * 0.12, w * 0.48, h * 0.02],
  ]
  const positions = segments.flatMap(([x1, y1, x2, y2]) => [x1, y1, z, x2, y2, z])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const veins = new THREE.LineSegments(geometry, material)
  veins.renderOrder = 4
  return veins
}

function addWingSpot(
  wing: THREE.Group,
  x: number,
  y: number,
  radius: number,
  material: THREE.Material,
) {
  const spot = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), material)
  spot.position.set(x, y, 0.007)
  wing.add(spot)
}

function addWingStripe(
  wing: THREE.Group,
  x: number,
  y: number,
  rotation: number,
  length: number,
  material: THREE.Material,
) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.018, length), material)
  stripe.position.set(x, y, 0.008)
  stripe.rotation.z = rotation
  wing.add(stripe)
}

interface ButterflyMotion {
  anchor: THREE.Vector3
  orbitRadius: number
  orbitSpeed: number
  phase: number
  leftWing: THREE.Object3D
  rightWing: THREE.Object3D
  visualRoot: THREE.Object3D
}
