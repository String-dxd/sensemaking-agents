// Character assembly (plan 006, step 4) — spec + registry + loaded GLB
// scenes → one live character: canonical skeleton, skinned body, mounted
// parts, morphs, toon materials, merged spring-chain defs, face anchor.
//
// Pure three, no React, no loaders: the caller (CharacterRoot.tsx in the
// studio, tests with stubs) supplies already-loaded scenes/textures.
//
// Memory contract: assembly CLONES scenes (SkeletonUtils-style) but shares
// their geometries/textures — repeated reassembly allocates zero new
// geometry. dispose() releases only what assembly created (materials).

import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  createToonMaterial,
  type ResolvedTextures,
  type TextureResolver,
  type ToonMaterial,
  defaultTextureResolver,
} from '../materials/toonMaterial'
import { resolvesAuthored } from '../materials/patternRegistry'
import type { ColliderGroup, SpringChainDef } from '../motion/springTypes'
import type { BoneScale, CharacterSpec, PartSlot, Region } from '../spec/schema'
import { BONE_NAMES, type BoneName } from '../spec/schema'
import { archetypeColliderGroups, archetypeHead, ARCHETYPES_DEF } from './archetypes'
import type { PartDef } from './partRegistry'

export type PartRegistryLike = Record<string, PartDef>

export interface LoadedAssets {
  /** Pristine body GLB scene (rig + skinned meshes). Cloned by assembly. */
  bodyScene: THREE.Object3D
  /** Pristine part GLB scenes per slot (absent for empty parts). */
  partScenes: Partial<Record<PartSlot, THREE.Object3D>>
  /** Authored palette-mask/albedo textures per region ('authored' textureId). */
  texturesByRegion?: Partial<Record<Region, ResolvedTextures>>
}

export interface AssembledCharacter {
  root: THREE.Group
  skeleton: THREE.Skeleton
  boneByName: Map<BoneName, THREE.Object3D>
  /** Head-centre anchor (child of the head bone) for the plan-002 face rig. */
  faceAnchor: THREE.Object3D
  headRadius: number
  /** True when the equipped muzzle is a beak (hide the drawn mouth plane). */
  hideMouth: boolean
  /** Extra radial offset for the mouth plane (muzzle-front drawing). */
  mouthRadialOffset: number
  /** Spring-chain defs: spec rig merged with equipped parts' springProfiles. */
  springChains: SpringChainDef[]
  colliderGroups: ColliderGroup[]
  /** Live toon materials per region (CharacterRoot pushes spec updates). */
  regionMaterials: Partial<Record<Region, ToonMaterial>>
  /** Meshes per region (outline toggling). */
  regionMeshes: Partial<Record<Region, THREE.Mesh[]>>
  /** Dispose everything assembly created (materials; geometry is shared). */
  dispose(): void
}

const CANONICAL_CHAINS: ReadonlyArray<{ name: string; bones: readonly BoneName[]; colliders: string[] }> = [
  { name: 'earL', bones: ['earL.1', 'earL.2'], colliders: ['head'] },
  { name: 'earR', bones: ['earR.1', 'earR.2'], colliders: ['head'] },
  { name: 'tail', bones: ['tail.1', 'tail.2', 'tail.3', 'tail.4'], colliders: [] },
]

// three's GLTFLoader sanitizes node names for PropertyBinding — it STRIPS
// DOTS, so the canonical `earL.1` arrives as `earL1` even though the GLB is
// byte-correct (verified with gltf-transform in assets.test.ts). Assembly
// restores the canonical names on its own CLONES, so loader caches and
// call order don't matter. (Plan 007 heads-up: keyframe track names for
// dotted bones need the `.bones[earL.1]` subscript syntax.)
const SANITIZED_TO_CANONICAL = new Map(
  BONE_NAMES.map((name) => [THREE.PropertyBinding.sanitizeNodeName(name), name] as const),
)

/** Restore GLTFLoader-sanitized node names to their canonical dotted forms
 * (shared with the plan-008 dressing pass, which clones item scenes too). */
export function restoreCanonicalNames(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    const canonical = SANITIZED_TO_CANONICAL.get(object.name)
    if (canonical) object.name = canonical
  })
}

function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh)
  })
  return out
}

function applyMorphs(mesh: THREE.Mesh, morphs: Record<string, number>): void {
  const dict = mesh.morphTargetDictionary
  const influences = mesh.morphTargetInfluences
  if (!dict || !influences) return
  // Neutral baseline first: loaders initialize influences from the glTF
  // mesh's default weights, and GLBs authored before the plan-008 exporter
  // fix ship weights=1 for EVERY morph (all-on bodies — the gate-caught
  // belly-occludes-garments bug). The spec is the only source of truth.
  influences.fill(0)
  for (const [name, value] of Object.entries(morphs)) {
    const index = dict[name]
    if (index !== undefined) influences[index] = value
  }
}

