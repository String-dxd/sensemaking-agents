// Species taxonomy registry (plan 008, step 3) — the curated Core-8 presets
// that make "pick Shiba" produce a recognizable shiba with zero slider work.
//
// A SpeciesDef is a class → group → species leaf plus a full anatomy/palette
// loadout. `createCharacterFromSpecies` (below) overlays a preset onto
// `createDefaultCharacter`'s output.
//
// The Core-8 preset data below encodes the AC:NH benchmark decisions from
// the operator dogfooding pass — copied verbatim from plan 008, not
// re-derived. One row still carries a declared placeholder pending a later
// plan:
//   - tabby-cat's tail uses `fluff-fox` at a slim width (.1) as a stand-in;
//     plan 011 ships a dedicated `tail-slim-cat` part and updates this row.
// (plan 010 resolved the owl/duckling beaks: owl now uses `beak-hooked`,
//  duckling `bill-duck`; the three bird species also carry `patternId`.)

import type { AnimalClass } from '../skeleton/partRegistry'
import { createDefaultCharacter } from '../spec/defaults'
import { type Archetype, type BoneName, type BoneScale, type CharacterSpec, CharacterSpecSchema, type Personality } from '../spec/schema'

export type { AnimalClass }
export { ANIMAL_CLASSES } from '../skeleton/partRegistry'

/** 2nd-level filter (operator's "bird of prey / ostrich" tier). */
export const SPECIES_GROUPS = [
  'canine',
  'feline',
  'lagomorph',
  'ursid', // mammal
  'songbird',
  'raptor',
  'waterfowl', // bird
] as const
export type SpeciesGroup = (typeof SPECIES_GROUPS)[number]

export interface SpeciesDef {
  id: string
  label: string
  class: AnimalClass
  group: SpeciesGroup
  archetype: Archetype
  /** Per-slot part loadout (same shape as CharacterSpec anatomy.parts values). */
  parts: CharacterSpec['anatomy']['parts']
  bodyMorphs: Record<string, number>
  /** Optional curated bone scales, keyed like PartEntry.boneScales — attach
   * to the part entry of the slot named in `boneScaleSlot`. */
  boneScales?: Partial<Record<BoneName, BoneScale>>
  boneScaleSlot?: 'muzzle' | 'ears' | 'tail' | 'claws'
  palette: CharacterSpec['palette']
  /** Body pattern-mask id (plans 010/011 supply the assets); undefined = plain authored mask. */
  patternId?: string
  personality: Personality
}

