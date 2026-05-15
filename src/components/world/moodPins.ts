import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForMoodPin } from './hotspots'
import { islandHeightAt, positionOnIsland } from './island'
import type { MoodPinDescriptor } from './vipsWorldMapping'

export function createMoodPins(pins: MoodPinDescriptor[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-mood-pins'
  for (const pin of pins) {
    group.add(createMoodPin(pin))
  }
  return group
}

export function tickMoodPins(root: THREE.Object3D, time: number, motionScale = 1) {
  root.traverse((object) => {
    const motion = object.userData.moodPinMotion as MoodPinMotion | undefined
    if (!motion) return
    const pulse = 1 + Math.sin(time * 0.9 + motion.phase) * 0.06 * motionScale
    motion.head.scale.setScalar(pulse)
    motion.glowMaterial.opacity = motion.baseOpacity * (0.6 + 0.4 * pulse)
  })
}

function createMoodPin(pin: MoodPinDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = pin.id
  attachWorldHotspot(group, hotspotForMoodPin(pin))

  const base = positionOnIsland(pin.placementSeed, 0.66)
  group.position.copy(base)
  group.position.y = islandHeightAt(base.x, base.z) + 0.02

  const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x6c5644 })
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.18, 8), stemMaterial)
  stem.position.y = 0.09
  group.add(stem)

  const headColor = new THREE.Color(pin.color)
  const headMaterial = new THREE.MeshLambertMaterial({
    color: headColor,
    emissive: headColor.clone().multiplyScalar(0.18),
  })
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.05 + pin.intensity * 0.025, 14, 10),
    headMaterial,
  )
  head.position.y = 0.2
  group.add(head)

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: headColor,
    transparent: true,
    opacity: 0.18 + pin.recencyWeight * 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), glowMaterial)
  glow.position.y = 0.2
  group.add(glow)

  addWorldHitTarget(group, {
    name: `${pin.id}-mood-pin-hit-target`,
    position: new THREE.Vector3(0, 0.2, 0),
    scale: new THREE.Vector3(0.4, 0.4, 0.4),
    priority: 38,
  })

  group.userData.moodPinMotion = {
    head,
    glowMaterial,
    baseOpacity: glowMaterial.opacity,
    phase: ((pin.placementSeed % 360) * Math.PI) / 180,
  } satisfies MoodPinMotion

  return group
}

interface MoodPinMotion {
  head: THREE.Object3D
  glowMaterial: THREE.MeshBasicMaterial
  baseOpacity: number
  phase: number
}
