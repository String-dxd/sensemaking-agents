// The parametric-bird substrate — ported FROM the product engine's proven
// procedural bird (src/engine/student-space/Game/View/Kira.js: SPECIES,
// STANDING_BASE, STANDING_OVERRIDES, getCharacter). PURE data + merges — NO
// three/r3f/DOM imports, so it is headless-testable (the repo's enforced pure
// boundary). The rig layer (rig/buildProceduralBird.ts) consumes this to build
// geometry; the studio's variety comes from these numbers, not from authored art.
//
// Provenance: all 6 procedural species + their parameters are app-authored
// (confirmed clean by docs/audit/2026-06-12-asset-provenance-audit.md), so the
// whole procedural lane is publication-safe for MOE.

import { EYE_ARCHETYPE_PARAMS } from './eyeArchetypes'
import type { BeakType, CrestType, ProceduralBase, SpeciesId, TailType } from './genome'

// ── The character config every part builder reads ──────────────────────────────
// One flat record of the ~40 morphology + face params. STANDING_BASE is the
// default; each species overrides a sparse subset; an individual's MorphDelta
// overrides further. faceColor/lidColor/eyeRingColor are null-meaningful (null =
// "fall back / omit", e.g. eyeRingColor null = draw no ring) — ported faithfully.

export interface Vec3 {
  x: number
  y: number
  z: number
}
export interface BeakCfg {
  length: number
  width: number
  height: number
  gape: number
  open: number
}
export interface WingCfg {
  x: number
  y: number
  z: number
  length: number
  rootW: number
  tipW: number
  rest: number
  feathers: number
}
export interface LegCfg {
  y: number
  z: number
  len: number
  toe: number
}
export interface TailCfg {
  x: number
  y: number
  scaleX: number
  scaleY: number
  scaleZ: number
}

export interface CharacterConfig {
  scale: number
  body: Vec3
  bodyY: number
  belly: { y: number; z: number }
  bellyX: number
  bellyY: number
  neckTop: number
  neckBottom: number
  neckH: number
  neckY: number
  headX: number
  headY: number
  headSize: number
  headScale: Vec3
  faceY: number
  faceZ: number
  faceYOffset: number
  faceColor: string | null
  cheekSize: number
  cheekZ: number
  beak: BeakCfg
  beakKeepsDark: boolean
  eyeWhite: number
  pupil: number
  eyeSquash: number
  eyeY: number
  eyeZ: number
  eyeTilt: number
  pupilScaleX: number
  pupilScaleY: number
  pupilOffsetY: number
  upperLid: number
  lowerLid: number
  lidColor: string | null
  eyeRingColor: string | null
  lash: boolean
  shine: boolean
  brow: number
  browW: number
  crestScale: number
  wing: WingCfg
  leg: LegCfg
  tail: TailCfg
}

export const STANDING_BASE: CharacterConfig = {
  scale: 0.74,
  body: { x: 0.72, y: 0.88, z: 0.58 },
  bodyY: 0.62,
  belly: { y: 0.37, z: 0.35 },
  bellyX: 0.39,
  bellyY: 0.58,
  neckTop: 0.11,
  neckBottom: 0.13,
  neckH: 0.16,
  neckY: 1.08,
  headX: 0.1,
  headY: 1.34,
  headSize: 0.42,
  headScale: { x: 1.08, y: 1.02, z: 1.0 },
  faceY: 0.74,
  faceZ: 0.86,
  faceYOffset: -0.02,
  faceColor: null,
  cheekSize: 0.13,
  cheekZ: 0.31,
  beak: { length: 0.4, width: 0.18, height: 0.15, gape: 0.042, open: 0.05 },
  beakKeepsDark: false,
  eyeWhite: 0.2,
  pupil: 0.13,
  eyeSquash: 0.42,
  eyeY: 0.17,
  eyeZ: 0.275,
  eyeTilt: 0,
  pupilScaleX: 0.7,
  pupilScaleY: 1.08,
  pupilOffsetY: -0.02,
  upperLid: 0.08,
  lowerLid: 0.0,
  lidColor: null,
  eyeRingColor: null,
  lash: false,
  shine: false,
  brow: -0.08,
  browW: 0.18,
  crestScale: 0.82,
  wing: { x: 0.02, y: 0.82, z: 0.31, length: 0.56, rootW: 0.13, tipW: 0.38, rest: -0.1, feathers: 3 },
  leg: { y: 0.34, z: 0.2, len: 0.32, toe: 0.14 },
  tail: { x: 0.4, y: 0.55, scaleX: 0.36, scaleY: 0.5, scaleZ: 0.5 },
}

