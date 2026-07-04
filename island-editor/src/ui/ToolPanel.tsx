import './panel.css'

export type Tool = 'raise' | 'lower' | 'water' | 'path' | 'erase'
export type BrushSize = 1 | 2 | 3

const TOOLS: Tool[] = ['raise', 'lower', 'water', 'path', 'erase']
const SIZES: BrushSize[] = [1, 2, 3]

const TOOL_HINTS: Record<Tool, string> = {
  raise: 'Click-drag to raise land one cliff tier per stroke.',
  lower: 'Click-drag to lower land one cliff tier per stroke.',
  water: 'Carve cells down to the ocean floor — water flows in.',
  path: 'Paint a dirt path onto flat ground.',
  erase: 'Erase painted paths back to grass or sand.',
}

interface ToolPanelProps {
  tool: Tool
  onToolChange: (t: Tool) => void
  brushSize: BrushSize
  onBrushSizeChange: (s: BrushSize) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onExport: () => void
  onImport: () => void
  onTopView: () => void
  onDesignerView: () => void
}

export function ToolPanel({
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onExport,
  onImport,
  onTopView,
  onDesignerView,
}: ToolPanelProps) {
  return (
    <div className="tool-panel">
      <div className="tool-panel__title">Island designer</div>
      <div className="tool-panel__topbar">
        <div className="tool-panel__history">
          <button type="button" title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            ↶
          </button>
          <button type="button" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            ↷
          </button>
        </div>
      </div>

      <div className="tool-panel__section">Tool</div>
      <div className="tool-panel__modes">
        {TOOLS.map((t) => (
          <button
            type="button"
            key={t}
            className={tool === t ? 'is-active' : ''}
            onClick={() => onToolChange(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="tool-panel__hint">{TOOL_HINTS[tool]}</div>

      <div className="tool-panel__section">Brush size</div>
      <div className="tool-panel__modes">
        {SIZES.map((s) => (
          <button
            type="button"
            key={s}
            className={brushSize === s ? 'is-active' : ''}
            onClick={() => onBrushSizeChange(s)}
          >
            {s}×{s}
          </button>
        ))}
      </div>

      <div className="tool-panel__section">Scene</div>
      <div className="tool-panel__actions">
        <button type="button" onClick={onDesignerView}>
          Designer view
        </button>
        <button type="button" onClick={onTopView}>
          Top view
        </button>
        <button type="button" onClick={onExport}>
          Export
        </button>
        <button type="button" onClick={onImport}>
          Import
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}
