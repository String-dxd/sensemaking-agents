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
  // Optional GLB-specific tints (defined on the masked species spec).
  // When present, drive the MaskedBower GLB's MB_BodyYellow + MB_HeadOrange
  // (body) and Uniform_TieStriped (tie) materials.
  body?: string
  tie?: string
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

// Archived mesh builder for the retired procedural bird. Runtime Kira and
// onboarding hatch no longer call this; they use the MaskedBower GLB path.
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
export function buildArchivedStandingBird(spec: KiraSpecies): StandingBirdParts

// Loader for the Blender-authored Masked Bower GLB. Module-cached, so the
// scene is parsed once and re-handed to every caller. The scene already has
// the world-Kira's setup applied: yaw flip, scale, palette-driven body+head
// +tie recolor (read from SPECIES_BY_ID.masked.palette), leg pivots
// reparented, bone refs surfaced. The GLB's V_Crest* crown pieces stay
// visible — they're the bird's signature head element.
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
