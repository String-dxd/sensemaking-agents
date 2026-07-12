import type { FC, ReactNode } from 'react'
import type { ObjectKind } from '../terrain/terrainGrid'

export type Tool = 'raise' | 'lower' | 'water' | 'grass' | 'erase'
export type BrushSize = 1 | 2 | 3

// Shared stroke-icon attributes (24×24 viewBox; sized to 20px by panel.css).
export const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const RaiseIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M6 14l6-6 6 6" />
    <path d="M5 19h14" />
  </svg>
)

export const LowerIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M6 10l6 6 6-6" />
    <path d="M5 5h14" />
  </svg>
)

export const WaterIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M3 8q3-3 6 0t6 0 6 0" />
    <path d="M3 15q3-3 6 0t6 0 6 0" />
  </svg>
)

export const GrassIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 20c0-6-2-10-5-13" />
    <path d="M12 20V6" />
    <path d="M12 20c0-6 2-10 5-13" />
  </svg>
)

export const EraseIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M7 20l-3.5-3.5a2 2 0 0 1 0-2.8l8.7-8.7a2 2 0 0 1 2.8 0l3.5 3.5a2 2 0 0 1 0 2.8L12 20z" />
    <path d="M6 12l6 6" />
    <path d="M21 20H10" />
  </svg>
)

export const UndoIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H9" />
  </svg>
)

export const RedoIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H15" />
  </svg>
)

export const DesignerViewIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12v9" />
    <path d="M12 12l8-4.5" />
    <path d="M12 12L4 7.5" />
  </svg>
)

export const TopViewIcon: FC = () => (
  <svg {...svgProps}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M12 4v16" />
    <path d="M4 12h16" />
  </svg>
)

export const ExportIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 3v10" />
    <path d="M8 7l4-4 4 4" />
    <path d="M4 15v4h16v-4" />
  </svg>
)

export const ImportIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M12 13V3" />
    <path d="M8 9l4 4 4-4" />
    <path d="M4 15v4h16v-4" />
  </svg>
)

export const SaveIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
)

export const LoadIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M4 19V5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v3" />
    <path d="M4 19l2.5-8H22l-3 8z" />
  </svg>
)

export const ResetIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M3 3v5h5" />
    <path d="M3 8a9 9 0 1 0 3-4.7L3 8" />
  </svg>
)

// ── Camera dock icons ─────────────────────────────────────────────────────────
export const RotateLeftIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M4 9a8 8 0 1 1-1.5 5" />
    <path d="M4 4v5h5" />
  </svg>
)

export const RotateRightIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M20 9a8 8 0 1 0 1.5 5" />
    <path d="M20 4v5h-5" />
  </svg>
)

export const ZoomInIcon: FC = () => (
  <svg {...svgProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
    <path d="M11 8v6M8 11h6" />
  </svg>
)

export const ZoomOutIcon: FC = () => (
  <svg {...svgProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
    <path d="M8 11h6" />
  </svg>
)

export const RecenterIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

// Filled square that grows with brush size (glanceable; exact size in the tooltip).
export const BrushIcon: FC<{ size: BrushSize }> = ({ size }) => {
  const side = size === 1 ? 8 : size === 2 ? 12 : 16
  const offset = (24 - side) / 2
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x={offset} y={offset} width={side} height={side} rx="2" />
    </svg>
  )
}

export const TOOL_META: Record<Tool, { label: string; Icon: FC }> = {
  raise: { label: 'Raise', Icon: RaiseIcon },
  lower: { label: 'Lower', Icon: LowerIcon },
  water: { label: 'Water', Icon: WaterIcon },
  grass: { label: 'Grass', Icon: GrassIcon },
  erase: { label: 'Erase', Icon: EraseIcon },
}

// ── Model panel object silhouettes ─────────────────────────────────────────────
// Glanceable solid glyphs (not live 3D — see the Plan C maintenance notes). Filled
// shapes read better as silhouettes, so these use fill="currentColor" like BrushIcon.
// The broadleaf glyph tracks the asset: a wide canopy over a stubby trunk.
export const TreeIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="10.5" y="15" width="3" height="6" />
    <circle cx="12" cy="10" r="7" />
  </svg>
)

export const BushIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 20a4 4 0 0 1 3-6 4 4 0 0 1 5-2 4 4 0 0 1 5 2 4 4 0 0 1 3 6z" />
  </svg>
)

export const RockIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 20l3-8 5-3 6 4 2 7z" />
  </svg>
)

// Round body + head + a small beak triangle — a glanceable chick silhouette,
// matching the character asset's Sunny Chick read.
export const ChickIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="14" r="7" />
    <circle cx="12" cy="6.5" r="4" />
    <path d="M16 6.5l3.5 1.2-3.5 1.2z" />
  </svg>
)

export const KIND_META: Record<ObjectKind, { label: string; Icon: FC }> = {
  tree: { label: 'Tree', Icon: TreeIcon },
  bush: { label: 'Bush', Icon: BushIcon },
  rock: { label: 'Rock', Icon: RockIcon },
  character: { label: 'Chick', Icon: ChickIcon },
}

export type TipSide = 'top' | 'right' | 'left'

/**
 * Shared 40×40 icon tile used across the hotbar, camera dock, file bar, and model
 * panel. `hint` adds a second tooltip line — that's where per-tool prose lives now,
 * instead of an always-on caption under the panel.
 *
 * The tooltip is our own element rather than the native `title` attribute: native
 * tooltips can't hold two lines, take ~1s to appear, and can't be styled.
 */
export function IconButton({
  title,
  hint,
  tipSide = 'top',
  active,
  disabled,
  danger,
  onClick,
  children,
}: {
  title: string
  hint?: string
  tipSide?: TipSide
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <span className={`tip-wrap tip-wrap--${tipSide}`}>
      <button
        type="button"
        className={`tile${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
        aria-label={title}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
      <span className="tip" role="tooltip">
        <span className="tip__title">{title}</span>
        {hint ? <span className="tip__hint">{hint}</span> : null}
      </span>
    </span>
  )
}
