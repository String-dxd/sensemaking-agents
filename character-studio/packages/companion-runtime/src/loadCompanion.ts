// loadCompanion (plan 011 step 4) — the product-app entry point. Takes a
// host-parsed GLTF (the host owns the GLTFLoader + meshopt/KTX2 decoders — see
// docs/companion-handoff.md) plus the host's injected `three` namespace, and
// returns a live companion with a play API.
//
// FRAME ORDER (plan 000 §2.2, never reorder): animation → physics(springs) →
// procedural(idle/face/talk). `update(dt)` runs all layers in that order.
//
// Bone resolution: the GLB stores node INDICES in SEN_companion (three's
// GLTFLoader strips dots from names — indices are the stable handle). We map
// index → Object3D via `parser.associations`, then feed the solver the
// resolved objects' CURRENT (sanitized) names so getObjectByName matches AND
// the animation mixer's sanitized track names keep binding.

import { createFaceControl, type FaceControl } from './faceControl'
import { mulberry32 } from './noise'
import { createIdleLayer, type IdleLayer } from './proceduralIdle'
import { createClipMachine, type ClipMachine, GESTURE_NAMES, type GestureName, type MachineState } from './clipStateMachine'
import { type ColliderGroup, readSenCompanion, type SenCompanionData, type SpringChainDef } from './senCompanion'
import { createFixedStepper, createSpringRig, type SpringRig } from './springSolver'
import { type AmplitudeSource, createTalkDriver, makeSpeechSynthAmplitude, type TalkDriver } from './talkDriver'
import type { LoadedGLTF, MaterialLike, Object3DLike, ThreeNamespace } from './three-types'

type FacePart = 'eyeWhiteL' | 'eyeWhiteR' | 'pupilL' | 'pupilR' | 'browL' | 'browR' | 'mouth'

export interface LoadCompanionOptions {
  /** Seeded RNG (no Math.random in the runtime). Defaults to a fixed seed;
   * pass `Math.random` or a per-character seed for blink/gaze variety. */
  rng?: () => number
  seed?: number
}

/** A host material factory for the optional studio-grade toon rebuild. */
export type ToonMaterialFactory = (
  region: string,
  meta: SenCompanionData['materialsMeta'][string],
  palette: SenCompanionData['palette'],
  fallback: MaterialLike,
) => MaterialLike

export interface Companion {
  /** The SEN_companion data (provenance, palette, clip manifest, …). */
  readonly data: SenCompanionData
  /** Advance every layer by dt seconds (animation → physics → procedural). */
  update(dt: number): void
  setState(state: MachineState): void
  getState(): MachineState
  playGesture(name: GestureName): boolean
  setExpression(name: string): void
  /** Start talking from an amplitude source (defaults to synthetic speech). */
  say(source?: AmplitudeSource): void
  stopTalking(): void
  setGaze(x: number, y: number): void
  /** Host-optional: rebuild studio-grade toon materials from materialsMeta.
   * Default keeps the GLB's PBR fallback (works on three 0.149). */
  applyToonMaterials(factory: ToonMaterialFactory): void
  dispose(): void
}

function buildNodeIndexMap(gltf: LoadedGLTF): Map<number, Object3DLike> {
  const map = new Map<number, Object3DLike>()
  const assoc = gltf.parser?.associations
  if (assoc) {
    for (const [obj, def] of assoc.entries()) {
      const d = def as { nodes?: number; type?: string; index?: number } | undefined
      const idx = d?.nodes ?? (d?.type === 'nodes' ? d.index : undefined)
      if (typeof idx === 'number' && obj) map.set(idx, obj as Object3DLike)
    }
  }
  return map
}

