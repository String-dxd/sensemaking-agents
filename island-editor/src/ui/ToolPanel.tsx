import './panel.css'
import { type BrushSize, BrushIcon, IconButton, RedoIcon, type Tool, TOOL_META, UndoIcon } from './icons'

export type { BrushSize, Tool } from './icons'

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
}: ToolPanelProps) {
  return (
    <div className="hotbar">
      <div className="hotbar__hint">{TOOL_HINTS[tool]}</div>
      <div className="hotbar__row">
        <div className="hotbar__group">
          {TOOLS.map((t) => {
            const { label, Icon } = TOOL_META[t]
            return (
              <IconButton key={t} title={label} active={tool === t} onClick={() => onToolChange(t)}>
                <Icon />
              </IconButton>
            )
          })}
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          {SIZES.map((s) => (
            <IconButton
              key={s}
              title={`Brush ${s}×${s}`}
              active={brushSize === s}
              onClick={() => onBrushSizeChange(s)}
            >
              <BrushIcon size={s} />
            </IconButton>
          ))}
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          <IconButton title="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
