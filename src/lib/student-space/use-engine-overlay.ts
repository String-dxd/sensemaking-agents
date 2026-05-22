import type { ReactNode } from 'react'
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

/**
 * React-side coordinator for NON-routed overlays. The router owns routed
 * sheets (`/profile`, `/history`, …); this context owns everything else that
 * sits on top of the world canvas: capture sheets, the capture chooser,
 * in-world pickers (bird/track), and the onboarding flow.
 *
 * Mirrors the responsibilities of the legacy `OverlayController` JS singleton
 * for non-routed surfaces. Body classes (`has-capture-sheet`, `has-chooser`,
 * `is-onboarding`) are toggled here via a single useEffect so engine CSS
 * consumers (e.g. `body.has-chooser .bird-picker` hide rules) keep working
 * during the migration.
 */
export type CaptureSheet = 'ask' | 'mood' | null
export type ActivePicker = 'bird' | 'track' | null

export interface EngineOverlayState {
  activeCapture: CaptureSheet
  setActiveCapture: (next: CaptureSheet) => void
  activeChooser: boolean
  setActiveChooser: (next: boolean) => void
  activePicker: ActivePicker
  setActivePicker: (next: ActivePicker) => void
  isOnboarding: boolean
  setIsOnboarding: (next: boolean) => void
}

const EngineOverlayContext = createContext<EngineOverlayState | null>(null)

export function EngineOverlayProvider({ children }: { children: ReactNode }) {
  const [activeCapture, setActiveCapture] = useState<CaptureSheet>(null)
  const [activeChooser, setActiveChooser] = useState(false)
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [isOnboarding, setIsOnboarding] = useState(false)

  useEffect(() => {
    toggleBodyClass('has-capture-sheet', activeCapture !== null)
    return () => toggleBodyClass('has-capture-sheet', false)
  }, [activeCapture])

  useEffect(() => {
    toggleBodyClass('has-chooser', activeChooser)
    return () => toggleBodyClass('has-chooser', false)
  }, [activeChooser])

  useEffect(() => {
    toggleBodyClass('is-onboarding', isOnboarding)
    return () => toggleBodyClass('is-onboarding', false)
  }, [isOnboarding])

  const value = useMemo<EngineOverlayState>(
    () => ({
      activeCapture,
      setActiveCapture,
      activeChooser,
      setActiveChooser,
      activePicker,
      setActivePicker,
      isOnboarding,
      setIsOnboarding,
    }),
    [activeCapture, activeChooser, activePicker, isOnboarding],
  )

  return createElement(EngineOverlayContext.Provider, { value }, children)
}

export function useEngineOverlay(): EngineOverlayState {
  const ctx = useContext(EngineOverlayContext)
  if (!ctx) {
    throw new Error('useEngineOverlay must be used inside <EngineOverlayProvider>')
  }
  return ctx
}

function toggleBodyClass(name: string, on: boolean) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (on) body.classList.add(name)
  else body.classList.remove(name)
}
