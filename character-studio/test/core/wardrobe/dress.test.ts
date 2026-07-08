// Dressing pass tests (plan 008, step 3) — stub scenes in the assemble.test
// style: no loaders, no React, pure three. Covers the six plan cases: slot
// conflicts, earMode under/replace, hideBodyRegions, spring-chain merging,
// and the fully restorative undress round-trip.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { hexToLinear } from '../../../src/core/materials'
import { createSpringRig } from '../../../src/core/motion/springSolver'
import { archetypeColliderGroups, ARCHETYPES_DEF } from '../../../src/core/skeleton/archetypes'
import { buildArchetypeSkeleton, buildSkeleton } from '../../../src/core/skeleton'
import { assembleCharacter, type LoadedAssets } from '../../../src/core/skeleton/assemble'
import type { PartDef } from '../../../src/core/skeleton/partRegistry'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import type { CharacterSpec, WornItem } from '../../../src/core/spec/schema'
import {
  applyWardrobe,
  type DressOptions,
  EAR_FLATTEN_SCALE,
  resolveWornItems,
  type WardrobeAssets,
} from '../../../src/core/wardrobe/dress'
import { buildWardrobeRegistry } from '../../../src/core/wardrobe/itemRegistry'

const U = ARCHETYPES_DEF['biped-round'].uniformScale

// --- stub wardrobe registry ------------------------------------------------------

const joint = { stiffness: 0.2, gravityPower: 20, gravityDir: [0, -1, 0] as [number, number, number], dragForce: 0.1, hitRadius: 0.02 }

const STUB_WARDROBE = buildWardrobeRegistry({
  cap: {
    slot: 'headwear',
    label: 'Cap',
    url: 'stub://cap.glb',
    maskUrl: null,
    attach: 'socket',
    socket: 'socket.hat',
    earModes: ['under', 'through'],
    paletteSlots: ['primary'],
    morphs: [],
  },
  crown: {
    slot: 'headwear',
    label: 'Crown (replace ears)',
    url: 'stub://crown.glb',
    maskUrl: null,
    attach: 'socket',
    socket: 'socket.hat',
    earModes: ['replace'],
    paletteSlots: ['primary'],
    morphs: [],
  },
  tee: {
    slot: 'top',
    label: 'Tee',
    url: 'stub://tee.glb',
    maskUrl: null,
    attach: 'skinned',
    hideBodyRegions: ['torso', 'hips'],
    paletteSlots: ['primary'],
    morphs: ['bellyRound'],
  },
  onesie: {
    slot: 'outfit',
    label: 'Onesie',
    url: 'stub://onesie.glb',
    maskUrl: null,
    attach: 'skinned',
    hideBodyRegions: ['torso', 'hips', 'upperLegs'],
    paletteSlots: ['primary'],
    morphs: [],
  },
  scarf: {
    slot: 'neck',
    label: 'Scarf',
    url: 'stub://scarf.glb',
    maskUrl: null,
    attach: 'skinned',
    springChains: [{ name: 'scarfEndA', boneNames: ['scarfA1', 'scarfA2'], joints: [joint, joint], colliderGroupRefs: [] }],
    paletteSlots: ['primary'],
    morphs: [],
  },
  pack: {
    slot: 'back',
    label: 'Pack',
    url: 'stub://pack.glb',
    maskUrl: null,
    attach: 'mixed',
    socket: 'socket.back',
    springChains: [{ name: 'packStrapA', boneNames: ['packA1', 'packA2'], joints: [joint, joint], colliderGroupRefs: [] }],
    paletteSlots: ['primary'],
    morphs: [],
  },
  mug: {
    slot: 'handheldL',
    label: 'Mug',
    url: 'stub://mug.glb',
    maskUrl: null,
    attach: 'socket',
    socket: 'socket.handL',
    paletteSlots: ['primary'],
    morphs: [],
  },
})

// --- stub assembled character -------------------------------------------------------

const STUB_PARTS: Record<string, PartDef> = {
  'stub-ears': {
    slot: 'ears',
    label: 'Stub ears',
    url: 'stub://ears.glb',
    maskUrl: null,
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: ['earL.1', 'earL.2', 'earR.1', 'earR.2'],
    morphs: [],
  },
}

