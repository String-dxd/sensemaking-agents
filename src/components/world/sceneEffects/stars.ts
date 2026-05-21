import * as THREE from 'three'
import type { WorldEnvironmentControls } from '../worldStyle'
import { worldNightFactorForControls, worldTwilightFactor } from '../worldStyle'

const STAR_COUNT = 220
const HEMISPHERE_RADIUS = 60

interface StarsMotion {
  material: THREE.PointsMaterial
  twinklePhases: Float32Array
  twinkleSpeeds: Float32Array
  baseSizes: Float32Array
  geometry: THREE.BufferGeometry
  opacity: number
}

export function createStarsEffect(): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3)
  const sizes = new Float32Array(STAR_COUNT)
  const twinklePhases = new Float32Array(STAR_COUNT)
  const twinkleSpeeds = new Float32Array(STAR_COUNT)
  const baseSizes = new Float32Array(STAR_COUNT)

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const seed = hash(i + 7)
    const theta = seed * Math.PI * 2
    const phi = (0.18 + hash(i + 31) * 0.62) * Math.PI * 0.5
    const x = Math.cos(theta) * Math.sin(phi) * HEMISPHERE_RADIUS
    const y = Math.cos(phi) * HEMISPHERE_RADIUS
    const z = Math.sin(theta) * Math.sin(phi) * HEMISPHERE_RADIUS
    positions.set([x, y, z], i * 3)
    const base = 0.18 + hash(i + 53) * 0.62
    baseSizes[i] = base
    sizes[i] = base
    twinklePhases[i] = hash(i + 71) * Math.PI * 2
    twinkleSpeeds[i] = 0.9 + hash(i + 91) * 1.4
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    size: 0.42,
    sizeAttenuation: true,
    map: createStarTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xfff6e0,
    opacity: 0,
  })

  const stars = new THREE.Points(geometry, material)
  stars.name = 'student-space-stars'
  stars.frustumCulled = false
  stars.renderOrder = 999
  stars.userData.starsMotion = {
    material,
    twinklePhases,
    twinkleSpeeds,
    baseSizes,
    geometry,
    opacity: 0,
  } satisfies StarsMotion
  return stars
}

export function tickStarsEffect(
  root: THREE.Object3D,
  elapsed: number,
  controls?: WorldEnvironmentControls,
) {
  const motion = root.userData.starsMotion as StarsMotion | undefined
  if (!motion) return
  const target = Math.max(
    worldNightFactorForControls(elapsed, controls),
    worldTwilightFactor(elapsed) * 0.4,
  )
  motion.opacity += (target - motion.opacity) * 0.06
  motion.material.opacity = motion.opacity
  if (motion.opacity > 0.001) {
    const twinkle = 0.85 + Math.sin(elapsed * 0.6 + (motion.twinklePhases[0] ?? 0)) * 0.05
    motion.material.size = 0.42 * twinkle
  }
}

function createStarTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 248, 220, 1)')
  gradient.addColorStop(0.4, 'rgba(255, 240, 195, 0.55)')
  gradient.addColorStop(1, 'rgba(255, 240, 195, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
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
