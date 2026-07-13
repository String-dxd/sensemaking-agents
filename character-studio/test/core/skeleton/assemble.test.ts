import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { assembleCharacter, type LoadedAssets, mergeSpringChains } from '../../../src/core/skeleton/assemble'
import { archetypeHead, ARCHETYPES_DEF, buildArchetypeSkeleton } from '../../../src/core/skeleton/archetypes'
import { buildSkeleton } from '../../../src/core/skeleton/canonical'
import type { PartDef } from '../../../src/core/skeleton/partRegistry'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import type { Archetype, CharacterSpec } from '../../../src/core/spec/schema'

// --- stub registry -----------------------------------------------------------

const STUB_REGISTRY: Record<string, PartDef> = {
  'stub-ears': {
    slot: 'ears',
    label: 'Stub ears',
    url: 'stub://ears.glb',
    maskUrl: null,
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: ['earL.1', 'earL.2', 'earR.1', 'earR.2'],
    morphs: ['length', 'width'],
    springProfile: { stiffness: 0.1, gravityPower: 44, gravityDir: [0, -1, 0], dragForce: 0.2, hitRadius: 0.02 },
  },
  'stub-muzzle': {
    slot: 'muzzle',
    label: 'Stub muzzle',
    url: 'stub://muzzle.glb',
    maskUrl: null,
    region: 'muzzle',
    classes: ['mammal'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    mouthOffset: 0.1,
  },
  'stub-beak': {
    slot: 'muzzle',
    label: 'Stub beak',
    url: 'stub://beak.glb',
    maskUrl: null,
    region: 'muzzle',
    classes: ['bird'],
    attachTo: ['socket.muzzle'],
    morphs: [],
    hidesMouth: true,
  },
  'stub-none': {
    slot: 'claws',
    label: 'None',
    url: null,
    maskUrl: null,
    region: 'claws',
    classes: ['mammal', 'bird'],
    morphs: [],
  },
}

// --- stub assets ---------------------------------------------------------------

function geometryWithMorphs(morphNames: string[], boneIndex = 0): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([boneIndex, 0, 0, 0, boneIndex, 0, 0, 0, boneIndex, 0, 0, 0], 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  geometry.morphAttributes.position = morphNames.map((name) => {
    const attr = new THREE.Float32BufferAttribute(new Float32Array(9), 3)
    attr.name = name
    return attr
  })
  return geometry
}

/** Body GLB stand-in: archetype-proportioned canonical rig + one SkinnedMesh. */
function stubBodyScene(archetype: Archetype): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, skeleton } = buildArchetypeSkeleton(archetype)
  scene.add(bones[0])
  const mesh = new THREE.SkinnedMesh(geometryWithMorphs(['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall']), new THREE.MeshBasicMaterial())
  mesh.name = 'body'
  mesh.bind(skeleton)
  mesh.updateMorphTargets()
  scene.add(mesh)
  return scene
}

/** Skinned ear part stand-in: reference-space mini rig, canonical bone names. */
function stubEarScene(): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, skeleton, boneByName } = buildSkeleton() // reference space
  scene.add(bones[0])
  const mesh = new THREE.SkinnedMesh(
    geometryWithMorphs(['length', 'width'], skeleton.bones.findIndex((b) => b.name === 'earL.1')),
    new THREE.MeshBasicMaterial(),
  )
  mesh.name = 'ears'
  mesh.bind(skeleton)
  mesh.updateMorphTargets()
  scene.add(mesh)
  expect(boneByName.get('earL.1')).toBeDefined()
  return scene
}

function stubSkinnedColorScene(name: string, boneName: string, colorItemSize = 4): THREE.Object3D {
  const scene = new THREE.Group()
  const { bones, skeleton } = buildSkeleton()
  scene.add(bones[0])
  const boneIndex = skeleton.bones.findIndex((bone) => bone.name === boneName)
  const geometry = geometryWithMorphs([], boneIndex)
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(3 * colorItemSize).fill(0.25), colorItemSize),
  )
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
  mesh.name = name
  mesh.bind(skeleton)
  scene.add(mesh)
  return scene
}

function stubRigidScene(name: string, attachBone: string, morphs: string[]): THREE.Object3D {
  const scene = new THREE.Group()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.morphAttributes.position = morphs.map((n) => {
    const attr = new THREE.Float32BufferAttribute(new Float32Array(9), 3)
    attr.name = n
    return attr
  })
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.name = name
  mesh.userData.attachBone = attachBone
  mesh.updateMorphTargets()
  scene.add(mesh)
  return scene
}

