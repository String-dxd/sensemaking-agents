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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RosterView } from '../roster/RosterView'
import { studioCommands } from '../state/commandStore'
import { MotionDebugPanel } from '../viewport/MotionDebugPanel'
import { Stage, type OrbitControlsHandle } from '../viewport/Stage'
import { usePlayStore } from '../play/playStore'
import { type EditMode, MODE_TAB_ORDER, ModePanel, ModeTabs, selectStudioTab } from './ModeTabs'
import { Toasts } from './Toasts'
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

export function Shell() {
  const [editMode, setEditMode] = useState<EditMode>('animal')
  const [rosterOpen, setRosterOpen] = useState(false)
  const orbitControlsRef = useRef<OrbitControlsHandle>(null)
  const playing = usePlayStore((s) => s.mode) === 'play'
  const showStats = useMemo(() => new URLSearchParams(window.location.search).get('stats') === '1', [])

  useShellKeyboardShortcuts(setEditMode)

  const openRoster = useCallback(() => setRosterOpen(true), [])
  const closeRoster = useCallback(() => setRosterOpen(false), [])

  return (
    <div className="cs-shell">
      <TopBar onOpenRoster={openRoster} />
      <div className="cs-shell__body">
        <div className="cs-viewport">
          <Stage showStats={showStats} orbitControlsRef={orbitControlsRef} />
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
