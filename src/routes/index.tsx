import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { BottomSheet } from '~/components/BottomSheet'
import { CaptureActionMenu } from '~/components/CaptureActionMenu'
import { EmotionPicker } from '~/components/EmotionPicker'
import { FloatingWorldActions } from '~/components/FloatingWorldActions'
import {
  MirrorSessionErrorPanel,
  useMirrorSession,
  VoicePhaseOverlay,
} from '~/components/MirrorSession'
import { ProfileSheetView } from '~/components/ProfileSheetView'
import { type ReflectionsFilter, ReflectionsSheetView } from '~/components/ReflectionsSheetView'
import type { SheetKey } from '~/components/SheetEntryRail'
import { TrajectorySheetView } from '~/components/TrajectorySheetView'
import { VipsPageView } from '~/components/VipsPageView'
import type { VoiceButtonPhase } from '~/components/VoiceButton'
import { WorldHud } from '~/components/WorldHud'
import { WorldStage } from '~/components/WorldStage'
import { buildVipsWorldSceneModel } from '~/components/world/vipsWorldMapping'
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
    <section className="flex flex-col gap-3 py-2" data-testid="landing-error">
      <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
      }),
    [vipsData],
  )

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

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center py-2">
      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-3">
        <FloatingWorldActions
          authMenu={authMenu}
          onOpenProfile={() => openLibrarySheet('profile')}
          onOpenTrajectory={() => openLibrarySheet('trajectory')}
          profileOpen={openSheet === 'profile'}
          sheetPanelId={SHEET_PANEL_ID}
          trajectoryOpen={openSheet === 'trajectory'}
          voiceModeActive={voiceModeActive}
        />
        <WorldStage className="min-h-[calc(100svh-6.5rem)] flex-1" sceneModel={sceneModel}>
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
          <div className="absolute inset-x-4 bottom-4">
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
    return (
      <ProfileSheetView
        authMenu={authMenu}
        openSheet={sheet}
        onOpenSheet={onOpenSheet}
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
  return <VipsPageView studentId={STUDENT_ID} dimension={sheet} page={page} timeline={timeline} />
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

function isSheetKey(value: unknown): value is SheetKey {
  return typeof value === 'string' && (SHEET_KEYS as readonly string[]).includes(value)
}