function skinnedTriangle(skeleton: THREE.Skeleton, boneName: string, morphNames: string[] = []): THREE.SkinnedMesh {
  const boneIndex = Math.max(0, skeleton.bones.findIndex((b) => b.name === boneName))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([boneIndex, 0, 0, 0, boneIndex, 0, 0, 0, boneIndex, 0, 0, 0], 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  geometry.morphAttributes.position = morphNames.map((name) => {
    const attr = new THREE.Float32BufferAttribute(new Float32Array(9), 3)
    attr.name = name
    return attr
  })
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
  mesh.bind(skeleton)
  mesh.updateMorphTargets()
  return mesh
}

/** Body stand-in with plan-008 hide-region submeshes (bodyRegion extras). */
function stubBodyScene(): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, skeleton } = buildArchetypeSkeleton('biped-round')
  scene.add(bones[0])
  const body = skinnedTriangle(skeleton, 'hips', ['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'])
  body.name = 'body'
  scene.add(body)
  for (const region of ['torso', 'hips', 'upperLegs']) {
    const sub = skinnedTriangle(skeleton, 'hips', ['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'])
    sub.name = `body_${region}`
    sub.userData.bodyRegion = region
    scene.add(sub)
  }
  return scene
}

function stubEarScene(): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, skeleton } = buildSkeleton()
  scene.add(bones[0])
  const mesh = skinnedTriangle(skeleton, 'earL.1')
  mesh.name = 'ears'
  scene.add(mesh)
  return scene
}

function assemble(): { assembled: ReturnType<typeof assembleCharacter>; spec: CharacterSpec } {
  const spec = createDefaultCharacter('biped-round')
  spec.anatomy.parts = { ears: { partId: 'stub-ears', morphs: {} } }
  const assets: LoadedAssets = { bodyScene: stubBodyScene(), partScenes: { ears: stubEarScene() } }
  return { assembled: assembleCharacter(spec, STUB_PARTS, assets), spec }
}

// --- stub item scenes -----------------------------------------------------------------

function rigidItemScene(name: string, attachBone: string): THREE.Object3D {
  const scene = new THREE.Group()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.name = name
  mesh.userData.attachBone = attachBone
  scene.add(mesh)
  return scene
}

/** Skinned garment stand-in on the reference rig, optionally with item-internal
 * spring bones (chained under `itemBoneParent`) the mesh is weighted to. */
function skinnedItemScene(
  name: string,
  weightBone: string,
  itemBones: Array<{ name: string; parent: string; offset: [number, number, number] }> = [],
  morphNames: string[] = [],
  withRigid?: { name: string; attachBone: string },
): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, boneByName } = buildSkeleton()
  scene.add(bones[0])
  const allBones = [...bones]
  const byName = new Map<string, THREE.Bone>(bones.map((b) => [b.name, b as THREE.Bone]))
  for (const spec of itemBones) {
    const bone = new THREE.Bone()
    bone.name = spec.name
    bone.position.set(...spec.offset)
    const parent = byName.get(spec.parent)
    if (!parent) throw new Error(`stub: unknown parent ${spec.parent}`)
    parent.add(bone)
    byName.set(spec.name, bone)
    allBones.push(bone)
  }
  expect(boneByName.get('chest')).toBeDefined()
  scene.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(allBones as THREE.Bone[])
  const mesh = skinnedTriangle(skeleton, weightBone, morphNames)
  mesh.name = name
  scene.add(mesh)
  if (withRigid) {
    const rigid = rigidItemScene(withRigid.name, withRigid.attachBone)
    scene.add(rigid.children[0])
  }
  return scene
}

