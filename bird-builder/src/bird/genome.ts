// The BirdGenome (v2) — the durable export artifact and the studio's single
// source of truth. PURE: no three/r3f/DOM imports (headless-testable). A genome
// is a LAYERED ASSEMBLY: a base (procedural primitives OR an authored GLB) +
// per-individual identity + worn accessories. Variety comes from the procedural
// base's species × parts × morph × plumage × pattern × face axes.
//
// Supersedes BirdConfig v1 (kept in birdConfig.ts for migration only). See
// docs/plans/2026-06-17-002-feat-bird-builder-procedural-variety-refactor-plan.md.

import { isHexColor, type SlotColors, type SlotState } from './birdConfig'
import { type SpeciesEntry, SPECIES, SPECIES_BY_ID } from './morphology'
import { ITEM_BY_ID, NONE_ITEM, SLOTS } from './slots'

export type { SlotColors, SlotState }

// ── Vocabularies (each enum value maps to a concrete builder/painter behavior) ──
export type SpeciesId = 'flame' | 'regent' | 'emerald' | 'satin' | 'twilight' | 'lilac'
export type GlbSpeciesId = 'masked'
export type CrestType = 'pointed' | 'tuft' | 'fan' | 'curve' | 'none' // verbatim makeCrest()
export type TailType = 'long-fan' | 'short-fan' | 'pointed' | 'forked' | 'square' // makeTailGeometry()
export type BeakType = 'slender' | 'stout' | 'hooked' | 'short' // makeBeakProfile() (net-new geometry)
export type EyeArchetype = 'button' | 'sweet' | 'sharp' | 'sleepy' | 'wide' | 'star' | 'angular' | 'half-lid'
export type Personality = 'bright' | 'bold' | 'gentle' | 'grumpy' | 'sporty' | 'quirky'
export type PatternType = 'none' | 'stripe' | 'speckle' | 'gradient' | 'chevron'
export type ZoneId = 'back' | 'belly' | 'accent' | 'beak' | 'legs' | 'eye'
export type PatternZone = 'back' | 'belly' | 'wing'

export const SPECIES_IDS: SpeciesId[] = ['flame', 'regent', 'emerald', 'satin', 'twilight', 'lilac']
export const CREST_TYPES: CrestType[] = ['pointed', 'tuft', 'fan', 'curve', 'none']
export const TAIL_TYPES: TailType[] = ['long-fan', 'short-fan', 'pointed', 'forked', 'square']
export const BEAK_TYPES: BeakType[] = ['slender', 'stout', 'hooked', 'short']
export const EYE_ARCHETYPES: EyeArchetype[] = ['button', 'sweet', 'sharp', 'sleepy', 'wide', 'star', 'angular', 'half-lid']
export const PERSONALITIES: Personality[] = ['bright', 'bold', 'gentle', 'grumpy', 'sporty', 'quirky']
export const PATTERN_TYPES: PatternType[] = ['none', 'stripe', 'speckle', 'gradient', 'chevron']
export const ZONE_IDS: ZoneId[] = ['back', 'belly', 'accent', 'beak', 'legs', 'eye']
export const PATTERN_ZONES: PatternZone[] = ['back', 'belly', 'wing']

export const NAME_MAX = 24

// 6 semantic plumage zones, keyed by NAME (the Hero Forge lesson — never index).
// faceColor/lidColor/eyeRingColor are optional per-individual overrides; when
// absent the rig falls back to the species character defaults.
export interface PlumagePalette {
  back: string
  belly: string
  accent: string
  beak: string
  legs: string
  eye: string
  faceColor?: string | null
  lidColor?: string | null
  eyeRingColor?: string | null
}

