import './panel.css'
import { ExportIcon, IconButton, ImportIcon, ResetIcon } from './icons'

interface FileBarProps {
  onExport: () => void
  onImport: () => void
  onReset: () => void
}

/** Top-right file bar: rare/meta actions kept away from the creative loop. */
export function FileBar({ onExport, onImport, onReset }: FileBarProps) {
  return (
    <div className="file-bar">
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
