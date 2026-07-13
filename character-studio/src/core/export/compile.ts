// Character compiler (plan 011 step 2) — CharacterSpec + loaded assets → one
// self-sufficient `.companion.glb` (Uint8Array), assembled with gltf-transform.
//
// PIPELINE:
//   1. Assemble the LIVE three character exactly as the studio does
//      (assembleCharacter + applyWardrobe + sculpt sync) — this IS the
//      canonical assembly, so fidelity is guaranteed by reuse, not re-derived.
//   2. Translate the live scene → a gltf-transform Document:
//      - skinned meshes: POSITION (base+sculpt already baked into the attribute
//        by applyDelta), NORMAL, UV, JOINTS_0/WEIGHTS_0, morph targets kept
//        with NEUTRALIZED default weights (plan carryover: part GLBs ship shape
//        keys at weight 1; assembly zeroes them, we bake the zeros as node
//        defaults so a generic viewer isn't inflated);
//      - rigid parts + drawn-face planes: bone-child mesh nodes;
//      - one skin per distinct bind (inverseBindMatrices = skeleton.boneInverses,
//        joint nodes = the canonical bone nodes; grafted wardrobe bones included);
//      - the 11 contract clips copied from the clips GLB, hips-rebased for the
//        archetype so a generic viewer animates correctly with no runtime help.
//   3. Materials: unlit face planes (KHR_materials_unlit + KHR_texture_transform
//      per cell), PBR body/region fallback (palette-primary baseColor) + a
//      `SEN_companion.materialsMeta` recipe so the runtime rebuilds toon.
//   4. Attach `SEN_companion`, LOSSLESS meshopt-compress geometry/anim, validate
//      the round-trip, write the GLB.
//
// NODE-COMPATIBLE (plan maintenance note: server-side re-export): three's
// GLTFLoader.parse + gltf-transform both run headless; no DOM, no canvas. The
// caller supplies already-loaded scenes + the clips Document + PNG bytes.
// ASYNC: gltf-transform's NodeIO.writeBinary + the meshopt encoder are async.

import type { Document, Material, Node as GNode, Skin, Texture, TextureInfo } from '@gltf-transform/core'
import { Document as GltfDocument, WebIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMaterialsUnlit, KHRTextureTransform } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import * as THREE from 'three'
import {
  type AtlasCell,
  BROW_CELLS,
  DEFAULT_PLACEMENT,
  EXPRESSION_PRESETS,
  EYE_CELLS,
  EYE_CELLS_WITHOUT_PUPIL,
  type ExpressionName,
  FACE_LAYER_RADIAL_OFFSET,
  FACE_LAYER_RADIAL_STEP,
  type FacePlacement,
  GAZE_MAX,
  makeFacePlaneGeometry,
  MOUTH_CELLS,
  PUPIL_CELLS,
} from '../face'
import { hexToLinear } from '../materials/palette'
import {
  ARCHETYPES_DEF,
  type AssembledCharacter,
  archetypeHead,
  assembleCharacter,
  BODY_REGISTRY,
  getPart,
  type LoadedAssets,
  meshVersionOf,
  PART_REGISTRY,
} from '../skeleton'
import { collectSculptTargets, type SculptTargetSource, syncTargetsToPayload } from '../sculpt'
import type { CharacterSpec, PartSlot, Region } from '../spec/schema'
import { applyWardrobe, resolveWornItems, WARDROBE_REGISTRY } from '../wardrobe'
import {
  SEN_COMPANION_EXT_VERSION,
  type SenCompanionData,
  SENCompanionExtension,
} from './senCompanion'
import { assignCellTexture, embedPngTexture, faceCellTransform } from './textures'

// --- inputs -------------------------------------------------------------------

