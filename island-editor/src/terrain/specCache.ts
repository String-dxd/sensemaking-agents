// Per-edit derived-field memoization, keyed on the SPEC OBJECT (plan 029).
// Pure, framework-agnostic — NO three/r3f imports, mirroring grassField/
// shoreField. App mints a fresh spec identity per grid tick
// ({ ...specRef.current }) while the grid arrays mutate in place — so the
// spec object is the correct cache key (a WeakMap entry per edit, collected
// with the spec) and the grid object is NOT (its identity survives mutation;
// keying on it would serve stale fields). If App's spec-identity model ever
// changes, this comment is the tripwire.

import { type ShoreField, shoreDistanceField } from './shoreField'
import { blurTiers, type IslandSpec } from './terrainGrid'

const blurredCache = new WeakMap<IslandSpec, Float32Array>()

/** The 3×3-blurred tier field for this spec — computed once per edit and
 *  shared by every consumer (terrain cursor, object placement, grass, the
 *  character env, …). */
export function blurredForSpec(spec: IslandSpec): Float32Array {
  let b = blurredCache.get(spec)
  if (!b) {
    b = blurTiers(spec.grid)
    blurredCache.set(spec, b)
  }
  return b
}

const shoreCache = new WeakMap<IslandSpec, ShoreField>()

/** The signed shore-distance field for this spec — computed once per edit
 *  and shared by the sea foam texture AND the swim leash (previously two
 *  independent lattice+BFS runs per paint tick). */
export function shoreFieldForSpec(spec: IslandSpec): ShoreField {
  let f = shoreCache.get(spec)
  if (!f) {
    f = shoreDistanceField(spec.grid, spec.worldSize)
    shoreCache.set(spec, f)
  }
  return f
}