export const SPECIES_REGISTRY = {
  shiba: {
    id: 'shiba',
    label: 'Shiba',
    class: 'mammal',
    group: 'canine',
    archetype: 'biped-round',
    parts: {
      ears: { partId: 'upright-pointy', morphs: { length: 0.35, width: 0.45 } },
      muzzle: { partId: 'boxy-dog', morphs: { length: 0.4 } },
      tail: { partId: 'curl-shiba', morphs: {} },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.35, chubby: 0.25 },
    patternId: 'pattern-shiba',
    palette: {
      primary: '#e8a15c',
      secondary: '#d98f4a',
      belly: '#fdf1e0',
      accentA: '#8a5a34',
      accentB: '#3a2a20',
      padsNose: '#4a3328',
    },
    personality: 'cheerful',
  },
  'tabby-cat': {
    id: 'tabby-cat',
    label: 'Tabby Cat',
    class: 'mammal',
    group: 'feline',
    archetype: 'biped-slim',
    parts: {
      ears: { partId: 'upright-pointy', morphs: { length: 0.25, width: 0.35 } },
      muzzle: { partId: 'short-cat', morphs: { length: 0.25 } },
      tail: { partId: 'slim-cat', morphs: { length: 0.4, width: 0.2 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { slim: 0.3 },
    patternId: 'pattern-tabby',
    palette: {
      primary: '#e2954f',
      secondary: '#c97a3a',
      belly: '#f7ead8',
      accentA: '#9c5a28',
      accentB: '#3a2a20',
      padsNose: '#d98a80',
    },
    personality: 'calm',
  },
  rabbit: {
    id: 'rabbit',
    label: 'Rabbit',
    class: 'mammal',
    group: 'lagomorph',
    archetype: 'biped-slim',
    parts: {
      ears: { partId: 'bunny-tall', morphs: { length: 0.5, width: 0.3 } },
      muzzle: { partId: 'short-cat', morphs: { length: 0.05 } },
      tail: { partId: 'stub-round', morphs: { width: 0.3 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { headBig: 0.2 },
    patternId: 'pattern-rabbit',
    palette: {
      primary: '#efe6da',
      secondary: '#dccbb8',
      belly: '#fdf8f0',
      accentA: '#cf9f8f',
      accentB: '#8a7a68',
      padsNose: '#e0958f',
    },
    personality: 'gentle',
  },
  'bear-cub': {
    id: 'bear-cub',
    label: 'Bear Cub',
    class: 'mammal',
    group: 'ursid',
    archetype: 'biped-round',
    parts: {
      ears: { partId: 'round-bear', morphs: { width: 0.5 } },
      muzzle: { partId: 'boxy-dog', morphs: { length: 0.15 } },
      tail: { partId: 'stub-round', morphs: {} },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { chubby: 0.5, bellyRound: 0.4 },
    boneScales: { head: { x: 1.05, y: 1.05, z: 1.05 } },
    boneScaleSlot: 'muzzle',
    patternId: 'pattern-bear',
    palette: {
      primary: '#8a5f3f',
      secondary: '#7a5236',
      belly: '#d9b98f',
      accentA: '#5f3f28',
      accentB: '#3a2a20',
      padsNose: '#3a2a20',
    },
    personality: 'calm',
  },
  fox: {
    id: 'fox',
    label: 'Fox',
    class: 'mammal',
    group: 'canine',
    archetype: 'biped-slim',
    parts: {
      ears: { partId: 'upright-pointy', morphs: { length: 0.45, width: 0.25 } },
      muzzle: { partId: 'short-cat', morphs: { length: 0.5 } },
      tail: { partId: 'fluff-fox', morphs: { length: 0.4, width: 0.6 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { slim: 0.35 },
    patternId: 'pattern-fox',
    palette: {
      primary: '#e07b39',
      secondary: '#c9662c',
      belly: '#fbf3e6',
      accentA: '#3d2c22',
      accentB: '#f7efe2',
      padsNose: '#2e2019',
    },
    personality: 'mischievous',
  },
  robin: {
    id: 'robin',
    label: 'Robin',
    class: 'bird',
    group: 'songbird',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-small', morphs: { length: 0.3 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.3 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.3 },
    patternId: 'pattern-robin',
    palette: {
      primary: '#8a6f5a',
      secondary: '#6f5847',
      belly: '#e2653f',
      accentA: '#e8b23a',
      accentB: '#4a3a2e',
      padsNose: '#5a4636',
    },
    personality: 'cheerful',
  },
  owl: {
    id: 'owl',
    label: 'Owl',
    class: 'bird',
    group: 'raptor',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-hooked', morphs: { length: 0.3 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.15 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'feather-tuft', morphs: {} },
    },
    bodyMorphs: { chubby: 0.4, headBig: 0.35 },
    patternId: 'pattern-owl',
    palette: {
      primary: '#a08363',
      secondary: '#7d6248',
      belly: '#ead9bd',
      accentA: '#c9a23a',
      accentB: '#55422f',
      padsNose: '#5a4636',
    },
    personality: 'proud',
  },
  duckling: {
    id: 'duckling',
    label: 'Duckling',
    class: 'bird',
    group: 'waterfowl',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'bill-duck', morphs: { length: 0.4 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.1 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.45 },
    patternId: 'pattern-duckling',
    palette: {
      primary: '#f2d349',
      secondary: '#e8c53e',
      belly: '#faeaa8',
      accentA: '#e8973a',
      accentB: '#c9a23a',
      padsNose: '#b8742a',
    },
    personality: 'cheerful',
  },
} as const satisfies Record<string, SpeciesDef>

export type SpeciesId = keyof typeof SPECIES_REGISTRY

export const SPECIES_IDS = Object.keys(SPECIES_REGISTRY) as SpeciesId[]

export function getSpecies(id: string): SpeciesDef | null {
  return (SPECIES_REGISTRY as Record<string, SpeciesDef>)[id] ?? null
}

export function speciesForClass(klass: AnimalClass): SpeciesId[] {
  return SPECIES_IDS.filter((id) => SPECIES_REGISTRY[id].class === klass)
}

/**
 * Build a schema-valid CharacterSpec from a species preset (plan 008, step
 * 4): starts from `createDefaultCharacter`, overlays the preset's anatomy /
 * body morphs / palette / bone scales, and parses the result — same
 * fail-loud rule as `createDefaultCharacter` itself.
 */
export function createCharacterFromSpecies(id: SpeciesId, name?: string): CharacterSpec {
  const def = SPECIES_REGISTRY[id] as SpeciesDef
  const base = createDefaultCharacter(def.archetype, def.personality)

  const parts = structuredClone(def.parts)
  if (def.boneScales && def.boneScaleSlot) {
    const entry = parts[def.boneScaleSlot]
    if (entry) {
      entry.boneScales = { ...entry.boneScales, ...def.boneScales }
    }
  }

  const materials = structuredClone(base.materials)
  if (def.patternId && materials.body) {
    materials.body = { ...materials.body, textureId: def.patternId }
  }

  const candidate: CharacterSpec = {
    ...base,
    meta: {
      ...base.meta,
      species: id,
      name: name ?? def.label,
    },
    anatomy: {
      ...base.anatomy,
      parts,
      bodyMorphs: { ...def.bodyMorphs },
    },
    palette: { ...def.palette },
    materials,
  }

  return CharacterSpecSchema.parse(candidate)
}
