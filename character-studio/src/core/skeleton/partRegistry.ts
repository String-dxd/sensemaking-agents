// Anatomy-part registry (plan 006, step 3) — the typed catalog every panel
// picker and the assembler consume. Adding a part = drop a GLB (authored per
// src/assets/anatomy/ASSET-CONTRACT.md) + one entry here; no other code.
//
// Attachment modes:
//   - skinned  (`skinnedTo`): the GLB contains a SkinnedMesh bound to those
//     canonical bones; assembly rebinds it onto the live body skeleton.
//   - rigid    (`attachTo`): every mesh in the GLB is parented to a bone;
//     multi-attach GLBs tag meshes via the `attachBone` glTF extra
//     (exported from a Blender custom property). Rigid meshes are authored
//     with their origin at the attach bone's rest position.
//   - empty    (`url: null`): a legitimate "none" choice (mitten hands have
//     no claw mesh; most characters have no crest).

import type * as THREE from 'three'
import type { SpringJointParams } from '../motion/springTypes'
import { buildProceduralBody } from '../procgen/body'
import { buildProceduralPart } from '../procgen/parts'
import type { BoneName, PartSlot, Region } from '../spec/schema'

/** Taxonomy classes a part is anatomically legal for (species wave). */
export const ANIMAL_CLASSES = ['mammal', 'bird'] as const
export type AnimalClass = (typeof ANIMAL_CLASSES)[number]

/**
 * Where an asset's THREE scene comes from (plan 012 D2 / plan 013 step 4).
 * The GLB lane survives until each wave's deletion step; bodies + anatomy parts
 * are procedural after plan 013. The two runtime loaders route per-def:
 * `CharacterRoot.tsx` (studio) and `companionExport.ts` (export).
 */
export type AssetSource =
  | { kind: 'glb'; url: string }
  | { kind: 'procedural'; build: () => THREE.Object3D }

export interface PartDef {
  slot: PartSlot
  /** Panel display name. */
  label: string
  /** GLB asset URL (Vite-resolved); null for empty parts. */
  url: string | null
  /** Channel-packed palette mask (R/G/B/A → primary/secondary/belly/accentA); null → flat primary. */
  maskUrl: string | null
  /** Material region this part's meshes belong to (spec.materials key). */
  region: Region
  /** Taxonomy classes this part is anatomically legal for. */
  classes: readonly AnimalClass[]
  /** Canonical bones a SkinnedMesh in this GLB is bound to. */
  skinnedTo?: readonly BoneName[]
  /** Bones/sockets rigid meshes in this GLB attach to. */
  attachTo?: readonly BoneName[]
  /** Morph target (shape key) names this part exposes as sliders. */
  morphs: readonly string[]
  /**
   * If set, the spring chains covering this part's bones get these joint
   * params (floppy ears springier than upright ones). Skinned parts only.
   */
  springProfile?: SpringJointParams
  /** Beaks ARE the mouth — hide the drawn mouth plane while equipped. */
  hidesMouth?: boolean
  /**
   * Muzzles only: extra radial offset (reference-space m) pushing the drawn
   * mouth plane out to float on the muzzle front (FacePlacement.mouthRadialOffset).
   */
  mouthOffset?: number
  /**
   * ASSET-CONTRACT `baseMeshVersion` (plan 009): bump when a shipped mesh's
   * topology (vertex count) changes — saved sculpt deltas for the old
   * version then refuse to load, loudly. Defaults to DEFAULT_MESH_VERSION.
   */
  meshVersion?: number
  /**
   * Asset scene source (plan 013 step 4). Procedural for every non-empty part;
   * absent for empty parts (`url: null`). The runtime loaders route per-def.
   */
  source?: AssetSource
}

/** Contract version assumed when a def doesn't declare `meshVersion`. */
export const DEFAULT_MESH_VERSION = 1

export function meshVersionOf(def: { meshVersion?: number }): number {
  return def.meshVersion ?? DEFAULT_MESH_VERSION
}

const EAR_BONES = ['earL.1', 'earL.2', 'earR.1', 'earR.2'] as const satisfies readonly BoneName[]
const TAIL_BONES = ['tail.1', 'tail.2', 'tail.3', 'tail.4'] as const satisfies readonly BoneName[]

const spring = (
  stiffness: number,
  gravityPower: number,
  dragForce: number,
  hitRadius = 0.02,
): SpringJointParams => ({ stiffness, gravityPower, gravityDir: [0, -1, 0], dragForce, hitRadius })

const partUrl = (file: string) => new URL(`../../assets/anatomy/parts/${file}`, import.meta.url).href
const maskUrl = (file: string) => new URL(`../../assets/anatomy/textures/${file}`, import.meta.url).href

