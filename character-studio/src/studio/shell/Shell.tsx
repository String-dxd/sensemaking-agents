// Shell (plan 012 step 1) — the studio's top-level composition: TopBar,
// left viewport (Stage, ALWAYS mounted — unmounting it would lose the WebGL
// context and the in-memory character), ModeTabs rail, and a managed right
// panel column that shows whichever mode's panel(s) are active. Recomposes
// what used to be App.tsx mounting <Stage> + <FacePanel> ad hoc, with every
// OTHER panel mounted (fixed-position, overlapping) inside Stage.tsx itself.
//
// Keyboard: 1–7 switch modes (MODE_TAB_ORDER), Space toggles Play, ⌘Z/⇧⌘Z
// route to the studio-wide command stack (moved here from App.tsx — same
// guard against hijacking focused form controls).
//
// Crash safety (plan 012 step 4): `ViewportErrorBoundary` wraps ONLY the
// viewport (a broken spec must not white-screen the STUDIO, but the panel
// column/roster stay usable either way) and offers "revert to last
// autosave"; `useBeforeUnloadWarning` warns on tab close/reload while dirty.
// Autosave's own versioned slots (kept-last-5-per-character, pruned) live in
// rosterStore.ts (step 2) — the boundary's revert action is what actually
// exercises them.

import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultCharacter } from '../../core/spec/defaults'
import { revertToLastAutosave } from '../roster/rosterStore'
import { RosterView } from '../roster/RosterView'
import { studioCommands } from '../state/commandStore'
import { useCharacterStore } from '../state/characterStore'
import { MotionDebugPanel } from '../viewport/MotionDebugPanel'
import { Stage, type OrbitControlsHandle } from '../viewport/Stage'
import { usePlayStore } from '../play/playStore'
import { type EditMode, MODE_TAB_ORDER, ModePanel, ModeTabs, selectStudioTab } from './ModeTabs'
import { pushToast, Toasts } from './Toasts'
import { TopBar } from './TopBar'

/** Skip global shortcuts while a TEXT-ENTRY control has focus, so typed
 * digits and Cmd+Z still reach text fields/selects normally. Deliberately
 * does NOT include BUTTON: this studio's UI is almost entirely buttons
 * (mode tabs, wardrobe/anatomy pickers, expression presets...), and a
 * clicked button keeps focus afterwards — excluding BUTTON here would mean
 * "press 6 to jump to Lighting" stops working the moment you've clicked
 * anything, which is most of the time. */
function isTextEntryField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

/** Space is different: a focused BUTTON natively activates on Space, and
 * that must keep working (e.g. a focused mode tab, a wardrobe item). */
function isActivatableControl(target: EventTarget | null): boolean {
  return isTextEntryField(target) || (target instanceof HTMLElement && target.tagName === 'BUTTON')
}

function useShellKeyboardShortcuts(setEditMode: (mode: EditMode) => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘Z / ⇧⌘Z → undo/redo (unchanged behavior, moved here from App.tsx).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (isTextEntryField(e.target)) return
        e.preventDefault()
        if (e.shiftKey) studioCommands.redo()
        else studioCommands.undo()
        return
      }

      // 1..7 → MODE_TAB_ORDER[n - 1].
      if (/^[1-9]$/.test(e.key)) {
        if (isTextEntryField(e.target)) return
        const index = Number(e.key) - 1
        if (index < MODE_TAB_ORDER.length) {
          e.preventDefault()
          selectStudioTab(MODE_TAB_ORDER[index], setEditMode)
          return
        }
      }

      // Space toggles Play without disturbing the remembered edit mode
      // (mirrors PlayControls' own toggle — neither touches `editMode`).
      if (e.code === 'Space') {
        if (isActivatableControl(e.target)) return
        e.preventDefault()
        const mode = usePlayStore.getState().mode
        usePlayStore.getState().setMode(mode === 'play' ? 'studio' : 'play')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setEditMode])
}

/** Native "leave site?" prompt while there are unsaved edits — the
 * debounced autosave means a reload/close within the last ~2s of editing
 * could otherwise lose work. Most browsers ignore the custom message text
 * and show their own generic wording; setting it anyway costs nothing. */
function useBeforeUnloadWarning() {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useCharacterStore.getState().dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}

interface ViewportErrorBoundaryState {
  error: Error | null
}

/**
 * Wraps ONLY the viewport (not the panel column/roster, which stay usable
 * regardless) — a corrupt spec throwing during CharacterRoot's render must
 * not white-screen the whole studio. Offers reverting to the last autosave
 * slot for the currently-open character (rosterStore's versioned,
 * pruned-to-5 slots — plan 012 step 4), or starting over with a fresh
 * character if no autosave exists (e.g. this was the very first, never-
 * saved edit of a scratch character).
 */
class ViewportErrorBoundary extends Component<{ children: ReactNode }, ViewportErrorBoundaryState> {
  state: ViewportErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ViewportErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[character-studio] viewport crashed:', error, info.componentStack)
  }

  private handleRevert = async (): Promise<void> => {
    const id = useCharacterStore.getState().spec.meta.id
    const restored = await revertToLastAutosave(id)
    if (restored) {
      this.setState({ error: null })
      pushToast('Reverted to the last autosave.', 'info')
    } else {
      pushToast('No autosave was available for this character.', 'error')
    }
  }

  private handleNewCharacter = (): void => {
    useCharacterStore.getState().setSpec(createDefaultCharacter('biped-round'))
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="cs-crash">
        <h2>The viewport hit an error</h2>
        <p>{error.message}</p>
        <div className="cs-crash__actions">
          <button type="button" className="cs-btn" onClick={this.handleRevert}>
            Revert to last autosave
          </button>
          <button type="button" className="cs-btn" onClick={this.handleNewCharacter}>
            Start a new character
          </button>
        </div>
      </div>
    )
  }
}

export function Shell() {
  const [editMode, setEditMode] = useState<EditMode>('animal')
  const [rosterOpen, setRosterOpen] = useState(false)
  const orbitControlsRef = useRef<OrbitControlsHandle>(null)
  const playing = usePlayStore((s) => s.mode) === 'play'
  const showStats = useMemo(() => new URLSearchParams(window.location.search).get('stats') === '1', [])

  useShellKeyboardShortcuts(setEditMode)
  useBeforeUnloadWarning()

  const openRoster = useCallback(() => setRosterOpen(true), [])
  const closeRoster = useCallback(() => setRosterOpen(false), [])

  return (
    <div className="cs-shell">
      <TopBar onOpenRoster={openRoster} />
      <div className="cs-shell__body">
        <div className="cs-viewport">
          <ViewportErrorBoundary>
            <Stage showStats={showStats} orbitControlsRef={orbitControlsRef} />
          </ViewportErrorBoundary>
          {/* Dev-only spring-tuning tool (plan 003) — always available
              outside Play, docked bottom-left of the viewport (not tied to
              a builder-flow mode). Hidden in Play like every other panel. */}
          {playing ? null : <MotionDebugPanel />}
        </div>
        <ModeTabs editMode={editMode} onSelectEdit={setEditMode} />
        <div className="cs-column cs-scroll">
          <ModePanel editMode={editMode} orbitControlsRef={orbitControlsRef} />
        </div>
      </div>
      <Toasts />
      {rosterOpen ? <RosterView onClose={closeRoster} /> : null}
    </div>
  )
}
