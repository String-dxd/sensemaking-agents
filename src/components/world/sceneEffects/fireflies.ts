import * as THREE from 'three'
import { islandHeightAt } from '../island'
import type { WorldEnvironmentControls } from '../worldStyle'
import { worldNightFactorForControls } from '../worldStyle'

const COUNT = 8
const CORE_COLOR = 0xfff4c2
const HALO_COLOR = 0xffe8a8

interface FireflyEntry {
  group: THREE.Group
  coreMaterial: THREE.MeshBasicMaterial
  halo: THREE.Sprite
  haloMaterial: THREE.SpriteMaterial
  baseX: number
  baseY: number
  baseZ: number
  phase: number
  phaseY: number
  driftSpeed: number
}

interface FirefliesMotion {
  entries: FireflyEntry[]
  texture: THREE.CanvasTexture
  motionScale: number
}

export function createAmbientFireflies(motionScale: number): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-ambient-fireflies'
  const texture = createHaloTexture()
  const entries: FireflyEntry[] = []

  for (let i = 0; i < COUNT; i += 1) {
    const theta = hash(i + 11) * Math.PI * 2
    const radius = (0.45 + hash(i + 23) * 0.4) * 4
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius
    const ground = islandHeightAt(x, z)
    const baseY = ground + 0.7 + hash(i + 37) * 1.1

    const fireflyGroup = new THREE.Group()
    fireflyGroup.name = `student-space-ambient-firefly-${i}`
    fireflyGroup.position.set(x, baseY, z)

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: CORE_COLOR,
      transparent: true,
      opacity: 0,
    })
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), coreMaterial)
    fireflyGroup.add(core)

    const haloMaterial = new THREE.SpriteMaterial({
      map: texture,
      color: HALO_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const halo = new THREE.Sprite(haloMaterial)
    halo.scale.setScalar(0.32)
    fireflyGroup.add(halo)

    group.add(fireflyGroup)
    entries.push({
      group: fireflyGroup,
      coreMaterial,
      halo,
      haloMaterial,
      baseX: x,
      baseY,
      baseZ: z,
      phase: hash(i + 47) * Math.PI * 2,
      phaseY: hash(i + 59) * Math.PI * 2,
      driftSpeed: 0.26 + hash(i + 71) * 0.18,
    })
  }

  group.userData.firefliesMotion = { entries, texture, motionScale } satisfies FirefliesMotion
  return group
}

export function tickAmbientFireflies(
  root: THREE.Object3D,
  elapsed: number,
  controls?: WorldEnvironmentControls,
) {
  const motion = root.userData.firefliesMotion as FirefliesMotion | undefined
  if (!motion) return
  const night = worldNightFactorForControls(elapsed, controls)
  const glow = night * 0.85
  for (const entry of motion.entries) {
    const driftT = elapsed * entry.driftSpeed * motion.motionScale
    entry.group.position.set(
      entry.baseX + Math.sin(driftT + entry.phase) * 0.55,
      entry.baseY + Math.sin(elapsed * 0.7 + entry.phaseY) * 0.18,
      entry.baseZ + Math.cos(driftT * 0.7 + entry.phase) * 0.55,
    )
    const pulse = 1 + Math.sin(elapsed * 1.4 + entry.phase) * 0.18
    entry.halo.scale.setScalar(0.32 * pulse)
    entry.haloMaterial.opacity = 0.75 * glow
    entry.coreMaterial.opacity = 0.65 * glow
  }
}

function createHaloTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 244, 194, 1)')
  gradient.addColorStop(0.35, 'rgba(255, 232, 168, 0.55)')
  gradient.addColorStop(1, 'rgba(255, 232, 168, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function hash(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 2654435761)
  h ^= h >>> 16
  return ((h >>> 0) % 10000) / 10000
}