export const PART_REGISTRY = {
  // --- ears (skinned to the ear chains) ----------------------------------
  'upright-pointy': {
    slot: 'ears',
    label: 'Upright pointy',
    url: partUrl('ears-upright-pointy.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('upright-pointy') },
    maskUrl: maskUrl('part-ears-upright-pointy.mask.png'),
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: EAR_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.5, 12, 0.1),
  },
  'floppy-long': {
    slot: 'ears',
    label: 'Floppy long',
    url: partUrl('ears-floppy-long.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('floppy-long') },
    maskUrl: maskUrl('part-ears-floppy-long.mask.png'),
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: EAR_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.12, 40, 0.15),
  },
  'round-bear': {
    slot: 'ears',
    label: 'Round bear',
    url: partUrl('ears-round-bear.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('round-bear') },
    maskUrl: maskUrl('part-ears-round-bear.mask.png'),
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: EAR_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.45, 10, 0.1),
  },
  'bunny-tall': {
    slot: 'ears',
    label: 'Bunny tall',
    url: partUrl('ears-bunny-tall.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('bunny-tall') },
    maskUrl: maskUrl('part-ears-bunny-tall.mask.png'),
    region: 'ears',
    classes: ['mammal'],
    skinnedTo: EAR_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.18, 32, 0.13),
  },

  // --- muzzles / beaks (rigid on socket.muzzle) --------------------------
  'short-cat': {
    slot: 'muzzle',
    label: 'Short cat',
    url: partUrl('muzzle-short-cat.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('short-cat') },
    maskUrl: maskUrl('part-muzzle-short-cat.mask.png'),
    region: 'muzzle',
    classes: ['mammal'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    mouthOffset: 0.09,
  },
  'boxy-dog': {
    slot: 'muzzle',
    label: 'Boxy dog',
    url: partUrl('muzzle-boxy-dog.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('boxy-dog') },
    maskUrl: maskUrl('part-muzzle-boxy-dog.mask.png'),
    region: 'muzzle',
    classes: ['mammal'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    mouthOffset: 0.14,
  },
  'beak-small': {
    slot: 'muzzle',
    label: 'Small beak',
    url: partUrl('muzzle-beak-small.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('beak-small') },
    maskUrl: maskUrl('part-muzzle-beak-small.mask.png'),
    region: 'muzzle',
    classes: ['bird'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    hidesMouth: true,
  },
  'beak-round': {
    slot: 'muzzle',
    label: 'Round beak',
    url: partUrl('muzzle-beak-round.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('beak-round') },
    maskUrl: maskUrl('part-muzzle-beak-round.mask.png'),
    region: 'muzzle',
    classes: ['bird'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    hidesMouth: true,
  },
  'beak-hooked': {
    slot: 'muzzle',
    label: 'Hooked beak',
    url: partUrl('muzzle-beak-hooked.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('beak-hooked') },
    maskUrl: maskUrl('part-muzzle-beak-hooked.mask.png'),
    region: 'muzzle',
    classes: ['bird'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    hidesMouth: true,
  },
  'bill-duck': {
    slot: 'muzzle',
    label: 'Duck bill',
    url: partUrl('muzzle-bill-duck.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('bill-duck') },
    maskUrl: maskUrl('part-muzzle-bill-duck.mask.png'),
    region: 'muzzle',
    classes: ['bird'],
    attachTo: ['socket.muzzle'],
    morphs: ['length'],
    hidesMouth: true,
  },

  // --- tails (skinned to the tail chain) ----------------------------------
  'curl-shiba': {
    slot: 'tail',
    label: 'Shiba curl',
    url: partUrl('tail-curl-shiba.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('curl-shiba') },
    maskUrl: maskUrl('part-tail-curl-shiba.mask.png'),
    region: 'tail',
    classes: ['mammal'],
    skinnedTo: TAIL_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.45, 14, 0.1),
  },
  'fluff-fox': {
    slot: 'tail',
    label: 'Fox fluff',
    url: partUrl('tail-fluff-fox.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('fluff-fox') },
    maskUrl: maskUrl('part-tail-fluff-fox.mask.png'),
    region: 'tail',
    classes: ['mammal'],
    skinnedTo: TAIL_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.22, 26, 0.12),
  },
  'slim-cat': {
    slot: 'tail',
    label: 'Slim cat',
    url: partUrl('tail-slim-cat.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('slim-cat') },
    maskUrl: maskUrl('part-tail-slim-cat.mask.png'),
    region: 'tail',
    classes: ['mammal'],
    skinnedTo: TAIL_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.3, 18, 0.1),
  },
  'stub-round': {
    slot: 'tail',
    label: 'Round stub',
    url: partUrl('tail-stub-round.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('stub-round') },
    maskUrl: maskUrl('part-tail-stub-round.mask.png'),
    region: 'tail',
    classes: ['mammal'],
    skinnedTo: TAIL_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.55, 10, 0.1),
  },
  'feather-fan': {
    slot: 'tail',
    label: 'Feather fan',
    url: partUrl('tail-feather-fan.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('feather-fan') },
    maskUrl: maskUrl('part-tail-feather-fan.mask.png'),
    region: 'tail',
    classes: ['bird'],
    skinnedTo: TAIL_BONES,
    morphs: ['length', 'width'],
    springProfile: spring(0.3, 20, 0.12),
  },

  // --- claws (rigid on hand/foot bones) -----------------------------------
  'mitten-none': {
    slot: 'claws',
    label: 'Mittens (none)',
    url: null,
    maskUrl: null,
    region: 'claws',
    classes: ['mammal', 'bird'],
    morphs: [],
  },
  'stub-claws': {
    slot: 'claws',
    label: 'Stub claws',
    url: partUrl('claws-stub.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('stub-claws') },
    maskUrl: maskUrl('part-claws-stub.mask.png'),
    region: 'claws',
    classes: ['mammal', 'bird'],
    attachTo: ['handL', 'handR', 'footL', 'footR'],
    morphs: [],
  },

  // --- crests (rigid on the head-top socket). Region note: REGIONS has no
  // `crest` entry (plan-004 schema) — crests are head plumage and share the
  // `ears` material region.
  none: {
    slot: 'crest',
    label: 'None',
    url: null,
    maskUrl: null,
    region: 'ears',
    classes: ['mammal', 'bird'],
    morphs: [],
  },
  'feather-tuft': {
    slot: 'crest',
    label: 'Feather tuft',
    url: partUrl('crest-feather-tuft.glb'),
    source: { kind: 'procedural', build: () => buildProceduralPart('feather-tuft') },
    maskUrl: maskUrl('part-crest-feather-tuft.mask.png'),
    region: 'ears',
    classes: ['bird'],
    attachTo: ['socket.hat'],
    morphs: [],
  },
} as const satisfies Record<string, PartDef>

export type PartId = keyof typeof PART_REGISTRY

export const PART_IDS = Object.keys(PART_REGISTRY) as PartId[]

/** Part ids for one slot, registry order (panel picker rows). Optionally
 * filtered to parts anatomically legal for `animalClass`. */
export function partsForSlot(slot: PartSlot, animalClass?: AnimalClass): PartId[] {
  return PART_IDS.filter(
    (id) =>
      PART_REGISTRY[id].slot === slot &&
      (animalClass === undefined ||
        (PART_REGISTRY[id].classes as readonly AnimalClass[]).includes(animalClass)),
  )
}

export function getPart(partId: string): PartDef | null {
  return (PART_REGISTRY as Record<string, PartDef>)[partId] ?? null
}

// --- archetype bodies --------------------------------------------------------

export interface BodyDef {
  /** GLB with the full canonical skeleton + skinned body mesh. */
  url: string
  maskUrl: string
  /** Body morph target names (shared contract across archetypes). */
  morphs: readonly string[]
  /** ASSET-CONTRACT `baseMeshVersion` (see PartDef.meshVersion). */
  meshVersion?: number
  /** Asset scene source (plan 013 step 4) — procedural for every archetype. */
  source?: AssetSource
}

export const BODY_MORPHS = ['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'] as const

const bodyUrl = (file: string) => new URL(`../../assets/anatomy/${file}`, import.meta.url).href

export const BODY_REGISTRY: Record<'biped-round' | 'biped-slim' | 'bird', BodyDef> = {
  'biped-round': {
    url: bodyUrl('body-biped-round.glb'),
    maskUrl: maskUrl('body-biped-round.mask.png'),
    morphs: BODY_MORPHS,
    meshVersion: 4, // plan 013: procedural stitched-shell topology (new vertex layout — v3 sculpt deltas refuse loudly)
    source: { kind: 'procedural', build: () => buildProceduralBody('biped-round').scene },
  },
  'biped-slim': {
    url: bodyUrl('body-biped-slim.glb'),
    maskUrl: maskUrl('body-biped-slim.mask.png'),
    morphs: BODY_MORPHS,
    meshVersion: 4, // plan 013: procedural stitched-shell topology (new vertex layout — v3 sculpt deltas refuse loudly)
    source: { kind: 'procedural', build: () => buildProceduralBody('biped-slim').scene },
  },
  bird: {
    url: bodyUrl('body-bird.glb'),
    maskUrl: maskUrl('body-bird.mask.png'),
    morphs: BODY_MORPHS,
    meshVersion: 5, // plan 017: AC bird anatomy (wing paddle, tarsus, toe fan)
    source: { kind: 'procedural', build: () => buildProceduralBody('bird').scene },
  },
}
