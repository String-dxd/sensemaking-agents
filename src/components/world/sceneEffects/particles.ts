import * as THREE from 'three'
import { WORLD_STYLE } from '../worldStyle'

interface ParticleMotion {
  anchors: Float32Array
  phaseA: Float32Array
  phaseB: Float32Array
  speed: Float32Array
  material: THREE.PointsMaterial
  motionScale: number
}

export function createAmbientParticles(motionScale: number): THREE.Points {
  const count = WORLD_STYLE.effects.maxParticles
  const positions = new Float32Array(count * 3)
  const anchors = new Float32Array(count * 3)
  const phaseA = new Float32Array(count)
  const phaseB = new Float32Array(count)
  const speed = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const seed = hash(i + 11)
    const angle = seed * Math.PI * 2
    const radius = Math.sqrt(hash(i + 31)) * 4.2
    const x = Math.cos(angle) * radius
    const y = 0.55 + hash(i + 53) * 2.1
    const z = Math.sin(angle) * radius
    anchors.set([x, y, z], i * 3)
    positions.set([x, y, z], i * 3)
    phaseA[i] = hash(i + 71) * Math.PI * 2
    phaseB[i] = hash(i + 97) * Math.PI * 2
    speed[i] = 0.045 + hash(i + 113) * 0.06
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    map: createParticleTexture(),
    size: 0.105,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xfff4d8,
    opacity: 0.48,
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'student-space-ambient-motes'
  points.frustumCulled = false
  points.renderOrder = 6
  points.userData.particleMotion = { anchors, phaseA, phaseB, speed, material, motionScale }
  return points
}

export function tickAmbientParticles(root: THREE.Object3D, elapsed: number) {
  root.traverse((object) => {
    const motion = object.userData.particleMotion as ParticleMotion | undefined
    if (!motion) return
    const positionAttribute = (object as THREE.Points).geometry.attributes.position
    if (!positionAttribute) return
    const positions = positionAttribute.array as Float32Array
    const drift = 0.48 * motion.motionScale
    const bob = 0.14 * motion.motionScale
    for (let i = 0; i < motion.speed.length; i += 1) {
      const stride = i * 3
      const speed = motion.speed[i] ?? 0.05
      const phaseA = motion.phaseA[i] ?? 0
      const phaseB = motion.phaseB[i] ?? 0
      positions[stride] = (motion.anchors[stride] ?? 0) + Math.cos(elapsed * speed + phaseA) * drift
      positions[stride + 1] =
        (motion.anchors[stride + 1] ?? 0) + Math.sin(elapsed * speed * 0.7 + phaseB) * bob
      positions[stride + 2] =
        (motion.anchors[stride + 2] ?? 0) + Math.sin(elapsed * speed * 0.9 + phaseA) * drift * 0.7
    }
    positionAttribute.needsUpdate = true
    motion.material.opacity = 0.38 + Math.sin(elapsed * 0.08) * 0.08
  })
}

function createParticleTexture(): THREE.CanvasTexture {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,252,235,0.95)')
  gradient.addColorStop(0.5, 'rgba(255,246,215,0.35)')
  gradient.addColorStop(1, 'rgba(255,246,215,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function hash(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 2654435761)
  h ^= h >>> 16
  return ((h >>> 0) % 10000) / 10000
}
