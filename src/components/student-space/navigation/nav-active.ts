import type { RailItemId } from './nav-items'

/**
 * Shared helpers for deriving which rail item should appear active
 * given the current router pathname. Consumed by both `SideRail` and
 * `MobileNav` so the active-state contract is identical across viewports.
 */
export function normalizePathname(pathnameOrHref: string): string {
  const [beforeHash = '/'] = pathnameOrHref.split('#')
  const [pathname = '/'] = beforeHash.split('?')
  const segments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

export function activeKeyFromPathname(pathname: string): RailItemId | null {
  const normalized = normalizePathname(pathname)
  if (normalized === '/') return 'home'
  const [head] = normalized.replace(/^\/+/, '').split('/')
  if (
    head === 'letters' ||
    head === 'history' ||
    head === 'profile' ||
    head === 'trajectory' ||
    head === 'settings'
  ) {
    return head
  }
  return null
}
