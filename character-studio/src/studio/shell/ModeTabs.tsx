// ModeTabs (plan 012 step 1) — maps the brief's builder flow (choose animal
// → shape anatomy → dress → materials → freeform → play) to the shell's
// seven modes, and owns which panel(s) render in the managed right column
// for the active one. "Animal" is the species-first SpeciesSection (class
// chips + species cards + personality — advisor plan 009; plus FacePanel —
// identity + expressiveness belong together in the "choose your animal"
// step); "Play" swaps the column over to PlayControls entirely and
// force-exits studio mode's other affordances.
//
// `usePlayStore().mode` ('studio' | 'play') is the single source of truth
// for whether Play is the active tab — there is no separate "activeTab"
// state to fall out of sync with PlayControls' own exit button. `editMode`
// (owned by Shell.tsx) only remembers which of the SIX non-Play tabs to
// fall back to once Play mode ends.

import type { RefObject } from 'react'
import { AnatomyPanel } from '../panels/AnatomyPanel'
import { FacePanel } from '../panels/FacePanel'
import { LightingPanel } from '../panels/LightingPanel'
import { MaterialPanel } from '../panels/MaterialPanel'
import { SculptPanel } from '../panels/SculptPanel'
import { SpeciesSection } from '../panels/SpeciesSection'
import { WardrobePanel } from '../panels/WardrobePanel'
import { PlayControls } from '../play/PlayControls'
import { usePlayStore } from '../play/playStore'
import type { OrbitControlsHandle } from '../viewport/Stage'

export const EDIT_MODES = ['animal', 'anatomy', 'wardrobe', 'materials', 'sculpt', 'lighting'] as const
export type EditMode = (typeof EDIT_MODES)[number]
export type StudioTabId = EditMode | 'play'

/** Tab order == keyboard 1..7 order == the builder-flow reading order. */
export const MODE_TAB_ORDER: readonly StudioTabId[] = [...EDIT_MODES, 'play']

export const MODE_LABELS: Record<StudioTabId, string> = {
  animal: 'Animal',
  anatomy: 'Anatomy',
  wardrobe: 'Wardrobe',
  materials: 'Materials',
  sculpt: 'Sculpt',
  lighting: 'Lighting',
  play: 'Play',
}

/** Shared by ModeTabs' own clicks AND Shell's keyboard shortcuts (1–7) so
 * both paths stay identical. Selecting "play" enters Play mode; selecting
 * any edit mode exits Play mode (if active) and remembers the choice. */
export function selectStudioTab(id: StudioTabId, setEditMode: (mode: EditMode) => void): void {
  if (id === 'play') {
    usePlayStore.getState().setMode('play')
    return
  }
  if (usePlayStore.getState().mode === 'play') usePlayStore.getState().setMode('studio')
  setEditMode(id)
}

export function ModeTabs({
  editMode,
  onSelectEdit,
}: {
  editMode: EditMode
  onSelectEdit(mode: EditMode): void
}) {
  const playing = usePlayStore((s) => s.mode) === 'play'
  const active: StudioTabId = playing ? 'play' : editMode

  return (
    <nav className="cs-modetabs" aria-label="Builder flow">
      {MODE_TAB_ORDER.map((id, i) => (
        <button
          key={id}
          type="button"
          className={active === id ? 'cs-modetab is-active' : 'cs-modetab'}
          onClick={() => selectStudioTab(id, onSelectEdit)}
        >
          <span className="cs-modetab__index">{i + 1}</span>
          <span className="cs-modetab__label">{MODE_LABELS[id]}</span>
        </button>
      ))}
    </nav>
  )
}

/** The right column's content for the current mode (plan 012 step 1). */
export function ModePanel({
  editMode,
  orbitControlsRef,
}: {
  editMode: EditMode
  orbitControlsRef: RefObject<OrbitControlsHandle | null>
}) {
  const playing = usePlayStore((s) => s.mode) === 'play'

  if (playing) return <PlayControls />

  switch (editMode) {
    case 'animal':
      return (
        <>
          <SpeciesSection />
          <FacePanel />
        </>
      )
    case 'anatomy':
      return <AnatomyPanel />
    case 'wardrobe':
      return <WardrobePanel />
    case 'materials':
      return <MaterialPanel />
    case 'sculpt':
      return <SculptPanel />
    case 'lighting':
      return <LightingPanel orbitControlsRef={orbitControlsRef} />
    default:
      return null
  }
}
