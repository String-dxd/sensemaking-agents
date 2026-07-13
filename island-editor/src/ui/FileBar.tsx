import './panel.css'
import { ExportIcon, IconButton, ImportIcon, LoadIcon, ResetIcon, SaveIcon } from './icons'

interface FileBarProps {
  onSave: () => void
  onLoad: () => void
  onExport: () => void
  onImport: () => void
  onReset: () => void
}

/** Top-right file bar: rare/meta actions kept away from the creative loop.
 *  Save/Load persist to the repo-tracked `saves/island.json` via the dev-server
 *  middleware; Export/Import stay the file-download/file-picker lane. */
export function FileBar({ onSave, onLoad, onExport, onImport, onReset }: FileBarProps) {
  return (
    <div className="file-bar">
      <IconButton title="Save" tipSide="left" onClick={onSave}>
        <SaveIcon />
      </IconButton>
      <IconButton title="Load" tipSide="left" onClick={onLoad}>
        <LoadIcon />
      </IconButton>
      <IconButton title="Export" tipSide="left" onClick={onExport}>
        <ExportIcon />
      </IconButton>
      <IconButton title="Import" tipSide="left" onClick={onImport}>
        <ImportIcon />
      </IconButton>
      <IconButton title="Reset" tipSide="left" danger onClick={onReset}>
        <ResetIcon />
      </IconButton>
    </div>
  )
}
