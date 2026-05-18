import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import type { CartographerOutputRow, MirrorEntryRow, VipsTimelineEntryRow } from '~/db/queries'
import type { LoadTrajectoryResult } from '~/server/load-trajectory.handler.server'
import type { LoadVipsPagesResult } from '~/server/load-vips-pages.handler.server'
import type { WikiSnapshot } from '~/server/load-wiki.handler.server'

export interface StudentSpaceProfileQuote {
  id: string
  text: string
  canonicalClaimId: string
  confidence: 'low' | 'medium' | 'high'
  sourceCaptureId: string | null
  createdAt: string
  backendTimelineEntryId: number
  backendReflectionId: number | null
  evidenceState: 'confirmed'
}

export interface StudentSpaceProfileFacetSnapshot {
  id: VipsDimension
  paragraph: string
  openQuestion: string
  lastRefinedAt: string
  quotes: StudentSpaceProfileQuote[]
}

export interface StudentSpaceProfileSnapshot {
  facets: Record<VipsDimension, StudentSpaceProfileFacetSnapshot>
  identity: {
    name: string
    className: string
    avatarDataUrl: string | null
  }
}

export interface StudentSpaceReflectionCaptureSnapshot {
  id: string
  createdAt: string
  entryDate: string
  kind: 'ask'
  text: string
  reframe: {
    headline: string
    highlightPhrase: string
    themes: string[]
    needs: string[]
    moods: string[]
  }
  thread: Array<{ role: 'you' | 'kira'; text: string }>
  backendMirrorEntryId: number
  reviewStatus: MirrorEntryRow['review_status']
  syncStatus: 'synced'
  contextType: MirrorEntryRow['context_type']
}

export interface StudentSpaceTrajectoryCaptureSnapshot {
  id: string
  createdAt: string
  entryDate: string
  kind: 'trajectory'
  backendCartographerOutputId: number
  syncStatus: 'synced'
  trajectory: {
    throughLine: string
    bearings: Array<{
      id: string
      title: string
      prompt: string
      traitTags: string[]
      ecgTags: string[]
      risk: string
    }>
  }
}

export interface StudentSpaceMoodPinSnapshot {
  id: string
  createdAt: string
  entryDate: string
  emotion: string
  intensity: 1 | 2 | 3 | 4
  cause: null
  note: null
  backendMirrorEntryId: number
}

export interface StudentSpaceBackendSnapshot {
  profile: StudentSpaceProfileSnapshot
  reflections: StudentSpaceReflectionCaptureSnapshot[]
  trajectory: StudentSpaceTrajectoryCaptureSnapshot | null
  recentMoods: StudentSpaceMoodPinSnapshot[]
}

interface SnapshotInput {
  vips: LoadVipsPagesResult
  wiki: WikiSnapshot
  trajectory: LoadTrajectoryResult
}

interface GameLike {
  state?: {
    applyBackendSnapshot?: (snapshot: StudentSpaceBackendSnapshot) => void
    captures?: {
      subscribe?: unknown
      hydrate?: (snapshot: unknown) => void
      upsertBackend?: (snapshot: unknown[]) => void
    }
    moodPins?: {
      subscribe?: unknown
      hydrate?: (snapshot: unknown) => void
      upsertBackend?: (snapshot: unknown[]) => void
    }
    profile?: {
      subscribe?: unknown
      hydrate?: (snapshot: unknown) => void
      hydrateBackend?: (snapshot: unknown) => void
    }
  }
}

const ZERO_DATE = new Date(0).toISOString()

export function createStudentSpaceBackendSnapshot({
  vips,
  wiki,
  trajectory,
}: SnapshotInput): StudentSpaceBackendSnapshot {
  return {
    profile: mapVipsPagesToStudentSpaceProfile(vips),
    reflections: mapWikiSnapshotToStudentSpaceReflections(wiki),
    trajectory: mapTrajectoryResultToStudentSpaceCapture(trajectory),
    recentMoods: mapRecentMoodsToStudentSpacePins(vips),
  }
}

export function applyStudentSpaceBackendSnapshot(
  game: GameLike,
  snapshot: StudentSpaceBackendSnapshot,
): void {
  if (game.state?.applyBackendSnapshot) {
    game.state.applyBackendSnapshot(snapshot)
    return
  }

  const profile = game.state?.profile
  if (profile?.hydrateBackend) profile.hydrateBackend(snapshot.profile)
  else profile?.hydrate?.(snapshot.profile)

  const captures = snapshot.trajectory
    ? [...snapshot.reflections, snapshot.trajectory]
    : snapshot.reflections
  const captureState = game.state?.captures
  if (captureState?.upsertBackend) captureState.upsertBackend(captures)
  else captureState?.hydrate?.(captures)

  const moodPins = game.state?.moodPins
  if (moodPins?.upsertBackend) moodPins.upsertBackend(snapshot.recentMoods)
  else moodPins?.hydrate?.(snapshot.recentMoods)
}

