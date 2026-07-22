/**
 * Coverage for the Path Finder status-preview override slice
 * (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * Pins set / clear / hydrate / persistence-round-trip and the lenient
 * stance on bad payloads. The actual `TrajectorySheet` integration (pill
 * label + body branching) is exercised by the existing engine smoke
 * tests once the override is wired into State; this file owns the slice
 * in isolation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import IdentityStatusOverride from '~/engine/student-space/Game/State/IdentityStatusOverride.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

function freshPersistence() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IdentityStatusOverride as unknown as { instance: unknown }).instance = null
  return new Persistence({ storage: memoryAdapter() })
}

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(IdentityStatusOverride as unknown as { instance: unknown }).instance = null
})

describe('IdentityStatusOverride', () => {
  it('defaults to the Searching preview', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    expect(slice.current).toBe('searching')
    expect(slice.isActive).toBe(true)
  })

  it('accepts valid Marcia status ids and reports as active', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    slice.setOverride('searching')
    expect(slice.current).toBe('searching')
    expect(slice.isActive).toBe(true)
  })

  it('rejects unknown ids with a console.warn and keeps the previous value', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    slice.setOverride('searching')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = slice.setOverride('nonsense' as never)
    expect(result).toBe('searching')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('clears the override when given null or the "auto" sentinel', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    slice.setOverride('achieved')
    slice.setOverride(null)
    expect(slice.current).toBeNull()
    slice.setOverride('foreclosed')
    slice.setOverride('auto')
    expect(slice.current).toBeNull()
  })

  it('notifies subscribers on real changes and skips no-op writes', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    const sub = vi.fn()
    slice.subscribe(sub)
    slice.setOverride('diffused')
    slice.setOverride('diffused')
    expect(sub).toHaveBeenCalledTimes(1)
    slice.setOverride('achieved')
    expect(sub).toHaveBeenCalledTimes(2)
  })

  it('round-trips through Persistence', () => {
    const persistence = freshPersistence()
    const slice = new IdentityStatusOverride()
    slice.setOverride('foreclosed')
    // Persistence.save is debounced; flush() drains pending timers
    // synchronously so the load() below reads the just-written value.
    persistence.flush()

    ;(IdentityStatusOverride as unknown as { instance: unknown }).instance = null
    const rehydrated = new IdentityStatusOverride()
    rehydrated.hydrate(persistence.load().identityStatusOverride as never)
    expect(rehydrated.current).toBe('foreclosed')
  })

  it('hydrates from a bare-string snapshot too (forwards-compat)', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    slice.hydrate('searching')
    expect(slice.current).toBe('searching')
  })

  it('ignores garbage hydrate payloads', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    // Seed a known value so the assertions test "garbage leaves state
    // untouched" independent of the constructor default.
    slice.setOverride('foreclosed')
    slice.hydrate('not-a-status' as never)
    expect(slice.current).toBe('foreclosed')
    slice.hydrate(42 as never)
    expect(slice.current).toBe('foreclosed')
    slice.hydrate(undefined)
    expect(slice.current).toBe('foreclosed')
  })

  it('isolates subscriber crashes from the fan-out', () => {
    freshPersistence()
    const slice = new IdentityStatusOverride()
    const good = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    slice.subscribe(() => {
      throw new Error('boom')
    })
    slice.subscribe(good)
    slice.setOverride('starter')
    expect(good).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