export function loadCompanion(gltf: LoadedGLTF, THREE: ThreeNamespace, options: LoadCompanionOptions = {}): Companion {
  const data = readSenCompanion(gltf)
  const scene = gltf.scene
  const rng = options.rng ?? mulberry32(options.seed ?? 0x9e3779b9)

  const indexMap = buildNodeIndexMap(gltf)
  const objForBone = (name: string): Object3DLike | undefined => {
    const idx = data.boneNodeIndices[name]
    if (idx !== undefined) {
      const o = indexMap.get(idx)
      if (o) return o
    }
    // Fallback: three sanitizes dotted names (earL.1 → earL1).
    return scene.getObjectByName(name) ?? scene.getObjectByName(name.replace(/[.]/g, ''))
  }
  /** Sanitized (three-current) name of a bone, for solver getObjectByName. */
  const boneName = (name: string): string => objForBone(name)?.name ?? name

  // --- springs (physics) ----------------------------------------------------
  const remappedChains: SpringChainDef[] = data.springRig.map((chain) => ({
    name: chain.name,
    boneNames: chain.boneNames.map(boneName),
    joints: chain.joints.map((j) => ({ ...j, gravityDir: [...j.gravityDir] as [number, number, number] })),
    colliderGroupRefs: [...chain.colliderGroupRefs],
  }))
  const remappedColliderGroups: ColliderGroup[] = data.colliderGroups.map((g) => ({
    name: g.name,
    colliders: g.colliders.map((c) => ({ ...c, boneName: boneName(c.boneName), offset: [...c.offset] as [number, number, number] })),
  }))
  const springRig: SpringRig | null = remappedChains.length
    ? createSpringRig(THREE, scene, remappedChains, remappedColliderGroups)
    : null
  const springStepper = springRig ? createFixedStepper((h) => springRig.step(h)) : null

  // --- idle (procedural) — breath only, so it never fights the clip pose ----
  const chest = objForBone('chest')
  const head = objForBone('head')
  const hips = objForBone('hips')
  let idle: IdleLayer | null = null
  if (chest && head && hips) {
    idle = createIdleLayer({ chest, head, hips }, rng)
    idle.setChannels({ breath: true, headBob: false, sway: false, microTurn: false })
  }

  // --- clips (animation) — already hips-rebased at compile; no runtime rebase.
  const mixer = new THREE.AnimationMixer(scene)
  const clipMachine: ClipMachine | null = gltf.animations.length
    ? createClipMachine(THREE, mixer, gltf.animations)
    : null

  // --- face (procedural) ----------------------------------------------------
  const planes: Partial<Record<FacePart, Object3DLike>> = {}
  for (const [part, idx] of Object.entries(data.face.planeNodeIndices)) {
    const o = indexMap.get(idx)
    if (o) planes[part as FacePart] = o
  }
  const face: FaceControl = createFaceControl(planes, data.face, rng)
  face.setExpression(data.face.defaultExpression)

  // --- talk (procedural) ----------------------------------------------------
  const talk: TalkDriver = createTalkDriver({ setMouthOverride: (cell) => face.setMouthOverride(cell) }, rng)

  return {
    data,
    update(dt: number): void {
      clipMachine?.update(dt) // animation
      springStepper?.advance(dt) // physics
      idle?.update(dt) // procedural
      face.update(dt)
      talk.update(dt)
    },
    setState(state: MachineState): void {
      clipMachine?.setState(state)
    },
    getState: () => clipMachine?.getState() ?? 'idle',
    playGesture: (name: GestureName) =>
      (GESTURE_NAMES as readonly string[]).includes(name) ? (clipMachine?.playGesture(name) ?? false) : false,
    setExpression: (name: string) => face.setExpression(name),
    say(source?: AmplitudeSource): void {
      talk.start(source ?? makeSpeechSynthAmplitude(rng))
    },
    stopTalking: () => talk.stop(),
    setGaze: (x: number, y: number) => face.setGaze(x, y),
    applyToonMaterials(factory: ToonMaterialFactory): void {
      scene.traverse((o) => {
        const mat = o.material
        if (!mat) return
        const single = Array.isArray(mat) ? mat[0] : mat
        const region = single.userData?.region as string | undefined ?? nameToRegion(single)
        if (!region) return
        const meta = data.materialsMeta[region]
        if (!meta) return
        const rebuilt = factory(region, meta, data.palette, single)
        if (Array.isArray(o.material)) o.material[0] = rebuilt
        else o.material = rebuilt
      })
    },
    dispose(): void {
      springRig?.dispose()
      idle?.reset()
      clipMachine?.dispose()
      face.dispose()
      talk.stop()
    },
  }
}

/** Region from the compiler's `region-<name>` material name. */
function nameToRegion(mat: MaterialLike): string | undefined {
  const name = (mat as { name?: string }).name
  return name?.startsWith('region-') ? name.slice('region-'.length) : undefined
}
