// Versioned spec migration (plan 004, step 3).
//
// `migrateSpec` reads `meta.specVersion` off an unknown blob, applies every
// migration step from that version up to `SPEC_VERSION` in order, then
// validates the result against `CharacterSpecSchema`. v1→v1 is an identity
// transform today, but the chain, its tests, and the rule live now — see the
// migration rule atop `schema.ts`. Retrofitting this after designers have
// saved rosters is how tools corrupt work.

import { CharacterSpecSchema, SPEC_VERSION } from './schema'

/** One migration step per source version, producing the next version's shape. */
export type Migration = (old: unknown) => unknown

export const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: meta gains `species` (default 'custom' — no v1 spec ever
  // recorded a species) and specVersion advances.
  1: (old) => {
    const spec = old as { meta: Record<string, unknown> }
    return { ...spec, meta: { ...spec.meta, species: 'custom', specVersion: 2 } }
  },
}

function readSpecVersion(raw: unknown): number {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'meta' in raw &&
    typeof (raw as { meta?: unknown }).meta === 'object' &&
    (raw as { meta?: unknown }).meta !== null &&
    'specVersion' in (raw as { meta: object }).meta
  ) {
    const version = (raw as { meta: { specVersion: unknown } }).meta.specVersion
    if (typeof version === 'number') return version
  }
  throw new Error('migrateSpec: could not read a numeric meta.specVersion from the input')
}

/**
 * Migrate an unknown parsed-JSON blob up to the current `SPEC_VERSION`, then
 * validate it. Throws with a clear message if the source version is newer
 * than this build supports, if a migration step is missing from the chain,
 * or if the migrated result fails validation.
 */
export function migrateSpec(raw: unknown): import('./schema').CharacterSpec {
  const startVersion = readSpecVersion(raw)
  if (startVersion > SPEC_VERSION) {
    throw new Error(
      `migrateSpec: input specVersion ${startVersion} is newer than this build supports (SPEC_VERSION ${SPEC_VERSION})`,
    )
  }

  let version = startVersion
  let value = raw
  while (version < SPEC_VERSION) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      throw new Error(
        `migrateSpec: no migration registered for specVersion ${version} (needed to reach SPEC_VERSION ${SPEC_VERSION})`,
      )
    }
    value = migration(value)
    version += 1
  }

  const result = CharacterSpecSchema.safeParse(value)
  if (!result.success) {
    throw new Error(`migrateSpec: migrated spec failed validation — ${result.error.message}`)
  }
  return result.data
}
