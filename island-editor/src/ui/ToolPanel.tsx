import type { FC, ReactNode } from 'react'
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

// Shared stroke-icon attributes (24×24 viewBox; sized to 20px by panel.css).
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const RaiseIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M6 14l6-6 6 6" />
    <path d="M5 19h14" />
  </svg>
)

const LowerIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M6 10l6 6 6-6" />
    <path d="M5 5h14" />
  </svg>
)

const WaterIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M3 8q3-3 6 0t6 0 6 0" />
    <path d="M3 15q3-3 6 0t6 0 6 0" />
  </svg>
)

const PathIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M5 12h14" strokeDasharray="3 4" />
  </svg>
)

const EraseIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M7 20l-3.5-3.5a2 2 0 0 1 0-2.8l8.7-8.7a2 2 0 0 1 2.8 0l3.5 3.5a2 2 0 0 1 0 2.8L12 20z" />
    <path d="M6 12l6 6" />
    <path d="M21 20H10" />
  </svg>
)

const UndoIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H9" />
  </svg>
)

const RedoIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H15" />
  </svg>
)

const DesignerViewIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12v9" />
    <path d="M12 12l8-4.5" />
    <path d="M12 12L4 7.5" />
  </svg>
)

const TopViewIcon: FC = () => (
  <svg {...svgProps}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M12 4v16" />
    <path d="M4 12h16" />
  </svg>
)

const ExportIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 3v10" />
    <path d="M8 7l4-4 4 4" />
    <path d="M4 15v4h16v-4" />
  </svg>
)

const ImportIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 13V3" />
    <path d="M8 9l4 4 4-4" />
    <path d="M4 15v4h16v-4" />
  </svg>
)

const ResetIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M3 3v5h5" />
    <path d="M3 8a9 9 0 1 0 3-4.7L3 8" />
  </svg>
)

// Filled square that grows with brush size (glanceable; exact size in the tooltip).
const BrushIcon: FC<{ size: BrushSize }> = ({ size }) => {
  const side = size === 1 ? 8 : size === 2 ? 12 : 16
  const offset = (24 - side) / 2
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x={offset} y={offset} width={side} height={side} rx="2" />
    </svg>
  )
}

const TOOL_META: Record<Tool, { label: string; Icon: FC }> = {
  raise: { label: 'Raise', Icon: RaiseIcon },
  lower: { label: 'Lower', Icon: LowerIcon },
  water: { label: 'Water', Icon: WaterIcon },
  path: { label: 'Path', Icon: PathIcon },
  erase: { label: 'Erase', Icon: EraseIcon },
}

function HotbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`hotbar__btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
    <div className="hotbar">
      <div className="hotbar__hint">{TOOL_HINTS[tool]}</div>
      <div className="hotbar__row">
        <div className="hotbar__group">
          {TOOLS.map((t) => {
            const { label, Icon } = TOOL_META[t]
            return (
              <HotbarButton key={t} title={label} active={tool === t} onClick={() => onToolChange(t)}>
                <Icon />
              </HotbarButton>
            )
          })}
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          {SIZES.map((s) => (
            <HotbarButton
              key={s}
              title={`Brush ${s}×${s}`}
              active={brushSize === s}
              onClick={() => onBrushSizeChange(s)}
            >
              <BrushIcon size={s} />
            </HotbarButton>
          ))}
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          <HotbarButton title="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </HotbarButton>
          <HotbarButton title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </HotbarButton>
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          <HotbarButton title="Designer view" onClick={onDesignerView}>
            <DesignerViewIcon />
          </HotbarButton>
          <HotbarButton title="Top view" onClick={onTopView}>
            <TopViewIcon />
          </HotbarButton>
        </div>

        <span className="hotbar__divider" />

        <div className="hotbar__group">
          <HotbarButton title="Export" onClick={onExport}>
            <ExportIcon />
          </HotbarButton>
          <HotbarButton title="Import" onClick={onImport}>
            <ImportIcon />
          </HotbarButton>
          <HotbarButton title="Reset" onClick={onReset}>
            <ResetIcon />
          </HotbarButton>
        </div>
      </div>
    </div>
  )
}
