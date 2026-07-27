import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error — engine source is JavaScript without companion declarations.
import Sound from '~/engine/student-space/Game/View/Sound.js'

/**
 * `suspend()` / `resume()` are the audio half of the route-change freeze:
 * navigating from the world to a routed sheet pauses the rAF loop, and the
 * soundtrack has to stop with it. Suspending the AudioContext alone is not
 * enough — streamed tracks play through looping <audio> elements that bypass
 * the Web Audio graph, so they have to be paused directly.
 *
 * `Sound`'s constructor reaches for the `State` singleton, WebAudio, and
 * window listeners, so (as in `Sound.mutePref.test.ts`) these tests invoke the
 * prototype methods against hand-rolled receivers that own only the fields the
 * methods touch.
 */

// A real streamed track id from the catalog — `resume()` looks the current
// track up to decide whether there is an element to restart.
const STREAM_ID = 'dreamy-flashback'

function makeStreamEl() {
  return { pause: vi.fn(), play: vi.fn(() => Promise.resolve()), volume: 0 }
}

type StreamEl = ReturnType<typeof makeStreamEl>

function makeReceiver(overrides: Record<string, unknown> = {}) {
  const el: StreamEl = makeStreamEl()
  const other: StreamEl = makeStreamEl()
  return {
    el,
    other,
    receiver: {
      _muted: false,
      _suspended: false,
      _trackId: STREAM_ID,
      _streamEls: new Map<string, StreamEl>([
        [STREAM_ID, el],
        ['tranquility', other],
      ]),
      ctx: { suspend: vi.fn(), resume: vi.fn(), currentTime: 0 },
      ...overrides,
    },
  }
}

const suspend = (receiver: unknown) => Sound.prototype.suspend.call(receiver)
const resume = (receiver: unknown) => Sound.prototype.resume.call(receiver)

describe('Sound.suspend', () => {
  it('suspends the AudioContext and pauses every stream element', () => {
    const { el, other, receiver } = makeReceiver()
    suspend(receiver)
    expect(receiver.ctx.suspend).toHaveBeenCalledTimes(1)
    expect(el.pause).toHaveBeenCalledTimes(1)
    expect(other.pause).toHaveBeenCalledTimes(1)
    expect(receiver._suspended).toBe(true)
  })

  it('still flags suspension when audio was never unlocked (ctx is null)', () => {
    // The AudioContext only exists after the first user gesture; suspending
    // before that must not throw and must still record the state.
    const { el, receiver } = makeReceiver({ ctx: null })
    expect(() => suspend(receiver)).not.toThrow()
    expect(receiver._suspended).toBe(true)
    expect(el.pause).toHaveBeenCalledTimes(1)
  })
})

describe('Sound.resume', () => {
  it('resumes the context and replays only the current track', () => {
    const { el, other, receiver } = makeReceiver({ _suspended: true })
    resume(receiver)
    expect(receiver.ctx.resume).toHaveBeenCalledTimes(1)
    expect(el.play).toHaveBeenCalledTimes(1)
    expect(other.play).not.toHaveBeenCalled()
    expect(receiver._suspended).toBe(false)
  })

  it('clears the flag but plays nothing while muted', () => {
    const { el, receiver } = makeReceiver({ _muted: true, _suspended: true })
    resume(receiver)
    expect(receiver.ctx.resume).not.toHaveBeenCalled()
    expect(el.play).not.toHaveBeenCalled()
    expect(receiver._suspended).toBe(false)
  })
})

describe('Sound.setMuted while suspended', () => {
  // setMuted() touches more of the instance than suspend/resume do, so the
  // receiver carries the mute-path collaborators too.
  function makeMuteReceiver(suspended: boolean) {
    const base = makeReceiver({ _muted: true, _suspended: suspended })
    const receiver = Object.assign(base.receiver, {
      _listeners: [] as Array<(m: boolean) => void>,
      _streamVolTarget: 0.55,
      unlocked: true,
      master: {
        gain: { cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn() },
      },
      _savePref: vi.fn(),
      _streamElIdOf: Sound.prototype._streamElIdOf,
    })
    return { ...base, receiver }
  }

  it('does not start playback when the user unmutes behind a routed sheet', () => {
    const { el, receiver } = makeMuteReceiver(true)
    Sound.prototype.setMuted.call(receiver, false)
    expect(receiver._muted).toBe(false)
    expect(el.play).not.toHaveBeenCalled()
  })

  it('starts playback after resume() lifts the suspension', () => {
    const { el, receiver } = makeMuteReceiver(true)
    Sound.prototype.setMuted.call(receiver, false)
    expect(el.play).not.toHaveBeenCalled()
    resume(receiver)
    expect(el.play).toHaveBeenCalledTimes(1)
  })

  it('starts playback immediately when unmuting while NOT suspended', () => {
    const { el, receiver } = makeMuteReceiver(false)
    Sound.prototype.setMuted.call(receiver, false)
    expect(el.play).toHaveBeenCalledTimes(1)
  })
})

describe('suspension holds across the async start paths', () => {
  // setTrack()'s stream start resolves asynchronously; a track change made
  // from the Settings sheet (world paused → suspended) must not start
  // playback behind the sheet.
  it('setTrack while suspended loads the stream but does not play it', async () => {
    const { other: nextEl, receiver: base } = makeReceiver({ _suspended: true })
    const receiver = Object.assign(base, {
      unlocked: true,
      _streamVolTarget: 0.55,
      _saveTrackPref: vi.fn(),
      _trackListeners: [] as Array<(id: string) => void>,
      _ensureStream: Sound.prototype._ensureStream,
      _currentStreamVolume: Sound.prototype._currentStreamVolume,
    })
    Sound.prototype.setTrack.call(receiver, 'tranquility')
    // _ensureStream resolves from the pre-seeded map; flush its microtask.
    await Promise.resolve()
    await Promise.resolve()
    expect(receiver._trackId).toBe('tranquility')
    expect(nextEl.play).not.toHaveBeenCalled()
    // Coming back to the world picks the switched track up.
    resume(receiver)
    expect(nextEl.play).toHaveBeenCalledTimes(1)
  })

  // The unlock gesture listener is window-global, so the first-ever click can
  // land inside a routed sheet. The fresh AudioContext + graph must inherit
  // the suspension instead of starting to sound behind the sheet.
  it('_unlock while suspended re-applies suspend() to the fresh graph', () => {
    class FakeAudioContext {
      state = 'running'
      resume = vi.fn()
      suspend = vi.fn()
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    try {
      const receiver = {
        unlocked: false,
        _suspended: true,
        ctx: null as unknown,
        _buildGraph: vi.fn(),
        suspend: vi.fn(),
      }
      Sound.prototype._unlock.call(receiver)
      expect(receiver._buildGraph).toHaveBeenCalledTimes(1)
      expect(receiver.unlocked).toBe(true)
      expect(receiver.suspend).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
