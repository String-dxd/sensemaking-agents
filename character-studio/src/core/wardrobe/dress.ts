// Dressing pass (plan 008, step 3) — worn items + registry + loaded GLB
// scenes onto an assembled character (plan 006): rigid items parented to
// their socket bones, skinned garments rebound onto the LIVE body skeleton
// (spec boneScales apply automatically through the shared bones), AC
// hat-ears earMode, body-hide submesh toggling, item spring chains grafted
// into the character's spring rig, palette recoloring with per-item
// overrides.
//
// Pure three, no React, no loaders — the caller (CharacterRoot.tsx, tests
// with stubs) supplies already-loaded scenes/textures, mirrors assemble.ts.
//
// Lifecycle contract: `applyWardrobe` MUTATES the assembled character
// (parents meshes, grafts bones, scales ear bones, hides submeshes) and
// returns an `undress()` that restores every mutation exactly. Dress at
// most once per assembly; redress = undress() → applyWardrobe(). The
// caller must rebuild the spring rig from the returned `springChains`
// after dressing AND after undressing (a rig built on grafted bones must
// never outlive them — leaked chains are the plan-008 reviewer hazard).

import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  createToonMaterial,
  type Palette,
  type ResolvedTextures,
  type TextureResolver,
  type ToonMaterial,
} from '../materials'
import type { SpringChainDef } from '../motion/springTypes'
import { ARCHETYPES_DEF } from '../skeleton/archetypes'
import { type AssembledCharacter, restoreCanonicalNames } from '../skeleton/assemble'
import {
  type Archetype,
  BONE_NAMES,
  type BoneName,
  type EarMode,
  PALETTE_SLOTS,
  type PaletteSlot,
  type WearSlot,
  type WornItem,
} from '../spec/schema'
import {
  type BodyHideRegion,
  defaultEarMode,
  type WardrobeItemDef,
  type WardrobeRegistryLike,
} from './itemRegistry'

/** AC hat-ears `under` mode: flatten earL/R.1 to ~15 % (plan 000 §2.1). */
export const EAR_FLATTEN_SCALE = 0.15

const CANONICAL = new Set<string>(BONE_NAMES)
const EAR_ROOT_BONES: readonly BoneName[] = ['earL.1', 'earR.1']

// --- worn-item resolution (conflict rules) -----------------------------------

export interface ResolvedWornItem {
  itemId: string
  worn: WornItem
  def: WardrobeItemDef
  /** Effective ear mode (validated against the item's supported list). */
  earMode: EarMode | null
}

/** The wear slots an item blocks: `outfit` occupies top + bottom too. */
function occupies(slot: WearSlot): readonly WearSlot[] {
  return slot === 'outfit' ? ['outfit', 'top', 'bottom'] : [slot]
}

/**
 * Enforce the plan-008 conflict rules on a spec `wardrobe` list: unknown
 * items are skipped, one item per slot with LAST-WINS eviction (`outfit`
 * occupying top+bottom), `earMode` limited to the item's supported list
 * (falls back to the item default). Every correction emits a warning —
 * pure data in, pure data out (the panel surfaces the same warnings the
 * dressing pass acts on).
 */
export function resolveWornItems(
  wornItems: readonly WornItem[],
  registry: WardrobeRegistryLike,
): { items: ResolvedWornItem[]; warnings: string[] } {
  const items: ResolvedWornItem[] = []
  const warnings: string[] = []

  for (const worn of wornItems) {
    const def = registry[worn.itemId]
    if (!def) {
      warnings.push(`unknown wardrobe item "${worn.itemId}" — skipped`)
      continue
    }
    if (worn.slot !== def.slot) {
      warnings.push(`"${worn.itemId}" is worn in slot "${worn.slot}" but registered for "${def.slot}" — using the registry slot`)
    }

    const occupied = occupies(def.slot)
    for (let i = items.length - 1; i >= 0; i--) {
      if (occupies(items[i].def.slot).some((s) => occupied.includes(s))) {
        warnings.push(`slot conflict on "${def.slot}": "${items[i].itemId}" replaced by "${worn.itemId}" (last wins)`)
        items.splice(i, 1)
      }
    }

    let earMode: EarMode | null = null
    if (def.earModes) {
      if (worn.earMode && !def.earModes.includes(worn.earMode)) {
        warnings.push(`"${worn.itemId}" does not support earMode "${worn.earMode}" — using "${defaultEarMode(def)}"`)
      }
      earMode = worn.earMode && def.earModes.includes(worn.earMode) ? worn.earMode : defaultEarMode(def)
    } else if (worn.earMode) {
      warnings.push(`"${worn.itemId}" is not ear-aware — earMode "${worn.earMode}" ignored`)
    }

    items.push({ itemId: worn.itemId, worn, def, earMode })
  }

  return { items, warnings }
}

// --- dressing ------------------------------------------------------------------

