import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { ChoicesPageView } from '~/components/ChoicesPageView'
import { RelationshipsPageView } from '~/components/RelationshipsPageView'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetSurface,
  SheetTitle,
} from '~/components/ui/sheet'
import { bootProfileTabSlices } from '~/lib/student-space/profile-tab-state'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

/**
 * Profile — six-tab routed sheet (U7 React rewrite of
 * `src/engine/student-space/Game/View/ProfileSheet.js`, 1,208 lines).
 *
 * This is a **stubby** migration: Relationships + Choices tabs are absorbed
 * directly via the existing React components (`RelationshipsPageView` /
 * `ChoicesPageView`), driven by the engine slices via `bootProfileTabSlices`.
 * The four VIPS tabs (Values, Interests, Personality, Skills) currently
 * render placeholder copy — the rich TLDR hero + dimension prose + bento
 * + timeline + disclosure UI from the engine sheet is follow-up work.
 *
 * Engine wiring removed: the engine no longer constructs ProfileSheet and
 * the bridge file (`profile-tab-react-bridge.tsx`) is no longer reachable
 * from the engine side. React surfaces consume engine slices directly via
 * `bootProfileTabSlices` (which the bridge already used).
 */
type ProfileTab = 'values' | 'interests' | 'personality' | 'skills' | 'relationships' | 'choices'

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'values', label: 'Values' },
  { id: 'interests', label: 'Interests' },
  { id: 'personality', label: 'Personality' },
  { id: 'skills', label: 'Skills' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'choices', label: 'Choices' },
]

const VIPS_TAB_IDS: ProfileTab[] = ['values', 'interests', 'personality', 'skills']

export function ProfileSheet() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { tab?: string }
  const initialTab: ProfileTab = isProfileTab(params.tab) ? (params.tab as ProfileTab) : 'values'
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab)

  useEffect(() => {
    if (isProfileTab(params.tab) && params.tab !== activeTab) {
      setActiveTab(params.tab as ProfileTab)
    }
  }, [params.tab, activeTab])

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const setTab = (tab: ProfileTab) => {
    setActiveTab(tab)
    navigate({ to: tab === 'values' ? '/profile' : `/profile/${tab}` })
  }

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(next) => {
        if (next === false) navigate({ to: '/' })
      }}
    >
      <SheetSurface>
        <SheetSidebar>
          <SheetIdentityHeader>
            <SheetTitle>Profile</SheetTitle>
            <SheetDescription>
              Patterns the engine has noticed across your reflections.
            </SheetDescription>
          </SheetIdentityHeader>
          <nav className="px-4 pb-6" role="tablist" aria-label="Profile sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab}
                data-active={tab.id === activeTab || undefined}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  tab.id === activeTab
                    ? 'bg-(--color-sheet-pane-left) text-(--color-sheet-ink)'
                    : 'text-(--color-sheet-ink-soft) hover:bg-black/5',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </SheetSidebar>
        <SheetContent>
          <SheetPageHeader>
            <SheetTitle>{TABS.find((t) => t.id === activeTab)?.label}</SheetTitle>
          </SheetPageHeader>
          <SheetBody>
            <ProfileTabBody tab={activeTab} />
          </SheetBody>
        </SheetContent>
      </SheetSurface>
    </Sheet>
  )
}

function isProfileTab(value: unknown): boolean {
  return typeof value === 'string' && TABS.some((t) => t.id === value)
}

function ProfileTabBody({ tab }: { tab: ProfileTab }) {
  if (tab === 'relationships') return <RelationshipsTab />
  if (tab === 'choices') return <ChoicesTab />
  return <VipsPlaceholder tab={tab} />
}

function RelationshipsTab() {
  const slices = useMemo(() => bootProfileTabSlices(), [])
  const relationships = slices?.relationships ?? null
  useEngineSliceVersion(relationships)
  const map = relationships?.listMap() ?? []
  const belonging = relationships?.listBelonging() ?? []
  const perspectives = relationships?.listPerspectives() ?? []
  return (
    <RelationshipsPageView
      map={map}
      belonging={belonging}
      perspectives={perspectives}
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

function ChoicesTab() {
  const slices = useMemo(() => bootProfileTabSlices(), [])
  const choices = slices?.choices ?? null
  useEngineSliceVersion(choices)
  const decisions = choices?.listDecisions() ?? []
  const intentions = choices?.listIntentions() ?? []
  return (
    <ChoicesPageView
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

function VipsPlaceholder({ tab }: { tab: ProfileTab }) {
  const engine = useEngine()
  // The rich VIPS UI (TLDR hero + bento + timeline + disclosure) is
  // follow-up work that needs the engine's `state.profile` slice exposed.
  // For now we show a status placeholder so the route is reachable.
  const profile = (engine as unknown as { state?: { profile?: unknown } } | null)?.state?.profile
  const hasProfile = Boolean(profile)
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-(--color-sheet-ink)">
        The <strong className="capitalize">{tab}</strong> tab will surface the patterns the engine
        has noticed across your captures and reflections in this dimension.
      </p>
      {!hasProfile ? (
        <p className="text-sm text-(--color-sheet-ink-soft)">
          The profile engine isn't ready yet — open this view once you've recorded a few captures.
        </p>
      ) : (
        <p className="text-sm text-(--color-sheet-ink-soft)">
          Rich {tab}-tab content (TLDR hero, bento tiles, timeline, disclosure) is follow-up
          work that ports the engine ProfileSheet's per-dimension prose into React.
        </p>
      )}
    </div>
  )
}

export const VIPS_TABS = VIPS_TAB_IDS
