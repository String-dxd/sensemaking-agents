// Island spec loader — the engine's world source (R1/R2).
//
// Mirrors `islandLayout.js`'s loader+fallback shape: import the committed JSON
// (regenerated via `pnpm sync:island`), validate it through the ported
// validator, and fall back to a frozen known-good snapshot if the committed
// file is missing or invalid — boot never renders an empty world.

import { validateSpecObject } from '../State/islandSpecCore/specIO.ts'
import type { IslandSpec } from '../State/islandSpecCore/terrainGrid.ts'
import committed from './defaultIslandSpec.json'
import { FALLBACK_ISLAND_SPEC } from './fallbackIslandSpec.ts'

/** Validate an arbitrary parsed payload as the island spec; any failure routes
 *  to the frozen fallback (exported for the loader test's corruption path). */
export function loadIslandSpecFrom(parsed: unknown): IslandSpec {
  try {
    return validateSpecObject(parsed)
  } catch (error) {
    console.warn('[islandSpec] committed spec invalid — booting the frozen fallback island', error)
    return validateSpecObject(FALLBACK_ISLAND_SPEC)
  }
}

/** The committed island spec (validated at call time; falls back on failure). */
export function loadIslandSpec(): IslandSpec {
  return loadIslandSpecFrom(committed)
}