export interface CompileAssets {
  /** Pristine body GLB scene (from GLTFLoader.parse). */
  bodyScene: THREE.Object3D
  /** Pristine part GLB scenes per slot. */
  partScenes: Partial<Record<PartSlot, THREE.Object3D>>
  /** Pristine worn-item GLB scenes by itemId. */
  itemScenes?: Partial<Record<string, THREE.Object3D>>
  /** The 11-clip set as a gltf-transform Document (caller loads via NodeIO/WebIO). */
  clipsDocument: Document
  /** Atlas PNG bytes for the character's atlasId (eye/pupil/brow/mouth). */
  atlasPngs: Record<'eye' | 'pupil' | 'brow' | 'mouth', Uint8Array>
  /** Palette-mask PNG bytes per material region (body/ears/muzzle/tail/claws). */
  maskPngsByRegion?: Partial<Record<Region, Uint8Array>>
}

export interface CompileOptions {
  /** Lossless meshopt (EXT_meshopt_compression) on geometry/morphs/anim. Default true. */
  compress?: boolean
}

export interface CompileResult {
  glb: Uint8Array
  stats: CompileStats
}

export interface CompileStats {
  triangles: number
  nodes: number
  meshes: number
  skins: number
  clips: string[]
  textureBytes: number
  totalBytes: number
  compressed: boolean
  /** True when totalBytes exceeds the 8 MB budget (plan step 2). */
  overBudget: boolean
}

export const EIGHT_MB = 8 * 1024 * 1024
export const CELL_UV = 0.25
/** Canonical reference hips rest local (clips are authored on it). */
const REFERENCE_HIPS_LOCAL = [0, 0.34, 0] as const
const REGIONS: Region[] = ['body', 'ears', 'muzzle', 'tail', 'claws']

type FacePart = 'eyeWhiteL' | 'eyeWhiteR' | 'pupilL' | 'pupilR' | 'browL' | 'browR' | 'mouth'

// --- compiler -----------------------------------------------------------------

export async function compileCharacter(
  spec: CharacterSpec,
  assets: CompileAssets,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const compress = options.compress ?? true

  // 1) Canonical assembly (reuse the studio path). Assembly's toon materials
  //    are ignored — glTF materials are authored from the spec below.
  const assembled = assembleCharacter(spec, PART_REGISTRY, {
    bodyScene: assets.bodyScene,
    partScenes: assets.partScenes,
    texturesByRegion: {},
  } satisfies LoadedAssets)

  // 2) Dress (wardrobe rides the same skeleton; item spring chains merge in).
  let springChains = assembled.springChains
  const itemMeshSet = new Set<THREE.Mesh>()
  const worn = resolveWornItems(spec.wardrobe, WARDROBE_REGISTRY).items
  if (worn.length > 0 && assets.itemScenes) {
    const dressed = applyWardrobe(
      assembled,
      spec.wardrobe,
      WARDROBE_REGISTRY,
      { itemScenes: assets.itemScenes },
      { archetype: spec.meta.archetype, palette: spec.palette, bodyMorphs: spec.anatomy.bodyMorphs },
    )
    springChains = dressed.springChains
    for (const meshes of Object.values(dressed.itemMeshes)) for (const m of meshes) itemMeshSet.add(m)
  }

  // 3) Bake sculpt deltas (base + delta) into the position attributes.
  bakeSculpt(spec, assets, assembled.root)
  assembled.root.updateWorldMatrix(true, true)

  // 4) Build the glTF Document.
  const doc = new GltfDocument()
  doc.createBuffer()
  const scene = doc.createScene(spec.meta.name)
  doc.getRoot().setDefaultScene(scene)
  const characterRoot = doc.createNode('characterRoot')
  scene.addChild(characterRoot)

  const boneNodes = buildBoneNodes(doc, assembled.root, characterRoot)
  const skinByKey = new Map<string, Skin>()
  const materials = buildRegionMaterials(doc, spec)

  for (const mesh of collectMeshes(assembled.root)) {
    addRegionMesh(doc, mesh, boneNodes, skinByKey, characterRoot, materials)
  }

  // 5) Drawn-face planes.
  const face = buildFacePlanes(doc, spec, assembled, assets.atlasPngs, boneNodes)

  // 6) Animations (11 clips, hips-rebased for this archetype).
  const hips = assembled.boneByName.get('hips')?.position
  const clipNames = buildAnimations(doc, assets.clipsDocument, boneNodes, {
    from: REFERENCE_HIPS_LOCAL,
    to: hips ? [hips.x, hips.y, hips.z] : REFERENCE_HIPS_LOCAL,
  })

  // 7) SEN_companion — recorded now (node/texture lists are final; meshopt
  //    only rewrites buffer views, never the node/texture property lists).
  const senData = buildSenCompanion(doc, spec, {
    springChains,
    colliderGroups: assembled.colliderGroups,
    boneNodes,
    face,
    clipNames,
  })
  doc.createExtension(SENCompanionExtension).setData(senData)

  // 8) Compress + write + validate.
  if (compress) {
    await MeshoptEncoder.ready
    doc.createExtension(EXTMeshoptCompression).setRequired(true)
  }
  const glb = await writeGlb(doc, compress)
  await validateRoundTrip(glb, compress)

  return { glb, stats: computeStats(doc, glb, clipNames, compress) }
}