export interface WardrobeAssets {
  /** Pristine item GLB scenes by itemId. Cloned by the dressing pass. */
  itemScenes: Partial<Record<string, THREE.Object3D>>
  /** Palette-mask textures by itemId ('authored' textureId resolution). */
  itemTextures?: Partial<Record<string, ResolvedTextures>>
}

export interface DressOptions {
  archetype: Archetype
  /** Spec palette; per-item `paletteOverrides` merge over it. */
  palette: Palette
  /** Spec bodyMorphs — garments bake body-follow morphs (ASSET-CONTRACT). */
  bodyMorphs?: Record<string, number>
}

export interface DressedCharacter {
  /** The character this result dressed (staleness guard for the caller). */
  assembled: AssembledCharacter
  /** Post-conflict-resolution worn items, in wear order. */
  items: ResolvedWornItem[]
  itemMeshes: Record<string, THREE.Mesh[]>
  /** One live toon material per item (live palette updates via applyPalette). */
  itemMaterials: Record<string, ToonMaterial>
  /** Character chains + item chains — rebuild the spring rig from THIS. */
  springChains: SpringChainDef[]
  /** Body submesh regions currently hidden. */
  hiddenRegions: BodyHideRegion[]
  warnings: string[]
  /** Restore every dressing mutation (idempotent). */
  undress(): void
}

function applyMorphs(mesh: THREE.Mesh, morphs: Record<string, number>): void {
  const dict = mesh.morphTargetDictionary
  const influences = mesh.morphTargetInfluences
  if (!dict || !influences) return
  for (const [name, value] of Object.entries(morphs)) {
    const index = dict[name]
    if (index !== undefined) influences[index] = value
  }
}

/** Merge valid per-item palette overrides over the spec palette. */
export function mergeItemPalette(palette: Palette, overrides: Record<string, string> | undefined): Palette {
  if (!overrides) return palette
  const merged = { ...palette }
  for (const slot of PALETTE_SLOTS) {
    const color = overrides[slot]
    if (color) merged[slot as PaletteSlot] = color
  }
  return merged
}

