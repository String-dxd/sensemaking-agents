// CharacterRoot (plan 006, step 4) — replaces PlaceholderBody in the Stage.
//
// Loads the archetype body + equipped part GLBs (drei useGLTF, cached),
// runs core assembly (assembleCharacter — pure three), mounts the face rig
// on the returned anchor, and registers spring rig + idle layer + body
// movers in the frame loop. Re-assembles reactively when the spec's
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
import { createPortal, useThree } from '@react-three/fiber'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  addOutline,
  applyMaterialAssign,
  applyPalette,
  applyTextureId,
  defaultTextureResolver,
  getOutline,
  removeOutline,
  type ResolvedTextures,
  type TextureResolver,
} from '../../core/materials'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { mulberry32 } from '../../core/motion/noise'
import { createIdleLayer } from '../../core/motion/proceduralIdle'
import { createFixedStepper, createSpringRig } from '../../core/motion/springSolver'
import { assembleCharacter, type LoadedAssets } from '../../core/skeleton/assemble'
import { BODY_REGISTRY, getPart, PART_REGISTRY } from '../../core/skeleton/partRegistry'
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
import { FALLBACK_ASSIGN, useMotionStudio, useToonStudio } from '../state/studioStores'
import { createBodyMover } from './bodyMover'
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

export function CharacterRoot() {
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
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
  const gltfUrls = useMemo(
    () => [body.url, ...equipped.map((e) => e.def.url as string), ...wornResolved.map((i) => i.def.url)],
    [body, equipped, wornResolved],
  )
  const maskEntries = useMemo(() => {
    const entries: Array<{ region: Region; url: string }> = [{ region: 'body', url: body.maskUrl }]
    for (const { def } of equipped) if (def.maskUrl) entries.push({ region: def.region, url: def.maskUrl })
    return entries
  }, [body, equipped])
  const itemMaskEntries = useMemo(
    () => wornResolved.flatMap((i) => (i.def.maskUrl ? [{ itemId: i.itemId, url: i.def.maskUrl }] : [])),
    [wornResolved],
  )

  const gltfs = useGLTF(gltfUrls)
  // one call: region masks first, item masks after (the list is never empty)
  const maskTextures = useTexture([...maskEntries.map((e) => e.url), ...itemMaskEntries.map((e) => e.url)])

  // --- assembly ---------------------------------------------------------------
  const assembled = useMemo(() => {
    for (const texture of maskTextures) configureMask(texture)
    const texturesByRegion: Partial<Record<Region, ResolvedTextures>> = {}
    maskEntries.forEach(({ region }, i) => {
      texturesByRegion[region] ??= { map: null, maskMap: maskTextures[i] }
    })
    const partScenes: LoadedAssets['partScenes'] = {}
    equipped.forEach(({ slot }, i) => {
      partScenes[slot] = gltfs[i + 1].scene
    })
    const spec = useCharacterStore.getState().spec
    return assembleCharacter(spec, PART_REGISTRY, {
      bodyScene: gltfs[0].scene,
      partScenes,
      texturesByRegion,
    })
  }, [gltfs, maskTextures, maskEntries, equipped])

  const texturesByRegion = useMemo(() => {
    const map: Partial<Record<Region, ResolvedTextures>> = {}
    maskEntries.forEach(({ region }, i) => {
      map[region] ??= { map: null, maskMap: maskTextures[i] }
    })
    return map
  }, [maskEntries, maskTextures])

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
  useEffect(() => {
    const spec = useCharacterStore.getState().spec
    const itemScenes: WardrobeAssets['itemScenes'] = {}
    wornResolved.forEach((item, j) => {
      itemScenes[item.itemId] = gltfs[1 + equipped.length + j].scene
    })
    const itemTextures: NonNullable<WardrobeAssets['itemTextures']> = {}
    itemMaskEntries.forEach(({ itemId }, j) => {
      itemTextures[itemId] = { map: null, maskMap: maskTextures[maskEntries.length + j] }
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
  }, [assembled, gltfs, maskTextures, maskEntries, itemMaskEntries, equipped, wornResolved])

  // --- motion: springs (physics) + idle (procedural) + movers (animation) ----
  // Waits for the dressing pass: the rig is built from the DRESSED chain set
  // and must never solve chains whose grafted bones were undressed away.
  useEffect(() => {
    if (!dressed || dressed.assembled !== assembled) return
    const chest = assembled.boneByName.get('chest')
    const head = assembled.boneByName.get('head')
    const hips = assembled.boneByName.get('hips')
    const neck = assembled.boneByName.get('neck')
    if (!chest || !head || !hips || !neck) return

    const rig = createSpringRig(assembled.root, dressed.springChains, assembled.colliderGroups)
    const stepper = createFixedStepper((h) => rig.step(h))
    const onPhysics = (dt: number) => {
      stepper.advance(dt)
    }
    const idle = createIdleLayer({ chest, head, hips }, mulberry32(IDLE_SEED))
    const onProcedural = (dt: number) => idle.update(dt)
    const mover = createBodyMover(assembled.root, neck)
    const onAnimation = (dt: number) => mover.update(dt)

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
  }, [assembled, dressed])

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
        textureId === 'authored'
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

  const placement = useMemo(
    () => ({ mouthRadialOffset: assembled.mouthRadialOffset }),
    [assembled],
  )

  return (
    // key forces a clean detach/attach (primitive AND portal container) when
    // reassembly swaps the root — r3f does not migrate either in place.
    <Fragment key={assembled.root.uuid}>
      <primitive object={assembled.root} />
      {createPortal(
        // head shells are drawn slightly wider than the cranium sphere
        // (head_wide 1.02–1.06 in the body builder) — pad the face-plane
        // radius so eyes/brows float just off the widest surface.
        <FaceRig headRadius={assembled.headRadius * 1.07} placement={placement} hideMouth={assembled.hideMouth} />,
        assembled.faceAnchor,
      )}
    </Fragment>
  )
}
