/**
 * Game.setRenderActive() / rAF gate coverage (plan unit U6).
 *
 * Scope simplification — the production `Game` constructor instantiates
 * `View`, `State`, and `Debug`, all of which boot real WebGL / audio /
 * persistence subsystems. None of that machinery is exercised by the
 * render-gate logic, which is purely flag arithmetic: cancel an rAF on
 * flip-false, schedule one on flip-true.
 *
 * To keep the test focused, we instantiate a minimal stand-in by reading
 * Game's prototype methods (`setRenderActive`, `update`, `_handleVisibilityChange`)
 * and invoking them against a hand-rolled context object that owns just the
 * flags + the rAF schedule. This is the same trick `update()` itself relies
 * on: it touches only `this._running`, `this._hidden`, `this._renderActive`,
 * `this._rafId`, `this.state`, and `this.view`.
 *
 * Imports go through `Game.js` directly so a future refactor of the method
 * bodies (e.g. moving the rAF schedule into a helper) breaks this test —
 * which is the point. If you change the gate's behaviour, you should be
 * forced to revisit these scenarios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy dependencies so importing Game.js doesn't try to build a
// WebGL context, a real Persistence layer, etc. Each mock returns a default
// constructible class with no-op methods — Game.js only touches `state` and
// `view` from inside `update()`, which we never enter in these tests.
vi.mock('~/engine/student-space/Game/Debug/Debug.js', () => ({
  default: class StubDebug {},
}))
vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: class StubState {
    update() {}
    resize() {}
  },
}))
vi.mock('~/engine/student-space/Game/View/View.js', () => ({
  default: class StubView {
    update() {}
    resize() {}
  },
}))
vi.mock('~/engine/student-space/Game/View/OverlayController.js', () => ({
  default: class StubOverlay {
    static instance: unknown = null
    static getInstance() {
      return null
    }
  },
}))
vi.mock('~/engine/student-space/Game/State/MoodPins.js', () => ({
  default: class StubMoodPins {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Captures.js', () => ({
  default: class StubCaptures {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Profile.js', () => ({
  default: class StubProfile {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Onboarding.js', () => ({
  default: class StubOnboarding {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/CalendarEvents.js', () => ({
  default: class StubCalendarEvents {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/TeacherLetters.js', () => ({
  default: class StubTeacherLetters {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Sprouts.js', () => ({
  default: class StubSprouts {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Relationships.js', () => ({
  default: class StubRelationships {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Choices.js', () => ({
  default: class StubChoices {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/IdentityStatusOverride.js', () => ({
  default: class StubIdentityStatusOverride {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/IslandSnapshotBridge.js', () => ({
  default: class StubIslandSnapshotBridge {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/State/Auth.js', () => ({
  default: class StubAuth {
    static instance: unknown = null
  },
}))
vi.mock('~/engine/student-space/Game/index.js', () => ({
  HOST_BODY_CLASSES: [] as readonly string[],
}))

import Game from '~/engine/student-space/Game/Game.js'

interface GameInternals {
  _running: boolean
  _hidden: boolean
  _renderActive: boolean
  _rafId: number | null
  state: { update: () => void }
  view: { update: () => void }
  update(): void
  setRenderActive(active: boolean): void
  _handleVisibilityChange(): void
}

/**
 * Build a minimal stand-in that owns only the fields setRenderActive/update
 * touch. We delegate the actual method calls to `Game.prototype` so any
 * behaviour change in the engine surfaces here.
 */
function makeHarness(initial: Partial<GameInternals> = {}): GameInternals {
  const proto = (Game as unknown as { prototype: GameInternals }).prototype
  const ctx: GameInternals = {
    _running: true,
    _hidden: false,
    _renderActive: true,
    _rafId: null,
    state: { update: vi.fn() },
    view: { update: vi.fn() },
    update: proto.update,
    setRenderActive: proto.setRenderActive,
    _handleVisibilityChange: proto._handleVisibilityChange,
    ...initial,
  }
  return ctx
}

