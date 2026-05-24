import { useLocation } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '~/components/ui/drawer'
import { useIsMobile } from '~/lib/student-space/use-is-mobile'
import { cn } from '~/lib/utils'
import { activeKeyFromPathname } from './nav-active'
import { BOTTOM_RAIL_ITEMS, type RailItem, SHEET_HREFS, TOP_RAIL_ITEMS } from './nav-items'
import { useNavGate } from './use-nav-gate'

/**
 * Mobile navigation surface (≤640px). Renders a top-left hamburger button
 * that opens a left-slide drawer carrying the same six destinations as
 * `SideRail` desktop. Hidden via `min-[641px]:hidden` at desktop widths so
 * each viewport gets exactly one nav surface.
 *
 * Shares the URL transport, active-key derivation, optimistic active state,
 * and onboarding-hide gate with `SideRail` via `./use-nav-gate`.
 */
export function MobileNav({ game }: { game: unknown }) {
  const location = useLocation()
  const { hidden, pendingPathname, navigate } = useNavGate(game)
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  // Close the drawer when the viewport flips to desktop. Without this, a
  // user who opens the drawer on mobile and rotates to landscape ends up
  // with the portaled drawer + backdrop + focus trap stuck over the now-
  // visible SideRail — the trigger's `min-[641px]:hidden` only hides the
  // hamburger; `DrawerPortal` escapes the trigger's wrapper.
  useEffect(() => {
    if (!isMobile && open) setOpen(false)
  }, [isMobile, open])

  if (hidden) return null

  const handleNavigate = (href: string) => {
    navigate(href)
    setOpen(false)
  }

  const activeKey = activeKeyFromPathname(pendingPathname ?? location.pathname)

  const renderItem = (item: RailItem) => (
    <MobileNavRow
      key={item.id}
      item={item}
      active={activeKey === item.id}
      onSelect={handleNavigate}
    />
  )

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        aria-label="Open navigation"
        data-testid="mobile-nav-trigger"
        className={cn(
          'min-[641px]:hidden',
          // Match `WorldControlsToggle` and `ZoomHud` (the viewport-fixed FAB stacks):
          // 12px inset from the inside-frame edge on both axes.
          'fixed top-[calc(var(--inset-frame)+12px)] left-[calc(var(--inset-frame)+12px)] z-[70]',
          // Match `WorldIconButton` (the zoom / sound / arrange FABs) so the
          // hamburger reads as part of the same in-world chrome family
          // rather than a foreign nav surface.
          'grid size-11 cursor-pointer place-items-center rounded-full border border-white/72 bg-white/82 text-[#2b2620] shadow-lg shadow-black/18 backdrop-blur-md transition-[transform,background-color,border-color,color,box-shadow] hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-[0.96]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        <Menu aria-hidden className="size-5" />
      </DrawerTrigger>
      <DrawerContent
        side="left"
        aria-label="Navigation menu"
        data-testid="mobile-nav-drawer"
        className="bg-(--color-sheet-bg) text-(--color-sheet-ink)"
      >
        <DrawerTitle className="sr-only">Navigation</DrawerTitle>
        <nav className="flex h-full flex-col gap-1 px-3 pt-(--inset-frame) pb-4">
          <div className="mt-14 flex flex-col gap-1">{TOP_RAIL_ITEMS.map(renderItem)}</div>
          <div className="my-3 border-t border-(--color-sheet-divider)" />
          <div className="flex flex-col gap-1">{BOTTOM_RAIL_ITEMS.map(renderItem)}</div>
        </nav>
      </DrawerContent>
    </Drawer>
  )
}

function MobileNavRow({
  item,
  active,
  onSelect,
}: {
  item: RailItem
  active: boolean
  onSelect: (href: string) => void
}) {
  const { id, label, Icon } = item
  const href = SHEET_HREFS[id]
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-current={active ? 'page' : undefined}
      data-active={active || undefined}
      onClick={() => onSelect(href)}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-[15px] font-medium',
        'text-(--color-sheet-ink-soft) transition-[background-color,color,border-color,transform] active:scale-[0.99]',
        'hover:border-(--color-sheet-divider) hover:bg-white/70 hover:text-(--color-sheet-ink)',
        'data-[active]:border-(--color-sheet-divider) data-[active]:bg-white data-[active]:text-(--color-sheet-ink) data-[active]:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span>{label}</span>
    </button>
  )
}
