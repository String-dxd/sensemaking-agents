// Constrained randomize (the Mii lesson): every roll stays within the curated
// item catalog + feather presets, so a random bird is always shareable, never
// junk. Pure — takes an injected `rand: () => number` (0..1) for determinism in
// tests and for the app to pass `Math.random`.

import { type BirdConfig, defaultBirdConfig, setSlotItem } from './birdConfig'
import { FEATHER_PRESETS } from './palettes'
import { itemsForSlot, NONE_ITEM, SLOTS } from './slots'

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

export function randomizeConfig(rand: () => number = Math.random): BirdConfig {
  let config = defaultBirdConfig()

  const preset = pick(rand, FEATHER_PRESETS)
  config = { ...config, featherPalette: { ...preset.palette } }

  for (const slot of SLOTS) {
    const choices = [NONE_ITEM, ...itemsForSlot(slot.id).map((i) => i.id)]
    config = setSlotItem(config, slot.id, pick(rand, choices))
  }

  return config
}
