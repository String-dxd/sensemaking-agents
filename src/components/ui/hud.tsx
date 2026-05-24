import type { HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

/**
 * Minimal HUD shell. Position with a `dock` variant; `<Hud>` handles ARIA,
 * stacking, motion-reduce, and dock geometry — consumers fill the interior.
 *
 * Replaces the HUD-specific CSS classes (`.hour-hud`, `.mood-hud`, `.zoom-hud`,
 * `.fps-overlay`, `.status-preview-hud`) for the React rewrite.
 */
export type HudDock = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface HudProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  dock?: HudDock
  /**
   * ARIA role; defaults to `status` (polite live-region semantics suitable for
   * HUDs that surface non-urgent state like time-of-day or current mood).
   * Pass `null` for decorative HUDs that should have no announce semantics.
   */
  role?: HTMLAttributes<HTMLDivElement>['role'] | null
}

// `+68px` mobile bump on top-left docks clears the hamburger button.
// Geometry: hamburger at `top-(--inset-frame)+12px`, size-11 (44px) → bottom
// at +56px from `--inset-frame`. +68px leaves a 12px gap. If the hamburger
// size or inset changes (see `MobileNav.tsx`), bump this and the matching
// constant in `StudentSpaceHud.tsx` line 502 together.
const DOCK_CLASSES: Record<HudDock, string> = {
  'top-left':
    'top-(--inset-frame) left-[calc(var(--width-rail)+var(--inset-frame)+12px)] max-[640px]:top-[calc(var(--inset-frame)+68px)]',
  'top-right': 'top-(--inset-frame) right-[calc(var(--inset-frame)+12px)]',
  'bottom-left': 'bottom-(--inset-frame) left-[calc(var(--width-rail)+var(--inset-frame)+12px)]',
  'bottom-right': 'bottom-(--inset-frame) right-[calc(var(--inset-frame)+12px)]',
}

export function Hud({ dock = 'top-right', className, role = 'status', ...props }: HudProps) {
  return (
    <div
      data-testid="hud"
      data-dock={dock}
      role={role ?? undefined}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={cn(
        'fixed z-30 transition-opacity duration-(--duration-sheet) ease-(--ease-sheet) motion-reduce:transition-none',
        DOCK_CLASSES[dock],
        className,
      )}
      {...props}
    />
  )
}
