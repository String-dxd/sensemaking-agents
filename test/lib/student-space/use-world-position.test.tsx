import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  useWorldPosition,
  type WorldPositionResult,
  type WorldPositionSource,
} from '~/lib/student-space/use-world-position'

function makeSource(initialProjection: WorldPositionResult | null = { x: 0, y: 0, visible: true }) {
  const listeners = new Set<() => void>()
  let current = initialProjection
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    project: vi.fn(() => current),
    notify() {
      for (const cb of listeners) cb()
    },
    set(projection: WorldPositionResult | null) {
      current = projection
    },
    listenerCount() {
      return listeners.size
    },
  }
}

function Label({ mesh, source }: { mesh: object | null; source: WorldPositionSource | null }) {
  const ref = useWorldPosition(mesh, source)
  return <div ref={ref} data-testid="lbl" />
}

describe('useWorldPosition', () => {
  it('writes transform/opacity on the element on first apply', () => {
    const mesh = {}
    const source = makeSource({ x: 100, y: 200, visible: true })
    const { getByTestId } = render(<Label mesh={mesh} source={source} />)
    const el = getByTestId('lbl') as HTMLDivElement
    expect(el.style.transform).toBe('translate3d(100px, 200px, 0)')
    expect(el.style.opacity).toBe('1')
    expect(el.style.pointerEvents).toBe('auto')
  })

  it('hides the element when the projection reports not visible', () => {
    const mesh = {}
    const source = makeSource({ x: 0, y: 0, visible: false })
    const { getByTestId } = render(<Label mesh={mesh} source={source} />)
    expect((getByTestId('lbl') as HTMLDivElement).style.opacity).toBe('0')
    expect((getByTestId('lbl') as HTMLDivElement).style.pointerEvents).toBe('none')
  })

  it('hides the element when mesh is null', () => {
    const source = makeSource()
    const { getByTestId } = render(<Label mesh={null} source={source} />)
    expect((getByTestId('lbl') as HTMLDivElement).style.opacity).toBe('0')
  })

  it('updates transform when the source notifies', () => {
    const mesh = {}
    const source = makeSource({ x: 10, y: 20, visible: true })
    const { getByTestId } = render(<Label mesh={mesh} source={source} />)
    source.set({ x: 50, y: 60, visible: true })
    source.notify()
    expect((getByTestId('lbl') as HTMLDivElement).style.transform).toBe(
      'translate3d(50px, 60px, 0)',
    )
  })

  it('unsubscribes on unmount', () => {
    const source = makeSource()
    const { unmount } = render(<Label mesh={{}} source={source} />)
    expect(source.listenerCount()).toBe(1)
    unmount()
    expect(source.listenerCount()).toBe(0)
  })

  it('no-ops when source is null', () => {
    const { getByTestId } = render(<Label mesh={{}} source={null} />)
    expect((getByTestId('lbl') as HTMLDivElement).style.transform).toBe('')
  })
})
