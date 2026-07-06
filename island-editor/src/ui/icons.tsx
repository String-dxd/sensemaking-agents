import type { FC, ReactNode } from 'react'

export type Tool = 'raise' | 'lower' | 'water' | 'path' | 'erase'
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

export const PathIcon: FC = () => (
  <svg {...svgProps}>
    <path d="M5 12h14" strokeDasharray="3 4" />
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
  path: { label: 'Path', Icon: PathIcon },
  erase: { label: 'Erase', Icon: EraseIcon },
}

/** Shared 40×40 icon tile used across the hotbar, camera dock, and file bar. */
export function IconButton({
  title,
  active,
  disabled,
  danger,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`tile${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
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
