import type { VipsDimension } from '~/data/vips-taxonomy'
import { cn } from '~/lib/utils'

export type SheetKey = VipsDimension | 'profile' | 'reflections' | 'trajectory'

const ENTRIES: { key: VipsDimension; label: string }[] = [
  { key: 'values', label: 'Values' },
  { key: 'interests', label: 'Interests' },
  { key: 'personality', label: 'Personality' },
  { key: 'skills', label: 'Skills' },
]

export interface SheetEntryRailProps {
  openSheet: SheetKey | null
  onOpenSheet: (key: VipsDimension) => void
  /** Id of the BottomSheet panel — wired to aria-controls. */
  sheetPanelId: string
  /** When true, every entry is non-interactive (e.g., during voice mode). */
  disabled?: boolean
}

/**
 * Row of profile dimension triggers. Each button opens a dimension sheet
 * via the parent's `onOpenSheet` callback. Wired to the sheet's
 * `aria-controls` and reports `aria-expanded` so screen readers track
 * which sheet (if any) is open. When `disabled`, the rail is non-interactive.
 */
export function SheetEntryRail({
  openSheet,
  onOpenSheet,
  sheetPanelId,
  disabled = false,
}: SheetEntryRailProps) {
  return (
    <nav
      aria-label="Profile dimensions"
      className="flex w-full gap-2 overflow-x-auto py-1 sm:flex-wrap"
      data-testid="sheet-entry-rail"
    >
      {ENTRIES.map(({ key, label }) => {
        const isOpen = openSheet === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onOpenSheet(key)}
            disabled={disabled}
            aria-expanded={isOpen}
            aria-controls={sheetPanelId}
            aria-disabled={disabled || undefined}
            data-testid={`sheet-trigger-${key}`}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isOpen ? 'bg-muted text-foreground' : null,
              disabled ? 'cursor-not-allowed opacity-50 hover:bg-background/80' : null,
            )}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
