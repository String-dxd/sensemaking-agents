// Ambient declarations for the Kira companion module. The runtime is
// `Kira.js`; React surfaces only need the species catalog typed (egg
// onboarding palette, etc.), so the full Kira class stays untyped.

export type KiraSpeciesId = 'flame' | 'ember' | 'regent' | 'emerald' | 'satin' | 'twilight' | 'lilac'

export type KiraSpeciesPalette = {
  back: string
  belly: string
  accent: string
  beak: string
  legs: string
  eye: string
}

export type KiraSpecies = {
  id: KiraSpeciesId
  displayName: string
  shape: { crest: string; tail: string; beak: string }
  palette: KiraSpeciesPalette
}

export const SPECIES: ReadonlyArray<KiraSpecies>

// Known species keys are typed as definitely-defined; arbitrary string
// lookups still return `KiraSpecies | undefined` so callers must handle
// the miss case (and so noUncheckedIndexedAccess stays honest).
export const SPECIES_BY_ID: Readonly<
  { [K in KiraSpeciesId]: KiraSpecies } & { [k: string]: KiraSpecies | undefined }
>

// Mesh builder used by the onboarding hatch surface to reuse the real
// world-route bird inside the egg. Returns the same parts handle the Kira
// class wraps internally (root group + body/head/wing/leg/tail refs).
export type StandingBirdParts = {
  root: import('three').Group
  body: import('three').Mesh
  head: import('three').Group
  tail: import('three').Group
  wingL: import('three').Group
  wingR: import('three').Group
  legL: import('three').Group
  legR: import('three').Group
  beak: import('three').Group
  headBaseY: number
  headBaseRotZ: number
  wingBaseZL: number
  wingBaseZR: number
}
export function buildStandingBird(spec: KiraSpecies): StandingBirdParts