// --- assembly helpers ---------------------------------------------------------

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

function bakeSculpt(spec: CharacterSpec, assets: CompileAssets, root: THREE.Object3D): void {
  if (!spec.anatomy.sculptDelta) return
  const archetype = spec.meta.archetype
  const uniformScale = ARCHETYPES_DEF[archetype].uniformScale
  const sources: SculptTargetSource[] = [
    {
      assetId: `body-${archetype}`,
      scene: assets.bodyScene,
      meshVersion: meshVersionOf(BODY_REGISTRY[archetype]),
      weldSpace: 'body',
      localToWorldScale: 1,
    },
  ]
  for (const [slot, entry] of Object.entries(spec.anatomy.parts)) {
    if (!entry) continue
    const def = getPart(entry.partId)
    const partScene = assets.partScenes[slot as PartSlot]
    if (!def || def.url === null || !partScene) continue
    sources.push({
      assetId: entry.partId,
      scene: partScene,
      meshVersion: meshVersionOf(def),
      weldSpace: entry.partId,
      localToWorldScale: uniformScale,
    })
  }
  const targets = collectSculptTargets(root, sources)
  syncTargetsToPayload(targets, spec.anatomy.sculptDelta) // writes base+delta into positions
}

// --- glTF translation ---------------------------------------------------------

/** Build one glTF node per live Bone (canonical + grafted wardrobe bones),
 * mirroring the hierarchy. The skeleton ROOT bone folds any non-bone ancestor
 * (rig/Scene) transform into its own world matrix, so glTF joint-world ==
 * three bone-world exactly. */
function buildBoneNodes(doc: Document, root: THREE.Object3D, characterRoot: GNode): Map<string, GNode> {
  const bones: THREE.Object3D[] = []
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o)
  })
  const nodes = new Map<string, GNode>()
  for (const bone of bones) {
    if (nodes.has(bone.name)) continue
    nodes.set(bone.name, doc.createNode(bone.name))
  }
  const scratch = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), m: new THREE.Matrix4() }
  for (const bone of bones) {
    const node = nodes.get(bone.name)!
    const parentIsBone = (bone.parent as THREE.Bone | null)?.isBone === true
    if (parentIsBone) {
      node.setTranslation([bone.position.x, bone.position.y, bone.position.z])
      node.setRotation([bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w])
      node.setScale([bone.scale.x, bone.scale.y, bone.scale.z])
      nodes.get(bone.parent!.name)!.addChild(node)
    } else {
      // Root bone: bake full world so no ancestor transform is lost.
      scratch.m.fromArray(bone.matrixWorld.elements).decompose(scratch.p, scratch.q, scratch.s)
      node.setTranslation([scratch.p.x, scratch.p.y, scratch.p.z])
      node.setRotation([scratch.q.x, scratch.q.y, scratch.q.z, scratch.q.w])
      node.setScale([scratch.s.x, scratch.s.y, scratch.s.z])
      characterRoot.addChild(node)
    }
  }
  return nodes
}

