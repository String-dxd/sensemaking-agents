/**
 * React-into-engine bridge for the non-VIPS Profile tabs.
 *
 * When the engine `ProfileSheet` switches to the `relationships` or
 * `choices` tab, it asks this module to mount the corresponding React view
 * into a host DOM element it provides. The same engine state slices back
 * both the React view and the rest of the engine — there is no second
 * store, just a different rendering surface.
 *
 * `omitChrome` is set so the React view doesn't re-render the avatar +
 * tab rail (the engine sheet already owns those).
 */
import { useEffect, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ChoicesPageView } from '~/components/ChoicesPageView'
import {
  RelationshipsPageView,
  type VipsSelfSideClaim,
} from '~/components/RelationshipsPageView'
import { VIPS_DIMENSIONS, VIPS_TAXONOMY, type VipsDimension } from '~/data/vips-taxonomy'
import Choices from '~/engine/student-space/Game/State/Choices.js'
import Relationships from '~/engine/student-space/Game/State/Relationships.js'
import { bootProfileTabSlices } from '~/lib/student-space/profile-tab-state'
import { loadVipsPages } from '~/server/load-vips-pages.functions'

type ProfileTabSurface = 'relationships' | 'choices'

interface ActiveMount {
  root: Root
  el: HTMLElement
}

let active: ActiveMount | null = null
// One QueryClient per host page is fine — share it across mounts to dedupe
// the VIPS pages fetch the Relationships §3 self-side column needs.
let sharedQueryClient: QueryClient | null = null

function getQueryClient() {
  if (!sharedQueryClient) {
    sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
  }
  return sharedQueryClient
}

export function mountProfileTabReactPanel(tab: ProfileTabSurface, el: HTMLElement) {
  if (active && active.el === el) {
    active.root.render(<Panel tab={tab} />)
    return
  }
  unmountProfileTabReactPanel()
  const root = createRoot(el)
  root.render(<Panel tab={tab} />)
  active = { root, el }
}

export function unmountProfileTabReactPanel() {
  if (!active) return
  try {
    active.root.unmount()
  } catch (err) {
    console.warn('[profile-tab-react-bridge] unmount failed', err)
  }
  active = null
}

function Panel({ tab }: { tab: ProfileTabSurface }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {tab === 'relationships' ? <RelationshipsPanelContainer /> : <ChoicesPanelContainer />}
    </QueryClientProvider>
  )
}

// ── Relationships container ─────────────────────────────────────────────

function RelationshipsPanelContainer() {
  const slices = useMemo(() => bootProfileTabSlices(), [])
  const relationships = slices?.relationships ?? null
  useEngineSliceVersion(relationships)

  const map = relationships?.listMap() ?? []
  const belonging = relationships?.listBelonging() ?? []
  const perspectives = relationships?.listPerspectives() ?? []

  const { data: vipsData } = useQuery({
    queryKey: ['vips-pages', 'me'],
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
    <RelationshipsPageView
      omitChrome
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
  )
}

// ── Choices container ────────────────────────────────────────────────────

function ChoicesPanelContainer() {
  const slices = useMemo(() => bootProfileTabSlices(), [])
  const choices = slices?.choices ?? null
  useEngineSliceVersion(choices)

  const decisions = choices?.listDecisions() ?? []
  const intentions = choices?.listIntentions() ?? []

  return (
    <ChoicesPageView
      omitChrome
      decisions={decisions}
      intentions={intentions}
      actions={{
        addDecision: (p) => choices?.addDecision(p) ?? null,
        removeDecision: (id) => choices?.removeDecision(id) ?? null,
        tagDecisionPattern: (id, tag) => choices?.tagDecisionPattern(id, tag) ?? null,
        addChangeIntention: (p) => choices?.addChangeIntention(p) ?? null,
        removeChangeIntention: (id) => choices?.removeChangeIntention(id) ?? null,
      }}
    />
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

interface Subscribable {
  subscribe: (cb: () => void) => () => void
}

function useEngineSliceVersion(slice: Relationships | Choices | Subscribable | null) {
  const [, setV] = useState(0)
  useEffect(() => {
    if (!slice) return
    return slice.subscribe(() => setV((v) => v + 1))
  }, [slice])
}

interface VipsPagesShape {
  pages: Array<{ dimension: string; compiled_truth: string }>
  timeline_by_dimension: Record<string, Array<{ canonical_claim_id: string }>>
}

function topClaimLabelFor(data: VipsPagesShape | undefined, dimension: VipsDimension): string {
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