function stubAssets(archetype: Archetype): LoadedAssets {
  return {
    bodyScene: stubBodyScene(archetype),
    partScenes: {
      ears: stubEarScene(),
      muzzle: stubRigidScene('muzzle', 'socket.muzzle', ['length']),
    },
  }
}

function specWith(archetype: Archetype, parts: CharacterSpec['anatomy']['parts']): CharacterSpec {
  const spec = createDefaultCharacter(archetype)
  spec.anatomy.parts = parts
  return spec
}

// --- tests -----------------------------------------------------------------------

describe('assembleCharacter', () => {
  it('builds the full character: skeleton, face anchor, region materials', () => {
    const spec = specWith('biped-round', {
      ears: { partId: 'stub-ears', morphs: { length: 0.7 } },
      muzzle: { partId: 'stub-muzzle', morphs: { length: 0.4 } },
      claws: { partId: 'stub-none', morphs: {} },
    })
    const assembled = assembleCharacter(spec, STUB_REGISTRY, stubAssets('biped-round'))

    expect(assembled.boneByName.size).toBe(38)
    expect(assembled.faceAnchor.parent?.name).toBe('head')
    const head = archetypeHead('biped-round')
    expect(assembled.faceAnchor.position.y).toBeCloseTo(head.center[1], 6)
    expect(assembled.headRadius).toBeCloseTo(head.radius, 6)
    expect(assembled.regionMaterials.body).toBeDefined()
    expect(assembled.regionMaterials.ears).toBeDefined()
    expect(assembled.regionMaterials.muzzle).toBeDefined()
    expect(assembled.hideMouth).toBe(false)
    expect(assembled.mouthRadialOffset).toBeCloseTo(0.1 * ARCHETYPES_DEF['biped-round'].uniformScale, 6)
  })

  it('zeroes loader-defaulted morph influences before applying the spec (weights=1 GLB bug)', () => {
    const spec = specWith('biped-round', {})
    spec.anatomy.bodyMorphs = { bellyRound: 0.4 }
    const assets = stubAssets('biped-round')
    // simulate GLTFLoader initializing influences from glTF weights=[1,1,...]
    const pristineBody = assets.bodyScene.getObjectByName('body') as THREE.SkinnedMesh
    pristineBody.morphTargetInfluences?.fill(1)
    const assembled = assembleCharacter(spec, STUB_REGISTRY, assets)
    const body = assembled.root.getObjectByName('body') as THREE.SkinnedMesh
    const dict = body.morphTargetDictionary ?? {}
    expect(body.morphTargetInfluences?.[dict.bellyRound]).toBeCloseTo(0.4)
    expect(body.morphTargetInfluences?.[dict.chubby]).toBe(0)
    expect(body.morphTargetInfluences?.[dict.headBig]).toBe(0)
  })

  it('applies body and part morph weights by name', () => {
    const spec = specWith('biped-round', {
      ears: { partId: 'stub-ears', morphs: { length: 0.7, width: 0.2 } },
    })
    spec.anatomy.bodyMorphs = { bellyRound: 0.9, headBig: 0.3 }
    const assembled = assembleCharacter(spec, STUB_REGISTRY, stubAssets('biped-round'))

    const body = assembled.root.getObjectByName('body') as THREE.SkinnedMesh
    expect(body.morphTargetInfluences?.[body.morphTargetDictionary?.bellyRound ?? -1]).toBeCloseTo(0.9)
    expect(body.morphTargetInfluences?.[body.morphTargetDictionary?.headBig ?? -1]).toBeCloseTo(0.3)
    const ears = assembled.root.getObjectByName('ears') as THREE.SkinnedMesh
    expect(ears.morphTargetInfluences?.[ears.morphTargetDictionary?.length ?? -1]).toBeCloseTo(0.7)
  })

  it('rebinds skinned parts onto the BODY skeleton with archetype-scaled inverses', () => {
    const spec = specWith('biped-round', { ears: { partId: 'stub-ears', morphs: {} } })
    const assembled = assembleCharacter(spec, STUB_REGISTRY, stubAssets('biped-round'))
    const ears = assembled.root.getObjectByName('ears') as THREE.SkinnedMesh
    expect(ears).toBeDefined()
    // every part-skeleton bone resolved to the body's bone instance
    for (const bone of ears.skeleton.bones) {
      expect(assembled.boneByName.get(bone.name as never)).toBe(bone)
    }
    // inverse binds carry the archetype uniform scale (reference -> archetype)
    const u = ARCHETYPES_DEF['biped-round'].uniformScale
    const earIdx = ears.skeleton.bones.findIndex((b) => b.name === 'earL.1')
    const inv = ears.skeleton.boneInverses[earIdx]
    const scale = new THREE.Vector3()
    inv.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
    expect(scale.x).toBeCloseTo(u, 5)
  })

  it('aliases opted-in authored COLOR_0 weights to paletteChannels', () => {
    const registry: Record<string, PartDef> = {
      'stub-palette-wing': {
        slot: 'wings',
        label: 'Palette wing',
        url: 'stub://palette-wing.glb',
        maskUrl: null,
        region: 'tail',
        classes: ['bird'],
        skinnedTo: ['upperArmL'],
        morphs: [],
        paletteFromVertexColor: true,
      },
    }
    const spec = specWith('bird', { wings: { partId: 'stub-palette-wing', morphs: {} } })
    const assembled = assembleCharacter(spec, registry, {
      bodyScene: stubBodyScene('bird'),
      partScenes: { wings: stubSkinnedColorScene('paletteWing', 'upperArmL') },
    })
    const wing = assembled.root.getObjectByName('paletteWing') as THREE.SkinnedMesh
    expect(wing.geometry.getAttribute('paletteChannels')).toBe(wing.geometry.getAttribute('color'))
    expect(assembled.regionMaterials.tail?.userData.toonDefines.paletteVertex).toBe(true)
  })

  it('does not reinterpret vertex colors on parts without the explicit palette contract', () => {
    const registry: Record<string, PartDef> = {
      'stub-colored-part': {
        slot: 'wings',
        label: 'Ordinary colored part',
        url: 'stub://colored-part.glb',
        maskUrl: null,
        region: 'tail',
        classes: ['bird'],
        skinnedTo: ['upperArmL'],
        morphs: [],
      },
    }
    const spec = specWith('bird', { wings: { partId: 'stub-colored-part', morphs: {} } })
    const assembled = assembleCharacter(spec, registry, {
      bodyScene: stubBodyScene('bird'),
      partScenes: { wings: stubSkinnedColorScene('ordinaryColor', 'upperArmL') },
    })
    const wing = assembled.root.getObjectByName('ordinaryColor') as THREE.SkinnedMesh
    expect(wing.geometry.hasAttribute('color')).toBe(true)
    expect(wing.geometry.hasAttribute('paletteChannels')).toBe(false)
    expect(assembled.regionMaterials.tail?.userData.toonDefines.paletteVertex).toBe(false)
  })

  it('rejects opted-in COLOR_0 attributes that are not RGBA', () => {
    const registry: Record<string, PartDef> = {
      'stub-invalid-palette-wing': {
        slot: 'wings',
        label: 'Invalid palette wing',
        url: 'stub://invalid-palette-wing.glb',
        maskUrl: null,
        region: 'tail',
        classes: ['bird'],
        skinnedTo: ['upperArmL'],
        morphs: [],
        paletteFromVertexColor: true,
      },
    }
    const spec = specWith('bird', { wings: { partId: 'stub-invalid-palette-wing', morphs: {} } })
    expect(() =>
      assembleCharacter(spec, registry, {
        bodyScene: stubBodyScene('bird'),
        partScenes: { wings: stubSkinnedColorScene('invalidPalette', 'upperArmL', 3) },
      }),
    ).toThrow(/COLOR_0 itemSize 3; expected 4/)
  })

  it('parents rigid parts to their attach bone at archetype scale', () => {
    const spec = specWith('biped-round', { muzzle: { partId: 'stub-muzzle', morphs: {} } })
    const assembled = assembleCharacter(spec, STUB_REGISTRY, stubAssets('biped-round'))
    const muzzle = assembled.root.getObjectByName('muzzle') as THREE.Mesh
    expect(muzzle.parent?.name).toBe('socket.muzzle')
    expect(muzzle.scale.x).toBeCloseTo(ARCHETYPES_DEF['biped-round'].uniformScale, 6)
  })

  it('beaks set hideMouth', () => {
    const assets: LoadedAssets = {
      bodyScene: stubBodyScene('bird'),
      partScenes: { muzzle: stubRigidScene('beak', 'socket.muzzle', []) },
    }
    const spec = specWith('bird', { muzzle: { partId: 'stub-beak', morphs: {} } })
    const assembled = assembleCharacter(spec, STUB_REGISTRY, assets)
    expect(assembled.hideMouth).toBe(true)
  })

  it('applies part boneScales to the shared skeleton', () => {
    const spec = specWith('biped-round', {
      ears: { partId: 'stub-ears', morphs: {}, boneScales: { 'earL.1': { x: 1.5, y: 2, z: 1.5 } } },
    })
    const assembled = assembleCharacter(spec, STUB_REGISTRY, stubAssets('biped-round'))
    const ear = assembled.boneByName.get('earL.1')
    expect(ear?.scale.y).toBeCloseTo(2)
  })

  it('throws on a body scene missing canonical bones', () => {
    const spec = specWith('biped-round', {})
    const badBody = new THREE.Group()
    const bone = new THREE.Bone()
    bone.name = 'not-a-canonical-bone'
    badBody.add(bone)
    const mesh = new THREE.SkinnedMesh(geometryWithMorphs([]), new THREE.MeshBasicMaterial())
    mesh.bind(new THREE.Skeleton([bone]))
    badBody.add(mesh)
    expect(() => assembleCharacter(spec, STUB_REGISTRY, { bodyScene: badBody, partScenes: {} })).toThrow(/missing canonical bone/)
  })

  it('dispose releases the materials assembly created (geometry stays shared)', () => {
    const spec = specWith('biped-round', { ears: { partId: 'stub-ears', morphs: {} } })
    const assets = stubAssets('biped-round')
    const assembled = assembleCharacter(spec, STUB_REGISTRY, assets)
    const disposed: string[] = []
    for (const [region, material] of Object.entries(assembled.regionMaterials)) {
      material?.addEventListener('dispose', () => disposed.push(region))
    }
    const geometryBefore = (assets.bodyScene.getObjectByName('body') as THREE.Mesh).geometry
    assembled.dispose()
    expect(disposed.sort()).toEqual(Object.keys(assembled.regionMaterials).sort())
    // pristine asset geometry untouched (shared, reused by the next assembly)
    expect(geometryBefore.attributes.position).toBeDefined()
  })
})