const TypedArrayOf = (attr: THREE.BufferAttribute) =>
  attr.array.constructor as { new (a: ArrayLike<number>): ArrayBufferView }

function accessor(
  doc: Document,
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4',
  array: ArrayBufferView,
) {
  return doc.createAccessor().setBuffer(doc.getRoot().listBuffers()[0]).setType(type).setArray(array as never)
}

function attributeAccessor(doc: Document, attr: THREE.BufferAttribute, type: 'VEC2' | 'VEC3' | 'VEC4') {
  const Typed = TypedArrayOf(attr)
  return accessor(doc, type, new Typed(attr.array as unknown as ArrayLike<number>))
}

function getOrBuildSkin(doc: Document, skeleton: THREE.Skeleton, boneNodes: Map<string, GNode>, cache: Map<string, Skin>): Skin {
  const names = skeleton.bones.map((b) => b.name).join(',')
  let hash = 0
  for (const inv of skeleton.boneInverses) for (const e of inv.elements) hash = (hash * 31 + Math.round(e * 1e5)) | 0
  const key = `${names}|${hash}`
  const cached = cache.get(key)
  if (cached) return cached

  const skin = doc.createSkin()
  const ibm = new Float32Array(skeleton.boneInverses.length * 16)
  skeleton.boneInverses.forEach((inv, i) => ibm.set(inv.elements, i * 16))
  skin.setInverseBindMatrices(accessor(doc, 'MAT4', ibm))
  for (const bone of skeleton.bones) {
    const node = boneNodes.get(bone.name)
    if (!node) throw new Error(`compile: skin references unknown bone "${bone.name}"`)
    skin.addJoint(node)
  }
  const rootJoint = boneNodes.get('root')
  if (rootJoint) skin.setSkeleton(rootJoint)
  cache.set(key, skin)
  return skin
}