// SPARSE morphology deltas off the species base. Every value is a MULTIPLIER
// (1.0 = unchanged; absent = 1.0), applied to the species character's dimensional
// fields — so a delta scales proportions WITHOUT ever losing the species
// silhouette. Sparseness keeps the URL hash tiny. Mirrors the nested structure
// resolveCharacter deep-merges (rotation/count fields like wing.rest/feathers and
// beak.gape/open are deliberately excluded — multiplying them is meaningless).
export interface MorphDelta {
  bodyY?: number
  headSize?: number
  neckH?: number
  crestScale?: number
  body?: Partial<{ x: number; y: number; z: number }>
  headScale?: Partial<{ x: number; y: number; z: number }>
  beak?: Partial<{ length: number; width: number; height: number }>
  wing?: Partial<{ length: number; rootW: number; tipW: number }>
  tail?: Partial<{ scaleX: number; scaleY: number; scaleZ: number }>
  leg?: Partial<{ len: number }>
}

export interface FaceSpec {
  eye: EyeArchetype
  browAngle?: number
  lidAperture?: number
  cheekMark?: 'none' | 'dot' | 'swirl'
}

export interface PatternSpec {
  type: PatternType
  zone: PatternZone
  scale: number
  color: string
}

export interface ProceduralBase {
  kind: 'procedural'
  species: SpeciesId
  parts: { crest: CrestType; tail: TailType; beak: BeakType }
  morph: MorphDelta
  palette: PlumagePalette
  face: FaceSpec
  pattern: PatternSpec | null
}

export interface GlbBase {
  kind: 'glb'
  species: GlbSpeciesId
  glbUrl: string
  palette: PlumagePalette
}

export type BirdBase = ProceduralBase | GlbBase

export interface BirdIdentity {
  name: string
  personality: Personality
}

export interface BirdGenome {
  version: 2
  base: BirdBase
  identity: BirdIdentity
  slots: Record<string, SlotState>
}

export const DEFAULT_SPECIES: SpeciesId = 'flame'
export const MASKED_GLB_URL = '/birds/MaskedBower.glb'

// ── Seeding ────────────────────────────────────────────────────────────────────

/** A species' default parts + 6-zone palette + default face (seeded on pick). */
export function speciesDefaults(speciesId: SpeciesId): {
  parts: ProceduralBase['parts']
  palette: PlumagePalette
  face: FaceSpec
} {
  const s: SpeciesEntry = SPECIES_BY_ID[speciesId] ?? SPECIES[0]
  return {
    parts: { ...s.shape },
    palette: { ...s.palette },
    face: { eye: DEFAULT_EYE_BY_SPECIES[speciesId] ?? 'sweet' },
  }
}

// A pleasant resting expression per species (the painter still reads the
// species' own eye params; this only picks a starting archetype).
const DEFAULT_EYE_BY_SPECIES: Record<SpeciesId, EyeArchetype> = {
  flame: 'sharp',
  regent: 'angular',
  emerald: 'button',
  satin: 'sleepy',
  twilight: 'half-lid',
  lilac: 'sweet',
}

function emptySlots(): Record<string, SlotState> {
  const slots: Record<string, SlotState> = {}
  for (const s of SLOTS) slots[s.id] = { itemId: NONE_ITEM, colors: { base: '#ffffff' } }
  return slots
}

/** The seed genome — a procedural Flame Bower, no accessories. */
export function defaultGenome(): BirdGenome {
  const d = speciesDefaults(DEFAULT_SPECIES)
  return {
    version: 2,
    base: { kind: 'procedural', species: DEFAULT_SPECIES, parts: d.parts, morph: {}, palette: d.palette, face: d.face, pattern: null },
    identity: { name: '', personality: 'gentle' },
    slots: emptySlots(),
  }
}

/** The masked GLB lane seed (the legacy hero bird, full 6-zone recolor). */
export function defaultGlbGenome(): BirdGenome {
  return {
    version: 2,
    base: {
      kind: 'glb',
      species: 'masked',
      glbUrl: MASKED_GLB_URL,
      palette: { back: '#ff6b0d', belly: '#ffd3a5', accent: '#d11f1a', beak: '#2a1a14', legs: '#3a2418', eye: '#1a1a1a' },
    },
    identity: { name: '', personality: 'bright' },
    slots: emptySlots(),
  }
}

// ── Setters (pure; each returns a new genome — one undoable commit) ──────────────