// Per-species deltas off STANDING_BASE (sparse — Partial, with nested partials).
export type CharacterOverride = Partial<
  Omit<CharacterConfig, 'body' | 'belly' | 'headScale' | 'beak' | 'wing' | 'leg' | 'tail'>
> & {
  body?: Partial<Vec3>
  belly?: Partial<{ y: number; z: number }>
  headScale?: Partial<Vec3>
  beak?: Partial<BeakCfg>
  wing?: Partial<WingCfg>
  leg?: Partial<LegCfg>
  tail?: Partial<TailCfg>
}

export const STANDING_OVERRIDES: Record<SpeciesId, CharacterOverride> = {
  flame: {
    body: { x: 0.7, y: 0.86, z: 0.56 },
    headScale: { x: 1.06, y: 1.02, z: 0.98 },
    faceColor: '#ffe6a2',
    beak: { length: 0.44, width: 0.2, height: 0.16, gape: 0.05, open: 0.1 },
    eyeRingColor: '#fff4bf',
    pupilScaleY: 1.18,
    upperLid: 0.03,
    brow: -0.14,
    wing: { x: 0.01, y: 0.82, z: 0.31, length: 0.6, rootW: 0.12, tipW: 0.42, rest: -0.12, feathers: 4 },
    tail: { x: 0.43, y: 0.55, scaleX: 0.42, scaleY: 0.56, scaleZ: 0.62 },
    crestScale: 0.9,
  },
  regent: {
    scale: 0.73,
    body: { x: 0.7, y: 0.82, z: 0.56 },
    headSize: 0.41,
    headScale: { x: 1.1, y: 0.98, z: 1.0 },
    faceY: 0.66,
    faceColor: '#fff7bf',
    beak: { length: 0.4, width: 0.22, height: 0.15, gape: 0.06, open: 0.12 },
    beakKeepsDark: true,
    eyeWhite: 0.19,
    pupil: 0.11,
    eyeRingColor: '#f04a2f',
    pupilScaleY: 1.2,
    upperLid: 0.0,
    brow: -0.2,
    browW: 0.2,
    wing: { x: 0.0, y: 0.77, z: 0.3, length: 0.48, rootW: 0.12, tipW: 0.34, rest: 0.02, feathers: 3 },
    leg: { y: 0.33, z: 0.21, len: 0.34, toe: 0.14 },
    tail: { x: 0.4, y: 0.52, scaleX: 0.32, scaleY: 0.46, scaleZ: 0.5 },
  },
  emerald: {
    scale: 0.7,
    body: { x: 0.62, y: 0.88, z: 0.55 },
    bodyY: 0.6,
    headX: 0.08,
    headY: 1.34,
    headSize: 0.39,
    headScale: { x: 1.0, y: 1.05, z: 0.98 },
    faceColor: '#dff0a5',
    beak: { length: 0.5, width: 0.15, height: 0.11, gape: 0.034, open: 0.02 },
    eyeWhite: 0.18,
    pupil: 0.105,
    eyeTilt: 0.1,
    pupilScaleX: 0.64,
    pupilScaleY: 1.16,
    upperLid: 0.14,
    brow: -0.02,
    wing: { x: 0.0, y: 0.78, z: 0.29, length: 0.58, rootW: 0.1, tipW: 0.34, rest: -0.18, feathers: 4 },
    leg: { y: 0.33, z: 0.18, len: 0.35, toe: 0.13 },
    tail: { x: 0.4, y: 0.54, scaleX: 0.38, scaleY: 0.52, scaleZ: 0.56 },
    crestScale: 0.72,
  },
  satin: {
    scale: 0.76,
    body: { x: 0.76, y: 0.86, z: 0.6 },
    headSize: 0.4,
    headScale: { x: 1.05, y: 1.0, z: 1.02 },
    faceY: 0.6,
    faceZ: 0.72,
    faceColor: '#d9edf7',
    beak: { length: 0.35, width: 0.22, height: 0.15, gape: 0.035, open: 0.02 },
    eyeWhite: 0.17,
    pupil: 0.095,
    eyeSquash: 0.54,
    eyeTilt: -0.1,
    pupilScaleX: 0.86,
    pupilScaleY: 0.58,
    upperLid: 0.48,
    lowerLid: 0.06,
    brow: 0.0,
    browW: 0.16,
    wing: { x: 0.02, y: 0.8, z: 0.35, length: 0.52, rootW: 0.15, tipW: 0.4, rest: -0.08, feathers: 3 },
    tail: { x: 0.42, y: 0.53, scaleX: 0.32, scaleY: 0.48, scaleZ: 0.52 },
  },
  twilight: {
    scale: 0.72,
    body: { x: 0.63, y: 0.82, z: 0.54 },
    bodyY: 0.58,
    headY: 1.3,
    headSize: 0.39,
    headScale: { x: 0.98, y: 1.04, z: 0.96 },
    cheekSize: 0.12,
    faceColor: '#e4dcff',
    beak: { length: 0.46, width: 0.16, height: 0.11, gape: 0.034, open: 0.02 },
    eyeWhite: 0.18,
    pupil: 0.1,
    eyeTilt: -0.24,
    pupilScaleX: 0.7,
    pupilScaleY: 0.62,
    upperLid: 0.36,
    lowerLid: 0.05,
    brow: -0.18,
    lash: true,
    wing: { x: -0.01, y: 0.75, z: 0.28, length: 0.62, rootW: 0.1, tipW: 0.36, rest: -0.16, feathers: 4 },
    leg: { y: 0.31, z: 0.18, len: 0.38, toe: 0.13 },
    tail: { x: 0.4, y: 0.5, scaleX: 0.42, scaleY: 0.5, scaleZ: 0.44 },
    crestScale: 0.7,
  },
  lilac: {
    scale: 0.78,
    body: { x: 0.8, y: 0.88, z: 0.62 },
    bodyY: 0.62,
    headY: 1.35,
    headSize: 0.4,
    headScale: { x: 1.12, y: 0.96, z: 1.02 },
    faceY: 0.64,
    cheekSize: 0.14,
    faceColor: '#f6e9fb',
    beak: { length: 0.36, width: 0.2, height: 0.14, gape: 0.035, open: 0.02 },
    eyeWhite: 0.19,
    pupil: 0.105,
    eyeSquash: 0.5,
    eyeTilt: -0.12,
    pupilScaleX: 0.7,
    pupilScaleY: 0.86,
    upperLid: 0.28,
    brow: 0.1,
    lash: true,
    wing: { x: 0.03, y: 0.82, z: 0.36, length: 0.54, rootW: 0.15, tipW: 0.44, rest: -0.03, feathers: 3 },
    leg: { y: 0.34, z: 0.23, len: 0.31, toe: 0.15 },
    tail: { x: 0.46, y: 0.54, scaleX: 0.44, scaleY: 0.56, scaleZ: 0.62 },
    crestScale: 0.62,
  },
}