function applyBoneScales(
  boneByName: Map<BoneName, THREE.Object3D>,
  boneScales: Partial<Record<BoneName, BoneScale>> | undefined,
): void {
  if (!boneScales) return
  for (const [name, scale] of Object.entries(boneScales)) {
    if (!scale) continue
    boneByName.get(name as BoneName)?.scale.set(scale.x, scale.y, scale.z)
  }
}

/**
 * Merge the spec's spring rig with the equipped parts' springProfiles:
 * a part's profile overrides every joint of the chains covering its bones;
 * chains missing for a springy part (e.g. ears equipped on a bird spec) are
 * synthesized from the canonical chain table.
 */
export function mergeSpringChains(
  specRig: SpringChainDef[],
  equippedParts: Array<{ def: PartDef }>,
): SpringChainDef[] {
  const chains = specRig.map((chain) => ({
    ...chain,
    boneNames: [...chain.boneNames],
    joints: chain.joints.map((j) => ({ ...j, gravityDir: [...j.gravityDir] as [number, number, number] })),
    colliderGroupRefs: [...chain.colliderGroupRefs],
  }))

  for (const { def } of equippedParts) {
    if (!def.springProfile || !def.skinnedTo) continue
    const partBones = new Set<string>(def.skinnedTo)
    let covered = false
    for (const chain of chains) {
      if (!chain.boneNames.some((b) => partBones.has(b))) continue
      covered = true
      chain.joints = chain.joints.map(() => ({
        ...def.springProfile!,
        gravityDir: [...def.springProfile!.gravityDir] as [number, number, number],
      }))
    }
    if (!covered) {
      for (const canonical of CANONICAL_CHAINS) {
        if (!canonical.bones.some((b) => partBones.has(b))) continue
        chains.push({
          name: canonical.name,
          boneNames: [...canonical.bones],
          joints: canonical.bones.map(() => ({
            ...def.springProfile!,
            gravityDir: [...def.springProfile!.gravityDir] as [number, number, number],
          })),
          colliderGroupRefs: [...canonical.colliders],
        })
      }
    }
  }
  return chains
}

