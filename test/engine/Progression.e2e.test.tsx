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
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IslandProgressionOverlay } from '~/components/IslandProgressionOverlay'
import type { Game } from '~/engine/student-space/Game'
import Sprouts, {
  BLOOM_THRESHOLD,
  wireSproutsToCaptures,
} from '~/engine/student-space/Game/State/Sprouts.js'
import Persistence, {
  memoryAdapter,
} from '~/engine/student-space/Game/State/Persistence.js'
// @ts-expect-error — Captures.js is JS without a companion .d.ts.
import Captures from '~/engine/student-space/Game/State/Captures.js'
// @ts-expect-error — MoodPins.js is JS without a companion .d.ts.
import MoodPins from '~/engine/student-space/Game/State/MoodPins.js'

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

  it('threshold captures surface the ready-to-plant tray', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    const tray = screen.getByRole('status', { name: /ready to plant: 1 sprouts/i })
    expect(tray).toHaveTextContent('Ready to plant · 1')
  })

  it('bloom() empties the tray and surfaces the planted toast', async () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    const ready = bundle.sprouts.readyToBloom()[0]!
    act(() => {
      bundle.sprouts.bloom(ready.id)
    })
    expect(screen.getByText(/planted\. a new tree/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: /ready to plant/i })).toBeNull()
    })
    expect(bundle.sprouts.listBloomedTrees()).toHaveLength(1)
  })

  it('a fourth capture after bloom opens a new sprout (not increments the bloomed tree)', () => {
    render(<IslandProgressionOverlay game={bundle.game} />)
    act(() => {
      for (let i = 0; i < BLOOM_THRESHOLD; i++) {
        bundle.captures.add({ kind: 'ask', text: `c-${i}` })
      }
    })
    const ready = bundle.sprouts.readyToBloom()[0]!
    act(() => {
      bundle.sprouts.bloom(ready.id)
    })
    act(() => {
      bundle.captures.add({ kind: 'ask', text: 'after-bloom' })
    })
    expect(bundle.sprouts.recent(10)).toHaveLength(1)
    expect(bundle.sprouts.getActive()!.count).toBe(1)
    expect(bundle.sprouts.getActive()!.readyToBloom).toBe(false)
    expect(bundle.sprouts.listBloomedTrees()).toHaveLength(1)
  })
})
