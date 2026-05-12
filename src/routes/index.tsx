import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { BottomSheet } from '~/components/BottomSheet'
import { SheetEntryRail, type SheetKey } from '~/components/SheetEntryRail'
import { TrajectorySheetView } from '~/components/TrajectorySheetView'
import { VipsPageView } from '~/components/VipsPageView'
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
})

function LandingPage() {
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null)
  const sheetPanelId = useId()

  return (
    <section className="flex flex-col items-center gap-4 py-2">
      <div className="relative w-full">
        <WorldStage>
          <WorldHud />
        </WorldStage>
      </div>
      <SheetEntryRail
        openSheet={openSheet}
        onOpenSheet={setOpenSheet}
        sheetPanelId={sheetPanelId}
      />
      <BottomSheet
        open={openSheet !== null}
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
      <VipsPageView
        studentId={STUDENT_ID}
        dimension={dimension}
        page={page}
        timeline={timeline}
      />
    </div>
  )
}
