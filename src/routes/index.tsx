import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Mood } from '~/agents/tools/schemas'
import { CaptureActionMenu } from '~/components/CaptureActionMenu'
import { EmotionChip } from '~/components/EmotionChip'
import { EmotionPicker } from '~/components/EmotionPicker'
import { FloatingWorldActions } from '~/components/FloatingWorldActions'
import {
  MirrorSessionErrorPanel,
  useMirrorSession,
  VoicePhaseOverlay,
} from '~/components/MirrorSession'
import { VoiceButton, type VoiceButtonPhase } from '~/components/VoiceButton'
import { WorldHud } from '~/components/WorldHud'
import { WorldStage } from '~/components/WorldStage'
import { buildVipsWorldSceneModel } from '~/components/world/vipsWorldMapping'
import type { VipsDimension } from '~/data/vips-taxonomy'
import type { MirrorEntryRow, VipsTimelineEntryRow } from '~/db/queries'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

const STUDENT_ID = 'me'

const VIPS_KEYS: VipsDimension[] = ['values', 'interests', 'personality', 'skills']

export const Route = createFileRoute('/')({
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
  const { data: vipsData } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: {} }),
  })
  const session = useMirrorSession({
    studentId: STUDENT_ID,
    onPersisted: () => {
      void queryClient.invalidateQueries({ queryKey: ['wiki', STUDENT_ID] })
      void queryClient.invalidateQueries({ queryKey: ['vips-pages', STUDENT_ID] })
      void navigate({ to: '/library', search: { filter: 'need-review' } })
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

  const voiceSlot = (
    <VoiceButton
      phase={voicePhase}
      amplitude={session.amplitude}
      onPress={session.handleVoicePress}
    />
  )

  return (
    <section className="flex flex-col items-center gap-4 py-2">
      <div className="relative w-full">
        <WorldStage sceneModel={sceneModel}>
          <FloatingWorldActions voiceModeActive={voiceModeActive} />
          <WorldHud
            voiceModeActive={voiceModeActive}
            captureSlot={
              <CaptureActionMenu
                modes={[
                  {
                    id: 'voice',
                    label: session.phase === 'recording' ? 'Stop recording' : 'Voice reflection',
                    description: 'Audio-only Mirror capture',
                    disabled: voicePhase === 'working',
                    onSelect: session.handleVoicePress,
                  },
                ]}
                disabled={voicePhase === 'working'}
                triggerSlot={voiceSlot}
              />
            }
          />
          <VoicePhaseOverlay
            phase={session.phase}
            remainingSec={session.remainingSec}
            showSoftPrompt={session.showSoftPrompt}
          />
          {session.phase === 'recording' ? (
            <MoodTagOverlay mood={session.mood} onMoodTagged={session.handleMoodTagged} />
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
    </section>
  )
}

/**
 * Mood-tag affordance shown during the `recording` phase. Floats bottom-
 * right of the world stage; tap opens an EmotionPicker overlay (Base UI
 * Dialog, owns focus + Escape + scroll lock). Selecting a tile calls
 * `handleMoodTagged` and auto-dismisses the picker.
 *
 * Non-blocking by design — the user can record without ever interacting
 * with this. Phase A keeps the tagged mood in MirrorSession's local state
 * only; Phase B wires it through `persistMirror`.
 */
function MoodTagOverlay({
  mood,
  onMoodTagged,
}: {
  mood: Mood | null
  onMoodTagged: (mood: Mood) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-6 z-10"
      data-testid="mood-tag-overlay"
    >
      {mood ? (
        <EmotionChip mood={mood} variant="user" asButton onClick={() => setPickerOpen(true)} />
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-testid="mood-tag-trigger"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted"
        >
          feeling?
        </button>
      )}
      {pickerOpen ? (
        <EmotionPicker
          layout="overlay"
          defaultValue={mood ?? undefined}
          onSelect={(next) => {
            onMoodTagged(next)
            setPickerOpen(false)
          }}
          onDismiss={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
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
