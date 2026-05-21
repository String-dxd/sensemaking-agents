import { createFileRoute, redirect } from '@tanstack/react-router'
import { studentSpaceSurfaceFromLocation } from '~/lib/student-space/route-sheets'
import { pathnameForSurface } from '~/lib/student-space/route-sync'

// The engine is mounted at the root layout (`src/routes/__root.tsx`) and
// stays visible across every route. The home route renders nothing of its
// own — the world canvas IS the home page.
//
// `beforeLoad` keeps legacy `?sheet=…` bookmarks working by redirecting
// them to the canonical nested-route equivalent (`/profile/values`,
// `/history`, `/trajectory`, …). The redirect runs before any component
// mounts, so externally-shared URLs round-trip silently.
export const Route = createFileRoute('/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { sheet?: string; filter?: 'need-review'; authError?: string } => {
    const out: { sheet?: string; filter?: 'need-review'; authError?: string } = {}
    if (typeof search.sheet === 'string') out.sheet = search.sheet
    if (search.filter === 'need-review') out.filter = 'need-review'
    // Auth-error surface — set by the WorkOS sign-out redirect when the
    // session was already invalid. Passed through unchanged so the engine
    // can read it.
    if (typeof search.authError === 'string') out.authError = search.authError
    return out
  },
  beforeLoad: ({ search, location }) => {
    if (!search.sheet) return
    // Reuse the legacy parser so query + hash normalization stays in one
    // place. TanStack strips the leading `#` off `location.hash`; the
    // legacy parser needs it back. Returns null for unknown sheet names —
    // fall through to `/`.
    const rawHash = location.hash ?? ''
    const normalisedHash = rawHash && !rawHash.startsWith('#') ? `#${rawHash}` : rawHash
    const parsed = studentSpaceSurfaceFromLocation({
      pathname: '/',
      search: `?sheet=${encodeURIComponent(search.sheet)}${
        search.filter ? `&filter=${search.filter}` : ''
      }`,
      hash: normalisedHash,
    })
    if (!parsed) return
    const to = pathnameForSurface({
      surface: parsed.surface,
      ...(parsed.entryId ? { entryId: parsed.entryId } : {}),
    })
    // `to` already encodes any hash from entryId. Forward `?filter` as a
    // search param since it's a runtime filter, not a path segment.
    const [pathname, hashRaw] = to.split('#')
    throw redirect({
      to: pathname as never,
      ...(hashRaw ? { hash: hashRaw } : {}),
      ...(parsed.filter ? { search: { filter: parsed.filter } as never } : {}),
    })
  },
  component: HomePage,
})

function HomePage() {
  return null
}
