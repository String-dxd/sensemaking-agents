// Species taxonomy registry (plan 008, step 3) — curated bird presets that
// make "pick Robin" produce a recognizable robin with zero slider work.
//
// A SpeciesDef is a class → group → species leaf plus a full anatomy/palette
// loadout. `createCharacterFromSpecies` (below) overlays a preset onto
// `createDefaultCharacter`'s output.
//
// The studio is bird-only: the five mammal presets were removed (the biped
// archetypes + mammal parts remain in the schema/part registry — only the
// species surface is birds). Colors are flat vertex-channel palette regions;
// species no longer carry baked pattern masks.

import type { AnimalClass } from '../skeleton/partRegistry'
import { createDefaultCharacter } from '../spec/defaults'
import { type Archetype, type BoneName, type BoneScale, type CharacterSpec, CharacterSpecSchema, type Personality } from '../spec/schema'

export type { AnimalClass }
export { ANIMAL_CLASSES } from '../skeleton/partRegistry'

/** 2nd-level filter (operator's "bird of prey / ostrich" tier). */
export const SPECIES_GROUPS = ['songbird', 'raptor', 'waterfowl'] as const
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
  personality: Personality
}

export const SPECIES_REGISTRY = {
  robin: {
    id: 'robin',
    label: 'Robin',
    class: 'bird',
    group: 'songbird',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-small', morphs: { length: 0.55 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.3 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.3 },
    palette: {
      primary: '#b98d6a',
      secondary: '#a67a54',
      belly: '#e8663d',
      accentA: '#f2c23e',
      accentB: '#7a5c44',
      padsNose: '#8a6a4e',
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
      muzzle: { partId: 'beak-hooked', morphs: { length: 0.5 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.15 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'feather-tuft', morphs: {} },
    },
    bodyMorphs: { chubby: 0.4, headBig: 0.35 },
    palette: {
      primary: '#d4a978',
      secondary: '#bc9161',
      belly: '#f7ecd6',
      accentA: '#f0b83e',
      accentB: '#8a6a48',
      padsNose: '#8a6a4e',
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
      muzzle: { partId: 'bill-duck', morphs: { length: 0.6 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.1 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.45 },
    palette: {
      primary: '#ffd93e',
      secondary: '#f5c52e',
      belly: '#fff3bd',
      accentA: '#ff9d3e',
      accentB: '#e8b23a',
      padsNose: '#e8873a',
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
  }

  return CharacterSpecSchema.parse(candidate)
}