function stubAssets(): WardrobeAssets {
  return {
    itemScenes: {
      cap: rigidItemScene('cap', 'socket.hat'),
      crown: rigidItemScene('crown', 'socket.hat'),
      mug: rigidItemScene('mug', 'socket.handL'),
      tee: skinnedItemScene('tee', 'chest', [], ['bellyRound']),
      onesie: skinnedItemScene('onesie', 'chest'),
      scarf: skinnedItemScene('scarf', 'scarfA1', [
        { name: 'scarfA1', parent: 'chest', offset: [0.04, 0.1, 0.1] },
        { name: 'scarfA2', parent: 'scarfA1', offset: [0, -0.05, 0] },
      ]),
      pack: skinnedItemScene(
        'packTails',
        'packA1',
        [
          { name: 'packA1', parent: 'socket.back', offset: [0.05, -0.08, -0.02] },
          { name: 'packA2', parent: 'packA1', offset: [0, -0.05, 0] },
        ],
        [],
        { name: 'pack', attachBone: 'socket.back' },
      ),
    },
  }
}

const OPTIONS: DressOptions = {
  archetype: 'biped-round',
  palette: createDefaultCharacter('biped-round').palette,
}

function worn(itemId: string, extra: Partial<WornItem> = {}): WornItem {
  return { slot: STUB_WARDROBE[itemId as keyof typeof STUB_WARDROBE]?.slot ?? 'headwear', itemId, ...extra }
}

// --- resolution -------------------------------------------------------------------------

describe('resolveWornItems', () => {
  it('resolves one item per slot, last wins with a warning', () => {
    const { items, warnings } = resolveWornItems([worn('cap'), worn('crown')], STUB_WARDROBE)
    expect(items.map((i) => i.itemId)).toEqual(['crown'])
    expect(warnings.some((w) => w.includes('slot conflict') && w.includes('cap'))).toBe(true)
  })

  it('outfit occupies top+bottom in both directions', () => {
    const outfitLast = resolveWornItems([worn('tee'), worn('onesie')], STUB_WARDROBE)
    expect(outfitLast.items.map((i) => i.itemId)).toEqual(['onesie'])
    const topLast = resolveWornItems([worn('onesie'), worn('tee')], STUB_WARDROBE)
    expect(topLast.items.map((i) => i.itemId)).toEqual(['tee'])
    expect(topLast.warnings.some((w) => w.includes('onesie'))).toBe(true)
  })

  it('skips unknown items and clamps earMode to the supported list', () => {
    const { items, warnings } = resolveWornItems(
      [worn('no-such-item'), worn('cap', { earMode: 'replace' }), worn('mug', { earMode: 'under' })],
      STUB_WARDROBE,
    )
    expect(items.map((i) => i.itemId)).toEqual(['cap', 'mug'])
    expect(items[0].earMode).toBe('under') // cap default, replace unsupported
    expect(items[1].earMode).toBeNull() // mug is not ear-aware
    expect(warnings.some((w) => w.includes('no-such-item'))).toBe(true)
    expect(warnings.some((w) => w.includes('does not support earMode'))).toBe(true)
    expect(warnings.some((w) => w.includes('not ear-aware'))).toBe(true)
  })
})

// --- dressing --------------------------------------------------------------------------