function addRegionMesh(
  doc: Document,
  mesh: THREE.Mesh,
  boneNodes: Map<string, GNode>,
  skinByKey: Map<string, Skin>,
  characterRoot: GNode,
  materials: Map<Region, Material>,
): void {
  const geom = mesh.geometry
  const position = geom.getAttribute('position') as THREE.BufferAttribute
  const normal = geom.getAttribute('normal') as THREE.BufferAttribute | undefined
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute | undefined
  const paletteChannels = geom.getAttribute('paletteChannels') as THREE.BufferAttribute | undefined
  const index = geom.getIndex()

  const prim = doc.createPrimitive()
  prim.setAttribute('POSITION', attributeAccessor(doc, position, 'VEC3'))
  if (normal) prim.setAttribute('NORMAL', attributeAccessor(doc, normal, 'VEC3'))
  if (uv) prim.setAttribute('TEXCOORD_0', attributeAccessor(doc, uv, 'VEC2'))
  if (paletteChannels) {
    if (paletteChannels.itemSize !== 4) {
      throw new Error(`compile: mesh "${mesh.name}" paletteChannels itemSize ${paletteChannels.itemSize}; expected 4`)
    }
    if (paletteChannels.count !== position.count) {
      throw new Error(
        `compile: mesh "${mesh.name}" paletteChannels count ${paletteChannels.count}; expected ${position.count}`,
      )
    }
    const color = attributeAccessor(doc, paletteChannels, 'VEC4')
    color.setNormalized(paletteChannels.normalized)
    prim.setAttribute('COLOR_0', color)
  }
  if (index) prim.setIndices(accessor(doc, 'SCALAR', new (TypedArrayOf(index))(index.array as unknown as ArrayLike<number>)))

  const skinned = mesh as THREE.SkinnedMesh
  const isSkinned = skinned.isSkinnedMesh === true
  if (isSkinned) {
    prim.setAttribute('JOINTS_0', attributeAccessor(doc, geom.getAttribute('skinIndex') as THREE.BufferAttribute, 'VEC4'))
    prim.setAttribute('WEIGHTS_0', attributeAccessor(doc, geom.getAttribute('skinWeight') as THREE.BufferAttribute, 'VEC4'))
  }

  const region = (mesh.userData.region as Region) ?? 'body'
  prim.setMaterial(materials.get(region) ?? materials.get('body')!)

  const gmesh = doc.createMesh(mesh.name)
  const morphPos = geom.morphAttributes.position
  const morphNorm = geom.morphAttributes.normal
  const dict = mesh.morphTargetDictionary
  if (morphPos && morphPos.length > 0 && dict) {
    const names = Object.entries(dict)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name)
    for (let i = 0; i < morphPos.length; i++) {
      const target = doc.createPrimitiveTarget(names[i])
      target.setAttribute('POSITION', attributeAccessor(doc, morphPos[i] as THREE.BufferAttribute, 'VEC3'))
      if (morphNorm?.[i]) target.setAttribute('NORMAL', attributeAccessor(doc, morphNorm[i] as THREE.BufferAttribute, 'VEC3'))
      prim.addTarget(target)
    }
    gmesh.setExtras({ targetNames: names })
    gmesh.setWeights([...(mesh.morphTargetInfluences ?? new Array(names.length).fill(0))])
  }
  gmesh.addPrimitive(prim)

  const node = doc.createNode(mesh.name).setMesh(gmesh)
  if (isSkinned) {
    node.setSkin(getOrBuildSkin(doc, skinned.skeleton, boneNodes, skinByKey))
    characterRoot.addChild(node) // skinned-mesh node transform is ignored by glTF
  } else {
    node.setTranslation([mesh.position.x, mesh.position.y, mesh.position.z])
    node.setRotation([mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w])
    node.setScale([mesh.scale.x, mesh.scale.y, mesh.scale.z])
    ;(boneNodes.get(mesh.parent?.name ?? '') ?? characterRoot).addChild(node)
  }
}

// --- materials ----------------------------------------------------------------

/** PBR fallback per region (flat palette-primary baseColor). The real toon
 * recipe travels in SEN_companion.materialsMeta for the runtime to rebuild. */
function buildRegionMaterials(doc: Document, spec: CharacterSpec): Map<Region, Material> {
  const map = new Map<Region, Material>()
  const [r, g, b] = hexToLinear(spec.palette.primary)
  for (const region of REGIONS) {
    map.set(
      region,
      doc.createMaterial(`region-${region}`).setBaseColorFactor([r, g, b, 1]).setMetallicFactor(0).setRoughnessFactor(0.9),
    )
  }
  return map
}

// --- face planes --------------------------------------------------------------

interface FaceBuildResult {
  planeNodes: Map<FacePart, GNode>
  atlasTextures: Record<'eye' | 'pupil' | 'brow' | 'mouth', Texture>
}

