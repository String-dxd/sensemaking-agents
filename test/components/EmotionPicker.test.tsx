import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmotionPicker } from '~/components/EmotionPicker'

const LOCAL_STORAGE_KEY = 'sensemaking.mood.last_used'

function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const stub: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
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

describe('EmotionPicker', () => {
  it('renders all 9 emotion tiles', () => {
    render(<EmotionPicker onSelect={vi.fn()} />)
    for (const mood of [
      'joy',
      'sadness',
      'anger',
      'fear',
      'disgust',
      'anxiety',
      'envy',
      'embarrassed',
      'ennui',
    ]) {
      expect(screen.getByTestId(`emotion-tile-${mood}`)).toBeInTheDocument()
    }
  })

  it('defaults to `joy` on first use', () => {
    render(<EmotionPicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('emotion-tile-joy')).toHaveAttribute('data-selected', 'true')
  })

  it('pre-highlights the last-used value from localStorage', () => {
    store.set(LOCAL_STORAGE_KEY, 'ennui')
    render(<EmotionPicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('emotion-tile-ennui')).toHaveAttribute('data-selected', 'true')
  })

  it('fires onSelect and writes localStorage on click', async () => {
    const onSelect = vi.fn()
    render(<EmotionPicker onSelect={onSelect} />)
    await userEvent.click(screen.getByTestId('emotion-tile-anxiety'))
    expect(onSelect).toHaveBeenCalledWith('anxiety')
    expect(store.get(LOCAL_STORAGE_KEY)).toBe('anxiety')
  })

  it('renders the radiogroup with the accessible label', () => {
    render(<EmotionPicker onSelect={vi.fn()} />)
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName("Who's at the console?")
  })

  it('roving tabindex: only the selected tile is tabbable', () => {
    render(<EmotionPicker onSelect={vi.fn()} defaultValue="anger" />)
    expect(screen.getByTestId('emotion-tile-anger')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('emotion-tile-joy')).toHaveAttribute('tabindex', '-1')
  })

  it('ignores corrupted localStorage values and falls back to joy', () => {
    store.set(LOCAL_STORAGE_KEY, 'not-a-real-mood')
    render(<EmotionPicker onSelect={vi.fn()} />)
    expect(screen.getByTestId('emotion-tile-joy')).toHaveAttribute('data-selected', 'true')
  })

  it('overlay layout renders a backdrop and calls onDismiss on backdrop click', async () => {
    const onDismiss = vi.fn()
    render(<EmotionPicker onSelect={vi.fn()} layout="overlay" onDismiss={onDismiss} />)
    expect(screen.getByTestId('emotion-picker-overlay')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('emotion-picker-backdrop'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('overlay layout closes on Escape', async () => {
    const onDismiss = vi.fn()
    render(<EmotionPicker onSelect={vi.fn()} layout="overlay" onDismiss={onDismiss} />)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalled()
  })
})
