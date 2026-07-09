// CharacterRoot (plan 006, step 4) — replaces PlaceholderBody in the Stage.
//
// Loads the archetype body + equipped part GLBs (drei useGLTF, cached),
// runs core assembly (assembleCharacter — pure three), attaches the drawn
// face to the body material (FaceRig → setFaceMap, advisor plan 002), and
// registers spring rig + idle layer + body movers in the frame loop. Re-assembles reactively when the spec's
// STRUCTURE changes (archetype / part ids); morphs, boneScales, palette and
// material params flow through cheap live-update effects instead.
//
// Memory contract: geometries/textures live in the loader caches and are
// shared by every assembly — reassembly allocates only materials, which
// dispose() releases. `renderer.info.memory` is logged per assembly in dev
// so leaks are visible (plan 006 done criterion).
//
// Wardrobe (plan 008): worn-item GLBs load alongside body/parts, so any
// structural wardrobe change (item ids / earMode) swaps the gltf list and
// triggers a clean reassembly; the dressing pass then mutates the fresh
// assembly in an effect whose cleanup undresses it. The spring rig is built
// from the DRESSED chain set (item chains ride grafted bones), which is why
// the motion effect waits for the dressed state — a rig must never outlive
// the grafted bones it solves.

import { useGLTF, useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  addOutline,
  applyMaterialAssign,
  applyPalette,
  applyTextureId,
  defaultTextureResolver,
  getBodyMask,
  getOutline,
  removeOutline,
  resolvesAuthored,
  type ResolvedTextures,
  type TextureResolver,
} from '../../core/materials'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { buildBodyScene } from '../../core/procgen/buildBody'
import { mulberry32 } from '../../core/motion/noise'
import { createIdleLayer } from '../../core/motion/proceduralIdle'
import { createFixedStepper, createSpringRig } from '../../core/motion/springSolver'
import {
  collectSculptTargets,
  SculptDeltaMismatchError,
  type SculptTargetSource,
  syncTargetsToPayload,
} from '../../core/sculpt'
import { ARCHETYPES_DEF } from '../../core/skeleton/archetypes'
import { assembleCharacter } from '../../core/skeleton/assemble'
import { BODY_REGISTRY, getPart, meshVersionOf, PART_REGISTRY } from '../../core/skeleton/partRegistry'
import type { PartSlot, Region } from '../../core/spec/schema'
import {
  applyWardrobe,
  type DressedCharacter,
  mergeItemPalette,
  resolveWornItems,
  WARDROBE_REGISTRY,
  type WardrobeAssets,
} from '../../core/wardrobe'
import { useCharacterStore } from '../state/characterStore'
import { createSculptSession, finalizeSculptVisuals, useSculptStore } from '../state/sculptStore'
import { FALLBACK_ASSIGN, useMotionStudio, useToonStudio } from '../state/studioStores'
import { usePlayStore } from '../play/playStore'
import { createBodyMover } from './bodyMover'
import { BIRD_PLACEMENT } from '../../core/face/faceComposite'
import { FaceRig } from './FaceRig'

const IDLE_SEED = 20260702

/** Palette masks are data on glTF-convention UVs: no color space, no flipY. */
function configureMask(texture: THREE.Texture): void {
  if (texture.flipY || texture.colorSpace !== THREE.NoColorSpace) {
    texture.flipY = false
    texture.colorSpace = THREE.NoColorSpace
    texture.needsUpdate = true
  }
}

/**
 * Wardrobe items are still GLB (until plan 016) — `useGLTF` can't take an empty
 * array, so it lives in this inner component mounted only when items are worn.
 * It reports the loaded scenes up into CharacterRoot state (the plan-013 seam:
 * body/parts are procedural + synchronous; only item scenes arrive async).
 */
function WardrobeItemLoader({
  urls,
  itemIds,
  onScenes,
}: {
  urls: string[]
  itemIds: string[]
  onScenes: (scenes: Record<string, THREE.Object3D>) => void
}) {
  const loaded = useGLTF(urls)
  useEffect(() => {
    const scenes: Record<string, THREE.Object3D> = {}
    loaded.forEach((gltf, i) => {
      scenes[itemIds[i]] = gltf.scene
    })
    onScenes(scenes)
  }, [loaded, itemIds, onScenes])
  return null
}

