// Ambient declarations for the Kira companion module. The runtime is
// `Kira.js`; React surfaces only need the species catalog typed (egg
// onboarding palette, etc.), so the full Kira class stays untyped.

export type KiraSpeciesId = 'flame' | 'masked' | 'regent' | 'emerald' | 'satin' | 'twilight' | 'lilac'

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

// Loader for the Blender-authored Masked Bower GLB. Module-cached, so the
// scene is parsed once and re-handed to every caller. The scene already has
// the world-Kira's setup applied: yaw flip, scale, crest hidden, body/tie
// recolor, leg pivots reparented, bone refs surfaced.
//
// IMPORTANT: a THREE.Object3D can only have one parent. Don't add the
// returned `scene` to your own group directly while the world Kira owns
// it — clone first with SkeletonUtils.clone() if you need a second copy
// (e.g. for the onboarding hatchling preview).
export function loadMaskedScene(): Promise<{
  scene: import('three').Object3D
  head: import('three').Object3D | null
  wingL: import('three').Object3D | null
  wingR: import('three').Object3D | null
  beakLower: import('three').Object3D | null
  legPivotL: import('three').Group | null
  legPivotR: import('three').Group | null
}>
