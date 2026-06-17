// Constrained randomize (the Mii lesson): every roll stays within the curated
// vocabularies — a species silhouette, curated per-zone swatches, a real eye
// archetype, a bounded morph jitter, and catalog accessories — so a random bird
// is always coherent and shareable, never junk. Personality biases the ranges so
// "Surprise me" reads intentional, not deformed. Pure — takes an injected
// `rand: () => number` (0..1) for deterministic tests + `Math.random` in the app.

import {
  type BeakType,
  type BirdGenome,
  CREST_TYPES,
  type CrestType,
  defaultGenome,
  EYE_ARCHETYPES,
  type EyeArchetype,
  type MorphDelta,
  PATTERN_TYPES,
  PATTERN_ZONES,
  type PatternSpec,
  type PatternType,
  type Personality,
  PERSONALITIES,
  type ProceduralBase,
  type SpeciesId,
  SPECIES_IDS,
  TAIL_TYPES,
  type TailType,
} from './genome'
import { PATTERN_SWATCHES, ZONE_SWATCHES } from './palettes'
import { itemsForSlot, NONE_ITEM, SLOTS } from './slots'

const BEAK_TYPES_LOCAL: BeakType[] = ['slender', 'stout', 'hooked', 'short']

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

// Personality → soft biases (probabilities + jitter envelopes). Keeps random
// birds expressive but never broken: brights get vivid plumage + open eyes,
// grumps get darker accents + angular eyes, etc.
interface PersonaBias {
  eyes: EyeArchetype[]
  patternChance: number
  morphAmt: number // 0..1 multiplier on the bounded morph jitter
}
const PERSONA_BIAS: Record<Personality, PersonaBias> = {
  bright: { eyes: ['button', 'wide', 'star', 'sweet'], patternChance: 0.5, morphAmt: 0.5 },
  bold: { eyes: ['sharp', 'angular', 'wide'], patternChance: 0.6, morphAmt: 0.8 },
  gentle: { eyes: ['sweet', 'button', 'sleepy'], patternChance: 0.3, morphAmt: 0.4 },
  grumpy: { eyes: ['angular', 'sharp', 'half-lid'], patternChance: 0.4, morphAmt: 0.7 },
  sporty: { eyes: ['sharp', 'wide', 'button'], patternChance: 0.55, morphAmt: 0.9 },
  quirky: { eyes: ['star', 'half-lid', 'angular', 'wide'], patternChance: 0.7, morphAmt: 1.0 },
}

const NAMES = [
  'Pip',
  'Mango',
  'Juno',
  'Sora',
  'Pebble',
  'Echo',
  'Tally',
  'Wren',
  'Clover',
  'Biscuit',
  'Nimbus',
  'Maple',
  'Kiwi',
  'Ziggy',
  'Plum',
  'Comet',
]

// Bounded per-param morph MULTIPLIERS around the species base (1.0 = unchanged),
// so the species silhouette is never lost. Symmetric 1 ± range × amount.
function jitterMul(rand: () => number, range: number, amount: number): number {
  return 1 + (rand() * 2 - 1) * range * amount
}

function randomMorph(rand: () => number, amount: number): MorphDelta {
  if (amount <= 0) return {}
  return {
    bodyY: jitterMul(rand, 0.05, amount),
    headSize: jitterMul(rand, 0.06, amount),
    neckH: jitterMul(rand, 0.12, amount),
    crestScale: jitterMul(rand, 0.2, amount),
    body: { x: jitterMul(rand, 0.14, amount), y: jitterMul(rand, 0.1, amount) },
    headScale: { x: jitterMul(rand, 0.08, amount) },
    beak: { length: jitterMul(rand, 0.18, amount) },
    wing: { length: jitterMul(rand, 0.1, amount) },
    tail: { scaleY: jitterMul(rand, 0.18, amount) },
  }
}

export function randomizeConfig(rand: () => number = Math.random): BirdGenome {
  const genome = defaultGenome()
  const species = pick(rand, SPECIES_IDS) as SpeciesId
  const personality = pick(rand, PERSONALITIES) as Personality
  const bias = PERSONA_BIAS[personality]

  const parts: ProceduralBase['parts'] = {
    crest: pick(rand, CREST_TYPES) as CrestType,
    tail: pick(rand, TAIL_TYPES) as TailType,
    beak: pick(rand, BEAK_TYPES_LOCAL) as BeakType,
  }

  // Curated per-zone swatches → coherent by construction.
  const palette = {
    back: pick(rand, ZONE_SWATCHES.back),
    belly: pick(rand, ZONE_SWATCHES.belly),
    accent: pick(rand, ZONE_SWATCHES.accent),
    beak: pick(rand, ZONE_SWATCHES.beak),
    legs: pick(rand, ZONE_SWATCHES.legs),
    eye: pick(rand, ZONE_SWATCHES.eye),
  }

  const eye = pick(rand, bias.eyes.length ? bias.eyes : EYE_ARCHETYPES) as EyeArchetype
  const morph = randomMorph(rand, bias.morphAmt)

  // Plumage patterns roll in P3 (pattern rendering); keep the bias + draws so the
  // PRNG stream is stable when P3 turns them on.
  const wantsPattern = rand() < bias.patternChance
  const pattern: PatternSpec | null = wantsPattern
    ? {
        type: pick(rand, PATTERN_TYPES.filter((t) => t !== 'none')) as Exclude<PatternType, 'none'>,
        zone: pick(rand, PATTERN_ZONES),
        scale: 0.4 + rand() * 0.5,
        color: pick(rand, PATTERN_SWATCHES),
      }
    : null

  const base: ProceduralBase = { kind: 'procedural', species, parts, morph, palette, face: { eye }, pattern }

  let next: BirdGenome = {
    ...genome,
    base,
    identity: { name: pick(rand, NAMES), personality },
  }

  // Accessories — constrained to the catalog (NONE is always an option).
  for (const slot of SLOTS) {
    const choices = [NONE_ITEM, ...itemsForSlot(slot.id).map((i) => i.id)]
    const itemId = pick(rand, choices)
    next = setSlotItemLocal(next, slot.id, itemId)
  }
  return next
}

// Local slot seeding (avoids importing the genome setter to keep this module's
// import surface flat; identical semantics).
function setSlotItemLocal(genome: BirdGenome, slotId: string, itemId: string): BirdGenome {
  const item = itemsForSlot(slotId).find((i) => i.id === itemId)
  const colors = item ? { ...item.defaultColors } : { base: '#ffffff' }
  return { ...genome, slots: { ...genome.slots, [slotId]: { itemId, colors } } }
}
