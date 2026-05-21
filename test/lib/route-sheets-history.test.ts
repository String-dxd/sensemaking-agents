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

describe('studentSpaceSurfaceFromLocation — history routing', () => {
  it('routes ?sheet=growth to the growth surface (History sheet, Growth tab)', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=growth'))).toEqual({
      surface: 'growth',
    })
  })

  it('routes ?sheet=history to the history surface', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=history'))).toEqual({
      surface: 'history',
    })
  })

  it('keeps ?sheet=calendar routing to reflections (now folded into History/Timeline)', () => {
    expect(studentSpaceSurfaceFromLocation(makeLocation('?sheet=calendar'))).toEqual({
      surface: 'reflections',
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