describe('applyWardrobe', () => {
  it('parents rigid items to their socket; boneScales flow through shared bones (scaled head + cap)', () => {
    const { assembled } = assemble()
    const head = assembled.boneByName.get('head')
    if (!head) throw new Error('no head bone')
    head.scale.set(1.4, 1.4, 1.4)
    const dressed = applyWardrobe(assembled, [worn('cap')], STUB_WARDROBE, stubAssets(), OPTIONS)
    const cap = assembled.root.getObjectByName('cap') as THREE.Mesh
    expect(cap.parent?.name).toBe('socket.hat')
    expect(cap.scale.x).toBeCloseTo(U, 6)
    assembled.root.updateMatrixWorld(true)
    const worldScale = cap.getWorldScale(new THREE.Vector3())
    expect(worldScale.x).toBeCloseTo(1.4 * U, 5) // head scale carries the hat
    expect(dressed.warnings).toEqual([])
  })

  it('rebinds skinned garments onto the LIVE body skeleton with archetype-scaled inverses', () => {
    const { assembled } = assemble()
    applyWardrobe(assembled, [worn('tee')], STUB_WARDROBE, stubAssets(), OPTIONS)
    const tee = assembled.root.getObjectByName('tee') as THREE.SkinnedMesh
    expect(tee.isSkinnedMesh).toBe(true)
    for (const bone of tee.skeleton.bones) {
      expect(assembled.boneByName.get(bone.name as never), bone.name).toBe(bone)
    }
    const chestIdx = tee.skeleton.bones.findIndex((b) => b.name === 'chest')
    const scale = new THREE.Vector3()
    tee.skeleton.boneInverses[chestIdx].decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
    expect(scale.x).toBeCloseTo(U, 5)
  })

  it('earMode under flattens ear roots (flag for the mounting layer); undress restores', () => {
    const { assembled } = assemble()
    const earL = assembled.boneByName.get('earL.1')
    if (!earL) throw new Error('no ear bone')
    earL.scale.set(1.2, 1.2, 1.2)
    const dressed = applyWardrobe(assembled, [worn('cap', { earMode: 'under' })], STUB_WARDROBE, stubAssets(), OPTIONS)
    expect(earL.scale.y).toBeCloseTo(1.2 * EAR_FLATTEN_SCALE, 6)
    expect(earL.userData.wardrobeFlatten).toBe(EAR_FLATTEN_SCALE)
    dressed.undress()
    expect(earL.scale.y).toBeCloseTo(1.2, 6)
    expect(earL.userData.wardrobeFlatten).toBeUndefined()
  })

  it('earMode replace hides the body ear meshes; through leaves them alone', () => {
    const { assembled } = assemble()
    const earMeshes = assembled.regionMeshes.ears ?? []
    expect(earMeshes.length).toBeGreaterThan(0)
    const dressed = applyWardrobe(assembled, [worn('crown')], STUB_WARDROBE, stubAssets(), OPTIONS)
    expect(earMeshes.every((m) => !m.visible)).toBe(true)
    expect(assembled.boneByName.get('earL.1')?.scale.x).toBeCloseTo(1, 6) // not flattened
    dressed.undress()
    expect(earMeshes.every((m) => m.visible)).toBe(true)

    const through = applyWardrobe(assembled, [worn('cap', { earMode: 'through' })], STUB_WARDROBE, stubAssets(), OPTIONS)
    expect(earMeshes.every((m) => m.visible)).toBe(true)
    expect(assembled.boneByName.get('earL.1')?.scale.x).toBeCloseTo(1, 6)
    through.undress()
  })

  it('hideBodyRegions toggles exactly the tagged submeshes; undress restores', () => {
    const { assembled } = assemble()
    const byRegion = (region: string) => assembled.root.getObjectByName(`body_${region}`) as THREE.Mesh
    const dressed = applyWardrobe(assembled, [worn('tee')], STUB_WARDROBE, stubAssets(), OPTIONS)
    expect(dressed.hiddenRegions.sort()).toEqual(['hips', 'torso'])
    expect(byRegion('torso').visible).toBe(false)
    expect(byRegion('hips').visible).toBe(false)
    expect(byRegion('upperLegs').visible).toBe(true)
    expect((assembled.root.getObjectByName('body') as THREE.Mesh).visible).toBe(true)
    dressed.undress()
    expect(byRegion('torso').visible).toBe(true)
    expect(byRegion('hips').visible).toBe(true)
  })

  it('grafts item spring bones and merges item chains into a rig-buildable chain set', () => {
    const { assembled } = assemble()
    const dressed = applyWardrobe(assembled, [worn('scarf'), worn('pack')], STUB_WARDROBE, stubAssets(), OPTIONS)

    const chainNames = dressed.springChains.map((c) => c.name)
    expect(chainNames).toEqual(expect.arrayContaining(['scarfEndA', 'packStrapA']))
    expect(dressed.springChains.length).toBe(assembled.springChains.length + 2)

    // grafted under the live skeleton, offsets scaled reference → archetype
    const scarfA1 = assembled.root.getObjectByName('scarfA1') as THREE.Bone
    expect(scarfA1.parent).toBe(assembled.boneByName.get('chest'))
    expect(scarfA1.position.y).toBeCloseTo(0.1 * U, 6)
    const scarfA2 = assembled.root.getObjectByName('scarfA2') as THREE.Bone
    expect(scarfA2.parent).toBe(scarfA1)

    // the real solver accepts the merged chain set on the dressed skeleton
    const rig = createSpringRig(assembled.root, dressed.springChains, archetypeColliderGroups('biped-round'))
    expect(rig.getParticles('scarfEndA')).toHaveLength(2)
    rig.dispose()

    // mixed item: rigid pack on the socket AND skinned tails on the rig
    expect((assembled.root.getObjectByName('pack') as THREE.Mesh).parent?.name).toBe('socket.back')
    expect((assembled.root.getObjectByName('packTails') as THREE.SkinnedMesh).isSkinnedMesh).toBe(true)
    dressed.undress()
  })

  it('undress is fully restorative and redress does not leak chains or bones', () => {
    const { assembled } = assemble()
    const outfit: WornItem[] = [worn('cap', { earMode: 'under' }), worn('tee'), worn('scarf'), worn('pack'), worn('mug')]

    const socketHat = assembled.boneByName.get('socket.hat')
    const chest = assembled.boneByName.get('chest')
    if (!socketHat || !chest) throw new Error('missing bones')
    const before = {
      rootChildren: assembled.root.children.length,
      hatChildren: socketHat.children.length,
      chestChildren: chest.children.length,
      earScale: assembled.boneByName.get('earL.1')?.scale.x,
      visible: [
        (assembled.root.getObjectByName('body_torso') as THREE.Mesh).visible,
        (assembled.regionMeshes.ears ?? []).map((m) => m.visible),
      ],
      chainCount: assembled.springChains.length,
    }

    const first = applyWardrobe(assembled, outfit, STUB_WARDROBE, stubAssets(), OPTIONS)
    const disposed: string[] = []
    for (const [id, material] of Object.entries(first.itemMaterials)) {
      material.addEventListener('dispose', () => disposed.push(id))
    }
    first.undress()
    first.undress() // idempotent

    expect(assembled.root.children.length).toBe(before.rootChildren)
    expect(socketHat.children.length).toBe(before.hatChildren)
    expect(chest.children.length).toBe(before.chestChildren)
    expect(assembled.boneByName.get('earL.1')?.scale.x).toBeCloseTo(before.earScale ?? 1, 6)
    expect((assembled.root.getObjectByName('body_torso') as THREE.Mesh).visible).toBe(true)
    expect(assembled.root.getObjectByName('scarfA1')).toBeUndefined()
    expect(assembled.springChains.length).toBe(before.chainCount) // never mutated
    expect(disposed.sort()).toEqual(Object.keys(first.itemMaterials).sort())

    // redress: same chain total, no duplicated grafts
    const second = applyWardrobe(assembled, outfit, STUB_WARDROBE, stubAssets(), OPTIONS)
    expect(second.springChains.length).toBe(first.springChains.length)
    expect(assembled.root.children.filter((c) => c.name === 'scarf')).toHaveLength(1)
    const graftCount: string[] = []
    assembled.root.traverse((o) => {
      if (o.name === 'scarfA1') graftCount.push(o.name)
    })
    expect(graftCount).toHaveLength(1)
    second.undress()
  })

  it('applies bodyMorphs to garments and paletteOverrides to item materials', () => {
    const { assembled } = assemble()
    const dressed = applyWardrobe(
      assembled,
      [worn('tee', { paletteOverrides: { primary: '#112233' } })],
      STUB_WARDROBE,
      stubAssets(),
      { ...OPTIONS, bodyMorphs: { bellyRound: 0.8 } },
    )
    const tee = assembled.root.getObjectByName('tee') as THREE.SkinnedMesh
    expect(tee.morphTargetInfluences?.[tee.morphTargetDictionary?.bellyRound ?? -1]).toBeCloseTo(0.8)

    const material = dressed.itemMaterials.tee
    const expected = new THREE.Color().setRGB(...hexToLinear('#112233'), THREE.LinearSRGBColorSpace)
    expect(material.color.getHex()).toBe(expected.getHex())
    expect(tee.material).toBe(material)
    dressed.undress()
  })
})
