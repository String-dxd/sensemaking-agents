import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextTypePicker } from '~/components/ContextTypePicker'

const LOCAL_STORAGE_KEY = 'sensemaking.context_type.last_used'

/**
 * happy-dom 15's localStorage implementation is inconsistent on its method
 * exposure (see the recurring upstream issue where `setItem`/`getItem`
 * exist but `removeItem`/`clear` are absent on the prototype). We install
 * a minimal in-memory Storage stub on `window.localStorage` for every
 * test in this file so the picker's runtime path can read+write without
 * relying on host behaviour.
 */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const stub: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: stub })
  return store
}

let store: Map<string, string>

beforeEach(() => {
  store = installMemoryStorage()
})

afterEach(() => {
  store.clear()
  vi.restoreAllMocks()
})

describe('ContextTypePicker', () => {
  it('renders all 5 closed-vocabulary buttons', () => {
    render(<ContextTypePicker onSelect={vi.fn()} />)
    for (const value of ['school', 'family', 'peer', 'hobby', 'civic']) {
      expect(screen.getByTestId(`context-option-${value}`)).toBeInTheDocument()
    }
  })

  it('defaults to `school` on first use (no prior localStorage)', () => {
    render(<ContextTypePicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('context-option-school')).toHaveAttribute('data-selected', 'true')
  })

  it('pre-highlights the last-used value from localStorage', () => {
    store.set(LOCAL_STORAGE_KEY, 'hobby')
    render(<ContextTypePicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('context-option-hobby')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('context-option-school')).toHaveAttribute('data-selected', 'false')
  })

  it('fires onSelect with the chosen value and writes localStorage', async () => {
    const onSelect = vi.fn()
    render(<ContextTypePicker onSelect={onSelect} />)
    await userEvent.click(screen.getByTestId('context-option-peer'))
    expect(onSelect).toHaveBeenCalledWith('peer')
    expect(store.get(LOCAL_STORAGE_KEY)).toBe('peer')
  })

  it('ignores corrupted localStorage values and falls back to default', () => {
    store.set(LOCAL_STORAGE_KEY, 'not-a-vips-context')
    render(<ContextTypePicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('context-option-school')).toHaveAttribute('data-selected', 'true')
  })
})
