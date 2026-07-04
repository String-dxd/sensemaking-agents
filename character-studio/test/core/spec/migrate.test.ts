import { describe, expect, it } from 'vitest'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'
import { MIGRATIONS, migrateSpec } from '../../../src/core/spec/migrate'
import { SPEC_VERSION } from '../../../src/core/spec/schema'

describe('migrateSpec', () => {
  it('passes a current-version spec through unchanged (identity)', () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    const migrated = migrateSpec(spec)
    expect(migrated).toEqual(spec)
  })

  it('throws a clear message when meta.specVersion cannot be read', () => {
    expect(() => migrateSpec({})).toThrow(/could not read/i)
    expect(() => migrateSpec(null)).toThrow(/could not read/i)
    expect(() => migrateSpec({ meta: {} })).toThrow(/could not read/i)
  })

  it('throws a clear message when the input specVersion is newer than this build supports', () => {
    const spec = createDefaultCharacter('biped-round', 'gentle')
    const future = { ...spec, meta: { ...spec.meta, specVersion: SPEC_VERSION + 1 } }
    expect(() => migrateSpec(future)).toThrow(/newer than this build supports/i)
  })

  it('throws a clear message when a migration step is missing from the chain', () => {
    expect(() => migrateSpec({ meta: { specVersion: -1 } })).toThrow(/no migration registered/i)
  })

  it('runs a synthetic v0 -> v1 migration end to end and the result validates', () => {
    // Register a throwaway v0 migration for this test only, exercising the
    // real machinery (not a stand-in) — restored in `finally` so it can't
    // leak into other tests.
    const legacyV0 = { meta: { specVersion: 0, legacyName: 'Rex' } }
    MIGRATIONS[0] = (old) => {
      const legacy = old as { meta: { legacyName: string } }
      const fresh = createDefaultCharacter('biped-round', 'gentle')
      return { ...fresh, meta: { ...fresh.meta, name: legacy.meta.legacyName } }
    }
    try {
      const migrated = migrateSpec(legacyV0)
      expect(migrated.meta.specVersion).toBe(SPEC_VERSION)
      expect(migrated.meta.name).toBe('Rex')
    } finally {
      delete MIGRATIONS[0]
    }
  })
})
