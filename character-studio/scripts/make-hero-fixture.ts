// Hero demo sculpt (aesthetic polish pass) — replaces the rough plan-009
// gate sculpt ("broader jowls") with an authored, reproducible hero:
// "Mochi" the cheerful shiba, whose sculpt shows the delta system off the
// way AC/Pokopia sculpts read — soft mochi cheek pouches, a rounded
// forehead, and a chest ruff. Deterministic output; import it via the
// roster's Import… button or feed it to the export CLI.
//
//   pnpm tsx scripts/make-hero-fixture.ts    -> fixtures/hero-shiba.character.json
//
// The deltas are authored as smooth gaussian fields over the body GLB's rest
// positions (geometry-local space, exactly what the sculpt system persists),
// quantized to SCULPT_QUANTUM like any studio-saved sculpt.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SCULPT_QUANTUM } from '../src/core/sculpt'
import { archetypeHead, buildArchetypeSkeleton } from '../src/core/skeleton/archetypes'
import { restWorldPositions } from '../src/core/skeleton/canonical'
import { BODY_REGISTRY, meshVersionOf } from '../src/core/skeleton/partRegistry'
import { createDefaultCharacter } from '../src/core/spec/defaults'
import { serializeSpec } from '../src/core/spec/io'
import type { SculptDeltaLayerPayload } from '../src/core/spec/schema'

const ARCHETYPE = 'biped-round' as const

function loadScene(url: URL): Promise<THREE.Object3D> {
  const buf = readFileSync(fileURLToPath(url))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(ab, '', (gltf) => resolve(gltf.scene), reject)
  })
}

// --- the sculpt: smooth displacement fields over rest positions -------------

interface Field {
  /** displacement (meters, rest space) this field wants at a rest position */
  at(p: THREE.Vector3, out: THREE.Vector3): void
}

const skeleton = buildArchetypeSkeleton(ARCHETYPE)
const world = restWorldPositions(skeleton)
const head = archetypeHead(ARCHETYPE)
const headCenter = new THREE.Vector3(
  world.head[0] + head.center[0],
  world.head[1] + head.center[1],
  world.head[2] + head.center[2],
)
const r = head.radius
const chestY = world.chest[1]

/** Radial gaussian bulge on the head sphere around a surface anchor. */
function headBulge(azimuthDeg: number, lift: number, amp: number, sigma: number): Field {
  const az = (azimuthDeg * Math.PI) / 180
  const dir = new THREE.Vector3(Math.sin(az), lift, Math.cos(az)).normalize()
  const anchor = headCenter.clone().addScaledVector(dir, r)
  const radial = new THREE.Vector3()
  return {
    at(p, out) {
      const d = p.distanceTo(anchor)
      const w = Math.exp(-(d * d) / (2 * sigma * sigma))
      if (w < 1e-3) return
      radial.copy(p).sub(headCenter)
      if (radial.lengthSq() < 1e-9) return
      radial.normalize()
      out.addScaledVector(radial, amp * w)
    },
  }
}

/** Forward chest bulge (the shiba ruff), fading with x/y distance. */
function chestRuff(amp: number): Field {
  const yC = chestY + 0.015
  return {
    at(p, out) {
      if (p.z < 0.02) return // front of the torso only
      const dx = p.x / 0.085
      const dy = (p.y - yC) / 0.075
      const w = Math.exp(-(dx * dx + dy * dy))
      if (w < 1e-3) return
      out.z += amp * w
    },
  }
}

const FIELDS: Field[] = [
  // mochi cheek pouches — low, forward-lateral, softly radial
  headBulge(52, -0.34, 0.015, 0.32 * r),
  headBulge(-52, -0.34, 0.015, 0.32 * r),
  // rounded forehead — broad, very subtle
  headBulge(0, 0.72, 0.005, 0.55 * r),
  // chest ruff
  chestRuff(0.007),
]

// --- bake fields into sparse quantized layers --------------------------------

async function main() {
  const bodyUrl = new URL(`../src/assets/anatomy/body-${ARCHETYPE}.glb`, import.meta.url)
  const scene = await loadScene(bodyUrl)

  const layers: SculptDeltaLayerPayload[] = []
  const p = new THREE.Vector3()
  const d = new THREE.Vector3()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const indices: number[] = []
    const values: number[] = []
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      d.set(0, 0, 0)
      for (const field of FIELDS) field.at(p, d)
      const qx = Math.round(d.x / SCULPT_QUANTUM)
      const qy = Math.round(d.y / SCULPT_QUANTUM)
      const qz = Math.round(d.z / SCULPT_QUANTUM)
      if (qx === 0 && qy === 0 && qz === 0) continue
      indices.push(i)
      values.push(qx, qy, qz)
    }
    if (indices.length === 0) return
    layers.push({
      assetId: `body-${ARCHETYPE}`,
      meshName: mesh.name,
      meshVersion: meshVersionOf(BODY_REGISTRY[ARCHETYPE]),
      vertexCount: pos.count,
      indices,
      values,
    })
  })

  const spec = createDefaultCharacter(ARCHETYPE, 'cheerful')
  spec.meta.id = '00000000-0000-4000-8000-00000000e550' // stable id: the hero fixture
  spec.meta.name = 'Mochi (hero shiba)'
  spec.meta.createdAt = '2026-07-05T00:00:00.000Z'
  spec.meta.updatedAt = '2026-07-05T00:00:00.000Z'
  spec.anatomy.parts.muzzle = { partId: 'boxy-dog', morphs: {} }
  spec.anatomy.parts.tail = { partId: 'curl-shiba', morphs: {} }
  spec.anatomy.bodyMorphs = { bellyRound: 0.25 }
  spec.palette = {
    primary: '#e08a3c',
    secondary: '#f2b877',
    belly: '#fdf3e2',
    accentA: '#7a4a26',
    accentB: '#33241a',
    padsNose: '#4a2f1f',
  }
  spec.anatomy.sculptDelta = {
    baseMeshId: `body-${ARCHETYPE}`,
    baseMeshVersion: meshVersionOf(BODY_REGISTRY[ARCHETYPE]),
    quantum: SCULPT_QUANTUM,
    layers,
  }

  const dir = fileURLToPath(new URL('../fixtures/', import.meta.url))
  mkdirSync(dir, { recursive: true })
  const out = `${dir}hero-shiba.character.json`
  writeFileSync(out, serializeSpec(spec))
  const touched = layers.reduce((n, l) => n + l.indices.length, 0)
  console.log(`wrote ${out} (${layers.length} layers, ${touched} sculpted verts)`)
}

main()
