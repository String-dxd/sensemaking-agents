// TopBar (plan 012 step 1) — app identity, current character name + dirty
// indicator, undo/redo (mirrors the ⌘Z/⇧⌘Z shortcut for discoverability),
// and the "Roster" button (plan 012 step 3) that opens RosterView.

import { useStudioCommands } from '../state/commandStore'
import { useCharacterStore } from '../state/characterStore'

export function TopBar({ onOpenRoster }: { onOpenRoster(): void }) {
  const name = useCharacterStore((s) => s.spec.meta.name)
  const dirty = useCharacterStore((s) => s.dirty)
  const commands = useStudioCommands()

  return (
    <header className="cs-topbar">
      <div className="cs-topbar__brand">Character Studio</div>
      <div className="cs-topbar__character">
        <span className="cs-topbar__name">{name}</span>
        {dirty ? (
          <span className="cs-topbar__dirty-dot" title="Unsaved changes — autosaves a couple of seconds after you pause" />
        ) : null}
      </div>
      <div className="cs-topbar__actions">
        <button
          type="button"
          className="cs-btn"
          disabled={!commands.canUndo()}
          onClick={() => commands.undo()}
          title={commands.undoLabel() ? `Undo ${commands.undoLabel()} (⌘Z)` : 'Undo (⌘Z)'}
        >
          Undo
        </button>
        <button
          type="button"
          className="cs-btn"
          disabled={!commands.canRedo()}
          onClick={() => commands.redo()}
          title={commands.redoLabel() ? `Redo ${commands.redoLabel()} (⇧⌘Z)` : 'Redo (⇧⌘Z)'}
        >
          Redo
        </button>
        <button type="button" className="cs-btn" onClick={onOpenRoster}>
          Roster
        </button>
      </div>
    </header>
  )
}