export function CharacterRoot() {
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
  const speciesId = useCharacterStore((s) => s.spec.meta.species)
  const parts = useCharacterStore((s) => s.spec.anatomy.parts)
  const bodyMorphs = useCharacterStore((s) => s.spec.anatomy.bodyMorphs)
  const materialsSpec = useCharacterStore((s) => s.spec.materials)
  const palette = useCharacterStore((s) => s.spec.palette)
  const wardrobe = useCharacterStore((s) => s.spec.wardrobe)
  const terminatorWarmth = useToonStudio((s) => s.terminatorWarmth)
  const gl = useThree((s) => s.gl)

  // --- structural key: reassemble only when archetype or part ids change ----
  const partIdKey = Object.entries(parts)
    .map(([slot, entry]) => `${slot}:${entry?.partId ?? ''}`)
    .sort()
    .join('|')

  const equipped = useMemo(
    () =>
      Object.entries(parts)
        .map(([slot, entry]) => ({ slot: slot as PartSlot, def: entry ? getPart(entry.partId) : null }))
        .filter((e): e is { slot: PartSlot; def: NonNullable<ReturnType<typeof getPart>> } => e.def !== null && e.def.url !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partIdKey],
  )

  // --- structural key: redress (via reassembly) when worn ids / earModes change
  const wardrobeKey = wardrobe.map((w) => `${w.slot}:${w.itemId}:${w.earMode ?? ''}`).join('|')
  const wornResolved = useMemo(
    () => resolveWornItems(useCharacterStore.getState().spec.wardrobe, WARDROBE_REGISTRY).items,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wardrobeKey],
  )

  const body = BODY_REGISTRY[archetype]

  // Body + anatomy parts are procedural (plan 013): memoized `def.source.build()`
  // per structural key (archetype / part-id). Wardrobe items stay GLB until
  // plan 016 and load through the inner <WardrobeItemLoader> below.
  const bodyScene = useMemo(() => {
    if (body.source?.kind !== 'procedural') throw new Error(`CharacterRoot: body "${archetype}" has no procedural source`)
    return buildBodyScene(archetype, speciesId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype, speciesId])
  const partScenes = useMemo(() => {
    const scenes: Partial<Record<PartSlot, THREE.Object3D>> = {}
    for (const { slot, def } of equipped) {
      if (def.source?.kind === 'procedural') scenes[slot] = def.source.build()
    }
    return scenes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partIdKey])
  const itemUrls = useMemo(() => wornResolved.map((i) => i.def.url), [wornResolved])
  const itemIds = useMemo(() => wornResolved.map((i) => i.itemId), [wornResolved])
  const [itemScenes, setItemScenes] = useState<Record<string, THREE.Object3D>>({})

  const bodyTextureId = materialsSpec.body?.textureId
  // Plan 019: the body mask is a UV-aligned DataTexture rasterized from the
  // body's per-vertex channels (plain 'authored') or a species pattern field —
  // NOT a baked PNG. Parts keep the per-vertex channel path (their baked PNGs
  // were unwrapped for the retired GLBs), so no part masks are sourced here.
  const bodyMask = useMemo(
    () => getBodyMask(bodyTextureId ?? 'authored', archetype).dataTexture,
    [bodyTextureId, archetype],
  )
  const itemMaskEntries = useMemo(
    () => wornResolved.flatMap((i) => (i.def.maskUrl ? [{ itemId: i.itemId, url: i.def.maskUrl }] : [])),
    [wornResolved],
  )

  // Wardrobe items still carry baked PNG masks (until plan 016); useTexture
  // needs a non-empty list, so fall back to the body PNG (result dropped) when
  // nothing is worn.
  const itemMaskUrls = useMemo(() => itemMaskEntries.map((e) => e.url), [itemMaskEntries])
  const maskTextures = useTexture(itemMaskUrls.length > 0 ? itemMaskUrls : [body.maskUrl])

  const texturesByRegion = useMemo<Partial<Record<Region, ResolvedTextures>>>(
    () => ({ body: { map: null, maskMap: bodyMask } }),
    [bodyMask],
  )

  // --- assembly ---------------------------------------------------------------
  const assembled = useMemo(() => {
    const spec = useCharacterStore.getState().spec
    return assembleCharacter(spec, PART_REGISTRY, {
      bodyScene,
      partScenes,
      texturesByRegion,
    })
  }, [bodyScene, partScenes, texturesByRegion])

  // dispose REPLACED assemblies (not the live one — StrictMode re-runs
  // effect cleanups without re-attaching the primitive), and report renderer
  // memory so geometry leaks are loud in dev
  const previousAssembled = useRef<typeof assembled | null>(null)
  useEffect(() => {
    if (previousAssembled.current && previousAssembled.current !== assembled) previousAssembled.current.dispose()
    previousAssembled.current = assembled
    if (import.meta.env.DEV) {
      console.info('[character-studio] assembled', archetype, 'renderer.info.memory =', JSON.stringify(gl.info.memory))
      const w = window as unknown as Record<string, unknown>
      w.__assembled = assembled
      w.__characterStore = useCharacterStore
      w.__rendererInfo = gl.info
    }
  }, [assembled, gl, archetype])
  useEffect(
    () => () => {
      previousAssembled.current?.dispose()
      previousAssembled.current = null
    },
    [],
  )

  // --- dressing (plan 008): mutate the fresh assembly, undress on teardown ----
  const [dressed, setDressed] = useState<DressedCharacter | null>(null)
  // Wait for the wardrobe loader to report every worn item's scene (true when
  // nothing is worn — `every` over an empty list). Body/parts are synchronous.
  const itemsReady = wornResolved.every((i) => itemScenes[i.itemId])
  useEffect(() => {
    if (!itemsReady) return
    const spec = useCharacterStore.getState().spec
    const itemTextures: NonNullable<WardrobeAssets['itemTextures']> = {}
    itemMaskEntries.forEach(({ itemId }, j) => {
      const texture = maskTextures[j]
      if (texture) configureMask(texture)
      itemTextures[itemId] = { map: null, maskMap: texture }
    })
    const result = applyWardrobe(assembled, spec.wardrobe, WARDROBE_REGISTRY, { itemScenes, itemTextures }, {
      archetype: spec.meta.archetype,
      palette: spec.palette,
      bodyMorphs: spec.anatomy.bodyMorphs,
    })
    if (result.warnings.length > 0) console.warn('[character-studio] wardrobe:', result.warnings.join('; '))
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__dressed = result
    setDressed(result)
    return () => {
      result.undress()
      setDressed(null)
    }
  }, [assembled, itemScenes, itemsReady, maskTextures, itemMaskEntries, wornResolved])

  // --- sculpt session (plan 009): targets + weld topologies per assembly ------
  useEffect(() => {
    const spec = useCharacterStore.getState().spec
    const bodyAssetId = `body-${spec.meta.archetype}`
    const uniformScale = ARCHETYPES_DEF[spec.meta.archetype].uniformScale
    const sources: SculptTargetSource[] = [
      {
        assetId: bodyAssetId,
        scene: bodyScene,
        meshVersion: meshVersionOf(BODY_REGISTRY[spec.meta.archetype]),
        weldSpace: 'body',
        localToWorldScale: 1,
      },
    ]
    equipped.forEach(({ slot, def }) => {
      const partId = spec.anatomy.parts[slot]?.partId
      if (!partId) return
      const scene = partScenes[slot]
      if (!scene) return
      sources.push({
        assetId: partId,
        scene,
        meshVersion: meshVersionOf(def),
        weldSpace: partId,
        localToWorldScale: uniformScale,
      })
    })
    const targets = collectSculptTargets(assembled.root, sources)
    const session = createSculptSession(assembled.root, targets, {
      baseMeshId: bodyAssetId,
      baseMeshVersion: meshVersionOf(BODY_REGISTRY[spec.meta.archetype]),
    })
    useSculptStore.setState({ session })
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sculptSession = session
    return () => {
      useSculptStore.setState({ session: null })
    }
  }, [assembled, bodyScene, partScenes, equipped])

  // --- sculpt delta ⇄ spec sync: apply saved payloads to the live meshes ------
  // Runs on load (setSpec), on undo/redo commits, and after reassembly. The
  // identity guard skips payloads this very session just serialized (stroke
  // ends), so live sculpting never re-applies its own writes.
  const sculptDelta = useCharacterStore((s) => s.spec.anatomy.sculptDelta)
  const sculptSession = useSculptStore((s) => s.session)
  useEffect(() => {
    if (!sculptSession) return
    const payload = sculptDelta ?? null
    if (sculptSession.lastSyncedPayload === payload) return
    try {
      const { skippedLayers } = syncTargetsToPayload(sculptSession.targets, payload)
      sculptSession.lastSyncedPayload = payload
      finalizeSculptVisuals(sculptSession) // welded normals across submesh seams + outline shells
      if (skippedLayers.length > 0) {
        console.warn(
          '[character-studio] sculptDelta layers kept for unequipped assets:',
          skippedLayers.map((l) => `${l.assetId}/${l.meshName}`).join(', '),
        )
      }
    } catch (error) {
      if (error instanceof SculptDeltaMismatchError) {
        console.error(`[character-studio] ${error.message}`)
      } else {
        throw error
      }
    }
  }, [sculptSession, sculptDelta])

  // --- motion: springs (physics) + idle (procedural) + movers (animation) ----
  // Waits for the dressing pass: the rig is built from the DRESSED chain set
  // and must never solve chains whose grafted bones were undressed away.
  // Sculpt mode (plan 009 step 4) pauses springs + idle so the surface holds
  // still under the brush: toggling `active` re-runs this effect — the
  // cleanup DISPOSES the rig (which restores spring-bone rest rotations) and
  // resets the idle layer, so sculpting happens on the clean rest pose; on
  // exit a fresh rig spawns with particles snapped to that pose (the plan's
  // "paused, reset on exit"). The face rig registers its own procedural
  // update and keeps blinking. Play Mode force-exits sculpt (Stage effect).
  const sculptActive = useSculptStore((s) => s.active)
  useEffect(() => {
    if (!dressed || dressed.assembled !== assembled) return
    const chest = assembled.boneByName.get('chest')
    const head = assembled.boneByName.get('head')
    const hips = assembled.boneByName.get('hips')
    const neck = assembled.boneByName.get('neck')
    if (!chest || !head || !hips || !neck) return

    if (sculptActive) {
      const hipsRest = [hips.position.x, hips.position.y, hips.position.z] as const
      useMotionStudio.setState({
        rig: null,
        idle: null,
        mover: null,
        character: { root: assembled.root, boneByName: assembled.boneByName, hipsRest },
        chains: dressed.springChains,
      })
      return () => {
        useMotionStudio.setState({ rig: null, idle: null, mover: null, character: null, chains: [] })
      }
    }

    const rig = createSpringRig(assembled.root, dressed.springChains, assembled.colliderGroups)
    const stepper = createFixedStepper((h) => rig.step(h))
    const onPhysics = (dt: number) => {
      stepper.advance(dt)
    }
    const idle = createIdleLayer({ chest, head, hips }, mulberry32(IDLE_SEED))
    const onProcedural = (dt: number) => idle.update(dt)
    const mover = createBodyMover(assembled.root, neck)
    // Play mode owns the root once active (its clip machine + locomotion
    // drive it); an in-flight hop/shake left running would otherwise write
    // root.position.y or neck.rotation.y underneath Play's stack.
    const onAnimation = (dt: number) => {
      if (usePlayStore.getState().mode === 'play') return
      mover.update(dt)
    }

    registerUpdate('animation', onAnimation)
    registerUpdate('physics', onPhysics)
    registerUpdate('procedural', onProcedural)
    // hips rest LOCAL position, captured before any animation writes — Play
    // Mode's clip machine rebases the hips translation tracks onto it.
    const hipsRest = [hips.position.x, hips.position.y, hips.position.z] as const
    useMotionStudio.setState({
      rig,
      idle,
      mover,
      character: { root: assembled.root, boneByName: assembled.boneByName, hipsRest },
      chains: dressed.springChains,
    })

    return () => {
      unregisterUpdate('animation', onAnimation)
      unregisterUpdate('physics', onPhysics)
      unregisterUpdate('procedural', onProcedural)
      idle.reset()
      rig.dispose()
      useMotionStudio.setState({ rig: null, idle: null, mover: null, character: null, chains: [] })
    }
  }, [assembled, dressed, sculptActive])

  // --- live updates: morphs + boneScales (no reassembly) -----------------------
  useEffect(() => {
    const applyMorphSet = (meshes: THREE.Mesh[] | undefined, morphs: Record<string, number>) => {
      for (const mesh of meshes ?? []) {
        const dict = mesh.morphTargetDictionary
        const influences = mesh.morphTargetInfluences
        if (!dict || !influences) continue
        influences.fill(0) // reset-then-apply so removed morph keys revert (see assemble.ts)
        for (const [name, value] of Object.entries(morphs)) {
          const index = dict[name]
          if (index !== undefined) influences[index] = value
        }
      }
    }
    applyMorphSet(assembled.regionMeshes.body, bodyMorphs)
    for (const [slot, entry] of Object.entries(parts)) {
      if (!entry) continue
      const def = getPart(entry.partId)
      if (def && def.slot === (slot as PartSlot)) applyMorphSet(assembled.regionMeshes[def.region], entry.morphs)
    }
    // garments carry baked body-follow morphs (ASSET-CONTRACT) — same weights
    if (dressed?.assembled === assembled) {
      for (const meshes of Object.values(dressed.itemMeshes)) applyMorphSet(meshes, bodyMorphs)
    }
    // boneScales: reset then apply so removed scales revert
    for (const bone of assembled.boneByName.values()) bone.scale.set(1, 1, 1)
    for (const entry of Object.values(parts)) {
      for (const [name, scale] of Object.entries(entry?.boneScales ?? {})) {
        if (scale) assembled.boneByName.get(name as never)?.scale.set(scale.x, scale.y, scale.z)
      }
    }
    // re-apply the wardrobe earMode `under` flatten the reset above wiped
    // (the dressing pass flags the bones it flattened)
    for (const bone of assembled.boneByName.values()) {
      const flatten = bone.userData.wardrobeFlatten
      if (typeof flatten === 'number') bone.scale.multiplyScalar(flatten)
    }
  }, [assembled, bodyMorphs, parts, dressed])

  // --- live updates: material params + textures + outlines ---------------------
  useEffect(() => {
    for (const [region, material] of Object.entries(assembled.regionMaterials)) {
      if (!material) continue
      const assign = materialsSpec[region as Region] ?? FALLBACK_ASSIGN
      const resolveTexture: TextureResolver = (textureId) =>
        resolvesAuthored(textureId)
          ? (texturesByRegion[region as Region] ?? { map: null, maskMap: null })
          : defaultTextureResolver(textureId)
      applyMaterialAssign(material, assign)
      applyTextureId(material, assign, palette, resolveTexture)
      for (const mesh of assembled.regionMeshes[region as Region] ?? []) {
        if (assign.outline && !getOutline(mesh)) addOutline(mesh)
        else if (!assign.outline) removeOutline(mesh)
      }
    }
  }, [assembled, materialsSpec, palette, texturesByRegion])

  // --- live updates: palette + studio terminator warmth --------------------------
  useEffect(() => {
    for (const material of Object.values(assembled.regionMaterials)) {
      if (material) applyPalette(material, palette)
    }
    // item materials: spec palette merged with each worn item's live overrides
    if (dressed?.assembled === assembled) {
      for (const item of dressed.items) {
        const material = dressed.itemMaterials[item.itemId]
        if (!material) continue
        const live = wardrobe.find((w) => w.itemId === item.itemId) ?? item.worn
        applyPalette(material, mergeItemPalette(palette, live.paletteOverrides))
      }
    }
  }, [assembled, palette, dressed, wardrobe])

  useEffect(() => {
    const materials = [
      ...Object.values(assembled.regionMaterials),
      ...(dressed?.assembled === assembled ? Object.values(dressed.itemMaterials) : []),
    ]
    for (const material of materials) {
      if (material) material.userData.toonUniforms.uTerminatorWarmth.value = terminatorWarmth
    }
  }, [assembled, dressed, terminatorWarmth])

  return (
    // key forces a clean detach/attach when reassembly swaps the root —
    // r3f does not migrate the primitive in place. The face rig renders no
    // scene objects (advisor plan 002): it draws into the body material's
    // head UVs, so it follows morphs/sculpt/bone scales for free.
    <Fragment>
      {itemUrls.length > 0 && <WardrobeItemLoader urls={itemUrls} itemIds={itemIds} onScenes={setItemScenes} />}
      <Fragment key={assembled.root.uuid}>
        <primitive object={assembled.root} />
        {assembled.regionMaterials.body && (
          <FaceRig
            bodyMaterial={assembled.regionMaterials.body}
            hideMouth={assembled.hideMouth}
            beakJaw={assembled.beakJaw}
            placement={archetype === 'bird' ? BIRD_PLACEMENT : undefined}
          />
        )}
      </Fragment>
    </Fragment>
  )
}
