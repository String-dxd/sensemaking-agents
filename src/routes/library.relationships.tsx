/**
 * `/library/relationships` — Relationships profile tab page.
 *
 * No server data required; the slice is engine-side + locally persisted.
 * The loader still warms VipsPages cache so §3's cross-tab self-side
 * (wired in U6) can read the student's top VIPS claim per dimension
 * without a separate fetch round-trip.
 */
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  type BelongingEntry,
  type OutsidePerspectiveEntry,
  type RelationshipMapEntry,
  RelationshipsPageView,
  type VipsSelfSideClaim,
} from '~/components/RelationshipsPageView'
import type { SheetKey } from '~/components/SheetEntryRail'
import { Button } from '~/components/ui/button'
import {
  isVipsDimension,
  VIPS_DIMENSIONS,
  VIPS_TAXONOMY,
  type VipsDimension,
} from '~/data/vips-taxonomy'
import { bootProfileTabSlices, useEngineSlice } from '~/lib/student-space/profile-tab-state'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

const STUDENT_ID = 'me'

export const Route = createFileRoute('/library/relationships')({
  loader: async ({ context }) => {
    await context.queryClient
      .ensureQueryData({
        queryKey: ['vips-pages', STUDENT_ID],
        queryFn: () => loadVipsPages({ data: {} }),
      })
      .catch(() => {
        // Loader failure is non-fatal — the §3 self-side column gracefully
        // degrades to a placeholder when VIPS data is missing.
      })
    return {}
  },
  component: RelationshipsPage,
})

function RelationshipsPage() {
  const navigate = useNavigate()
  const slices = bootProfileTabSlices()
  const relationships = useEngineSlice(slices?.relationships ?? null)

  const map = (relationships?.listMap() ?? []) as RelationshipMapEntry[]
  const belonging = (relationships?.listBelonging() ?? []) as BelongingEntry[]
  const perspectives = (relationships?.listPerspectives() ?? []) as OutsidePerspectiveEntry[]

  const { data: vipsData } = useQuery({
    queryKey: ['vips-pages', STUDENT_ID],
    queryFn: () => loadVipsPages({ data: {} }),
  })

  const selfSide = useMemo<VipsSelfSideClaim[]>(() => {
    if (!vipsData) return []
    return VIPS_DIMENSIONS.map((dimension) => ({
      dimension,
      topClaimLabel: topClaimLabelFor(vipsData, dimension),
    }))
  }, [vipsData])

  return (
    <section className="flex flex-col gap-4 py-2">
      <PageBackLink />
      <RelationshipsPageView
        studentId={STUDENT_ID}
        openSheet="relationships"
        onOpenSheet={(key: SheetKey) => {
          if (key === 'relationships') return
          if (key === 'choices') {
            void navigate({ to: '/library/choices' })
            return
          }
          if (typeof key === 'string' && isVipsDimension(key)) {
            void navigate({ to: '/library/$dimension', params: { dimension: key } })
          }
        }}
        map={map}
        belonging={belonging}
        perspectives={perspectives}
        selfSide={selfSide}
        actions={{
          addPerson: (p) => relationships?.addPerson(p) ?? null,
          removePerson: (id) => relationships?.removePerson(id) ?? null,
          addBelonging: (p) => relationships?.addBelonging(p) ?? null,
          removeBelonging: (id) => relationships?.removeBelonging(id) ?? null,
          addPerspective: (p) => relationships?.addPerspective(p) ?? null,
          removePerspective: (id) => relationships?.removePerspective(id) ?? null,
        }}
      />
      <div>
        <Link to="/" className="w-fit">
          <Button variant="outline" size="sm">
            Back to island
          </Button>
        </Link>
      </div>
    </section>
  )
}

function PageBackLink() {
  return (
    <Link to="/" className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground">
      ← Island
    </Link>
  )
}

interface VipsPagesData {
  pages: Array<{ dimension: string; compiled_truth: string }>
  timeline_by_dimension: Record<string, Array<{ canonical_claim_id: string }>>
}

function topClaimLabelFor(data: VipsPagesData | undefined, dimension: VipsDimension): string {
  if (!data) return 'No signal yet'
  const timeline = data.timeline_by_dimension?.[dimension] ?? []
  if (timeline.length === 0) {
    const page = data.pages.find((p) => p.dimension === dimension)
    return page?.compiled_truth?.trim() ? 'See VIPS page' : 'No signal yet'
  }
  const counts = new Map<string, number>()
  for (const entry of timeline) {
    counts.set(entry.canonical_claim_id, (counts.get(entry.canonical_claim_id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!top) return 'No signal yet'
  const canonical = VIPS_TAXONOMY.find((c) => c.id === top[0])
  return canonical?.label ?? top[0]
}