export function setSpecies(genome: BirdGenome, speciesId: SpeciesId): BirdGenome {
  if (genome.base.kind !== 'procedural') {
    // Switching from the GLB lane into procedural — seed a fresh procedural base.
    const d = speciesDefaults(speciesId)
    return { ...genome, base: { kind: 'procedural', species: speciesId, parts: d.parts, morph: {}, palette: d.palette, face: d.face, pattern: null } }
  }
  const d = speciesDefaults(speciesId)
  // Picking a species loads its silhouette + palette + face defaults (AC-style),
  // resetting morph (deltas are species-relative). Identity + slots are kept.
  return { ...genome, base: { ...genome.base, species: speciesId, parts: d.parts, morph: {}, palette: d.palette, face: d.face } }
}

export function setGlbSpecies(genome: BirdGenome): BirdGenome {
  if (genome.base.kind === 'glb') return genome
  const glb = defaultGlbGenome().base
  return { ...genome, base: glb }
}

export function setPart(genome: BirdGenome, part: keyof ProceduralBase['parts'], value: string): BirdGenome {
  if (genome.base.kind !== 'procedural') return genome
  return { ...genome, base: { ...genome.base, parts: { ...genome.base.parts, [part]: value } } }
}

export function setZoneColor(genome: BirdGenome, zone: keyof PlumagePalette, hex: string): BirdGenome {
  return { ...genome, base: { ...genome.base, palette: { ...genome.base.palette, [zone]: hex } } }
}

export function setMorph(genome: BirdGenome, patch: MorphDelta): BirdGenome {
  if (genome.base.kind !== 'procedural') return genome
  return { ...genome, base: { ...genome.base, morph: mergeMorph(genome.base.morph, patch) } }
}

function mergeMorph(prev: MorphDelta, patch: MorphDelta): MorphDelta {
  const next: MorphDelta = { ...prev, ...patch }
  for (const key of ['body', 'headScale', 'beak', 'wing', 'tail', 'leg'] as const) {
    if (patch[key]) next[key] = { ...(prev[key] ?? {}), ...patch[key] }
  }
  return next
}

export function setFace(genome: BirdGenome, patch: Partial<FaceSpec>): BirdGenome {
  if (genome.base.kind !== 'procedural') return genome
  return { ...genome, base: { ...genome.base, face: { ...genome.base.face, ...patch } } }
}

export function setPattern(genome: BirdGenome, pattern: PatternSpec | null): BirdGenome {
  if (genome.base.kind !== 'procedural') return genome
  return { ...genome, base: { ...genome.base, pattern } }
}

export function setName(genome: BirdGenome, name: string): BirdGenome {
  return { ...genome, identity: { ...genome.identity, name: name.slice(0, NAME_MAX) } }
}

export function setPersonality(genome: BirdGenome, personality: Personality): BirdGenome {
  return { ...genome, identity: { ...genome.identity, personality } }
}

export function setSlotItem(genome: BirdGenome, slotId: string, itemId: string): BirdGenome {
  const item = ITEM_BY_ID[itemId]
  const colors: SlotColors = item ? { ...item.defaultColors } : { base: '#ffffff' }
  return { ...genome, slots: { ...genome.slots, [slotId]: { itemId, colors } } }
}

export function setSlotColor(genome: BirdGenome, slotId: string, channel: 'base' | 'accent', hex: string): BirdGenome {
  const prev = genome.slots[slotId] ?? { itemId: NONE_ITEM, colors: { base: '#ffffff' } }
  return { ...genome, slots: { ...genome.slots, [slotId]: { ...prev, colors: { ...prev.colors, [channel]: hex } } } }
}

// ── Validation ───────────────────────────────────────────────────────────────
// genomeError returns the first problem (descriptive) or null when valid.

function isOneOf<T extends string>(v: unknown, set: readonly T[]): v is T {
  return typeof v === 'string' && (set as readonly string[]).includes(v)
}

