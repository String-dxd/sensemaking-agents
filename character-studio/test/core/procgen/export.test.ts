// Procedural export gate (plan 013 step 5.3). Compile a character whose body +
// anatomy parts come from the procedural builders (the plan-013 export path,
// as companionExport.ts / RosterView now does) and prove the `.companion.glb`
// is within budget (overBudget:false) and loads + animates in the
// companion-runtime with no NaN.

import { loadCompanion } from '@sensemaking/companion-runtime'
import { MeshoptDecoder } from 'meshoptimizer'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileCharacter } from '../../../src/core/export/compile'
import { BODY_REGISTRY, getPart } from '../../../src/core/skeleton/partRegistry'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import type { PartSlot } from '../../../src/core/spec/schema'
import { loadCompileAssets } from '../../../scripts/lib/node-assets'
import { parseGlbHeadless } from '../../helpers/headless-gltf'

describe('procedural companion export', () => {
  let glb: Uint8Array
  let overBudget = true

  beforeAll(async () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    // Non-procedural assets (clips/atlas/masks) from the node loader; body +
    // parts overridden with procedural builds (def.source.build()).
    const assets = await loadCompileAssets(spec)
    const body = BODY_REGISTRY[spec.meta.archetype]
    if (body.source?.kind === 'procedural') assets.bodyScene = body.source.build()
    for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
      if (!entry) continue
      const def = getPart(entry.partId)
      if (def?.source?.kind === 'procedural') assets.partScenes[slot as PartSlot] = def.source.build()
    }
    const result = await compileCharacter(spec, assets)
    glb = result.glb
    overBudget = result.stats.overBudget
  }, 60_000)

  it('compiles within the 8 MB budget (overBudget:false)', () => {
    expect(overBudget).toBe(false)
    expect(glb.byteLength).toBeGreaterThan(0)
  })

  it('loads in the companion-runtime and animates without NaN', async () => {
    const gltf = await parseGlbHeadless<{ scene: THREE.Object3D; animations: THREE.AnimationClip[]; parser: unknown }>(
      glb,
      new GLTFLoader() as never,
      MeshoptDecoder,
    )
    const companion = loadCompanion(gltf as never, THREE as never, { seed: 7 })
    companion.setState('walk')
    for (let f = 0; f < 120; f++) companion.update(1 / 60)
    let finite = true
    gltf.scene.traverse((o) => {
      const p = (o as THREE.Object3D).position
      if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) finite = false
    })
    expect(finite).toBe(true)
  }, 60_000)

  it('preserves paletteChannels as VEC4 COLOR_0 only on source meshes that carry them', async () => {
    const gltf = await parseGlbHeadless<{ scene: THREE.Object3D }>(
      glb,
      new GLTFLoader() as never,
      MeshoptDecoder,
    )
    let coloredMeshes = 0
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const color = mesh.geometry.getAttribute('color')
      if (color) {
        coloredMeshes++
        expect(color.itemSize, mesh.name).toBe(4)
      }
    })
    expect(coloredMeshes).toBeGreaterThan(0)
    for (const faceName of ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR', 'browL', 'browR', 'mouth']) {
      const face = gltf.scene.getObjectByName(faceName) as THREE.Mesh | undefined
      expect(face?.geometry.hasAttribute('color'), faceName).toBe(false)
    }
  }, 60_000)
})