function buildFacePlanes(
  doc: Document,
  spec: CharacterSpec,
  assembled: AssembledCharacter,
  atlasPngs: CompileAssets['atlasPngs'],
  boneNodes: Map<string, GNode>,
): FaceBuildResult {
  const headNode = boneNodes.get('head')
  if (!headNode) throw new Error('compile: no head bone node for face planes')

  const head = archetypeHead(spec.meta.archetype)
  const headRadius = assembled.headRadius * 1.07 // CharacterRoot pads the face radius
  const p: FacePlacement = { ...DEFAULT_PLACEMENT, mouthRadialOffset: assembled.mouthRadialOffset }

  const faceAnchor = doc.createNode('faceAnchor').setTranslation([head.center[0], head.center[1], head.center[2]])
  headNode.addChild(faceAnchor)

  const unlit = doc.createExtension(KHRMaterialsUnlit)
  const transformExt = doc.createExtension(KHRTextureTransform)
  const atlasTextures = {
    eye: embedPngTexture(doc, 'atlas-eye', atlasPngs.eye),
    pupil: embedPngTexture(doc, 'atlas-pupil', atlasPngs.pupil),
    brow: embedPngTexture(doc, 'atlas-brow', atlasPngs.brow),
    mouth: embedPngTexture(doc, 'atlas-mouth', atlasPngs.mouth),
  }

  const preset: { eyeL: string; eyeR: string; brow: string; mouth: string } =
    EXPRESSION_PRESETS[spec.face.expression as ExpressionName] ?? EXPRESSION_PRESETS.neutral
  const base = FACE_LAYER_RADIAL_OFFSET
  const above = base + FACE_LAYER_RADIAL_STEP
  const planeNodes = new Map<FacePart, GNode>()

  const addPlane = (
    part: FacePart,
    atlas: Texture,
    cell: AtlasCell,
    azimuth: number,
    elevation: number,
    width: number,
    height: number,
    radial: number,
    mirrorU: boolean,
  ) => {
    const geom = makeFacePlaneGeometry(headRadius, width, height, radial, mirrorU)
    const prim = doc.createPrimitive()
    prim.setAttribute('POSITION', attributeAccessor(doc, geom.getAttribute('position') as THREE.BufferAttribute, 'VEC3'))
    prim.setAttribute('NORMAL', attributeAccessor(doc, geom.getAttribute('normal') as THREE.BufferAttribute, 'VEC3'))
    prim.setAttribute('TEXCOORD_0', attributeAccessor(doc, geom.getAttribute('uv') as THREE.BufferAttribute, 'VEC2'))
    const idx = geom.getIndex() as THREE.BufferAttribute
    prim.setIndices(accessor(doc, 'SCALAR', new (TypedArrayOf(idx))(idx.array as unknown as ArrayLike<number>)))

    const mat = doc
      .createMaterial(`face-${part}`)
      .setBaseColorFactor([1, 1, 1, 1])
      .setBaseColorTexture(atlas)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.01)
    mat.setExtension('KHR_materials_unlit', unlit.createUnlit())
    assignCellTexture(doc, transformExt, mat.getBaseColorTextureInfo() as TextureInfo, cell, CELL_UV)
    prim.setMaterial(mat)

    const euler = new THREE.Euler(-elevation, azimuth, 0, 'YXZ')
    const q = new THREE.Quaternion().setFromEuler(euler)
    const node = doc
      .createNode(part)
      .setMesh(doc.createMesh(part).addPrimitive(prim))
      .setRotation([q.x, q.y, q.z, q.w])
    faceAnchor.addChild(node)
    planeNodes.set(part, node)
    return node
  }

  addPlane('eyeWhiteL', atlasTextures.eye, EYE_CELLS[preset.eyeL as keyof typeof EYE_CELLS], -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, false)
  addPlane('eyeWhiteR', atlasTextures.eye, EYE_CELLS[preset.eyeR as keyof typeof EYE_CELLS], p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, true)
  addPlane('pupilL', atlasTextures.pupil, PUPIL_CELLS.round, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, false)
  addPlane('pupilR', atlasTextures.pupil, PUPIL_CELLS.round, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, true)
  addPlane('browL', atlasTextures.brow, BROW_CELLS[preset.brow as keyof typeof BROW_CELLS], -p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, false)
  addPlane('browR', atlasTextures.brow, BROW_CELLS[preset.brow as keyof typeof BROW_CELLS], p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, true)
  if (!assembled.hideMouth) {
    addPlane('mouth', atlasTextures.mouth, MOUTH_CELLS[preset.mouth as keyof typeof MOUTH_CELLS], 0, p.mouthElevation, p.mouthWidth, p.mouthHeight, base + p.mouthRadialOffset, false)
  }

  return { planeNodes, atlasTextures }
}