export function mapVipsPagesToStudentSpaceProfile(
  snapshot: LoadVipsPagesResult,
): StudentSpaceProfileSnapshot {
  const pagesByDimension = new Map(snapshot.pages.map((page) => [page.dimension, page]))
  const facets = {} as Record<VipsDimension, StudentSpaceProfileFacetSnapshot>

  for (const dimension of VIPS_DIMENSIONS) {
    const page = pagesByDimension.get(dimension)
    const entries = snapshot.timeline_by_dimension[dimension] ?? []
    facets[dimension] = {
      id: dimension,
      paragraph: page?.compiled_truth ?? '',
      openQuestion: page?.open_question ?? '',
      lastRefinedAt: page?.updated_at ?? ZERO_DATE,
      quotes: entries.filter(isVisibleTimelineEntry).map(mapTimelineEntryToQuote),
    }
  }

  return {
    facets,
    identity: {
      name: snapshot.student_profile?.name ?? 'Me',
      className: snapshot.student_profile?.detail ?? '',
      avatarDataUrl: null,
    },
  }
}

export function mapWikiSnapshotToStudentSpaceReflections(
  snapshot: WikiSnapshot,
): StudentSpaceReflectionCaptureSnapshot[] {
  return snapshot.entries
    .map(mapMirrorEntryToReflectionCapture)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

export function mapMirrorEntryToReflectionCapture(
  entry: MirrorEntryRow,
): StudentSpaceReflectionCaptureSnapshot {
  return {
    id: mirrorCaptureId(entry.id),
    createdAt: entry.created_at,
    entryDate: toEntryDate(entry.created_at),
    kind: 'ask',
    text: entry.transcript,
    reframe: {
      headline: entry.story_reframe,
      highlightPhrase: entry.inferred_meaning,
      themes: [],
      needs: [],
      moods: moodTags(entry.tags),
    },
    thread: [
      { role: 'you', text: entry.transcript },
      { role: 'kira', text: entry.story_reframe },
    ],
    backendMirrorEntryId: entry.id,
    reviewStatus: entry.review_status,
    syncStatus: 'synced',
    contextType: entry.context_type,
  }
}

export function mapTrajectoryResultToStudentSpaceCapture(
  result: LoadTrajectoryResult,
): StudentSpaceTrajectoryCaptureSnapshot | null {
  if (!result.trajectory) return null
  return mapCartographerOutputToTrajectoryCapture(result.trajectory)
}

export function mapCartographerOutputToTrajectoryCapture(
  row: CartographerOutputRow,
): StudentSpaceTrajectoryCaptureSnapshot {
  return {
    id: `cartographer:${row.id}`,
    createdAt: row.created_at,
    entryDate: toEntryDate(row.created_at),
    kind: 'trajectory',
    backendCartographerOutputId: row.id,
    syncStatus: 'synced',
    trajectory: {
      throughLine: row.trajectory_text,
      bearings: row.pathways.map((pathway, index) => ({
        id: `cartographer:${row.id}:path:${index + 1}`,
        title: pathway.label,
        prompt: pathway.exploration_prompt,
        traitTags: pathway.trait_combination.map((trait) => trait.claim_id),
        ecgTags: pathway.ecg_region_tags,
        risk: pathway.risks_tradeoffs,
      })),
    },
  }
}

export function mapRecentMoodsToStudentSpacePins(
  snapshot: LoadVipsPagesResult,
): StudentSpaceMoodPinSnapshot[] {
  return snapshot.recent_moods.map((mood) => ({
    id: `mood:${mood.id}`,
    createdAt: mood.created_at,
    entryDate: toEntryDate(mood.created_at),
    emotion: mapMoodEmotion(mood.emotion),
    intensity: intensityToEngineScale(mood.intensity),
    cause: null,
    note: null,
    backendMirrorEntryId: mood.id,
  }))
}

function mapTimelineEntryToQuote(entry: VipsTimelineEntryRow): StudentSpaceProfileQuote {
  return {
    id: `timeline:${entry.id}`,
    text: entry.verbatim_quote,
    canonicalClaimId: entry.canonical_claim_id,
    confidence: entry.strength,
    sourceCaptureId: entry.reflection_id ? mirrorCaptureId(entry.reflection_id) : null,
    createdAt: entry.committed_at,
    backendTimelineEntryId: entry.id,
    backendReflectionId: entry.reflection_id,
    evidenceState: 'confirmed',
  }
}

function isVisibleTimelineEntry(entry: VipsTimelineEntryRow): boolean {
  return !entry.forgotten_at
}

function mirrorCaptureId(id: number): string {
  return `mirror:${id}`
}

function toEntryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '1970-01-01'
  return date.toISOString().slice(0, 10)
}

function moodTags(tags: readonly string[]): string[] {
  return tags
    .filter((tag) => tag.startsWith('mood:'))
    .map((tag) => mapMoodEmotion(tag.slice('mood:'.length)))
}

function mapMoodEmotion(emotion: string): string {
  if (emotion === 'embarrassed') return 'embarrassment'
  return emotion
}

function intensityToEngineScale(intensity: number): 1 | 2 | 3 | 4 {
  if (intensity >= 0.85) return 4
  if (intensity >= 0.6) return 3
  if (intensity >= 0.35) return 2
  return 1
}
