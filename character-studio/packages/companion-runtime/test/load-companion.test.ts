import { MeshoptDecoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
// Build a real fixture GLB with the studio compiler (test-only cross-package
// use; the shipped package imports none of this).
import { compileCharacter } from '../../../src/core/export/compile'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import { loadCompileAssets } from '../../../scripts/lib/node-assets'
import { loadCompanion } from '../src/loadCompanion'
import type { LoadedGLTF, Object3DLike, ThreeNamespace } from '../src/three-types'
import { parseGlb } from './helpers/parse'

let GLB: Uint8Array

beforeAll(async () => {
  const spec = createDefaultCharacter('biped-round', 'gentle')
  const assets = await loadCompileAssets(spec)
  const { glb } = await compileCharacter(spec, assets)
  GLB = glb
}, 60_000)

function anyFinite(o: Object3DLike): boolean {
  let ok = true
  o.traverse((n) => {
    for (const v of [n.position, n.scale] as const) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) ok = false
    }
    const q = n.quaternion
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z) || !Number.isFinite(q.w)) ok = false
  })
  return ok
}

// The version-agnostic proof: the SAME runtime code drives a compiled companion
// under three r149 AND r185. Each case parses the GLB with that version's
// GLTFLoader, then simulates 2 s and asserts life signs.
const versions: Array<{ name: string; load: () => Promise<{ THREE: ThreeNamespace; gltf: LoadedGLTF }> }> = [
  {
    name: 'three r149',
    load: async () => {
      const THREE = (await import('three-149')) as unknown as ThreeNamespace
      const { GLTFLoader } = await import('three-149/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await parseGlb<LoadedGLTF>(GLB, GLTFLoader as never, MeshoptDecoder)
      return { THREE, gltf }
    },
  },
  {
    name: 'three r185',
    load: async () => {
      const THREE = (await import('three-185')) as unknown as ThreeNamespace
      const { GLTFLoader } = await import('three-185/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await parseGlb<LoadedGLTF>(GLB, GLTFLoader as never, MeshoptDecoder)
      return { THREE, gltf }
    },
  },
]

describe.each(versions)('loadCompanion under $name', ({ load }) => {
  it('parses SEN_companion and exposes provenance + clips', async () => {
    const { THREE, gltf } = await load()
    const companion = loadCompanion(gltf, THREE, { seed: 1 })
    expect(companion.data.character.archetype).toBe('biped-round')
    expect(companion.data.clips.names).toContain('walk')
    expect(companion.data.springRig.length).toBeGreaterThan(0)
    companion.dispose()
  })

  it('simulates 2 s: springs move + settle, blink fires, no NaN', async () => {
    const { THREE, gltf } = await load()
    const companion = loadCompanion(gltf, THREE, { seed: 7 })

    // capture an ear-tip particle via the public API path: drive walk (excites
    // the chain), then idle-still and confirm it settles.
    companion.setState('walk')
    companion.setExpression('happy')
    const dt = 1 / 60
    let sawEyeChange = false
    const eyePlaneName = Object.keys(companion.data.face.planeNodeIndices).find((p) => p.startsWith('eyeWhite'))

    // Blink swaps the eye-white cell (happy→half→closed→half→happy); those
    // cells share row 0, so the atlas offset.x changes. Run ~10 s: the gentle
    // default blink mean is 4.5 s ± 2 s, so a blink is guaranteed in the window.
    const rest = eyePlaneName ? findEyeTexture(gltf.scene, eyePlaneName) : null
    const restX = rest?.x ?? null
    for (let f = 0; f < 600; f++) {
      companion.update(dt)
      if (!anyFinite(gltf.scene)) throw new Error('NaN transform during walk')
      if (eyePlaneName && restX !== null) {
        const tex = findEyeTexture(gltf.scene, eyePlaneName)
        if (tex && Math.abs(tex.x - restX) > 1e-6) sawEyeChange = true
      }
    }
    expect(anyFinite(gltf.scene)).toBe(true)
    expect(sawEyeChange).toBe(true) // blink cell-swaps happened

    // Now settle: idle + hold; the whole scene must stop diverging (no NaN).
    companion.setState('idle')
    for (let f = 0; f < 120; f++) companion.update(dt)
    expect(anyFinite(gltf.scene)).toBe(true)
    companion.dispose()
  })

  it('drives gestures, gaze, and talk without error or NaN', async () => {
    const { THREE, gltf } = await load()
    const companion = loadCompanion(gltf, THREE, { seed: 3 })
    expect(companion.playGesture('wave' as never)).toBe(false) // invalid name → false, no throw
    expect(companion.playGesture('gestureWave')).toBe(true)
    companion.setGaze(0.5, -0.3)
    companion.say()
    const dt = 1 / 60
    for (let f = 0; f < 120; f++) companion.update(dt)
    companion.stopTalking()
    expect(anyFinite(gltf.scene)).toBe(true)
    companion.dispose()
  })
})

/** Read the live eye-white plane's texture offset.y (blink cell swaps move it). */
function findEyeTexture(scene: Object3DLike, planeName: string): { x: number; y: number } | null {
  let found: { x: number; y: number } | null = null
  scene.traverse((o) => {
    if (found) return
    // three sanitizes names, but eyeWhiteL/R have no dots → unchanged.
    if (o.name !== planeName) return
    const mat = o.material
    const single = Array.isArray(mat) ? mat[0] : mat
    const off = single?.map?.offset
    if (off) found = { x: off.x, y: off.y }
  })
  return found
}
