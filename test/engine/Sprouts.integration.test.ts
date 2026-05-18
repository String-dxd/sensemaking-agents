/**
 * Integration coverage for U2 — the cross-slice wiring helper
 * `wireSproutsToCaptures` that lives in Sprouts.js and is invoked by
 * State.js to bridge Captures + MoodPins → Sprouts.grow.
 *
 * The helper is tested in isolation (not by booting State.js itself)
 * because importing State.js transitively pulls in View modules with
 * GLSL shaders that vitest can't parse without the glsl plugin. The
 * full chain — State.js → engine — is exercised by U8's e2e test that
 * runs against StudentSpaceHost with mocked engine internals.
 *
 * Verifies:
 *   - captures.add() grows the active sprout via the wired subscription
 *   - moodPins.add() grows the same active sprout
 *   - moodPins.patch() (post-save cause/note re-fire) does NOT double-increment
 *   - a throwing Sprouts.grow does not abort host-slice fan-out or skip persist
 *   - the returned unsubscribe handle detaches both subscriptions
 *   - three captures grow to ready-to-bloom; a fourth opens a new sprout
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Sprouts, { wireSproutsToCaptures } from '~/engine/student-space/Game/State/Sprouts.js'
// @ts-expect-error — MoodPins.js is JS without a companion .d.ts.
import MoodPins from '~/engine/student-space/Game/State/MoodPins.js'
// @ts-expect-error — Captures.js is JS without a companion .d.ts.
import Captures from '~/engine/student-space/Game/State/Captures.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'

function resetSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  ;(MoodPins as unknown as { instance: unknown }).instance = null
  ;(Captures as unknown as { instance: unknown }).instance = null
}

afterEach(() => {
  resetSingletons()
})

describe('wireSproutsToCaptures', () => {
  let captures: Captures
  let moodPins: MoodPins
  let sprouts: Sprouts
  let unwire: () => void

  beforeEach(() => {
    resetSingletons()
    new Persistence({ storage: memoryAdapter() })
    captures = new Captures()
    moodPins = new MoodPins()
    sprouts = new Sprouts()
    unwire = wireSproutsToCaptures(captures, moodPins, sprouts)
  })

  it('captures.add() grows the active sprout', () => {
    expect(sprouts.recent(10)).toHaveLength(0)
    captures.add({ kind: 'ask', text: 'hello' })
    expect(sprouts.recent(10)).toHaveLength(1)
    expect(sprouts.getActive()!.count).toBe(1)
  })

  it('moodPins.add() grows the same active sprout that captures opened', () => {
    captures.add({ kind: 'ask', text: 'hello' })
    moodPins.add({ emotion: 'joy', intensity: 2 })
    const active = sprouts.getActive()!
    expect(active.count).toBe(2)
    expect(active.captureRefs).toHaveLength(2)
  })

  it('moodPins.patch() (post-save cause/note re-fire) does NOT double-increment', () => {
    const pin = moodPins.add({ emotion: 'joy', intensity: 2 })
    expect(sprouts.getActive()!.count).toBe(1)
    moodPins.patch(pin.id, { cause: 'school' })
    // Re-fire from patch must not increment because the pin id is
    // already in captureRefs.
    expect(sprouts.getActive()!.count).toBe(1)
  })

  it('a throwing Sprouts.grow does NOT abort captures persistence (defense in depth)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const originalGrow = sprouts.grow.bind(sprouts)
    sprouts.grow = () => {
      throw new Error('forced grow failure')
    }

    captures.add({ kind: 'ask', text: 'survives' })
    expect(captures.entries).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(
      '[sprouts] grow from capture failed',
      expect.any(Error),
    )

    sprouts.grow = originalGrow
    warnSpy.mockRestore()
  })

  it('three captures grow one sprout to ready-to-bloom', () => {
    captures.add({ kind: 'ask', text: 'one' })
    captures.add({ kind: 'ask', text: 'two' })
    captures.add({ kind: 'ask', text: 'three' })
    const sprout = sprouts.recent(10)[0]!
    expect(sprout.count).toBe(3)
    expect(sprout.readyToBloom).toBe(true)
    expect(sprouts.readyToBloom()).toHaveLength(1)
  })

  it('a fourth capture spawns a new sprout after the first is ready', () => {
    for (let i = 0; i < 3; i++) captures.add({ kind: 'ask', text: `${i}` })
    captures.add({ kind: 'ask', text: 'fourth' })
    expect(sprouts.recent(10)).toHaveLength(2)
    expect(sprouts.getActive()!.count).toBe(1)
    expect(sprouts.getActive()!.readyToBloom).toBe(false)
  })

  it('unwire() detaches both subscriptions', () => {
    captures.add({ kind: 'ask', text: 'before' })
    expect(sprouts.getActive()!.count).toBe(1)
    unwire()
    captures.add({ kind: 'ask', text: 'after' })
    moodPins.add({ emotion: 'joy', intensity: 1 })
    // Counts must not change after unwire.
    expect(sprouts.getActive()!.count).toBe(1)
  })
})
