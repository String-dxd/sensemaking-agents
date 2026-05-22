import { useCallback, useEffect, useState } from 'react'

export const WORLD_CONTROLS_STORAGE_KEY = 'sm:world-controls-visible'
export const WORLD_CONTROLS_VISIBLE_CLASS = 'is-world-controls-visible'

const LEGACY_HIDDEN_STORAGE_KEY = 'sm:dev-overlay-hidden'
const LEGACY_HIDDEN_CLASS = 'is-dev-overlay-hidden'

export function readWorldControlsVisible(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    if (localStorage.getItem(WORLD_CONTROLS_STORAGE_KEY) === '1') return true
    if (localStorage.getItem(LEGACY_HIDDEN_STORAGE_KEY) === '1') return false
  } catch {
    return false
  }
  return false
}

export function applyWorldControlsVisible(next: boolean) {
  if (typeof document === 'undefined') return
  document.body.classList.toggle(WORLD_CONTROLS_VISIBLE_CLASS, next)
  document.body.classList.toggle(LEGACY_HIDDEN_CLASS, !next)
  try {
    if (next) localStorage.setItem(WORLD_CONTROLS_STORAGE_KEY, '1')
    else localStorage.removeItem(WORLD_CONTROLS_STORAGE_KEY)
    localStorage.removeItem(LEGACY_HIDDEN_STORAGE_KEY)
  } catch {
    // Non-fatal: class still updates for this session.
  }
}

export function useWorldControlsVisible(): [boolean, (next: boolean) => void] {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const initial = readWorldControlsVisible()
    setVisible(initial)
    applyWorldControlsVisible(initial)
    const body = document.body
    const sync = () => setVisible(body.classList.contains(WORLD_CONTROLS_VISIBLE_CLASS))
    const observer = new MutationObserver(sync)
    observer.observe(body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const update = useCallback((next: boolean) => {
    applyWorldControlsVisible(next)
    setVisible(next)
  }, [])

  return [visible, update]
}
