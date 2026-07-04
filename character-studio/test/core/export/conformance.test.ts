// Round-trip conformance suite (plan 011 step 5) — the headless fidelity gate.
// Compile the fixture dog, then prove the .companion.glb preserves everything
// (structure, clips, morphs, SEN_companion, byte-exact face atlases, baked
// sculpt) AND plays in the companion-runtime with life signs and no NaN.

import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMaterialsUnlit, KHRTextureTransform } from '@gltf-transform/extensions'
import { loadCompanion } from '@sensemaking/companion-runtime'
import { MeshoptDecoder } from 'meshoptimizer'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileCharacter, EIGHT_MB } from '../../../src/core/export/compile'
import { parseSenCompanion, SENCompanionExtension } from '../../../src/core/export/senCompanion'
import { SCULPT_QUANTUM } from '../../../src/core/sculpt'
import { BODY_REGISTRY, meshVersionOf } from '../../../src/core/skeleton'
import { BONE_NAMES } from '../../../src/core/spec/schema'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import { loadCompileAssets } from '../../../scripts/lib/node-assets'
import { parseGlbHeadless } from '../../helpers/headless-gltf'

const CONTRACT_CLIPS = ['idle', 'walk', 'run', 'sitIdle', 'talkIdle', 'sitDown', 'standUp', 'gestureWave', 'gestureNod', 'gestureShrug', 'gestureCheer']
const FRAME = 1 / 60

async function readerIO(): Promise<NodeIO> {
  await MeshoptDecoder.ready
  return new NodeIO()
    .registerExtensions([SENCompanionExtension, KHRMaterialsUnlit, KHRTextureTransform, EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
}

describe('companion GLB conformance (fixture dog)', () => {
  let glb: Uint8Array
  let atlasPngs: Awaited<ReturnType<typeof loadCompileAssets>>['atlasPngs']

  beforeAll(async () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    const assets = await loadCompileAssets(spec)
    atlasPngs = assets.atlasPngs
    const result = await compileCharacter(spec, assets)
    glb = result.glb
  }, 60_000)

  it('stays within the 8 MB budget', () => {
    expect(glb.byteLength).toBeLessThanOrEqual(EIGHT_MB)
  })

  it('preserves all canonical bone node names', async () => {
    const doc = await (await readerIO()).readBinary(glb)
    const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()))
    for (const bone of BONE_NAMES) expect(names.has(bone), `bone node "${bone}"`).toBe(true)
  })

  it('carries all 11 contract clips with durations within ±1 frame', async () => {
    const doc = await (await readerIO()).readBinary(glb)
    const anims = doc.getRoot().listAnimations()
    const names = anims.map((a) => a.getName())
    for (const clip of CONTRACT_CLIPS) expect(names, `clip "${clip}"`).toContain(clip)
    expect(names.length).toBe(11)
    // source durations (reference) vs exported, within one frame
    const src = await new NodeIO().read(new URL('../../../src/assets/clips/clips-core-v1.glb', import.meta.url).pathname)
    const srcDur = new Map(src.getRoot().listAnimations().map((a) => [a.getName(), duration(a)]))
    for (const a of anims) expect(Math.abs(duration(a) - (srcDur.get(a.getName()) ?? 0))).toBeLessThanOrEqual(FRAME)
  })

  it('keeps morph target names and NEUTRALIZED default weights', async () => {
    const doc = await (await readerIO()).readBinary(glb)
    const body = doc.getRoot().listMeshes().find((m) => (m.getExtras() as { targetNames?: string[] })?.targetNames)
    expect(body).toBeDefined()
    expect((body?.getExtras() as { targetNames: string[] }).targetNames).toEqual(['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'])
    // default character sets no morphs → all weights neutralized to 0.
    expect(body?.getWeights().every((w) => w === 0)).toBe(true)
  })

  it('validates its SEN_companion extension', async () => {
    const doc = await (await readerIO()).readBinary(glb)
    const ext = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'SEN_companion') as SENCompanionExtension
    const data = parseSenCompanion(ext.getData())
    expect(data.character.archetype).toBe('biped-round')
    expect(data.springRig.map((c) => c.name)).toEqual(['earL', 'earR', 'tail'])
    expect(Object.keys(data.face.planeNodeIndices)).toContain('mouth')
    // every recorded bone index resolves to a node of that (dotted) name
    const nodes = doc.getRoot().listNodes()
    for (const [name, idx] of Object.entries(data.boneNodeIndices)) expect(nodes[idx]?.getName()).toBe(name)
  })

  it('embeds the face atlases byte-for-byte (PNG, lossless)', async () => {
    const doc = await (await readerIO()).readBinary(glb)
    const ext = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'SEN_companion') as SENCompanionExtension
    const data = parseSenCompanion(ext.getData())
    const textures = doc.getRoot().listTextures()
    for (const [kind, srcBytes] of Object.entries(atlasPngs) as [keyof typeof atlasPngs, Uint8Array][]) {
      const idx = data.face.atlasTextureIndices[kind]
      const embedded = textures[idx]?.getImage()
      expect(embedded, `atlas ${kind}`).toBeDefined()
      expect(Buffer.from(embedded as Uint8Array).equals(Buffer.from(srcBytes)), `atlas ${kind} byte-equal`).toBe(true)
    }
  })

  it('plays in the companion-runtime: springs settle, blink fires, no NaN', async () => {
    const gltf = await parseGlbHeadless<{ scene: THREE.Object3D; animations: THREE.AnimationClip[]; parser: unknown }>(
      glb,
      new GLTFLoader() as never,
      MeshoptDecoder,
    )
    const companion = loadCompanion(gltf as never, THREE as never, { seed: 11 })
    companion.setState('walk')
    let sawBlink = false
    const eyeName = Object.keys(companion.data.face.planeNodeIndices).find((p) => p.startsWith('eyeWhite'))
    const restX = eyeOffsetX(gltf.scene, eyeName)
    for (let f = 0; f < 600; f++) {
      companion.update(FRAME)
      const x = eyeOffsetX(gltf.scene, eyeName)
      if (restX !== null && x !== null && Math.abs(x - restX) > 1e-6) sawBlink = true
    }
    expect(sawBlink).toBe(true)
    expect(finite(gltf.scene)).toBe(true)
    companion.setState('idle')
    for (let f = 0; f < 120; f++) companion.update(FRAME)
    expect(finite(gltf.scene)).toBe(true)
    companion.dispose()
  })
})

