/**
 * U7 coverage — `?sheet=growth` deep link is parsed by
 * `studentSpaceSurfaceFromLocation`, which is the host-side router that
 * turns URL params into engine `openSurface` calls.
 *
 * The full GrowthSheet surface is engine-DOM and tested by visual walk-
 * through; here we cover the load-bearing routing seam so a stale `?sheet=`
 * URL routes correctly into the engine.
 */

import { describe, expect, it } from 'vitest'

import { studentSpaceSurfaceFromLocation } from '~/lib/student-space/route-sheets'

function makeLocation(search: string, hash = ''): Pick<Location, 'hash' | 'pathname' | 'search'> {
  return { hash, pathname: '/', search }
}

describe('studentSpaceSurfaceFromLocation — growth', () => {
  it('routes ?sheet=growth to the growth surface', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=growth'))).toEqual({
      surface: 'growth',
    })
  })

  it('still routes ?sheet=profile to profile (regression guard)', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=profile'))).toEqual({
      surface: 'profile',
    })
  })

  it('returns null for an unknown sheet param', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=nonsense'))).toBeNull()
  })

  it('returns null when no sheet param is present', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation(''))).toBeNull()
  })
})
