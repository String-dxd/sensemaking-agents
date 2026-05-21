/**
 * URL ↔ Student Space overlay bridge.
 *
 * The router is the source of truth for which sheet is open. Pathname →
 * surface is derived via `surfaceFromPathname`; surface → pathname uses
 * `pathnameForSurface`. In-engine click sources call `game.navigate(href)`
 * which the host wires through TanStack's router so the URL leads, and
 * `useStudentSpaceRouteSync` listens to location changes and mirrors them
 * onto `OverlayController` via `game.openSurface` / `game.closeActiveSurface`.
 *
 * Legacy `?sheet=…` deep-links keep working through a redirect installed at
 * the home route (see `src/routes/index.tsx`); the legacy parser still lives
 * in `route-sheets.ts` and is only used by that redirect.
 */

import { useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { Game } from '~/engine/student-space/Game'
import type { StudentSpaceOpenSurfaceInput, StudentSpaceSurface } from './backend-bridge'

const PROFILE_TABS = [
  'values',
  'interests',
  'personality',
  'skills',
  'relationships',
  'choices',
] as const

const HISTORY_TABS = ['timeline', 'growth'] as const

export const DEFAULT_PROFILE_TAB: (typeof PROFILE_TABS)[number] = 'values'
export const DEFAULT_HISTORY_TAB: (typeof HISTORY_TABS)[number] = 'timeline'

export type ProfileTab = (typeof PROFILE_TABS)[number]
export type HistoryTab = (typeof HISTORY_TABS)[number]

interface PathnameOptions {
  surface: StudentSpaceSurface
  tab?: string
  entryId?: number
  // Note: `filter` is intentionally NOT a path segment. Callers attach it
  // as a search param (`?filter=…`) after computing the pathname here.
}

/**
 * Parse a pathname into the engine's `openSurface` input shape. Returns
 * `null` for `/` (no overlay) and for any unrecognized path so the caller
 * can fall through to the home behavior.
 */
export function surfaceFromPathname(pathname: string): StudentSpaceOpenSurfaceInput | null {
  const segments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  if (segments.length === 0) return null

  const [head, sub] = segments
  switch (head) {
    case 'profile': {
      const tab = isProfileTab(sub) ? sub : DEFAULT_PROFILE_TAB
      return { surface: 'profile', tab }
    }
    case 'history': {
      const tab = isHistoryTab(sub) ? sub : DEFAULT_HISTORY_TAB
      return { surface: 'history', tab }
    }
    case 'letters':
      return { surface: 'letters' }
    case 'trajectory':
      return { surface: 'trajectory' }
    default:
      return null
  }
}

/**
 * Build a canonical pathname for a surface + tab combination. Inverse of
 * `surfaceFromPathname`. Default tabs are omitted so URLs stay short
 * (e.g. `/profile` rather than `/profile/values`).
 */
export function pathnameForSurface(opts: PathnameOptions): string {
  const { surface, tab, entryId } = opts
  // `Number.isFinite` so a legitimate `entryId === 0` survives. Truthy
  // checks would silently drop it and route to a tabless surface.
  const hash = Number.isFinite(entryId) ? `#reflection-${entryId}` : ''
  switch (surface) {
    case 'profile': {
      if (tab && isProfileTab(tab) && tab !== DEFAULT_PROFILE_TAB) {
        return `/profile/${tab}${hash}`
      }
      return `/profile${hash}`
    }
    case 'values':
    case 'interests':
    case 'personality':
    case 'skills':
    case 'relationships':
    case 'choices':
      // Legacy callers may pass a Profile tab name as the surface. Normalise.
      if (surface === DEFAULT_PROFILE_TAB) return `/profile${hash}`
      return `/profile/${surface}${hash}`
    case 'history': {
      if (tab && isHistoryTab(tab) && tab !== DEFAULT_HISTORY_TAB) {
        return `/history/${tab}${hash}`
      }
      return `/history${hash}`
    }
    case 'reflections':
    case 'calendar':
      // Legacy aliases — both route to History's Timeline tab.
      return `/history${hash}`
    case 'growth':
      return `/history/growth${hash}`
    case 'letters':
      return `/letters${hash}`
    case 'trajectory':
      return `/trajectory${hash}`
    default:
      return `/${hash}`
  }
}

function isProfileTab(value: unknown): value is ProfileTab {
  return typeof value === 'string' && (PROFILE_TABS as readonly string[]).includes(value)
}

function isHistoryTab(value: unknown): value is HistoryTab {
  return typeof value === 'string' && (HISTORY_TABS as readonly string[]).includes(value)
}

/**
 * Subscribe to router location changes and mirror them onto the engine's
 * overlay state. Idempotent — re-applying the same path is a no-op so
 * unrelated location updates (e.g. hash-only changes) don't re-mount sheets.
 *
 * Pass `null` for `game` until the engine has booted; the hook will pick up
 * the first location change after the engine is non-null.
 *
 * `paused` defers the open call until the host releases it. Used to wait
 * for the backend snapshot when a sheet renders empty without server data
 * (e.g. trajectory). The hook still records the pending location, so when
 * `paused` flips false the deferred open fires automatically.
 */
export function useStudentSpaceRouteSync(game: Game | null, opts: { paused?: boolean } = {}): void {
  const location = useLocation()
  const lastApplied = useRef<string | null>(null)
  const paused = opts.paused === true
  // `filter=need-review` round-trips through the URL — TanStack parses
  // `location.search` into an object via per-route `validateSearch`. We
  // read it loosely (the home route validates it as `'need-review'` and
  // the history routes mirror that) and forward it into `openSurface`.
  const searchFilter =
    (location.search as { filter?: unknown } | undefined)?.filter === 'need-review'
      ? 'need-review'
      : undefined

  useEffect(() => {
    if (!game) return
    const filterKey = searchFilter ? `?filter=${searchFilter}` : ''
    const key = `${location.pathname}${location.hash ?? ''}${filterKey}`
    if (paused) return
    if (lastApplied.current === key) return
    lastApplied.current = key

    const parsed = surfaceFromPathname(location.pathname)
    if (!parsed) {
      game.closeActiveSurface()
      return
    }
    const entryId = entryIdFromHash(location.hash ?? '')
    game.openSurface({
      ...parsed,
      ...(entryId ? { entryId } : {}),
      ...(searchFilter ? { filter: searchFilter } : {}),
    })
  }, [game, location.pathname, location.hash, paused, searchFilter])
}

/**
 * Host-side companion: build the `onNavigate` callback for `createGame`
 * options. Pulled out as a hook so the host can hand a stable reference
 * to the engine without re-creating it on every render.
 */
export function useStudentSpaceNavigate(): (href: string) => void {
  const router = useRouter()
  // `router.navigate` accepts `{ to, hash }`; we split the href so hash
  // deep-links (#reflection-N) round-trip without becoming part of the
  // pathname. TanStack treats `to` as type-narrowed against the generated
  // route tree, so an unknown route would type-error here — by design.
  return (href: string) => {
    const [pathname, hashRaw] = href.split('#')
    // `router.navigate` re-prefixes `#`, so pass the raw fragment without
    // a leading `#`. Earlier versions added one and produced `##foo`.
    const hash = hashRaw || undefined
    void router.navigate({
      // `to` is typed against the generated route tree; we cast through
      // `unknown` because callers pass dynamic paths derived from
      // `pathnameForSurface`. Validation lives upstream.
      to: pathname as unknown as Parameters<typeof router.navigate>[0]['to'],
      ...(hash ? { hash } : {}),
    })
  }
}

function entryIdFromHash(hash: string): number | undefined {
  // TanStack Router's useLocation strips the leading `#`; window.location.hash
  // keeps it. Accept both shapes so the helper works from either side.
  const cleaned = hash.startsWith('#') ? hash : `#${hash}`
  const match = cleaned.match(/^#(?:reflection|entry)-(\d+)$/)
  if (!match?.[1]) return undefined
  const id = Number.parseInt(match[1], 10)
  return Number.isFinite(id) ? id : undefined
}