// ── Species catalog (the picker's source of truth) ─────────────────────────────
// Each carries the default silhouette PARTS (shape) + the 6-zone PLUMAGE palette.
// Picking a species in the UI seeds parts + palette from here in one commit.

export interface SpeciesPalette {
  back: string
  belly: string
  accent: string
  beak: string
  legs: string
  eye: string
}
export interface SpeciesEntry {
  id: SpeciesId
  displayName: string
  shape: { crest: CrestType; tail: TailType; beak: BeakType }
  palette: SpeciesPalette
}

export const SPECIES: SpeciesEntry[] = [
  {
    id: 'flame',
    displayName: 'Flame Bower',
    shape: { crest: 'pointed', tail: 'long-fan', beak: 'slender' },
    palette: { back: '#e63946', belly: '#ffd3a5', accent: '#ffb347', beak: '#2a1a14', legs: '#3a2418', eye: '#1a1a1a' },
  },
  {
    id: 'regent',
    displayName: 'Regent Bower',
    shape: { crest: 'none', tail: 'square', beak: 'stout' },
    palette: { back: '#ffd23f', belly: '#fff3a3', accent: '#f4a261', beak: '#2a1f10', legs: '#3a2818', eye: '#1a1a1a' },
  },
  {
    id: 'emerald',
    displayName: 'Emerald Bower',
    shape: { crest: 'tuft', tail: 'forked', beak: 'slender' },
    palette: { back: '#3aab48', belly: '#dff0a5', accent: '#f4e07a', beak: '#1a2818', legs: '#2a3a22', eye: '#1a1a1a' },
  },
  {
    id: 'satin',
    displayName: 'Satin Bower',
    shape: { crest: 'none', tail: 'short-fan', beak: 'stout' },
    palette: { back: '#2c7dd2', belly: '#cfe3f2', accent: '#5fb8ff', beak: '#1a2a3a', legs: '#1a2830', eye: '#1a1a1a' },
  },
  {
    id: 'twilight',
    displayName: 'Twilight Bower',
    shape: { crest: 'tuft', tail: 'pointed', beak: 'slender' },
    palette: { back: '#5a4cb8', belly: '#d0c8ec', accent: '#9a8aff', beak: '#1a1a2a', legs: '#2a2440', eye: '#0a0a0a' },
  },
  {
    id: 'lilac',
    displayName: 'Lilac Bower',
    shape: { crest: 'fan', tail: 'long-fan', beak: 'stout' },
    palette: { back: '#a065d8', belly: '#ecd8f2', accent: '#c08ee8', beak: '#2a1d3a', legs: '#3a2848', eye: '#1a1a1a' },
  },
]