export function applyWardrobe(
  assembled: AssembledCharacter,
  wornItems: readonly WornItem[],
  registry: WardrobeRegistryLike,
  assets: WardrobeAssets,
  options: DressOptions,
): DressedCharacter {
  const { items, warnings } = resolveWornItems(wornItems, registry)
  const uniformScale = ARCHETYPES_DEF[options.archetype].uniformScale
  const scaleMatrix = new THREE.Matrix4().makeScale(uniformScale, uniformScale, uniformScale)

  const itemMeshes: Record<string, THREE.Mesh[]> = {}
  const itemMaterials: Record<string, ToonMaterial> = {}
  const springChains: SpringChainDef[] = [...assembled.springChains]
  const graftedByName = new Map<string, THREE.Bone>()

  // undo ledger
  const graftedRoots: THREE.Bone[] = []
  const ownedSkeletons = new Set<THREE.Skeleton>()
  const earScaleRestores: Array<{ bone: THREE.Object3D; scale: THREE.Vector3 }> = []
  const shownAgainOnUndress: THREE.Object3D[] = []

  const boneLookup = (name: string): THREE.Bone | undefined =>
    graftedByName.get(name) ?? (assembled.boneByName.get(name as BoneName) as THREE.Bone | undefined)

  const dressed: ResolvedWornItem[] = []
  for (const item of items) {
    const pristine = assets.itemScenes[item.itemId]
    if (!pristine) {
      warnings.push(`no loaded scene for wardrobe item "${item.itemId}" — skipped`)
      continue
    }
    dressed.push(item)
    const scene = cloneSkinned(pristine)
    restoreCanonicalNames(scene)

    // --- graft item-internal spring bones onto the live skeleton ------------
    // Item bones are authored in reference space under a canonical parent;
    // scaling their local offsets by uniformScale puts their rest heads at
    // the archetype-space positions the garment was fitted to (see the
    // ASSET-CONTRACT un-map formula — offsets are u× their authored value).
    const itemBones: THREE.Bone[] = []
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && !CANONICAL.has(o.name)) itemBones.push(o as THREE.Bone)
    })
    for (const bone of itemBones) {
      bone.position.multiplyScalar(uniformScale)
      graftedByName.set(bone.name, bone)
    }
    for (const bone of itemBones) {
      const parentName = bone.parent?.name
      if (parentName && CANONICAL.has(parentName)) {
        const liveParent = assembled.boneByName.get(parentName as BoneName)
        if (!liveParent) throw new Error(`dress: item "${item.itemId}" bone "${bone.name}" grafts under missing bone "${parentName}"`)
        liveParent.add(bone) // nested item bones ride along (still its children)
        graftedRoots.push(bone)
      }
    }

    // --- mount meshes ---------------------------------------------------------
    const meshes: THREE.Mesh[] = []
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
    })
    if (meshes.length === 0) throw new Error(`dress: item "${item.itemId}" scene has no mesh`)
    itemMeshes[item.itemId] = meshes

    for (const mesh of meshes) {
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        // Rebind onto the live skeleton by bone name — the anatomy-part
        // convention: inverse binds scaled by uniformScale map reference-
        // space vertices onto archetype-scaled bones (assemble.ts, plan 006).
        const skinned = mesh as THREE.SkinnedMesh
        const bones: THREE.Bone[] = []
        const inverses: THREE.Matrix4[] = []
        skinned.skeleton.bones.forEach((itemBone, i) => {
          const liveBone = boneLookup(itemBone.name)
          if (!liveBone) throw new Error(`dress: item "${item.itemId}" is skinned to unknown bone "${itemBone.name}"`)
          bones.push(liveBone)
          inverses.push(new THREE.Matrix4().copy(scaleMatrix).multiply(skinned.skeleton.boneInverses[i]))
        })
        skinned.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4())
        ownedSkeletons.add(skinned.skeleton)
        assembled.root.add(skinned)
      } else {
        // Rigid: parent to the attach bone (origin authored at the socket's
        // rest position, +Z forward; archetype size via node scale).
        const attach = (mesh.userData.attachBone as BoneName | undefined) ?? item.def.socket
        const bone = attach ? assembled.boneByName.get(attach) : undefined
        if (!bone) throw new Error(`dress: item "${item.itemId}" has no valid attach bone (${String(attach)})`)
        mesh.position.set(0, 0, 0)
        mesh.scale.setScalar(uniformScale)
        bone.add(mesh)
      }
      mesh.userData.wardrobeItem = item.itemId
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false // skinned/bone-parented bounds are stale by design
      applyMorphs(mesh, options.bodyMorphs ?? {})
    }

    // --- material: item mask + spec palette merged with the item overrides ---
    const textures = assets.itemTextures?.[item.itemId] ?? { map: null, maskMap: null }
    const resolveTexture: TextureResolver = () => textures
    const material = createToonMaterial(
      { rampSoftness: 0.2, rimStrength: 0.3, shadowTint: '#b8a8c8', textureId: 'authored' },
      mergeItemPalette(options.palette, item.worn.paletteOverrides),
      { resolveTexture },
    )
    itemMaterials[item.itemId] = material
    for (const mesh of meshes) mesh.material = material

    // --- item spring chains → the character's rig (deep copies) --------------
    for (const chain of item.def.springChains ?? []) {
      springChains.push({
        ...chain,
        boneNames: [...chain.boneNames],
        joints: chain.joints.map((j) => ({ ...j, gravityDir: [...j.gravityDir] as [number, number, number] })),
        colliderGroupRefs: [...chain.colliderGroupRefs],
      })
    }
  }

  // --- ear mode (at most one headwear survives resolution) --------------------
  const headwear = dressed.find((i) => i.def.slot === 'headwear')
  if (headwear?.earMode === 'under') {
    for (const name of EAR_ROOT_BONES) {
      const bone = assembled.boneByName.get(name)
      if (!bone) continue
      earScaleRestores.push({ bone, scale: bone.scale.clone() })
      bone.scale.multiplyScalar(EAR_FLATTEN_SCALE)
      // CharacterRoot's boneScale live-update effect resets scales and
      // re-applies the spec — this flag tells it to re-apply the flatten.
      bone.userData.wardrobeFlatten = EAR_FLATTEN_SCALE
    }
  } else if (headwear?.earMode === 'replace') {
    for (const mesh of assembled.regionMeshes.ears ?? []) {
      if (!mesh.visible) continue
      mesh.visible = false
      shownAgainOnUndress.push(mesh)
    }
  }

  // --- body-hide regions ----------------------------------------------------------
  const hideSet = new Set<BodyHideRegion>(dressed.flatMap((i) => i.def.hideBodyRegions ?? []))
  const hiddenRegions = [...hideSet]
  if (hideSet.size > 0) {
    assembled.root.traverse((o) => {
      const region = o.userData.bodyRegion as BodyHideRegion | undefined
      if (region && hideSet.has(region) && o.visible) {
        o.visible = false
        shownAgainOnUndress.push(o)
      }
    })
  }

  let undressed = false
  return {
    assembled,
    items: dressed,
    itemMeshes,
    itemMaterials,
    springChains,
    hiddenRegions,
    warnings,
    undress(): void {
      if (undressed) return
      undressed = true
      for (const meshes of Object.values(itemMeshes)) {
        for (const mesh of meshes) mesh.removeFromParent()
      }
      for (const material of Object.values(itemMaterials)) material.dispose()
      for (const skeleton of ownedSkeletons) skeleton.dispose()
      for (const bone of graftedRoots) bone.removeFromParent()
      for (const { bone, scale } of earScaleRestores) {
        bone.scale.copy(scale)
        delete bone.userData.wardrobeFlatten
      }
      for (const object of shownAgainOnUndress) object.visible = true
    },
  }
}
