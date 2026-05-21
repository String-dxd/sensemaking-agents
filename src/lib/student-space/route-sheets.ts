import type { StudentSpaceOpenSurfaceInput, StudentSpaceSurface } from './backend-bridge'

const SURFACES = new Set<StudentSpaceSurface>([
  'profile',
  'reflections',
  'trajectory',
  'values',
  'interests',
  'personality',
  'skills',
  'relationships',
  'choices',
  'growth',
  'history',
  'letters',
])

export function studentSpaceSurfaceFromLocation(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
): StudentSpaceOpenSurfaceInput | null {
  const params = new URLSearchParams(location.search)
  const rawSheet = params.get('sheet')
  if (!rawSheet) return null
  const surface = normalizeSurface(rawSheet)
  if (!surface) return null
  const filter = params.get('filter') === 'need-review' ? 'need-review' : undefined
  const entryId = reflectionIdFromHash(location.hash)
  return {
    surface,
    ...(filter ? { filter } : {}),
    ...(entryId ? { entryId } : {}),
  }
}

function normalizeSurface(value: string): StudentSpaceSurface | null {
  if (SURFACES.has(value as StudentSpaceSurface)) return value as StudentSpaceSurface
  // 'calendar' deep links now route into History (Timeline tab), preserving
  // existing bookmarks after the Calendar chip was folded into History.
  if (value === 'calendar') return 'reflections'
  if (value === 'library') return 'reflections'
  return null
}

function reflectionIdFromHash(hash: string): number | undefined {
  const match = hash.match(/^#(?:reflection|entry)-(\d+)$/)
  if (!match?.[1]) return undefined
  const id = Number.parseInt(match[1], 10)
  return Number.isFinite(id) ? id : undefined
}
