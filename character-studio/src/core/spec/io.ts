// Serialize/parse helpers for CharacterSpec JSON files (plan 004, step 4).
//
// File extension contract: saved characters use `<name>.character.json`.

import { migrateSpec } from './migrate'
import type { CharacterSpec } from './schema'

export const CHARACTER_FILE_EXTENSION = '.character.json'

/** Recursively sorts object keys (arrays keep their order) so serialized
 * output is deterministic and git diffs of saved characters are readable. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortDeep(input[key])
    }
    return sorted
  }
  return value
}

/** Stable, key-sorted, pretty-printed JSON — deterministic across calls. */
export function serializeSpec(spec: CharacterSpec): string {
  return `${JSON.stringify(sortDeep(spec), null, 2)}\n`
}

/** Parse a saved character file's contents, migrating + validating it. */
export function parseSpec(json: string): CharacterSpec {
  const raw: unknown = JSON.parse(json)
  return migrateSpec(raw)
}
