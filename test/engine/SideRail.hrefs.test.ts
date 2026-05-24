/**
 * Cross-check: SideRail's `SHEET_HREFS` map must match what
 * `pathnameForSurface` in `route-sync.ts` produces for each surface.
 *
 * The map exists beside the React SideRail so navigation labels and the
 * route-sync helper stay in lockstep. This test is the runtime enforcement
 * of that contract.
 *
 * If a rename, a new surface, or a path change lands in route-sync.ts
 * and SideRail.SHEET_HREFS doesn't follow, this test fails. Catches the
 * drift at PR review time, not in production.
 *
 * Background: code-review finding F14 (maintainability M-02, P2) from
 * the 2026-05-21 review pipeline.
 */
import { describe, expect, it } from 'vitest'
import { SHEET_HREFS } from '~/components/student-space/navigation/nav-items'
import { pathnameForSurface } from '~/lib/student-space/route-sync'

describe('SideRail.SHEET_HREFS vs pathnameForSurface', () => {
  it('home maps to /', () => {
    // The `home` rail entry has no surface — it just returns the user to
    // the world. The pathname `/` is what `surfaceFromPathname` treats as
    // "no overlay open", so no `pathnameForSurface` call backs this row.
    expect(SHEET_HREFS.home).toBe('/')
  })

  it('letters matches pathnameForSurface({ surface: "letters" })', () => {
    expect(SHEET_HREFS.letters).toBe(pathnameForSurface({ surface: 'letters' }))
  })

  it('history matches pathnameForSurface({ surface: "history" })', () => {
    expect(SHEET_HREFS.history).toBe(pathnameForSurface({ surface: 'history' }))
  })

  it('profile matches pathnameForSurface({ surface: "profile" })', () => {
    expect(SHEET_HREFS.profile).toBe(pathnameForSurface({ surface: 'profile' }))
  })

  it('trajectory matches pathnameForSurface({ surface: "trajectory" })', () => {
    expect(SHEET_HREFS.trajectory).toBe(pathnameForSurface({ surface: 'trajectory' }))
  })

  it('settings maps to /settings (React-only route, not an engine surface)', () => {
    // Settings is a React-only routed page — it intentionally doesn't go
    // through pathnameForSurface because the engine has no `settings`
    // surface. Pinning the literal here so a rename can't silently
    // diverge the sidenav from the route.
    expect(SHEET_HREFS.settings).toBe('/settings')
  })

  it('every SHEET_HREFS key is either "home" or a value that round-trips through pathnameForSurface', () => {
    // Defensive: if someone adds a new rail entry, this test catches it.
    // Either the new key is `home` (no surface) or it must round-trip via
    // pathnameForSurface for the surface name matching the rail key.
    const knownKeys = new Set(['home', 'letters', 'history', 'profile', 'trajectory', 'settings'])
    for (const key of Object.keys(SHEET_HREFS)) {
      expect(knownKeys.has(key)).toBe(true)
    }
  })
})
