// Curated color presets. Pure data. Palette discipline (the AC lesson): a small
// shared set of swatches per plumage ZONE, not an open color space — so every
// pick (and every random roll) stays coherent and shareable. Each zone exposes
// a pool tuned to its role (saturated bodies, pale bellies, dark naturals for
// beak/legs/eye), which both the color picker and constrained-randomize draw from.

import type { PatternZone, ZoneId } from './genome'

export const ZONE_SWATCHES: Record<ZoneId, string[]> = {
  // Body — saturated, readable-at-distance hues.
  back: ['#e63946', '#ff6b0d', '#ffd23f', '#3aab48', '#2c7dd2', '#5a4cb8', '#a065d8', '#e76f51', '#2a9d8f', '#264653'],
  // Belly / chest — pale tints that read as "lighter than the body".
  belly: ['#ffd3a5', '#fff3a3', '#dff0a5', '#cfe3f2', '#d0c8ec', '#ecd8f2', '#faf1dc', '#ffe6ee', '#e8f5e9', '#ffffff'],
  // Accent — bright complements for wing tips / tail / cheeks.
  accent: ['#ffb347', '#f4a261', '#f4e07a', '#5fb8ff', '#9a8aff', '#c08ee8', '#ff8e8e', '#ffd45a', '#7ed957', '#ff5ca8'],
  // Beak — warm naturals + a few darks.
  beak: ['#2a1a14', '#3a2418', '#e9a23b', '#f4a261', '#caa472', '#1a2a3a', '#2a1f10', '#d68a3c'],
  // Legs / feet — muted naturals.
  legs: ['#3a2418', '#2a3a22', '#1a2830', '#5a5048', '#caa472', '#3a2848', '#2a2440', '#7a6a58'],
  // Eyes — near-blacks + dark browns.
  eye: ['#1a1a1a', '#0a0a0a', '#2a1a14', '#1a2818', '#241a2a', '#3a2418'],
}

/** A flat curated set for the generic accessory / pattern color pickers. */
export const SWATCHES: string[] = [
  '#ffffff',
  '#1a1a1a',
  '#e4572e',
  '#f4a261',
  '#ffd23f',
  '#3a7d44',
  '#3aab48',
  '#2c7dd2',
  '#5fb8ff',
  '#5a4cb8',
  '#9a8aff',
  '#a065d8',
  '#d11f1a',
  '#f6e05e',
  '#e9c46a',
]

/** Pattern overlay colors — high-contrast inks that read over a body color. */
export const PATTERN_SWATCHES: string[] = ['#1a1a1a', '#ffffff', '#2a1a14', '#3a2418', '#f4e07a', '#ffb347', '#d11f1a', '#5fb8ff']

export const PATTERN_ZONE_LABELS: Record<PatternZone, string> = {
  back: 'Body',
  belly: 'Belly',
  wing: 'Wings',
}
