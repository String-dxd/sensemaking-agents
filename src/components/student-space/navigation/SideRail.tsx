import { useLocation } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { activeKeyFromPathname } from './nav-active'
import { BOTTOM_RAIL_ITEMS, type RailItem, SHEET_HREFS, TOP_RAIL_ITEMS } from './nav-items'
import { useNavGate } from './use-nav-gate'

/**
 * Desktop navigation rail (≥641px). Hidden on phone-narrow widths via
 * `max-[640px]:hidden` — the mobile counterpart is `MobileNav.tsx`. Each
 * viewport owns exactly one nav surface; both render the same six
 * destinations sourced from `./nav-items` and share the onboarding-hide
 * gate via `./use-nav-gate`.
 */
export function SideRail({ game }: { game: unknown }) {
  const location = useLocation()
  const { hidden, pendingPathname, navigate } = useNavGate(game)

  if (hidden) return null

  const activeKey = activeKeyFromPathname(pendingPathname ?? location.pathname)

  const renderItem = ({ id, label, Icon }: RailItem) => {
    const href = SHEET_HREFS[id]
    const active = activeKey === id
    return (
      <RailButton
        key={id}
        label={label}
        active={active}
        onClick={() => navigate(href)}
        Icon={Icon}
      />
    )
  }

  return (
    <nav
      aria-label="World navigation"
      className={cn(
        'fixed top-(--inset-frame) bottom-(--inset-frame) left-(--inset-frame) z-[70]',
        'flex w-[calc(var(--width-rail)-10px)] flex-col items-center justify-between rounded-2xl border border-transparent bg-transparent py-3 shadow-none',
        'max-[640px]:hidden',
      )}
    >
      <div className="flex flex-col gap-1">{TOP_RAIL_ITEMS.map(renderItem)}</div>
      <div className="flex flex-col gap-1">{BOTTOM_RAIL_ITEMS.map(renderItem)}</div>
    </nav>
  )
}

function RailButton({
  label,
  active = false,
  Icon,
  onClick,
}: {
  label: string
  active?: boolean
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-current={active ? 'page' : undefined}
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'group relative grid size-11 cursor-pointer place-items-center rounded-xl border border-transparent transition-[transform,background-color,border-color,color,box-shadow] active:scale-[0.96]',
        'bg-transparent text-(--color-sheet-ink-soft) shadow-none',
        'hover:border-white/70 hover:bg-white/70 hover:text-(--color-sheet-ink)',
        'data-[active]:border-white data-[active]:bg-white data-[active]:text-(--color-sheet-ink) data-[active]:shadow-lg data-[active]:shadow-black/12',
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span
        className={cn(
          'pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-10 -translate-y-1/2 translate-x-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap opacity-0 shadow-lg shadow-black/12 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
          'bg-white text-(--color-sheet-ink)',
        )}
      >
        {label}
      </span>
    </button>
  )
}