export const SPECIES_BY_ID: Record<string, SpeciesEntry> = Object.fromEntries(SPECIES.map((s) => [s.id, s]))
export const PROCEDURAL_SPECIES_IDS = SPECIES.map((s) => s.id)

// Keys whose merge must be NESTED (object spread), mirroring getCharacter()'s
// list at Kira.js L607 — plus 'belly' which getCharacter also nests. A delta that
// omits the same nested handling silently clobbers a whole sub-object; the
// resolveCharacter pinning test guards every field. (Stress-test risk #1.)
const NESTED_KEYS = ['body', 'belly', 'headScale', 'beak', 'wing', 'leg', 'tail'] as const

/** STANDING_BASE deep-merged with a species' override (verbatim getCharacter). */
export function getCharacter(speciesId: SpeciesId): CharacterConfig {
  const override = STANDING_OVERRIDES[speciesId] ?? {}
  const merged = { ...STANDING_BASE, ...override } as CharacterConfig
  for (const key of NESTED_KEYS) {
    // biome-ignore lint/suspicious/noExplicitAny: heterogeneous nested merge
    merged[key] = { ...(STANDING_BASE as any)[key], ...((override as any)[key] ?? {}) }
  }
  return merged
}

const mul = (v: number, f: number | undefined): number => (f === undefined ? v : v * f)

/**
 * The full per-INDIVIDUAL character config. Layered in order: species character
 * → eye archetype (absolute eye-param overrides) → bounded face deltas → sparse
 * MorphDelta MULTIPLIERS scaling the dimensional fields. The morph step rebuilds
 * every nested sub-object fresh (never mutates the species character's), so a
 * sparse delta can't clobber a sub-object. Pinned by the resolveCharacter test
 * (stress-test risk #1). NESTED_KEYS marks which fields getCharacter must nest.
 */
export function resolveCharacter(base: ProceduralBase): CharacterConfig {
  const character = getCharacter(base.species)
  const eye = EYE_ARCHETYPE_PARAMS[base.face?.eye] ?? {}
  const c = { ...character, ...eye } as CharacterConfig

  // Bounded face deltas (advanced disclosure) map onto specific eye params.
  if (base.face?.browAngle !== undefined) c.brow = base.face.browAngle
  if (base.face?.lidAperture !== undefined) c.upperLid = base.face.lidAperture

  // Morph multipliers — fresh nested objects so the species character is intact.
  const m = base.morph ?? {}
  c.bodyY = mul(character.bodyY, m.bodyY)
  c.headSize = mul(character.headSize, m.headSize)
  c.neckH = mul(character.neckH, m.neckH)
  c.crestScale = mul(character.crestScale, m.crestScale)
  c.body = { x: mul(character.body.x, m.body?.x), y: mul(character.body.y, m.body?.y), z: mul(character.body.z, m.body?.z) }
  c.headScale = { x: mul(character.headScale.x, m.headScale?.x), y: mul(character.headScale.y, m.headScale?.y), z: mul(character.headScale.z, m.headScale?.z) }
  c.beak = { ...character.beak, length: mul(character.beak.length, m.beak?.length), width: mul(character.beak.width, m.beak?.width), height: mul(character.beak.height, m.beak?.height) }
  c.wing = { ...character.wing, length: mul(character.wing.length, m.wing?.length), rootW: mul(character.wing.rootW, m.wing?.rootW), tipW: mul(character.wing.tipW, m.wing?.tipW) }
  c.tail = { ...character.tail, scaleX: mul(character.tail.scaleX, m.tail?.scaleX), scaleY: mul(character.tail.scaleY, m.tail?.scaleY), scaleZ: mul(character.tail.scaleZ, m.tail?.scaleZ) }
  c.leg = { ...character.leg, len: mul(character.leg.len, m.leg?.len) }
  c.belly = { ...character.belly }
  return c
}