// --- animations ---------------------------------------------------------------

interface HipsRebase {
  from: readonly [number, number, number]
  to: readonly [number, number, number]
}

function buildAnimations(doc: Document, clipsDoc: Document, boneNodes: Map<string, GNode>, hips: HipsRebase): string[] {
  const names: string[] = []
  const buffer = doc.getRoot().listBuffers()[0]
  const deltaScale = hips.from[1] !== 0 ? hips.to[1] / hips.from[1] : 1

  for (const srcAnim of clipsDoc.getRoot().listAnimations()) {
    const anim = doc.createAnimation(srcAnim.getName())
    for (const srcChannel of srcAnim.listChannels()) {
      const targetNode = srcChannel.getTargetNode()
      const path = srcChannel.getTargetPath()
      const srcSampler = srcChannel.getSampler()
      if (!targetNode || !path || !srcSampler) continue
      const boneName = targetNode.getName()
      const node = boneNodes.get(boneName)
      if (!node) continue // clip targets a bone we don't have (unlikely) — skip
      const input = srcSampler.getInput()
      const output = srcSampler.getOutput()
      if (!input || !output) continue

      const times = new Float32Array(input.getArray() as ArrayLike<number>)
      const values = new Float32Array(output.getArray() as ArrayLike<number>)
      if (path === 'translation' && boneName === 'hips') {
        for (let i = 0; i < values.length; i += 3) {
          values[i] = hips.to[0] + (values[i] - hips.from[0]) * deltaScale
          values[i + 1] = hips.to[1] + (values[i + 1] - hips.from[1]) * deltaScale
          values[i + 2] = hips.to[2] + (values[i + 2] - hips.from[2]) * deltaScale
        }
      }
      const sampler = doc
        .createAnimationSampler()
        .setInput(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(times))
        .setOutput(doc.createAccessor().setBuffer(buffer).setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(values))
        .setInterpolation(srcSampler.getInterpolation())
      anim.addSampler(sampler)
      anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler))
    }
    names.push(srcAnim.getName())
  }
  return names
}

// --- SEN_companion ------------------------------------------------------------

interface SenBuildInputs {
  springChains: SenCompanionData['springRig']
  colliderGroups: SenCompanionData['colliderGroups']
  boneNodes: Map<string, GNode>
  face: FaceBuildResult
  clipNames: string[]
}

