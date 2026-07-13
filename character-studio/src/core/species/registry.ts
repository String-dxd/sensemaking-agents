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

import type { BirdBodyShape } from '../procgen/body'
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
  'waterfowl',
  'galliform',
  'flightless', // bird
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
  /** Bird-archetype silhouette overrides (plan 017); ignored for mammals. */
  birdShape?: Partial<BirdBodyShape>
  personality: Personality
  /**
   * Mii-style color swatch row (plan 021 step 3): curated full-palette
   * recolors a player can one-tap apply. Variant #0 MUST equal `palette`
   * above exactly (the "default" swatch) — enforced by a registry test.
   */
  paletteVariants?: ReadonlyArray<{ id: string; label: string; palette: CharacterSpec['palette'] }>
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
      ears: { partId: 'bunny-tall', morphs: {} },
      muzzle: { partId: 'short-cat', morphs: { length: 0.05 } },
      tail: { partId: 'stub-round', morphs: { width: 0.3 } },
      claws: { partId: 'mitten-none', morphs: {} },
      crest: { partId: 'none', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.2 },
    patternId: 'pattern-rabbit',
    palette: {
      primary: '#f4efe7',
      secondary: '#e6dccd',
      belly: '#fffdf8',
      accentA: '#eaa9a2',
      accentB: '#8a7a68',
      padsNose: '#e58f88',
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
      muzzle: { partId: 'beak-small', morphs: { length: 0.45 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.4 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'none', morphs: {} },
      wings: { partId: 'wing-robin', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.3 },
    birdShape: {},
    patternId: 'pattern-robin',
    palette: {
      primary: '#8a6f5a',
      secondary: '#6f5847',
      belly: '#e2653f',
      accentA: '#f2c23e',
      accentB: '#4a3a2e',
      padsNose: '#5a4636',
    },
    personality: 'cheerful',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#8a6f5a',
          secondary: '#6f5847',
          belly: '#e2653f',
          accentA: '#f2c23e',
          accentB: '#4a3a2e',
          padsNose: '#5a4636',
        },
      },
      {
        id: 'blue-jay',
        label: 'Blue Jay',
        palette: {
          primary: '#3a6fb5',
          secondary: '#294f85',
          belly: '#e8ecf2',
          accentA: '#1e1e1e',
          accentB: '#294f85',
          padsNose: '#3a2a20',
        },
      },
      {
        id: 'gold',
        label: 'Gold',
        palette: {
          primary: '#d9a23a',
          secondary: '#b8842a',
          belly: '#f2c23e',
          accentA: '#8a3a2a',
          accentB: '#5a4020',
          padsNose: '#5a4020',
        },
      },
    ],
  },
  owl: {
    id: 'owl',
    label: 'Owl',
    class: 'bird',
    group: 'raptor',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-hooked', morphs: { length: 0.15 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.15 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'feather-tuft', morphs: {} },
      wings: { partId: 'wing-owl', morphs: {} },
    },
    bodyMorphs: { chubby: 0.4, headBig: 0.35 },
    birdShape: { wingLength: 0.9, headSize: 1.08, toeCut: 0.85 },
    patternId: 'pattern-owl',
    palette: {
      primary: '#7d5a3e',
      secondary: '#5d4430',
      belly: '#f0e4c8',
      accentA: '#e8b23a',
      accentB: '#3a2c20',
      padsNose: '#5a4636',
    },
    personality: 'proud',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#7d5a3e',
          secondary: '#5d4430',
          belly: '#f0e4c8',
          accentA: '#e8b23a',
          accentB: '#3a2c20',
          padsNose: '#5a4636',
        },
      },
      {
        id: 'snowy',
        label: 'Snowy',
        palette: {
          primary: '#eef1f4',
          secondary: '#d3d9e0',
          belly: '#ffffff',
          accentA: '#2a2a2a',
          accentB: '#b8c0c9',
          padsNose: '#c9a23a',
        },
      },
      {
        id: 'barn',
        label: 'Barn',
        palette: {
          primary: '#c98a4a',
          secondary: '#a8703a',
          belly: '#f7ecd8',
          accentA: '#5a3a26',
          accentB: '#8a5a34',
          padsNose: '#3a2a20',
        },
      },
    ],
  },
  duckling: {
    id: 'duckling',
    label: 'Duckling',
    class: 'bird',
    group: 'waterfowl',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'bill-duck', morphs: { length: 0.4 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.12 } },
      claws: { partId: 'bird-toes-webbed', morphs: {} },
      crest: { partId: 'none', morphs: {} },
      wings: { partId: 'wing-duck', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.45 },
    birdShape: { toeCut: 0.12, wingLength: 0.85, belly: 1.1 },
    patternId: 'pattern-duckling',
    palette: {
      primary: '#f2d349',
      secondary: '#e8c53e',
      belly: '#faeaa8',
      accentA: '#f0913a',
      accentB: '#c9a23a',
      padsNose: '#b8742a',
    },
    personality: 'cheerful',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#f2d349',
          secondary: '#e8c53e',
          belly: '#faeaa8',
          accentA: '#f0913a',
          accentB: '#c9a23a',
          padsNose: '#b8742a',
        },
      },
      {
        id: 'chocolate',
        label: 'Chocolate',
        palette: {
          primary: '#8a5a34',
          secondary: '#6f4526',
          belly: '#d9b98f',
          accentA: '#f0913a',
          accentB: '#4a3020',
          padsNose: '#3a2a20',
        },
      },
      {
        id: 'silver',
        label: 'Silver',
        palette: {
          primary: '#c9ccd2',
          secondary: '#a8adb8',
          belly: '#eef0f4',
          accentA: '#f0913a',
          accentB: '#7a808a',
          padsNose: '#b8742a',
        },
      },
    ],
  },
  eagle: {
    id: 'eagle',
    label: 'Eagle',
    class: 'bird',
    group: 'raptor',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-hooked', morphs: { length: 0.55 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.35 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'none', morphs: {} },
      wings: { partId: 'wing-eagle', morphs: { length: 0.5 } },
    },
    bodyMorphs: { slim: 0.15 },
    birdShape: { wingLength: 1.3, wingWidth: 1.1, tarsusLength: 1.15, toeCut: 0.9, headSize: 0.98 },
    patternId: 'pattern-eagle',
    palette: {
      primary: '#6b4a34',
      secondary: '#4e3626',
      belly: '#f4efe4',
      accentA: '#f2c23e',
      accentB: '#2e2019',
      padsNose: '#5a4636',
    },
    personality: 'proud',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#6b4a34',
          secondary: '#4e3626',
          belly: '#f4efe4',
          accentA: '#f2c23e',
          accentB: '#2e2019',
          padsNose: '#5a4636',
        },
      },
      {
        id: 'golden',
        label: 'Golden',
        palette: {
          primary: '#8a6a3a',
          secondary: '#6f5228',
          belly: '#c9a862',
          accentA: '#f2c23e',
          accentB: '#3a2a18',
          padsNose: '#5a4020',
        },
      },
      {
        id: 'dark-morph',
        label: 'Dark Morph',
        palette: {
          primary: '#3a2c22',
          secondary: '#241a14',
          belly: '#6f5236',
          accentA: '#f2c23e',
          accentB: '#1a120c',
          padsNose: '#2a2018',
        },
      },
    ],
  },
  penguin: {
    id: 'penguin',
    label: 'Penguin',
    class: 'bird',
    group: 'flightless',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-penguin', morphs: { length: 0.4 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.08 } },
      claws: { partId: 'bird-toes-webbed', morphs: {} },
      crest: { partId: 'none', morphs: {} },
      wings: { partId: 'wing-flipper', morphs: {} },
    },
    bodyMorphs: { chubby: 0.45, bellyRound: 0.3 },
    birdShape: { wingLength: 0.75, wingScallop: 0, wingWidth: 0.9, tarsusLength: 0.8, toeCut: 0.2, belly: 1.15 },
    patternId: 'pattern-penguin',
    palette: {
      primary: '#2e3a52',
      secondary: '#1f2938',
      belly: '#f7f4ec',
      accentA: '#f0913a',
      accentB: '#111722',
      padsNose: '#111722',
    },
    personality: 'calm',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#2e3a52',
          secondary: '#1f2938',
          belly: '#f7f4ec',
          accentA: '#f0913a',
          accentB: '#111722',
          padsNose: '#111722',
        },
      },
      {
        id: 'emperor',
        label: 'Emperor',
        palette: {
          primary: '#1c2230',
          secondary: '#10141c',
          belly: '#fdf8e8',
          accentA: '#f2c23e',
          accentB: '#0a0d12',
          padsNose: '#0a0d12',
        },
      },
      {
        id: 'gentoo',
        label: 'Gentoo',
        palette: {
          primary: '#38455e',
          secondary: '#252f42',
          belly: '#f2efe4',
          accentA: '#e85a3a',
          accentB: '#151a24',
          padsNose: '#e85a3a',
        },
      },
    ],
  },
  chicken: {
    id: 'chicken',
    label: 'Chicken',
    class: 'bird',
    group: 'galliform',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-chicken', morphs: { length: 0.35 } },
      tail: { partId: 'tail-sickle-rooster', morphs: { length: 0.3 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'comb-chicken', morphs: {} },
      wings: { partId: 'wing-chicken', morphs: {} },
    },
    bodyMorphs: { bellyRound: 0.25 },
    birdShape: { wingLength: 0.85, tarsusLength: 1.1, toeCut: 0.85 },
    patternId: 'pattern-chicken',
    palette: {
      primary: '#f7f2e8',
      secondary: '#d94f3a',
      belly: '#efe6d2',
      accentA: '#f2c23e',
      accentB: '#8a3a2a',
      padsNose: '#8a3a2a',
    },
    personality: 'cheerful',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#f7f2e8',
          secondary: '#d94f3a',
          belly: '#efe6d2',
          accentA: '#f2c23e',
          accentB: '#8a3a2a',
          padsNose: '#8a3a2a',
        },
      },
      {
        id: 'black',
        label: 'Black',
        palette: {
          primary: '#2a2a2e',
          secondary: '#d94f3a',
          belly: '#3f3f45',
          accentA: '#f2c23e',
          accentB: '#8a3a2a',
          padsNose: '#8a3a2a',
        },
      },
      {
        id: 'buff',
        label: 'Buff',
        palette: {
          primary: '#e8c07a',
          secondary: '#c9975a',
          belly: '#f7ecd8',
          accentA: '#f2c23e',
          accentB: '#8a5a34',
          padsNose: '#8a3a2a',
        },
      },
    ],
  },
  peacock: {
    id: 'peacock',
    label: 'Peacock',
    class: 'bird',
    group: 'galliform',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-small', morphs: { length: 0.3 } },
      tail: { partId: 'tail-train-peacock', morphs: { length: 0.5 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'crest-peacock', morphs: {} },
      wings: { partId: 'wing-peacock', morphs: {} },
    },
    bodyMorphs: { slim: 0.2 },
    birdShape: { wingLength: 0.95, tarsusLength: 1.2, toeCut: 0.8, neckLength: 0.6 },
    patternId: 'pattern-peacock',
    palette: {
      primary: '#2f5bb5',
      secondary: '#2e8a5a',
      belly: '#dff0e8',
      accentA: '#f2c23e',
      accentB: '#173a7a',
      padsNose: '#173a7a',
    },
    personality: 'proud',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#2f5bb5',
          secondary: '#2e8a5a',
          belly: '#dff0e8',
          accentA: '#f2c23e',
          accentB: '#173a7a',
          padsNose: '#173a7a',
        },
      },
      {
        id: 'white',
        label: 'White',
        palette: {
          primary: '#f4f2ec',
          secondary: '#e2ddd0',
          belly: '#ffffff',
          accentA: '#f2c23e',
          accentB: '#c9c2b0',
          padsNose: '#c9c2b0',
        },
      },
      {
        id: 'java-green',
        label: 'Java Green',
        palette: {
          primary: '#2e8a5a',
          secondary: '#246b46',
          belly: '#cde8d6',
          accentA: '#f2c23e',
          accentB: '#173a2a',
          padsNose: '#173a2a',
        },
      },
    ],
  },
  bowerbird: {
    id: 'bowerbird',
    label: 'Bowerbird',
    class: 'bird',
    group: 'songbird',
    archetype: 'bird',
    parts: {
      muzzle: { partId: 'beak-small', morphs: { length: 0.35 } },
      tail: { partId: 'feather-fan', morphs: { length: 0.3 } },
      claws: { partId: 'bird-toes', morphs: {} },
      crest: { partId: 'none', morphs: {} },
      wings: { partId: 'wing-bowerbird', morphs: {} },
    },
    bodyMorphs: { slim: 0.1 },
    birdShape: { wingLength: 1.05, neckLength: 0.15 },
    palette: {
      primary: '#23283f',
      secondary: '#3a4470',
      belly: '#2c3352',
      accentA: '#dfe3ea',
      accentB: '#7a5ac9',
      padsNose: '#4a4f6a',
    },
    personality: 'mischievous',
    paletteVariants: [
      {
        id: 'classic',
        label: 'Classic',
        palette: {
          primary: '#23283f',
          secondary: '#3a4470',
          belly: '#2c3352',
          accentA: '#dfe3ea',
          accentB: '#7a5ac9',
          padsNose: '#4a4f6a',
        },
      },
      {
        id: 'regent',
        label: 'Regent',
        palette: {
          primary: '#1c1a18',
          secondary: '#f2c23e',
          belly: '#2a2622',
          accentA: '#f2d97a',
          accentB: '#0c0a08',
          padsNose: '#3a2a10',
        },
      },
      {
        id: 'spotted',
        label: 'Spotted',
        palette: {
          primary: '#6f5738',
          secondary: '#8a7350',
          belly: '#d9c9a8',
          accentA: '#e8d9b8',
          accentB: '#3a2c1e',
          padsNose: '#3a2c1e',
        },
      },
    ],
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