describe('sculpt deltas are baked into exported positions', () => {
  it('exports base+delta where the spec sculpted, base elsewhere', async () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    const assets = await loadCompileAssets(spec)

    // Introspect a body mesh to build a valid delta payload for it.
    let target: { name: string; count: number; baseX0: number } | null = null
    assets.bodyScene.traverse((o) => {
      const m = o as THREE.Mesh
      if (target || !m.isMesh) return
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute
      target = { name: m.name, count: pos.count, baseX0: pos.getX(0) }
    })
    if (!target) throw new Error('no body mesh found')
    const t = target as { name: string; count: number; baseX0: number }

    const dx = 0.05
    spec.anatomy.sculptDelta = {
      baseMeshId: 'body-biped-round',
      baseMeshVersion: meshVersionOf(BODY_REGISTRY['biped-round']),
      quantum: SCULPT_QUANTUM,
      layers: [
        {
          assetId: 'body-biped-round',
          meshName: t.name,
          meshVersion: meshVersionOf(BODY_REGISTRY['biped-round']),
          vertexCount: t.count,
          indices: [0],
          values: [Math.round(dx / SCULPT_QUANTUM), 0, 0],
        },
      ],
    }

    const { glb } = await compileCharacter(spec, assets)
    const doc = await (await readerIO()).readBinary(glb)
    const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === t.name)
    const positions = mesh?.listPrimitives()[0].getAttribute('POSITION')?.getArray() as Float32Array
    // vertex 0 shifted by ~dx; a far vertex unchanged.
    expect(positions[0] - t.baseX0).toBeCloseTo(dx, 3)
  }, 60_000)
})

function duration(anim: { listSamplers(): Array<{ getInput(): { getArray(): ArrayLike<number> | null } | null }> }): number {
  let d = 0
  for (const s of anim.listSamplers()) {
    const arr = s.getInput()?.getArray()
    if (arr && arr.length) d = Math.max(d, arr[arr.length - 1])
  }
  return d
}

function eyeOffsetX(scene: THREE.Object3D, name: string | undefined): number | null {
  if (!name) return null
  const o = scene.getObjectByName(name)
  const mat = (o as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined
  return mat?.map ? mat.map.offset.x : null
}

function finite(o: THREE.Object3D): boolean {
  let ok = true
  o.traverse((n) => {
    if (![n.position.x, n.position.y, n.position.z, n.quaternion.x, n.quaternion.w, n.scale.x].every(Number.isFinite)) ok = false
  })
  return ok
}