describe('Game.setRenderActive / rAF gate (U6)', () => {
  // The spy types are opaque (vitest's overloaded MockInstance generics
  // don't compose cleanly with the global Window definition). We restore
  // via the explicit `mockRestore()` calls in afterEach so the lack of an
  // outer annotation here is fine.
  let rafSpy: { mockRestore(): void; mockClear(): void; mock: { calls: unknown[][] } }
  let cancelSpy: { mockRestore(): void; mockClear(): void; mock: { calls: unknown[][] } }
  let rafCallback: FrameRequestCallback | null = null
  let nextHandle = 1

  beforeEach(() => {
    rafCallback = null
    nextHandle = 1
    // requestAnimationFrame returns an opaque handle; the engine stores it
    // in `_rafId` and passes it to cancelAnimationFrame later. We capture
    // the most-recent callback so tests can drive a "frame" manually.
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb
      return nextHandle++
    })
    cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    rafSpy.mockRestore()
    cancelSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('cancels the in-flight rAF and nulls _rafId on setRenderActive(false)', () => {
    const ctx = makeHarness({ _rafId: 42 })
    ctx.setRenderActive(false)
    expect(cancelSpy).toHaveBeenCalledWith(42)
    expect(ctx._rafId).toBeNull()
    expect(ctx._renderActive).toBe(false)
  })

  it('reschedules an rAF when setRenderActive(true) flips back on (running + not hidden)', () => {
    const ctx = makeHarness({ _renderActive: false, _rafId: null })
    ctx.setRenderActive(true)
    // update() runs once synchronously (it ticks state/view and schedules
    // the next frame). The schedule path is the proof we resumed.
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(ctx._renderActive).toBe(true)
    expect(ctx._rafId).not.toBeNull()
    expect(ctx.state.update).toHaveBeenCalledTimes(1)
    expect(ctx.view.update).toHaveBeenCalledTimes(1)
  })

  it('does NOT reschedule when the tab is hidden — the visibilitychange gate still says false', () => {
    const ctx = makeHarness({ _renderActive: false, _hidden: true, _rafId: null })
    ctx.setRenderActive(true)
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx._rafId).toBeNull()
    expect(ctx._renderActive).toBe(true)
  })

  it('is a no-op when called with the same value as the current flag', () => {
    // Already paused; pausing again must not cancel or null anything.
    const ctx = makeHarness({ _renderActive: false, _rafId: null })
    ctx.setRenderActive(false)
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()

    // Already running; resuming again must not double-schedule.
    const ctx2 = makeHarness({ _renderActive: true, _rafId: 17 })
    ctx2.setRenderActive(true)
    expect(cancelSpy).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx2._rafId).toBe(17)
  })

  it('update() short-circuits when _renderActive is false', () => {
    const ctx = makeHarness({ _renderActive: false })
    ctx.update()
    expect(ctx.state.update).not.toHaveBeenCalled()
    expect(ctx.view.update).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('update() short-circuits when _running is false (regression guard)', () => {
    const ctx = makeHarness({ _running: false })
    ctx.update()
    expect(ctx.state.update).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('update() short-circuits when _hidden is true', () => {
    const ctx = makeHarness({ _hidden: true })
    ctx.update()
    expect(ctx.state.update).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('does NOT start a second rAF loop when setRenderActive(true) is called and _rafId is already non-null', () => {
    // Simulating the double-mount path: an rAF is already scheduled.
    // setRenderActive(true) shouldn't kick off another one.
    const ctx = makeHarness({ _renderActive: false, _rafId: 99 })
    // Flip true; resume only when _rafId is null.
    ctx._renderActive = false
    ctx.setRenderActive(true)
    // The implementation only schedules when _rafId == null, so it
    // should NOT have called rAF here.
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx._rafId).toBe(99)
  })

  it('integration: pause → resume cycles drive cancel + schedule in order', () => {
    const ctx = makeHarness()
    // Prime an in-flight rAF (as if update() had scheduled one).
    ctx._rafId = 7
    ctx.setRenderActive(false)
    expect(cancelSpy).toHaveBeenCalledWith(7)
    expect(ctx._rafId).toBeNull()
    ctx.setRenderActive(true)
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(ctx._rafId).not.toBeNull()
  })

  it('_handleVisibilityChange respects _renderActive — does not resume audio/rAF while paused by route', () => {
    // While on `/profile` (route-paused), tab hidden→visible must not
    // re-fire update() and must not call rAF.
    const ctx = makeHarness({ _renderActive: false, _hidden: true, _rafId: null })
    // Simulate the document flipping back to visible.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    ctx._handleVisibilityChange()
    expect(ctx._hidden).toBe(false)
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx.state.update).not.toHaveBeenCalled()
  })

  it('_handleVisibilityChange resumes update() when render is active and tab goes visible', () => {
    const ctx = makeHarness({ _renderActive: true, _hidden: true, _rafId: null })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    ctx._handleVisibilityChange()
    expect(ctx._hidden).toBe(false)
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(ctx.state.update).toHaveBeenCalledTimes(1)
  })

  // Drive a captured rAF callback so the schedule path is exercised end-to-end.
  it('the rAF callback drives the next update() — running loop continues', () => {
    const ctx = makeHarness({ _renderActive: true, _rafId: null })
    ctx.update()
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(rafCallback).not.toBeNull()
    // Drive the captured frame — should tick again and schedule another.
    rafCallback?.(performance.now())
    expect(ctx.state.update).toHaveBeenCalledTimes(2)
    expect(rafSpy).toHaveBeenCalledTimes(2)
  })
})
