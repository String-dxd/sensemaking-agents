import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import type { Mood } from '~/agents/tools/schemas'
import { BottomSheet } from '~/components/BottomSheet'
import { EmotionChip } from '~/components/EmotionChip'
import { EmotionPicker } from '~/components/EmotionPicker'
import {
  MirrorSessionErrorPanel,
  useMirrorSession,
  VoicePhaseOverlay,
} from '~/components/MirrorSession'
import { SheetEntryRail, type SheetKey } from '~/components/SheetEntryRail'
import { TrajectorySheetView } from '~/components/TrajectorySheetView'
import { VipsPageView } from '~/components/VipsPageView'
import { VoiceButton, type VoiceButtonPhase } from '~/components/VoiceButton'
import { WorldHud } from '~/components/WorldHud'
import { WorldStage } from '~/components/WorldStage'
import type { VipsDimension } from '~/data/vips-taxonomy'
import { loadPendingReview } from '~/server/load-pending-review.functions'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

const STUDENT_ID = 'demo'

const VIPS_KEYS: VipsDimension[] = ['values', 'interests', 'personality', 'skills']

function isVipsDimension(k: SheetKey): k is VipsDimension {
  return (VIPS_KEYS as readonly string[]).includes(k)
}

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const pending = await context.queryClient.ensureQueryData({
      queryKey: ['pending-review', STUDENT_ID],
      queryFn: () => loadPendingReview({ data: { studentId: STUDENT_ID } }),
    })
    if (pending.diff) {
      throw redirect({ to: '/reflect/review' })
    }
    await context.queryClient.ensureQueryData({
      queryKey: ['vips-pages', STUDENT_ID],
      queryFn: () => loadVipsPages({ data: { studentId: STUDENT_ID } }),
    })
  },
  component: LandingPage,
  errorComponent: LandingErrorFallback,
})

/**
 * Loader-level fallback. A cold-start DB blip or a flaky `loadPendingReview`
 * call shouldn't take the whole home page offline — the queryClient already
 * retries once (see src/router.tsx) and this fallback handles the case where
 * the retry also fails. Recording stays reachable because the Voice button
 * doesn't depend on the loader's pre-fetched library data.
 */
function LandingErrorFallback({ reset }: { reset: () => void }) {
  return (
    <section
      className="flex flex-col items-center gap-4 py-8 text-center"
      data-testid="landing-error"
    >
      <h1 className="text-xl font-semibold tracking-tight">
        Couldn’t load your library right now.
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        That’s usually a transient hiccup. You can retry, or head straight into recording — your
        library will be there when it comes back.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
        data-testid="landing-error-retry"
      >
        Try again
      </button>
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
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null)
  const sheetPanelId = useId()
  const session = useMirrorSession({
    studentId: STUDENT_ID,
    onPersisted: () => {
      // Invalidate the pending-review cache so the /reflect/review loader
      // re-fetches against the freshly-persisted staged diff. Without this,
      // a two-tab session can read a stale `{diff: null}` and bounce the
      // user to the empty-review state.
      void queryClient.invalidateQueries({ queryKey: ['pending-review', STUDENT_ID] })
      void navigate({ to: '/reflect/review' })
    },
  })

  // Voice mode locks library navigation and sheet interaction.
  const voiceModeActive = session.voiceModeActive
  // Closing the sheet must happen in an effect — setState during render
  // would force a second commit and can interrupt the Drawer's open→close
  // transition mid-flight.
  useEffect(() => {
    if (voiceModeActive) setOpenSheet(null)
  }, [voiceModeActive])

  const voiceSlot = (
    <VoiceButton
      phase={landingPhaseToVoiceButton(session.phase)}
      amplitude={session.amplitude}
      onPress={session.handleVoicePress}
    />
  )

  return (
    <section className="flex flex-col items-center gap-4 py-2">
      <div className="relative w-full">
        <WorldStage>
          <WorldHud voiceModeActive={voiceModeActive} voiceSlot={voiceSlot} />
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
      <SheetEntryRail
        openSheet={openSheet}
        onOpenSheet={setOpenSheet}
        sheetPanelId={sheetPanelId}
        disabled={voiceModeActive}
      />
      <BottomSheet
        open={openSheet !== null && !voiceModeActive}
        onOpenChange={(open) => {
          if (!open) setOpenSheet(null)
        }}
        id={sheetPanelId}
      >
        {openSheet !== null ? <SheetContent openSheet={openSheet} /> : null}
      </BottomSheet>
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
      className="pointer-events-auto absolute bottom-6 right-6 z-10"
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

function SheetContent({ openSheet }: { openSheet: SheetKey }) {
  if (openSheet === 'trajectory') {
    return <TrajectorySheetView studentId={STUDENT_ID} />
  }
  if (!isVipsDimension(openSheet)) return null
  return <VipsDimensionSheetContent dimension={openSheet} />
}

function VipsDimensionSheetContent({ dimension }: { dimension: VipsDimension }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: { studentId: STUDENT_ID } }),
  })

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 py-4" data-testid={`sheet-loading-${dimension}`}>
        <div className="h-3 w-2/3 rounded bg-muted/60" />
        <div className="h-3 w-1/2 rounded bg-muted/60" />
        <div className="h-3 w-3/4 rounded bg-muted/60" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`sheet-error-${dimension}`}>
        Couldn't load this page — try closing and reopening.
      </p>
    )
  }

  const page = data.pages.find((p) => p.dimension === dimension)
  const timeline = data.timeline_by_dimension[dimension] ?? []

  if (!page) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`sheet-empty-${dimension}`}>
        No page for this dimension yet.
      </p>
    )
  }

  return (
    <div data-testid={`vips-card-${dimension}`}>
      <VipsPageView studentId={STUDENT_ID} dimension={dimension} page={page} timeline={timeline} />
    </div>
  )
}
