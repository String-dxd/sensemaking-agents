import type { LucideIcon } from 'lucide-react'
import { Compass, History, Home, Mail, Settings, User } from 'lucide-react'

/**
 * Single source of truth for navigation destinations. Consumed by
 * `SideRail` (desktop) and `MobileNav` (≤640px) so both surfaces always
 * stay in lockstep. The `SHEET_HREFS` keys round-trip through
 * `pathnameForSurface` in `route-sync.ts` — enforced by
 * `test/engine/SideRail.hrefs.test.ts`.
 */
export const SHEET_HREFS = {
  home: '/',
  letters: '/letters',
  history: '/history',
  profile: '/profile',
  trajectory: '/trajectory',
  settings: '/settings',
} as const

export type RailItemId = keyof typeof SHEET_HREFS

export interface RailItem {
  id: RailItemId
  label: string
  Icon: LucideIcon
}

export const TOP_RAIL_ITEMS: RailItem[] = [
  { id: 'home', label: 'Island', Icon: Home },
  { id: 'profile', label: 'My Identity', Icon: User },
  { id: 'trajectory', label: 'Path Finder', Icon: Compass },
  { id: 'history', label: 'History', Icon: History },
]

export const BOTTOM_RAIL_ITEMS: RailItem[] = [
  { id: 'letters', label: 'Letters', Icon: Mail },
  { id: 'settings', label: 'Settings', Icon: Settings },
]
