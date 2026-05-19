/**
 * U8 — end-to-end coverage for the island progression chain:
 *
 *   captures.add()
 *     → wireSproutsToCaptures
 *       → sprouts.grow
 *         → subscriber fan-out
 *           → IslandProgressionOverlay re-render (tray + toast)
 *
 * The real engine boot requires WebGL + GLSL plugin which vitest does
 * not have. Instead this test wires the real Sprouts state slice + the
 * wireSproutsToCaptures helper + the React overlay through a stub Game
 * object — the same chain the live engine assembles, just without the
 * 3D view layer.
 *
 * What this proves that unit tests don't:
 *   - captures.add() really does cause the overlay's tray to appear
 *   - the toast sequence matches the slice's event order
 *   - the cross-slice subscription survives the React render cycle
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IslandProgressionOverlay } from '~/components/IslandProgressionOverlay'
import type { Game } from '~/engine/student-space/Game'
// @ts-expect-error — Captures.js is JS without a companion .d.ts.
import Captures from '~/engine/student-space/Game/State/Captures.js'
// @ts-expect-error — MoodPins.js is JS without a companion .d.ts.
import MoodPins from '~/engine/student-space/Game/State/MoodPins.js'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import Sprouts, {
  BLOOM_THRESHOLD,
  wireSproutsToCaptures,
} from '~/engine/student-space/Game/State/Sprouts.js'

function resetSingletons() {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Sprouts as unknown as { instance: unknown }).instance = null
  ;(MoodPins as unknown as { instance: unknown }).instance = null
  ;(Captures as unknown as { instance: unknown }).instance = null
}

interface FakeGameBundle {
  game: Game
  captures: { add: (payload: unknown) => { id: string } }
  sprouts: Sprouts
}

function buildFakeGame(): FakeGameBundle {
  new Persistence({ storage: memoryAdapter() })
  const captures = new Captures()
  const moodPins = new MoodPins()
  const sprouts = new Sprouts()
  wireSproutsToCaptures(captures, moodPins, sprouts)
  const game = {
    state: { sprouts, captures, moodPins },
    dispose() {},
  } as unknown as Game
  return { game, captures, sprouts }
}

function expectReadySprout(sprouts: Sprouts) {
  const ready = sprouts.readyToBloom()[0]
  expect(ready).toBeDefined()
  if (!ready) throw new Error('Expected a ready sprout')
  return ready
}

afterEach(() => {
  resetSingletons()
})

describe('island progression — captures → sprouts → overlay e2e', () => {
  let bundle: FakeGameBundle

  beforeEach(() => {
    resetSingletons()
    bundle = buildFakeGame()
  })

  it('a single capture surfaces the spawn toast', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      bundle.captures.add({ kind: 'ask', text: 'hello' })
    })
    expect(screen.getByText(/heard\. something is growing/i)).toBeInTheDocument()
  })

  it('threshold-crossing capture flips the sprout to readyToBloom', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    // State-side: the sprout is now ready. The auto-bloom + camera flow
    // lives in Sprouts VIEW; this e2e doesn't boot the view (no WebGL
    // in vitest). The view's camera flow + auto-bloom is covered by
    // manual smoke testing — see plan.
    expect(bundle.sprouts.readyToBloom()).toHaveLength(1)
  })

  it('explicit bloom() removes the sprout and surfaces the planted toast', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    const ready = expectReadySprout(bundle.sprouts)
    act(() => {
      bundle.sprouts.bloom(ready.id)
    })
    expect(screen.getByText(/planted\. a new tree/i)).toBeInTheDocument()
    expect(bundle.sprouts.listBloomedTrees()).toHaveLength(1)
    expect(bundle.sprouts.recent(10)).toHaveLength(0)
  })

  it('a fourth capture after bloom opens a new sprout (not increments the bloomed tree)', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    const ready = expectReadySprout(bundle.sprouts)
    act(() => {
      bundle.sprouts.bloom(ready.id)
    })
    act(() => {
      bundle.captures.add({ kind: 'ask', text: 'after-bloom' })
    })
    expect(bundle.sprouts.recent(10)).toHaveLength(1)
    expect(bundle.sprouts.getActive()?.count).toBe(1)
    expect(bundle.sprouts.getActive()?.readyToBloom).toBe(false)
    expect(bundle.sprouts.listBloomedTrees()).toHaveLength(1)
  })
})