function paletteError(p: unknown, where: string): string | null {
  if (typeof p !== 'object' || p === null) return `${where} must be an object`
  const o = p as Record<string, unknown>
  for (const z of ZONE_IDS) if (!isHexColor(o[z])) return `${where}.${z} must be a hex color`
  for (const opt of ['faceColor', 'lidColor', 'eyeRingColor'] as const) {
    if (o[opt] !== undefined && o[opt] !== null && !isHexColor(o[opt])) return `${where}.${opt} must be a hex color or null`
  }
  return null
}

function slotsError(slots: unknown): string | null {
  if (typeof slots !== 'object' || slots === null) return 'slots must be an object'
  for (const [slotId, raw] of Object.entries(slots as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) return `slots.${slotId} must be an object`
    const st = raw as Record<string, unknown>
    if (typeof st.itemId !== 'string') return `slots.${slotId}.itemId must be a string`
    const colors = st.colors as Record<string, unknown> | undefined
    if (typeof colors !== 'object' || colors === null) return `slots.${slotId}.colors must be an object`
    if (!isHexColor(colors.base)) return `slots.${slotId}.colors.base must be a hex color`
    if (colors.accent !== undefined && !isHexColor(colors.accent)) return `slots.${slotId}.colors.accent must be a hex color when present`
  }
  return null
}

export function genomeError(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) return 'root must be an object'
  const o = obj as Record<string, unknown>
  if (o.version !== 2) return `version must be 2, got ${String(o.version)}`

  const base = o.base as Record<string, unknown> | undefined
  if (typeof base !== 'object' || base === null) return 'base must be an object'

  if (base.kind === 'procedural') {
    if (!isOneOf(base.species, SPECIES_IDS)) return `base.species must be one of ${SPECIES_IDS.join('|')}`
    const parts = base.parts as Record<string, unknown> | undefined
    if (typeof parts !== 'object' || parts === null) return 'base.parts must be an object'
    if (!isOneOf(parts.crest, CREST_TYPES)) return 'base.parts.crest invalid'
    if (!isOneOf(parts.tail, TAIL_TYPES)) return 'base.parts.tail invalid'
    if (!isOneOf(parts.beak, BEAK_TYPES)) return 'base.parts.beak invalid'
    if (typeof base.morph !== 'object' || base.morph === null) return 'base.morph must be an object'
    const pe = paletteError(base.palette, 'base.palette')
    if (pe) return pe
    const face = base.face as Record<string, unknown> | undefined
    if (typeof face !== 'object' || face === null) return 'base.face must be an object'
    if (!isOneOf(face.eye, EYE_ARCHETYPES)) return 'base.face.eye invalid'
    if (base.pattern !== null) {
      const pat = base.pattern as Record<string, unknown> | undefined
      if (typeof pat !== 'object' || pat === null) return 'base.pattern must be an object or null'
      if (!isOneOf(pat.type, PATTERN_TYPES)) return 'base.pattern.type invalid'
      if (!isOneOf(pat.zone, PATTERN_ZONES)) return 'base.pattern.zone invalid'
      if (typeof pat.scale !== 'number') return 'base.pattern.scale must be a number'
      if (!isHexColor(pat.color)) return 'base.pattern.color must be a hex color'
    }
  } else if (base.kind === 'glb') {
    if (typeof base.species !== 'string') return 'base.species must be a string'
    if (typeof base.glbUrl !== 'string' || base.glbUrl.length === 0) return 'base.glbUrl must be a non-empty string'
    const pe = paletteError(base.palette, 'base.palette')
    if (pe) return pe
  } else {
    return `base.kind must be 'procedural' or 'glb', got ${String(base.kind)}`
  }

  const identity = o.identity as Record<string, unknown> | undefined
  if (typeof identity !== 'object' || identity === null) return 'identity must be an object'
  if (typeof identity.name !== 'string') return 'identity.name must be a string'
  if (identity.name.length > NAME_MAX) return `identity.name must be ≤ ${NAME_MAX} chars`
  if (!isOneOf(identity.personality, PERSONALITIES)) return 'identity.personality invalid'

  return slotsError(o.slots)
}

export function isValidGenome(obj: unknown): obj is BirdGenome {
  return genomeError(obj) === null
}
