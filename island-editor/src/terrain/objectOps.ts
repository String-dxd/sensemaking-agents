// Pure, framework-agnostic operations on the placed-objects layer (v4). NO
// three/r3f imports — headless-testable, mirroring the immutable style of
// gridOps. `rand` is injected so tests are deterministic; App passes Math.random
// at runtime (runtime jitter is fine in editor app code — the no-Math.random
// rule only binds Workflow scripts).

import type { ObjectKind, PlacedObject } from './terrainGrid'

/** Build a placed object at cell (c, r) with a stable id + yaw/scale jitter.
 *  `rand` supplies ALL entropy (injected so tests are deterministic). The id
 *  packs two base-36 tokens so distinct placements collide with negligible
 *  probability; `hashString(id)` later seeds the model's procedural variety.
 *
 *  The rand() CALL SEQUENCE is identical for every kind (token, token, yaw,
 *  scale) so existing deterministic tests for tree/bush/rock keep passing —
 *  only the character's scale result is overridden afterward. */
export function makePlacedObject(kind: ObjectKind, c: number, r: number, rand: () => number): PlacedObject {
  const token = () => Math.floor(rand() * 1e9).toString(36)
  const id = `${kind}-${token()}-${token()}`
  const yaw = rand() * Math.PI * 2
  // The character has ONE canonical size: its world scale is the runtime
  // height contract (CHARACTER_HEIGHT / CHARACTER_SOURCE_HEIGHT, applied in
  // useObjectModel), not decorative variety like the static kinds get.
  const scale = kind === 'character' ? 1 : 0.85 + rand() * 0.3 // 0.85..1.15
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

/** The first object occupying cell (c, r), or undefined if the cell is empty. */
export function objectAt(objects: PlacedObject[], c: number, r: number): PlacedObject | undefined {
  return objects.find((o) => o.c === c && o.r === r)
}

/** The placed character, or undefined if none exists yet (at most one ever does). */
export function findCharacter(objects: PlacedObject[]): PlacedObject | undefined {
  return objects.find((o) => o.kind === 'character')
}

/** Replace-on-place primitive: removes any existing `character` entries, then
 *  appends `o` — the single place a second character could ever be dropped
 *  gets normalized back down to one (immutable). */
export function withSingleCharacter(objects: PlacedObject[], o: PlacedObject): PlacedObject[] {
  return [...objects.filter((x) => x.kind !== 'character'), o]
}