export function assembleCharacter(
  spec: CharacterSpec,
  registry: PartRegistryLike,
  assets: LoadedAssets,
): AssembledCharacter {
  const archetype = spec.meta.archetype
  const uniformScale = ARCHETYPES_DEF[archetype].uniformScale
  const root = new THREE.Group()
  root.name = 'characterRoot'

  // --- body + skeleton -------------------------------------------------------
  const body = cloneSkinned(assets.bodyScene)
  restoreCanonicalNames(body)
  root.add(body)

  const boneByName = new Map<BoneName, THREE.Object3D>()
  body.traverse((o) => {
    if ((o as THREE.Bone).isBone && (BONE_NAMES as readonly string[]).includes(o.name)) {
      boneByName.set(o.name as BoneName, o)
    }
  })
  for (const name of BONE_NAMES) {
    if (!boneByName.has(name)) throw new Error(`assemble: body scene is missing canonical bone "${name}"`)
  }

  const bodyMeshes = collectSkinnedMeshes(body)
  if (bodyMeshes.length === 0) throw new Error('assemble: body scene has no skinned mesh')
  const skeleton = bodyMeshes[0].skeleton

  // Every Skeleton this assembly creates (clone + part rebinds) owns a GPU
  // bone texture — dispose() must release them or reassembly leaks textures.
  const ownedSkeletons = new Set<THREE.Skeleton>()
  for (const mesh of bodyMeshes) ownedSkeletons.add(mesh.skeleton)

  const regionMeshes: Partial<Record<Region, THREE.Mesh[]>> = {}
  const tagMesh = (mesh: THREE.Mesh, region: Region, castShadow = true) => {
    mesh.userData.region = region
    // muzzles hug the face — their hard shadow would dirty the drawn-face
    // zone (AC keeps faces clean), so they never cast
    mesh.castShadow = castShadow && region !== 'muzzle'
    mesh.receiveShadow = true
    mesh.frustumCulled = false // skinned/morphed bounds are stale by design
    ;(regionMeshes[region] ??= []).push(mesh)
  }
  for (const mesh of bodyMeshes) {
    tagMesh(mesh, 'body')
    applyMorphs(mesh, spec.anatomy.bodyMorphs)
  }

  // --- parts ------------------------------------------------------------------
  const equipped: Array<{ def: PartDef }> = []
  let hideMouth = false
  let mouthRadialOffset = 0

  for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
    if (!entry) continue
    const def = registry[entry.partId]
    if (!def) throw new Error(`assemble: unknown part "${entry.partId}" in slot "${slot}"`)
    equipped.push({ def })
    hideMouth ||= def.hidesMouth ?? false
    if (def.mouthOffset) mouthRadialOffset = Math.max(mouthRadialOffset, def.mouthOffset * uniformScale)
    if (def.url === null) continue

    const pristine = assets.partScenes[slot as PartSlot]
    if (!pristine) continue // asset not loaded (caller decides whether that is an error)
    const partScene = cloneSkinned(pristine)
    restoreCanonicalNames(partScene)

    if (def.skinnedTo) {
      // Rebind the part's skinned meshes onto the BODY skeleton by bone name.
      // Parts are authored in reference space (scale 1); scaling each inverse
      // bind by the archetype's uniformScale makes the mesh follow archetype
      // bones at archetype size: X = S(u) · T(-p_ref) maps a reference vertex
      // into scaled bone-local space (see plan 006 notes).
      const scale = new THREE.Matrix4().makeScale(uniformScale, uniformScale, uniformScale)
      for (const mesh of collectSkinnedMeshes(partScene)) {
        const bones: THREE.Bone[] = []
        const inverses: THREE.Matrix4[] = []
        mesh.skeleton.bones.forEach((partBone, i) => {
          const bodyBone = boneByName.get(partBone.name as BoneName)
          if (!bodyBone) throw new Error(`assemble: part "${entry.partId}" is skinned to unknown bone "${partBone.name}"`)
          bones.push(bodyBone as THREE.Bone)
          inverses.push(new THREE.Matrix4().copy(scale).multiply(mesh.skeleton.boneInverses[i]))
        })
        mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4())
        ownedSkeletons.add(mesh.skeleton)
        applyMorphs(mesh, entry.morphs)
        tagMesh(mesh, def.region)
        root.add(mesh)
      }
    } else {
      // Rigid: parent each mesh to its attach bone (origin authored at the
      // bone's rest position; archetype size via node scale).
      const meshes: THREE.Mesh[] = []
      partScene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
      })
      for (const mesh of meshes) {
        const attach = (mesh.userData.attachBone as BoneName | undefined) ?? def.attachTo?.[0]
        const bone = attach ? boneByName.get(attach) : undefined
        if (!bone) throw new Error(`assemble: part "${entry.partId}" has no valid attach bone (${String(attach)})`)
        mesh.position.set(0, 0, 0)
        mesh.scale.setScalar(uniformScale)
        applyMorphs(mesh, entry.morphs)
        tagMesh(mesh, def.region)
        bone.add(mesh)
      }
    }

    applyBoneScales(boneByName, entry.boneScales)
  }

  // --- materials ----------------------------------------------------------------
  const regionMaterials: Partial<Record<Region, ToonMaterial>> = {}
  for (const region of Object.keys(regionMeshes) as Region[]) {
    const assign = spec.materials[region] ?? {
      rampSoftness: 0.2,
      rimStrength: 0.3,
      shadowTint: '#b8a8c8',
      textureId: 'authored',
    }
    // plan 010: a body pattern id resolves through the authored path — its
    // baked mask is supplied via texturesByRegion (CharacterRoot swaps the
    // body mask URL); the shader is unchanged.
    const resolveTexture: TextureResolver = (textureId) =>
      resolvesAuthored(textureId)
        ? (assets.texturesByRegion?.[region] ?? { map: null, maskMap: null })
        : defaultTextureResolver(textureId)
    // Procedural meshes carry exact per-vertex palette channels; the authored
    // mask PNGs were baked against the retired GLB UV unwraps and misalign on
    // procedural UVs (dark limb streaks, muzzle blotches). Plan 019 rasterizes
    // the BODY channels into a UV-aligned mask (crisp two-tone regions the
    // vertex path can't hold at mesh density) — so prefer that mask when the
    // resolver supplies one, and keep the vertex path for everything else
    // (parts, and any region without a rasterized mask).
    const meshes = regionMeshes[region] ?? []
    const hasVertexChannels = meshes.length > 0 && meshes.every((m) => m.geometry.hasAttribute('paletteChannels'))
    const hasRasterizedMask = resolveTexture(assign.textureId ?? 'none').maskMap !== null
    const vertexChannels = hasVertexChannels && !hasRasterizedMask
    const material = createToonMaterial(assign, spec.palette, { resolveTexture, vertexChannels })
    regionMaterials[region] = material
    for (const mesh of regionMeshes[region] ?? []) mesh.material = material
  }

  // --- face anchor ---------------------------------------------------------------
  const head = archetypeHead(archetype)
  const faceAnchor = new THREE.Group()
  faceAnchor.name = 'faceAnchor'
  faceAnchor.position.set(...head.center)
  boneByName.get('head')?.add(faceAnchor)

  // --- springs -------------------------------------------------------------------
  const springChains = mergeSpringChains(spec.motion.springRig, equipped)
  const colliderGroups = archetypeColliderGroups(archetype)

  return {
    root,
    skeleton,
    boneByName,
    faceAnchor,
    headRadius: head.radius,
    hideMouth,
    mouthRadialOffset,
    springChains,
    colliderGroups,
    regionMaterials,
    regionMeshes,
    dispose(): void {
      // Assembly-owned GPU resources: region materials + skeleton bone
      // textures. Geometries/source textures are shared with the pristine
      // loaded assets (the asset cache owns them; reassembly allocates
      // none). Detaching `root` from the scene is the mounting layer's job
      // (r3f <primitive> owns attachment).
      for (const material of Object.values(regionMaterials)) material?.dispose()
      for (const owned of ownedSkeletons) owned.dispose()
    },
  }
}
