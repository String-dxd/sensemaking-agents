import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type CSSProperties, useCallback, useMemo, useState } from 'react'
import { BottomSheet } from '~/components/BottomSheet'
import { CaptureActionMenu } from '~/components/CaptureActionMenu'
import { EmotionPicker } from '~/components/EmotionPicker'
import { EnvironmentPanel } from '~/components/EnvironmentPanel'
import { FloatingWorldActions } from '~/components/FloatingWorldActions'
import {
  MirrorSessionErrorPanel,
  useMirrorSession,
  VoicePhaseOverlay,
} from '~/components/MirrorSession'
import { type ProfilePageOverview, ProfileSheetView } from '~/components/ProfileSheetView'
import { type ReflectionsFilter, ReflectionsSheetView } from '~/components/ReflectionsSheetView'
import type { SheetKey } from '~/components/SheetEntryRail'
import { TrajectorySheetView } from '~/components/TrajectorySheetView'
import { VipsPageView } from '~/components/VipsPageView'
import type { VoiceButtonPhase } from '~/components/VoiceButton'
import { WorldHud } from '~/components/WorldHud'
import { WorldStage } from '~/components/WorldStage'
import {
  buildVipsWorldSceneModel,
  type VipsWorldRecentMood,
} from '~/components/world/vipsWorldMapping'
import {
  DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
  type WorldEnvironmentControls,
  worldWeatherAtElapsed,
} from '~/components/world/worldStyle'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { MirrorEntryRow, VipsTimelineEntryRow } from '~/db/queries'
import { loadAuthMenu } from '~/server/auth-menu.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

const STUDENT_ID = 'me'
const SHEET_PANEL_ID = 'island-library-sheet'

const VIPS_KEYS: VipsDimension[] = ['values', 'interests', 'personality', 'skills']
const SHEET_KEYS: SheetKey[] = [
  'profile',
  'reflections',
  'values',
  'interests',
  'personality',
  'skills',
  'trajectory',
]

export const Route = createFileRoute('/')({
  validateSearch: (
    search,
  ): {
    sheet?: SheetKey
    filter?: ReflectionsFilter
    authError?: string
  } => ({
    sheet: isSheetKey(search.sheet) ? search.sheet : undefined,
    filter: search.filter === 'need-review' ? 'need-review' : undefined,
    authError: typeof search.authError === 'string' ? search.authError : undefined,
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['vips-pages', STUDENT_ID],
      queryFn: () => loadVipsPages({ data: {} }),
    })
  },
  component: LandingPage,
  errorComponent: LandingErrorFallback,
})

/**
 * Loader-level fallback. A cold-start DB blip while prefetching library data
 * shouldn't take the whole home page offline — the queryClient already retries
 * once (see src/router.tsx) and this fallback handles the case where the retry
 * also fails. Recording stays reachable because the Voice button doesn't
 * depend on the loader's pre-fetched library data.
 */
function LandingErrorFallback({ reset }: { reset: () => void }) {
  return (
    <section className="contents" data-testid="landing-error">
      <div className="fixed inset-x-4 top-4 z-50 flex flex-col gap-3 rounded-md border border-warning/30 bg-background/90 px-4 py-3 text-sm shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Library did not refresh.</p>
          <p className="text-muted-foreground">
            Recording is still available; retry when you need the latest pages.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex w-fit items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          data-testid="landing-error-retry"
        >
          Try again
        </button>
      </div>
      <LandingPage />
    </section>
  )
}

function landingPhaseToVoiceButton(
  phase: ReturnType<typeof useMirrorSession>['phase'],
): VoiceButtonPhase {
  if (phase === 'idle') return 'idle'
  if (phase === 'recording') return 'recording'
  if (phase === 'error' || phase === 'done') return 'idle'
  return 'working'
}

function LandingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sheet, filter } = Route.useSearch()
  const [captureMoodPickerOpen, setCaptureMoodPickerOpen] = useState(false)
  const [environmentControls, setEnvironmentControls] = useState(DEFAULT_WORLD_ENVIRONMENT_CONTROLS)
  const openSheet = sheet ?? null
  const reflectionsFilter = filter ?? 'all'
  const { data: vipsData } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: {} }),
  })
  const { data: authMenu } = useQuery({
    queryKey: ['auth-menu'],
    queryFn: () => loadAuthMenu(),
  })
  const session = useMirrorSession({
    studentId: STUDENT_ID,
    onPersisted: () => {
      void queryClient.invalidateQueries({ queryKey: ['wiki', STUDENT_ID] })
      void queryClient.invalidateQueries({ queryKey: ['vips-pages', STUDENT_ID] })
      void navigate({ to: '/', search: { sheet: 'reflections', filter: 'need-review' } })
    },
  })

  // Voice mode locks library navigation and sheet interaction.
  const voiceModeActive = session.voiceModeActive
  const voicePhase = landingPhaseToVoiceButton(session.phase)

  const sceneModel = useMemo(
    () =>
      buildVipsWorldSceneModel({
        timelineByDimension: vipsData
          ? {
              values: coerceTimeline(vipsData.timeline_by_dimension.values),
              interests: coerceTimeline(vipsData.timeline_by_dimension.interests),
              personality: coerceTimeline(vipsData.timeline_by_dimension.personality),
              skills: coerceTimeline(vipsData.timeline_by_dimension.skills),
            }
          : undefined,
        recentEntries: vipsData ? coerceRecentEntries(vipsData.recent_entries) : undefined,
        recentMoods: vipsData ? coerceRecentMoods(vipsData.recent_moods) : undefined,
        mailbox: vipsData?.world_mailbox,
      }),
    [vipsData],
  )
  const skyStyle = useMemo(
    () => createStudentSpaceSkyStyle(environmentControls),
    [environmentControls],
  )
  const skyNight = worldWeatherAtElapsed(0, environmentControls).isNight

  const openLibrarySheet = (nextSheet: SheetKey) => {
    void navigate({
      to: '/',
      search: {
        sheet: nextSheet,
        filter: nextSheet === 'reflections' ? filter : undefined,
      },
    })
  }

  const closeLibrarySheet = () => {
    void navigate({ to: '/', search: {} })
  }

  const updateReflectionsFilter = (nextFilter: ReflectionsFilter) => {
    void navigate({
      to: '/',
      search: {
        sheet: 'reflections',
        filter: nextFilter === 'need-review' ? 'need-review' : undefined,
      },
    })
  }

  const openWorldHotspotHref = useCallback(
    (href: string) => {
      const url = new URL(href, window.location.origin)
      const nextSheet = url.searchParams.get('sheet')
      if (!isSheetKey(nextSheet)) {
        window.location.href = href
        return
      }

      const nextFilter =
        nextSheet === 'reflections' && url.searchParams.get('filter') === 'need-review'
          ? 'need-review'
          : undefined
      void navigate({
        to: '/',
        search: {
          sheet: nextSheet,
          filter: nextFilter,
        },
      })
      if (url.hash) {
        window.setTimeout(() => {
          window.location.hash = url.hash
        }, 0)
      }
    },
    [navigate],
  )

  return (
    <section className="fixed inset-0 overflow-hidden" style={skyStyle}>
      <div className="relative h-full w-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-[1800ms]"
          style={{
            opacity: skyNight ? 0 : 1,
            background:
              'radial-gradient(ellipse 70% 55% at 50% 22%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 28%, rgba(255,255,255,0) 60%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-[1800ms]"
          style={{
            opacity: skyNight ? 0 : 0.85,
            background:
              'repeating-linear-gradient(92deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 6%, rgba(255,255,255,0.08) 8%, rgba(255,255,255,0.13) 9%, rgba(255,255,255,0) 11%, rgba(255,255,255,0) 17%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 60% at 50% 18%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 75%)',
            maskImage:
              'radial-gradient(ellipse 80% 60% at 50% 18%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 75%)',
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20">
          <FloatingWorldActions
            authMenu={authMenu}
            onOpenProfile={() => openLibrarySheet('profile')}
            onOpenTrajectory={() => openLibrarySheet('trajectory')}
            profileOpen={openSheet === 'profile'}
            sheetPanelId={SHEET_PANEL_ID}
            trajectoryOpen={openSheet === 'trajectory'}
            voiceModeActive={voiceModeActive}
          />
        </div>
        <WorldStage
          className="absolute inset-0 h-full min-h-svh w-full"
          onHotspotNavigate={openWorldHotspotHref}
          onVoicePromptSelect={() => {
            if (session.phase === 'idle') session.handleVoicePress()
          }}
          environmentControls={environmentControls}
          sceneModel={sceneModel}
        >
          <EnvironmentPanel
            controls={environmentControls}
            disabled={voiceModeActive}
            onChange={setEnvironmentControls}
          />
          <WorldHud
            voiceModeActive={voiceModeActive}
            captureSlot={
              <CaptureActionMenu
                modes={[
                  {
                    id: 'voice',
                    label: 'Speak',
                    description:
                      session.phase === 'recording' ? 'Stop this reflection' : 'Voice reflection',
                    disabled: voicePhase === 'working',
                    onSelect: session.handleVoicePress,
                  },
                  {
                    id: 'mood',
                    label: 'Feeling check-in',
                    description: 'Pick an emotion',
                    disabled: voicePhase === 'working',
                    onSelect: () => setCaptureMoodPickerOpen(true),
                  },
                ]}
                disabled={voicePhase === 'working'}
              />
            }
          />
          <VoicePhaseOverlay
            phase={session.phase}
            remainingSec={session.remainingSec}
            showSoftPrompt={session.showSoftPrompt}
          />
          {captureMoodPickerOpen ? (
            <EmotionPicker
              layout="overlay"
              defaultValue={session.mood ?? undefined}
              onSelect={(next) => {
                session.handleMoodTagged(next)
                setCaptureMoodPickerOpen(false)
              }}
              onDismiss={() => setCaptureMoodPickerOpen(false)}
            />
          ) : null}
        </WorldStage>
        {session.phase === 'error' && session.errorMessage ? (
          <div className="absolute inset-x-4 bottom-4 z-30">
            <MirrorSessionErrorPanel
              message={session.errorMessage}
              onReset={session.handleReset}
              onRetryChain={session.canRetryChain ? session.handleRetryChain : undefined}
            />
          </div>
        ) : null}
      </div>
      <BottomSheet
        open={openSheet != null}
        onOpenChange={(open) => !open && closeLibrarySheet()}
        id={SHEET_PANEL_ID}
        fullBleed={isProfileSurfaceSheet(openSheet)}
      >
        <LandingSheetContent
          sheet={openSheet}
          authMenu={authMenu}
          vipsData={vipsData}
          reflectionsFilter={reflectionsFilter}
          sheetPanelId={SHEET_PANEL_ID}
          voiceModeActive={voiceModeActive}
          onOpenSheet={openLibrarySheet}
          onReflectionsFilterChange={updateReflectionsFilter}
        />
      </BottomSheet>
    </section>
  )
}

function createStudentSpaceSkyStyle(controls: WorldEnvironmentControls): CSSProperties {
  const weather = worldWeatherAtElapsed(0, controls)
  return {
    background: `linear-gradient(180deg, ${rgbCss(weather.skyTop)} 0%, ${rgbCss(weather.skyMid)} 42%, ${rgbCss(weather.skyBottom)} 100%)`,
    color: weather.isNight ? '#f4f1ea' : undefined,
    transition: 'background 1800ms ease',
  }
}

function rgbCss(rgb: readonly [number, number, number]): string {
  return `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
}

function LandingSheetContent({
  sheet,
  authMenu,
  vipsData,
  reflectionsFilter,
  sheetPanelId,
  voiceModeActive,
  onOpenSheet,
  onReflectionsFilterChange,
}: {
  sheet: SheetKey | null
  authMenu: Awaited<ReturnType<typeof loadAuthMenu>> | undefined
  vipsData: Awaited<ReturnType<typeof loadVipsPages>> | undefined
  reflectionsFilter: ReflectionsFilter
  sheetPanelId: string
  voiceModeActive: boolean
  onOpenSheet: (sheet: SheetKey) => void
  onReflectionsFilterChange: (filter: ReflectionsFilter) => void
}) {
  if (!sheet) return null
  if (sheet === 'profile') {
    if (vipsData) {
      const page = vipsData.pages.find((candidate) => candidate.dimension === 'values')
      const timeline = vipsData.timeline_by_dimension.values ?? []
      if (page) {
        return (
          <VipsPageView
            studentId={STUDENT_ID}
            dimension="values"
            page={page}
            timeline={timeline}
            authMenu={authMenu}
            studentProfile={vipsData.student_profile}
            openSheet="values"
            onOpenSheet={onOpenSheet}
            sheetPanelId={sheetPanelId}
            disabled={voiceModeActive}
          />
        )
      }
    }
    return (
      <ProfileSheetView
        authMenu={authMenu}
        studentProfile={vipsData?.student_profile}
        openSheet={sheet}
        onOpenSheet={onOpenSheet}
        pageOverviews={buildProfilePageOverviews(vipsData)}
        sheetPanelId={sheetPanelId}
        disabled={voiceModeActive}
      />
    )
  }
  if (sheet === 'reflections') {
    return (
      <ReflectionsSheetView
        studentId={STUDENT_ID}
        filter={reflectionsFilter}
        onFilterChange={onReflectionsFilterChange}
      />
    )
  }
  if (sheet === 'trajectory') {
    return <TrajectorySheetView studentId={STUDENT_ID} />
  }
  if (!vipsData) {
    return <p className="py-4 text-sm text-muted-foreground">loading library…</p>
  }

  const page = vipsData.pages.find((candidate) => candidate.dimension === sheet)
  const timeline = vipsData.timeline_by_dimension[sheet] ?? []
  if (!page) {
    return <p className="py-4 text-sm text-muted-foreground">No page for this dimension yet.</p>
  }
  return (
    <VipsPageView
      studentId={STUDENT_ID}
      dimension={sheet}
      page={page}
      timeline={timeline}
      authMenu={authMenu}
      studentProfile={vipsData.student_profile}
      openSheet={sheet}
      onOpenSheet={onOpenSheet}
      sheetPanelId={sheetPanelId}
      disabled={voiceModeActive}
    />
  )
}

function isProfileSurfaceSheet(sheet: SheetKey | null): boolean {
  return (
    sheet === 'profile' ||
    sheet === 'reflections' ||
    (sheet != null && (VIPS_KEYS as readonly string[]).includes(sheet))
  )
}

function coerceTimeline(entries: VipsTimelineEntryRow[] | undefined) {
  return (entries ?? [])
    .filter((entry): entry is VipsTimelineEntryRow & { dimension: VipsDimension } =>
      (VIPS_KEYS as readonly string[]).includes(entry.dimension),
    )
    .map((entry) => ({ ...entry, dimension: entry.dimension as VipsDimension }))
}

function coerceRecentEntries(entries: MirrorEntryRow[] | undefined) {
  return (entries ?? []).map((entry) => ({
    id: entry.id,
    review_status: entry.review_status,
    context_type: entry.context_type,
    created_at: entry.created_at,
  }))
}

function coerceRecentMoods(
  entries:
    | Array<{
        id: number | string
        emotion: string
        intensity?: number
        created_at?: string | null
      }>
    | undefined,
): VipsWorldRecentMood[] {
  return (entries ?? []).map((entry) => ({
    id: entry.id,
    emotion: entry.emotion,
    intensity: entry.intensity,
    created_at: entry.created_at,
  }))
}

function buildProfilePageOverviews(
  vipsData: Awaited<ReturnType<typeof loadVipsPages>> | undefined,
): ProfilePageOverview[] | undefined {
  if (!vipsData) return undefined
  return VIPS_KEYS.map((dimension) => {
    const page = vipsData.pages.find((candidate) => candidate.dimension === dimension)
    return {
      dimension,
      compiledTruth: page?.compiled_truth ?? '',
      claimCount: vipsData.claim_count_by_dimension[dimension] ?? 0,
      updatedAt: page?.updated_at ?? null,
    }
  })
}

function isSheetKey(value: unknown): value is SheetKey {
  return typeof value === 'string' && (SHEET_KEYS as readonly string[]).includes(value)
}