function buildSenCompanion(doc: Document, spec: CharacterSpec, inputs: SenBuildInputs): SenCompanionData {
  const nodeList = doc.getRoot().listNodes()
  const texList = doc.getRoot().listTextures()
  const nodeIndex = (n: GNode) => nodeList.indexOf(n)
  const texIndex = (t: Texture) => texList.indexOf(t)

  const boneNodeIndices: Record<string, number> = {}
  for (const [name, node] of inputs.boneNodes) boneNodeIndices[name] = nodeIndex(node)

  const planeNodeIndices: Record<string, number> = {}
  for (const [part, node] of inputs.face.planeNodes) planeNodeIndices[part] = nodeIndex(node)

  return {
    extVersion: SEN_COMPANION_EXT_VERSION,
    character: {
      id: spec.meta.id,
      name: spec.meta.name,
      archetype: spec.meta.archetype,
      personality: spec.meta.personality,
    },
    springRig: inputs.springChains,
    colliderGroups: inputs.colliderGroups,
    boneNodeIndices,
    face: {
      planeNodeIndices,
      atlasTextureIndices: {
        eye: texIndex(inputs.face.atlasTextures.eye),
        pupil: texIndex(inputs.face.atlasTextures.pupil),
        brow: texIndex(inputs.face.atlasTextures.brow),
        mouth: texIndex(inputs.face.atlasTextures.mouth),
      },
      cellMaps: {
        eye: cellMap(EYE_CELLS),
        mouth: cellMap(MOUTH_CELLS),
        brow: cellMap(BROW_CELLS),
        pupil: cellMap(PUPIL_CELLS),
      },
      eyeCellsWithoutPupil: [...EYE_CELLS_WITHOUT_PUPIL],
      expressionPresets: Object.fromEntries(
        Object.entries(EXPRESSION_PRESETS).map(([k, v]) => [k, { ...v }]),
      ) as SenCompanionData['face']['expressionPresets'],
      mirroredPlanes: ['eyeWhiteR', 'pupilR', 'browR'],
      defaultExpression: EXPRESSION_PRESETS[spec.face.expression as ExpressionName] ? spec.face.expression : 'neutral',
      cellUv: CELL_UV,
      gazeMaxOffset: GAZE_MAX,
      pupilCell: 'round',
      blink: { meanIntervalS: spec.face.blink.meanIntervalS, enabled: spec.face.blink.enabled },
      gaze: { mode: spec.face.gaze.mode, intensity: spec.face.gaze.intensity },
    },
    procedural: { ...spec.motion.procedural },
    palette: { ...spec.palette },
    materialsMeta: Object.fromEntries(
      REGIONS.map((region) => {
        const a = spec.materials[region]
        return [region, { rampSoftness: a?.rampSoftness ?? 0.2, rimStrength: a?.rimStrength ?? 0.3, shadowTint: a?.shadowTint ?? '#b8a8c8', outline: a?.outline, maskTextureIndex: null }]
      }),
    ),
    clips: { setId: spec.motion.clipSetId, names: inputs.clipNames },
    studioLook: spec.studioLook ?? null,
  }
}

function cellMap(cells: Record<string, AtlasCell>): Record<string, [number, number]> {
  return Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, [v[0], v[1]]]))
}

// --- IO -----------------------------------------------------------------------

function baseIO(): WebIO {
  return new WebIO().registerExtensions([SENCompanionExtension, KHRMaterialsUnlit, KHRTextureTransform, EXTMeshoptCompression])
}

async function writeGlb(doc: Document, compress: boolean): Promise<Uint8Array> {
  const io = baseIO()
  if (compress) io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  return io.writeBinary(doc)
}

/** Round-trip the written GLB to prove it re-parses (SEN_companion validates,
 * meshopt decodes). Throws on any structural failure. */
async function validateRoundTrip(glb: Uint8Array, compressed: boolean): Promise<void> {
  const io = baseIO()
  if (compressed) {
    await MeshoptDecoder.ready
    io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  }
  const doc = await io.readBinary(glb)
  const ext = doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'SEN_companion') as SENCompanionExtension | undefined
  if (!ext?.getData()) throw new Error('compile: written GLB failed to round-trip SEN_companion')
  if (doc.getRoot().listAnimations().length === 0) throw new Error('compile: written GLB has no animations')
}

function computeStats(doc: Document, glb: Uint8Array, clipNames: string[], compressed: boolean): CompileStats {
  let triangles = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      const pos = prim.getAttribute('POSITION')
      triangles += (idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3
    }
  }
  let textureBytes = 0
  for (const tex of doc.getRoot().listTextures()) textureBytes += tex.getImage()?.byteLength ?? 0
  return {
    triangles: Math.round(triangles),
    nodes: doc.getRoot().listNodes().length,
    meshes: doc.getRoot().listMeshes().length,
    skins: doc.getRoot().listSkins().length,
    clips: clipNames,
    textureBytes,
    totalBytes: glb.byteLength,
    compressed,
    overBudget: glb.byteLength > EIGHT_MB,
  }
}

export { faceCellTransform }
