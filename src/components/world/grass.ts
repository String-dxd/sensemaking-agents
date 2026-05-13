import * as THREE from 'three'
import { islandHeightAt, islandNormalAt, isOnPlateau, radiusAtTheta } from './island'

const BLADE_COUNT = 260
const FIELD_SIZE = 11.5

export function createGrass(): THREE.Mesh {
  const geometry = buildGrassGeometry()
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindGust: { value: 0.75 },
      uColorRoot: { value: new THREE.Color(0x327433) },
      uColorTip: { value: new THREE.Color(0x7caf48) },
    },
    vertexShader: `
      attribute vec3 aRoot;
      attribute float aHeightFactor;
      attribute float aPhase;
      attribute vec2 aSway;
      varying float vHeightFactor;
      uniform float uTime;
      uniform float uWindGust;
      void main() {
        vec3 p = position;
        float wave = sin(uTime * 1.25 + aRoot.x * 1.7 + aRoot.z * 2.1 + aPhase);
        float cross = cos(uTime * 0.82 + aRoot.z * 1.2 + aPhase * 0.7);
        float sway = (wave * 0.055 + cross * 0.025) * uWindGust * aHeightFactor;
        p.xz += aSway * sway;
        vHeightFactor = aHeightFactor;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying float vHeightFactor;
      uniform vec3 uColorRoot;
      uniform vec3 uColorTip;
      void main() {
        vec3 col = mix(uColorRoot, uColorTip, smoothstep(0.0, 1.0, vHeightFactor));
        gl_FragColor = vec4(col, 0.92);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'student-space-grass'
  mesh.frustumCulled = false
  mesh.userData.worldAnimatedMaterial = material
  return mesh
}

function buildGrassGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const roots: number[] = []
  const heightFactors: number[] = []
  const phases: number[] = []
  const sways: number[] = []
  const rng = mulberry32(72391)

  let placed = 0
  let attempts = 0
  while (placed < BLADE_COUNT && attempts < BLADE_COUNT * 60) {
    attempts += 1
    const x = (rng() - 0.5) * FIELD_SIZE
    const z = (rng() - 0.5) * FIELD_SIZE
    if (!isOnPlateau(x, z)) continue

    const theta = Math.atan2(z, x)
    const plateauRadius = radiusAtTheta(theta)
    const rimDepth = plateauRadius - Math.hypot(x, z)
    if (rimDepth < plateauRadius * 0.22) continue

    const patchStrength = grassPatchStrength(x, z)
    if (patchStrength < 0.72) continue
    const tuftChance = ((patchStrength - 0.72) / 0.28) ** 2.4 * 0.28
    if (rng() > tuftChance) continue

    const [, ny] = islandNormalAt(x, z)
    if (ny < 0.72) continue

    const rootY = islandHeightAt(x, z) + 0.018
    const angle = rng() * Math.PI * 2
    const spike = rng() < 0.68
    const width = spike ? 0.01 + rng() * 0.012 : 0.009 + rng() * 0.012
    const height = spike ? 0.18 + rng() * 0.22 : 0.055 + rng() * 0.085
    const dx = Math.cos(angle) * width
    const dz = Math.sin(angle) * width
    const lean = 0.035 + rng() * 0.045
    const swayX = Math.cos(angle + Math.PI / 2)
    const swayZ = Math.sin(angle + Math.PI / 2)
    const phase = rng() * Math.PI * 2

    const verts = [
      [x - dx, rootY, z - dz, 0],
      [x + swayX * lean, rootY + height, z + swayZ * lean, 1],
      [x + dx, rootY, z + dz, 0],
    ] as const

    for (const [vx, vy, vz, heightFactor] of verts) {
      positions.push(vx, vy, vz)
      roots.push(x, rootY, z)
      heightFactors.push(heightFactor)
      phases.push(phase)
      sways.push(swayX, swayZ)
    }

    placed += 1
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aRoot', new THREE.Float32BufferAttribute(roots, 3))
  geometry.setAttribute('aHeightFactor', new THREE.Float32BufferAttribute(heightFactors, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 2))
  return geometry
}

function grassPatchStrength(x: number, z: number): number {
  const broad =
    (Math.sin(x * 0.92 + 1.7) + Math.cos(z * 1.08 - 0.4) + Math.sin((x + z) * 0.68 + 2.1)) / 3
  const pocket = smoothstep(0.18, 0.72, broad * 0.5 + 0.5)
  const brokenEdge = Math.sin(x * 3.7 + Math.cos(z * 1.9) * 1.6) * 0.5 + 0.5
  return pocket * (0.36 + brokenEdge * 0.64)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
