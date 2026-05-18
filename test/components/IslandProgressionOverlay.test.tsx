/**
 * IslandProgressionOverlay — React tray + toasts above the engine
 * canvas. The component is mounted by StudentSpaceHost once the engine
 * boots; it subscribes to game.state.sprouts via useSyncExternalStore.
 *
 * Tests use a fake Game with a minimal sprouts slice that mirrors the
 * subscribe / readyToBloom / recent contract — booting the real engine
 * (which would require WebGL + GLSL) is out of scope for component
 * tests; the engine boot is covered by StudentSpaceHost.test.tsx and
 * the slice itself by Sprouts.test.ts.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IslandProgressionOverlay } from '~/components/IslandProgressionOverlay'
import type { Game } from '~/engine/student-space/Game'

type Listener = (event: { type: string }) => void

interface FakeSprouts {
  ready: number
  active: number
  listeners: Set<Listener>
  readyToBloom(): unknown[]
  recent(n: number): unknown[]
  subscribe(cb: Listener): () => void
  emit(event: { type: 'spawned' | 'grew' | 'markedReady' | 'bloomed' }): void
}

function makeFakeGame(): { game: Game; sprouts: FakeSprouts } {
  const listeners = new Set<Listener>()
  const sprouts: FakeSprouts = {
    ready: 0,
    active: 0,
    listeners,
    readyToBloom() {
      return new Array(this.ready).fill(null)
    },
    recent(_n: number) {
      return new Array(this.active).fill(null)
    },
    subscribe(cb: Listener) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit(event) {
      for (const cb of listeners) cb(event)
    },
  }
  const game = {
    state: { sprouts },
    dispose() {},
  } as unknown as Game
  return { game, sprouts }
}

afterEach(() => {
  // Defaults are fine — no global singletons.
})

describe('IslandProgressionOverlay', () => {
  it('renders nothing chrome-relevant when there are zero ready sprouts', () => {
    const { game } = makeFakeGame()
    render(<IslandProgressionOverlay game={game} />)
    expect(screen.queryByRole('status', { name: /ready to plant/i })).toBeNull()
  })

  it('shows the tray when ready count > 0', () => {
    const { game, sprouts } = makeFakeGame()
    sprouts.ready = 2
    sprouts.active = 3
    render(<IslandProgressionOverlay game={game} />)
    act(() => {
      sprouts.emit({ type: 'markedReady' })
    })
    const tray = screen.getByRole('status', { name: /ready to plant: 2 sprouts/i })
    expect(tray).toHaveTextContent('Ready to plant · 2')
  })

  it('renders a toast on grow events and removes it after the TTL', async () => {
    const { game, sprouts } = makeFakeGame()
    render(<IslandProgressionOverlay game={game} />)
    act(() => {
      sprouts.emit({ type: 'spawned' })
    })
    expect(screen.getByText(/heard\. something is growing/i)).toBeInTheDocument()
    // TTL is 2.4s; we don't fast-forward timers here, just assert the
    // toast surfaces. Auto-dismiss is exercised by the e2e test.
    await waitFor(() => expect(screen.queryByText(/heard\. something is growing/i)).toBeNull(), {
      timeout: 3000,
    })
  })

  it('renders bloom toast distinctly from grow', () => {
    const { game, sprouts } = makeFakeGame()
    render(<IslandProgressionOverlay game={game} />)
    act(() => {
      sprouts.emit({ type: 'bloomed' })
    })
    expect(screen.getByText(/planted\. a new tree/i)).toBeInTheDocument()
  })

  it('renders nothing-breaking with a partial game (no sprouts slice)', () => {
    const partial = {
      state: {},
      dispose() {},
    } as unknown as Game
    render(<IslandProgressionOverlay game={partial} />)
    // Should mount without throwing; no tray, no toasts.
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('surfaces a "still growing" toast on the ss:sprout-tap-not-ready CustomEvent', () => {
    const { game } = makeFakeGame()
    render(<IslandProgressionOverlay game={game} />)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('ss:sprout-tap-not-ready', {
          detail: { sproutId: 'abc', count: 2, threshold: 3 },
        }),
      )
    })
    expect(screen.getByText(/still growing — 2\/3/i)).toBeInTheDocument()
  })

  it('unmounts the not-ready event listener on cleanup', () => {
    const { game } = makeFakeGame()
    const { unmount } = render(<IslandProgressionOverlay game={game} />)
    unmount()
    // Dispatching after unmount should NOT throw and should NOT surface
    // a toast (the listener detached).
    act(() => {
      window.dispatchEvent(
        new CustomEvent('ss:sprout-tap-not-ready', {
          detail: { count: 1, threshold: 3 },
        }),
      )
    })
    expect(screen.queryByText(/still growing/i)).toBeNull()
  })
})
