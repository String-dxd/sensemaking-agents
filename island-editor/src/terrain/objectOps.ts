// Pure, framework-agnostic operations on the placed-objects layer (v4). NO
// three/r3f imports — headless-testable, mirroring the immutable style of
// gridOps. `rand` is injected so tests are deterministic; App passes Math.random
// at runtime (runtime jitter is fine in editor app code — the no-Math.random
// rule only binds Workflow scripts).

import type { ObjectKind, PlacedObject } from './terrainGrid'

/** Build a placed object at cell (c, r) with a stable id + yaw/scale jitter.
 *  `rand` supplies ALL entropy (injected so tests are deterministic). The id
 *  packs two base-36 tokens so distinct placements collide with negligible
 *  probability; `hashString(id)` later seeds the model's procedural variety. */
export function makePlacedObject(kind: ObjectKind, c: number, r: number, rand: () => number): PlacedObject {
  const token = () => Math.floor(rand() * 1e9).toString(36)
  const id = `${kind}-${token()}-${token()}`
  const yaw = rand() * Math.PI * 2
  const scale = 0.85 + rand() * 0.3 // 0.85..1.15
  return { id, kind, c, r, yaw, scale }
}

/** Append an object (immutable — returns a new array). */
export function addObject(objects: PlacedObject[], o: PlacedObject): PlacedObject[] {
  return [...objects, o]
}

/** Remove the object with `id` (immutable; no-op if absent). */
export function removeObject(objects: PlacedObject[], id: string): PlacedObject[] {
  return objects.filter((o) => o.id !== id)
}
