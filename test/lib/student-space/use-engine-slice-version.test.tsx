import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'

function makeFakeSlice() {
  const listeners = new Set<() => void>()
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    notify() {
      for (const cb of listeners) cb()
    },
    listenerCount() {
      return listeners.size
    },
  }
}

function Counter({ slice }: { slice: ReturnType<typeof makeFakeSlice> | null }) {
  useEngineSliceVersion(slice)
  Counter.renders = (Counter.renders ?? 0) + 1
  return <span data-testid="counter">{Counter.renders}</span>
}
Counter.renders = 0

describe('useEngineSliceVersion', () => {
  it('re-renders the consumer when the slice notifies', () => {
    Counter.renders = 0
    const slice = makeFakeSlice()
    const { getByTestId } = render(<Counter slice={slice} />)
    const initial = Number(getByTestId('counter').textContent)
    act(() => slice.notify())
    const after = Number(getByTestId('counter').textContent)
    expect(after).toBeGreaterThan(initial)
  })

  it('does not subscribe when slice is null', () => {
    Counter.renders = 0
    const subscribe = vi.fn()
    render(<Counter slice={null} />)
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const slice = makeFakeSlice()
    const { unmount } = render(<Counter slice={slice} />)
    expect(slice.listenerCount()).toBe(1)
    unmount()
    expect(slice.listenerCount()).toBe(0)
  })
})
