// Body pattern-mask registry (plan 010). A pattern is a baked palette-mask
// VARIANT for a body archetype — per-species markings (robin breast, owl
// facial disc, duckling crown/wing band) riding the existing toon shader with
// no schema change: `materials.body.textureId` names the pattern, and the body
// mask URL swaps to the pattern's baked PNG. Hues stay in the character's
// palette; the pattern only reassigns channel weights.

import type { Archetype } from '../spec/schema'

const tex = (file: string) => new URL(`../../assets/anatomy/textures/${file}`, import.meta.url).href

export interface PatternDef {
  label: string
  /** Archetypes this pattern has a baked body mask for. */
  masks: Partial<Record<Archetype, string>>
}

export const PATTERN_REGISTRY = {
  'pattern-robin': { label: 'Robin', masks: { bird: tex('body-bird.pattern-robin.mask.png') } },
  'pattern-owl': { label: 'Owl', masks: { bird: tex('body-bird.pattern-owl.mask.png') } },
  'pattern-duckling': { label: 'Duckling', masks: { bird: tex('body-bird.pattern-duckling.mask.png') } },
  // Plan 019 bird set — rasterizer-resolved (no baked PNG); `masks` empty so
  // patternMaskUrl() returns null and getBodyMask() rasterizes the fields.
  'pattern-penguin': { label: 'Penguin', masks: {} },
  'pattern-eagle': { label: 'Eagle', masks: {} },
  'pattern-chicken': { label: 'Chicken', masks: {} },
  'pattern-peacock': { label: 'Peacock', masks: {} },
  'pattern-shiba': {
    label: 'Shiba points',
    masks: { 'biped-round': tex('body-biped-round.pattern-shiba.mask.png') },
  },
  'pattern-tabby': {
    label: 'Tabby stripes',
    masks: { 'biped-slim': tex('body-biped-slim.pattern-tabby.mask.png') },
  },
  'pattern-fox': {
    label: 'Fox socks',
    masks: { 'biped-slim': tex('body-biped-slim.pattern-fox.mask.png') },
  },
  'pattern-bear': {
    label: 'Bear muzzle',
    masks: { 'biped-round': tex('body-biped-round.pattern-bear.mask.png') },
  },
  'pattern-rabbit': {
    label: 'Rabbit underside',
    masks: { 'biped-slim': tex('body-biped-slim.pattern-rabbit.mask.png') },
  },
} as const satisfies Record<string, PatternDef>

export type PatternId = keyof typeof PATTERN_REGISTRY

export function getPattern(id: string): PatternDef | null {
  return (PATTERN_REGISTRY as Record<string, PatternDef>)[id] ?? null
}

/** Body mask URL for a pattern on a given archetype, or null if none applies. */
export function patternMaskUrl(id: string | undefined, archetype: Archetype): string | null {
  if (!id) return null
  return getPattern(id)?.masks[archetype] ?? null
}

/** True when a textureId resolves through the authored-mask path (plain authored or a baked pattern variant). */
export function resolvesAuthored(textureId: string): boolean {
  return textureId === 'authored' || getPattern(textureId) !== null
}
