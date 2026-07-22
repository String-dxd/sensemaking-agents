// Ported from island-editor/src/models/characterAsset.ts — behavior kept in
// sync via shared test vectors (see islandSpecCore/terrainGrid.ts).
//
// The character asset's runtime contract. CHARACTER_CLIPS mirrors the clips
// baked into public/models/character.glb.

export const CHARACTER_CLIPS = [
  'Walking',
  'Running',
  'Skip_Forward',
  'Wave_for_Help_2',
  'Talk_Passionately',
  'Talk_with_Right_Hand_Open',
  'Stand_Talking_Angry',
  'Wake_Up_and_Look_Up',
  'Stand_To_Side_Lying',
  'Swim_Forward',
] as const
export type CharacterClip = (typeof CHARACTER_CLIPS)[number]
export const DEFAULT_CLIP: CharacterClip = 'Walking'

/** World height of the character. The GLB ships at SOURCE scale (~1.62 —
 *  skinned meshes must not be scale-baked); the view divides this by
 *  CHARACTER_SOURCE_HEIGHT. Never bake scale into the skinned asset. */
export const CHARACTER_HEIGHT = 0.6

/** Bind-pose height of public/models/character.glb. Runtime cannot measure
 *  this with Box3: the asset is meshopt-quantized and skinned, so the
 *  dequantization correction lives inside the skin's inverse-bind matrices
 *  and raw geometry bounds are in quantized units. */
export const CHARACTER_SOURCE_HEIGHT = 1.62

// ── Companion species catalog ────────────────────────────────────────────────
// Moved here from the retired Kira.js (world-port U9): the egg-color choice
// remains recorded and schema-valid (R10) — these palettes drive the egg
// onboarding picker; the character's LOOK is uniform until per-species assets
// exist.

export type CompanionSpeciesId =
  | 'flame'
  | 'masked'
  | 'regent'
  | 'emerald'
  | 'satin'
  | 'twilight'
  | 'lilac'

export interface CompanionSpeciesPalette {
  back: string
  belly: string
  accent: string
  beak: string
  legs: string
  eye: string
  body?: string
  tie?: string
}

export interface CompanionSpecies {
  id: CompanionSpeciesId
  displayName: string
  shape: { crest: string; tail: string; beak: string }
  palette: CompanionSpeciesPalette
}

export const SPECIES: readonly CompanionSpecies[] = [
  {
    id: 'flame',
    displayName: 'Flame Bower',
    shape: { crest: 'pointed', tail: 'long-fan', beak: 'slender' },
    palette: {
      back: '#e63946',
      belly: '#ffd3a5',
      accent: '#ffb347',
      beak: '#2a1a14',
      legs: '#3a2418',
      eye: '#1a1a1a',
    },
  },
  {
    id: 'masked',
    displayName: 'Masked Bower',
    shape: { crest: 'pointed', tail: 'long-fan', beak: 'slender' },
    palette: {
      back: '#ffd23f',
      belly: '#fff3a3',
      accent: '#ff8c42',
      beak: '#2a1a14',
      legs: '#3a2418',
      eye: '#1a1a1a',
      body: '#ff6b0d',
      tie: '#d11f1a',
    },
  },
  {
    id: 'regent',
    displayName: 'Regent Bower',
    shape: { crest: 'none', tail: 'square', beak: 'stout' },
    palette: {
      back: '#ffd23f',
      belly: '#fff3a3',
      accent: '#f4a261',
      beak: '#2a1f10',
      legs: '#3a2818',
      eye: '#1a1a1a',
    },
  },
  {
    id: 'emerald',
    displayName: 'Emerald Bower',
    shape: { crest: 'tuft', tail: 'forked', beak: 'slender' },
    palette: {
      back: '#3aab48',
      belly: '#dff0a5',
      accent: '#f4e07a',
      beak: '#1a2818',
      legs: '#2a3a22',
      eye: '#1a1a1a',
    },
  },
  {
    id: 'satin',
    displayName: 'Satin Bower',
    shape: { crest: 'none', tail: 'short-fan', beak: 'stout' },
    palette: {
      back: '#2c7dd2',
      belly: '#cfe3f2',
      accent: '#5fb8ff',
      beak: '#1a2a3a',
      legs: '#1a2830',
      eye: '#1a1a1a',
    },
  },
  {
    id: 'twilight',
    displayName: 'Twilight Bower',
    shape: { crest: 'tuft', tail: 'pointed', beak: 'slender' },
    palette: {
      back: '#5a4cb8',
      belly: '#d0c8ec',
      accent: '#9a8aff',
      beak: '#1a1a2a',
      legs: '#2a2440',
      eye: '#0a0a0a',
    },
  },
  {
    id: 'lilac',
    displayName: 'Lilac Bower',
    shape: { crest: 'fan', tail: 'long-fan', beak: 'stout' },
    palette: {
      back: '#a065d8',
      belly: '#ecd8f2',
      accent: '#c08ee8',
      beak: '#2a1d3a',
      legs: '#3a2848',
      eye: '#1a1a1a',
    },
  },
]

export const SPECIES_BY_ID: Readonly<
  { [K in CompanionSpeciesId]: CompanionSpecies } & {
    [k: string]: CompanionSpecies | undefined
  }
> = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as never