describe('mergeSpringChains', () => {
  const profile = STUB_REGISTRY['stub-ears'].springProfile
  if (!profile) throw new Error('stub profile missing')

  it('overrides covering chains with the part profile', () => {
    const spec = createDefaultCharacter('biped-round')
    const merged = mergeSpringChains(spec.motion.springRig, [{ def: STUB_REGISTRY['stub-ears'] }])
    const earChains = merged.filter((c) => c.boneNames[0].startsWith('ear'))
    expect(earChains).toHaveLength(2)
    for (const chain of earChains) {
      for (const joint of chain.joints) {
        expect(joint.stiffness).toBeCloseTo(profile.stiffness)
        expect(joint.gravityPower).toBeCloseTo(profile.gravityPower)
      }
    }
    // tail chain untouched
    const tail = merged.find((c) => c.boneNames[0] === 'tail.1')
    expect(tail?.joints[0].stiffness).not.toBeCloseTo(profile.stiffness)
  })

  it('synthesizes canonical chains when the spec rig lacks them (bird + ears)', () => {
    const spec = createDefaultCharacter('bird') // bird default rig: tail only
    const merged = mergeSpringChains(spec.motion.springRig, [{ def: STUB_REGISTRY['stub-ears'] }])
    const earChains = merged.filter((c) => c.boneNames[0].startsWith('ear'))
    expect(earChains).toHaveLength(2)
    expect(earChains[0].colliderGroupRefs).toContain('head')
    expect(earChains[0].joints).toHaveLength(2)
  })

  it('does not mutate the input rig', () => {
    const spec = createDefaultCharacter('biped-round')
    const before = JSON.stringify(spec.motion.springRig)
    mergeSpringChains(spec.motion.springRig, [{ def: STUB_REGISTRY['stub-ears'] }])
    expect(JSON.stringify(spec.motion.springRig)).toBe(before)
  })
})
