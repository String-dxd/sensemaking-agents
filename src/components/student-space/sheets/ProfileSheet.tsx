import { useNavigate, useParams } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  ChevronDown,
  Compass,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  LogOut,
  MoreHorizontal,
  RefreshCcw,
  Share2,
  Sparkles,
  Users,
  Waves,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChoicesPageView } from '~/components/ChoicesPageView'
import { RelationshipsPageView } from '~/components/RelationshipsPageView'
import { Button } from '~/components/ui/button'
import {
  PageSurface,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetNavButton,
  SheetSidebar,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'
import { VIPS_TAXONOMY, type VipsDimension } from '~/data/vips-taxonomy'
import ShareTokenBridge from '~/engine/student-space/Game/State/ShareTokenBridge.js'
import { PROFILE_HEADERS, PROFILE_THEMES } from '~/lib/profile-tokens'
import { bootProfileTabSlices } from '~/lib/student-space/profile-tab-state'
import { rankClaims } from '~/lib/student-space/rank-claims'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

type ProfileTab = VipsDimension | 'relationships' | 'choices'

type AuthMenu =
  | { status: 'signed-out' }
  | { status: 'signed-in'; label?: string; detail?: string | null; kind?: string }

interface ProfileQuote {
  id: string
  text: string
  canonicalClaimId: string
  confidence?: 'low' | 'medium' | 'high' | string
  sourceCaptureId?: string | null
  createdAt?: string
  backendTimelineEntryId?: number | null
}

interface BigFiveAspect {
  name: string
  score: number
  lean?: 'left' | 'center' | 'right' | string
  blurb?: string
}

interface BigFiveTrait {
  id: string
  name: string
  tag?: string
  position: number
  poleLeft: string
  poleRight: string
  schoolReadout?: string
  aspects?: BigFiveAspect[]
}

interface BigFiveTldr {
  eyebrow?: string
  headline?: string
  poles?: string[]
  meta?: string
}

interface BigFive {
  tldr?: BigFiveTldr
  traits?: BigFiveTrait[]
}

interface ProfileFacet {
  id: VipsDimension
  paragraph?: string
  openQuestion?: string
  lastRefinedAt?: string
  quotes: ProfileQuote[]
  bigFive?: BigFive
}

interface ProfileSlice {
  identity?: {
    name?: string
    className?: string
    avatarDataUrl?: string | null
  }
  subscribe?: (cb: () => void) => () => void
  getFacet?: (facet: VipsDimension) => ProfileFacet | null
  countByClaim?: (facet: VipsDimension) => Record<string, number>
  forgetQuote?: (facet: VipsDimension, quoteId: string) => string | null
}

interface EngineState {
  auth?: { menu?: AuthMenu; subscribe?: (cb: () => void) => () => void }
  backend?: {
    forgetEvidence?: (input: { timelineEntryId: number }) => Promise<unknown>
    refreshSnapshot?: () => Promise<unknown>
  } | null
  captures?: { findById?: (id: string) => { kind?: string } | null }
  moodPins?: { pins?: Array<{ id: string }> }
  applyBackendSnapshot?: (snapshot: unknown) => void
  profile?: ProfileSlice
}

interface StudentSpaceEngine {
  state?: EngineState
  view?: { overlayController?: { open: (name: string, opts?: unknown) => void } }
}

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'values', label: 'Values' },
  { id: 'interests', label: 'Interests' },
  { id: 'personality', label: 'Personality' },
  { id: 'skills', label: 'Skills' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'choices', label: 'Choices' },
]

const VIPS_TAB_IDS: VipsDimension[] = ['values', 'interests', 'personality', 'skills']
const CLAIMS_BY_DIMENSION = VIPS_TAXONOMY.reduce(
  (acc, claim) => {
    if (!acc[claim.dimension]) acc[claim.dimension] = []
    acc[claim.dimension].push(claim)
    return acc
  },
  {} as Record<VipsDimension, typeof VIPS_TAXONOMY>,
)
const CLAIM_LABEL_BY_ID = new Map(VIPS_TAXONOMY.map((claim) => [claim.id, claim.label]))
const ARM_TIMEOUT_MS = 3200
const FORGET_FADE_MS = 200
const REVOKE_DISARM_MS = 4000

type ThumbnailRendererInstance = {
  getThumbnail: (id: string) => string
  prewarm?: (ids: string[]) => void
}

let thumbnailRenderer: ThumbnailRendererInstance | null = null
let thumbnailRendererLoader: Promise<ThumbnailRendererInstance | null> | null = null

function loadThumbnailRenderer(): Promise<ThumbnailRendererInstance | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (thumbnailRenderer) return Promise.resolve(thumbnailRenderer)
  if (thumbnailRendererLoader) return thumbnailRendererLoader
  thumbnailRendererLoader = import('~/engine/student-space/Game/View/ThumbnailRenderer.js')
    .then((mod) => {
      const Ctor = (mod as { default: new () => ThumbnailRendererInstance }).default
      thumbnailRenderer = new Ctor()
      return thumbnailRenderer
    })
    .catch((err) => {
      console.warn('[ProfileSheet] thumbnail renderer init failed', err)
      thumbnailRendererLoader = null
      return null
    })
  return thumbnailRendererLoader
}

function useClaimThumbnails(claimIds: string[]): Record<string, string> {
  const key = claimIds.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const ids = key ? key.split('|') : []
    loadThumbnailRenderer().then((renderer) => {
      if (cancelled || !renderer) return
      const next: Record<string, string> = {}
      for (const id of ids) {
        const url = renderer.getThumbnail(id)
        if (url) next[id] = url
      }
      if (!cancelled) setUrls(next)
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return urls
}

type MaybeSliceSubscribable = { subscribe?: (cb: () => void) => () => void }
type ClaimObject =
  | { kind: 'tree'; species: string }
  | { kind: 'flower'; species: string }
  | { kind: 'fruit'; species: string }
  | { kind: 'windStone' }
  | { kind: 'pool' }

const CLAIM_OBJECTS: Record<string, ClaimObject> = {
  'values.contribution': { kind: 'tree', species: 'mangrove' },
  'values.achievement': { kind: 'tree', species: 'oak' },
  'values.tradition': { kind: 'tree', species: 'cherry' },
  'values.security': { kind: 'tree', species: 'pine' },
  'values.independence': { kind: 'tree', species: 'palm' },
  'values.relationships': { kind: 'tree', species: 'maple' },
  'values.wellbeing': { kind: 'tree', species: 'willow' },
  'values.learning': { kind: 'tree', species: 'banyan' },
  'interests.realistic': { kind: 'flower', species: 'daisy' },
  'interests.investigative': { kind: 'flower', species: 'pansy' },
  'interests.artistic': { kind: 'flower', species: 'rose' },
  'interests.social': { kind: 'flower', species: 'lily' },
  'interests.enterprising': { kind: 'flower', species: 'tulip' },
  'interests.conventional': { kind: 'flower', species: 'hyacinth' },
  'personality.extraversion': { kind: 'windStone' },
  'personality.neuroticism': { kind: 'pool' },
  'skills.interpersonal': { kind: 'fruit', species: 'fig' },
  'skills.analytical': { kind: 'fruit', species: 'pear' },
  'skills.creative': { kind: 'fruit', species: 'plum' },
  'skills.practical': { kind: 'fruit', species: 'apple' },
  'skills.leadership': { kind: 'fruit', species: 'citrus' },
  'skills.communication': { kind: 'fruit', species: 'berry' },
}

export function ProfileSheet() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { tab?: string }
  const engine = useEngine() as StudentSpaceEngine | null
  const state = engine?.state
  const profile = state?.profile ?? null
  const initialTab: ProfileTab = isProfileTab(params.tab) ? (params.tab as ProfileTab) : 'values'
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab)
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const [expandedTimelines, setExpandedTimelines] = useState<Set<VipsDimension>>(() => new Set())
  const [shareOpen, setShareOpen] = useState(false)
  const profileSubscription = useBoundSubscribable(profile)
  const authSubscription = useBoundSubscribable(state?.auth ?? null)

  useEngineSliceVersion(profileSubscription)
  useEngineSliceVersion(authSubscription)

  useEffect(() => {
    if (isProfileTab(params.tab) && params.tab !== activeTab) {
      setActiveTab(params.tab as ProfileTab)
      setSelectedClaimId(null)
    }
  }, [params.tab, activeTab])

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const setTab = (tab: ProfileTab) => {
    setActiveTab(tab)
    setSelectedClaimId(null)
    navigate({ to: tab === 'values' ? '/profile' : `/profile/${tab}` })
  }

  const themeStyle = themeVars(activeTab)

  const dismissToHome = useCallback(() => navigate({ to: '/' }), [navigate])
  usePageEscape(dismissToHome)

  return (
    <PageSurface className="isolate" style={themeStyle}>
      <SheetSidebar>
        <SheetIdentityHeader>
          <SheetTitle>My Identity</SheetTitle>
          <SheetDescription>
            The shape of your reflections so far across values, interests, personality, and skills.
          </SheetDescription>
          <div className="mt-2">
            <IdentityCard profile={profile} />
          </div>
        </SheetIdentityHeader>
        <div className="flex flex-col gap-1 px-4 pb-6" role="tablist" aria-label="Profile sections">
          {PROFILE_TABS.map((tab) => (
            <SheetNavButton
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTab}
              active={tab.id === activeTab}
              onClick={() => setTab(tab.id)}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  tab.id === activeTab ? 'bg-(--profile-accent)' : 'bg-(--color-sheet-divider)',
                )}
              />
              {tab.label}
            </SheetNavButton>
          ))}
        </div>
        {state?.auth?.menu?.status !== 'signed-in' ? (
          <div className="mt-auto border-t border-(--color-sheet-divider) px-4 py-4">
            <SignInLink />
          </div>
        ) : null}
      </SheetSidebar>
      <SheetContent>
        <header
          data-testid="profile-page-header"
          className="flex items-center justify-end gap-2 border-b border-(--color-sheet-divider) px-9 py-5"
        >
          <ShareButton onClick={() => setShareOpen(true)} />
          <AccountMenuButton authMenu={state?.auth?.menu} />
        </header>
        <SheetBody className="space-y-8">
          {isVipsTab(activeTab) ? (
            <VipsProfileTab
              tab={activeTab}
              profile={profile}
              backend={state?.backend}
              applyBackendSnapshot={state?.applyBackendSnapshot}
              overlayController={engine?.view?.overlayController}
              captures={state?.captures}
              moodPins={state?.moodPins}
              selectedClaimId={selectedClaimId}
              setSelectedClaimId={setSelectedClaimId}
              timelineExpanded={expandedTimelines.has(activeTab)}
              setTimelineExpanded={(expanded) => {
                setExpandedTimelines((prev) => {
                  const next = new Set(prev)
                  if (expanded) next.add(activeTab)
                  else next.delete(activeTab)
                  return next
                })
              }}
            />
          ) : activeTab === 'relationships' ? (
            <RelationshipsTab />
          ) : (
            <ChoicesTab />
          )}
        </SheetBody>
      </SheetContent>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </PageSurface>
  )
}

function IdentityCard({ profile }: { profile: ProfileSlice | null }) {
  const identity = profile?.identity ?? {}
  const name = identity.name?.trim() || 'Student'
  const className = identity.className?.trim() || 'Student Space profile'
  const initial = name.charAt(0).toUpperCase()

  const face = identity.avatarDataUrl ? (
    <img src={identity.avatarDataUrl} alt="" className="size-full object-cover" />
  ) : (
    <span aria-hidden>{initial}</span>
  )

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-(--color-sheet-divider) bg-white/45 px-3 py-2.5"
      data-testid="profile-identity-card"
    >
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-(--color-onb-bg-cream) text-base font-semibold text-(--color-sheet-ink) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--profile-accent)_32%,transparent)]">
        {face}
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-(--color-sheet-ink)">{name}</h3>
        <p className="truncate text-xs text-(--color-sheet-ink-soft)">{className}</p>
      </div>
    </div>
  )
}

function AccountMenuButton({ authMenu }: { authMenu: AuthMenu | undefined }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const signedIn = authMenu?.status === 'signed-in'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!signedIn) return null

  return (
    <div ref={rootRef} className="relative" data-testid="profile-auth-menu">
      <button
        type="button"
        aria-label="More account actions"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="profile-auth-more"
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-(--color-sheet-divider) bg-white/80 text-(--color-sheet-ink) transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-sheet-pane-right)"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 rounded-xl border border-(--color-sheet-divider) bg-white p-2 shadow-[0_18px_48px_rgba(43,38,32,0.14)]"
        >
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--color-sheet-ink-soft)">
              {authMenu?.label || 'Signed in'}
            </p>
            {authMenu?.detail ? (
              <p className="mt-0.5 truncate text-xs text-(--color-sheet-ink-soft)">
                {authMenu.detail}
              </p>
            ) : null}
          </div>
          <form
            action="/api/auth/sign-out"
            method="post"
            data-testid="profile-auth-signout-form"
            onSubmit={(event) => {
              event.preventDefault()
              try {
                window.__studentSpaceGame?.dispose()
              } catch {
                // Continue to body-scoped POST.
              }
              clearStudentSpaceLocalStateInline()
              submitBodyScopedAuthForm('/api/auth/sign-out')
            }}
          >
            <button
              type="submit"
              data-testid="profile-auth-signout"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-(--color-sheet-ink) transition-colors hover:bg-black/5"
            >
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function SignInLink() {
  const profileReturnPathname = encodeURIComponent('/?sheet=profile')
  return (
    <a
      href={`/?auth=sign-in&returnPathname=${profileReturnPathname}#sign-in`}
      data-testid="profile-auth-signin"
      onClick={() => {
        try {
          window.__studentSpaceGame?.dispose()
        } catch {
          // Navigation is already in flight.
        }
      }}
      className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-(--color-onb-accent) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-onb-accent-deep) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-onb-accent-deep) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-sheet-pane-left) active:scale-[0.96]"
    >
      Sign in
    </a>
  )
}

function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="profile-share-button"
      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-(--color-sheet-divider) bg-white/80 px-4 text-sm font-semibold text-(--color-sheet-ink) transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-sheet-pane-right) active:scale-[0.96]"
    >
      <Share2 aria-hidden className="size-4" />
      Share
    </button>
  )
}

function VipsProfileTab({
  tab,
  profile,
  backend,
  applyBackendSnapshot,
  overlayController,
  captures,
  moodPins,
  selectedClaimId,
  setSelectedClaimId,
  timelineExpanded,
  setTimelineExpanded,
}: {
  tab: VipsDimension
  profile: ProfileSlice | null
  backend: EngineState['backend']
  applyBackendSnapshot?: (snapshot: unknown) => void
  overlayController?: { open: (name: string, opts?: unknown) => void }
  captures?: EngineState['captures']
  moodPins?: EngineState['moodPins']
  selectedClaimId: string | null
  setSelectedClaimId: (claimId: string | null) => void
  timelineExpanded: boolean
  setTimelineExpanded: (expanded: boolean) => void
}) {
  const facet = profile?.getFacet?.(tab) ?? null
  const claims = CLAIMS_BY_DIMENSION[tab] ?? []
  const counts = profile?.countByClaim?.(tab) ?? {}
  const total = claims.reduce((sum, claim) => sum + (counts[claim.id] ?? 0), 0)
  const header = PROFILE_HEADERS[tab]
  const ranked = rankClaims(claims, counts)
  const visibleQuotes = (facet?.quotes ?? [])
    .filter((quote) => !selectedClaimId || quote.canonicalClaimId === selectedClaimId)
    .slice()
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const hasFilter = Boolean(selectedClaimId)
  const cap = 3
  const shouldCap = !timelineExpanded && visibleQuotes.length > cap && !hasFilter
  const quotes = shouldCap ? visibleQuotes.slice(0, cap) : visibleQuotes
  // Personality has only 2 canonical claims (extraversion + neuroticism), so
  // the VIPS "most common / quietly emerging" stats and the COLLECTION bento
  // have nothing meaningful to surface. The Big-Five Recognition cards carry
  // the personality read instead — five hand-authored trait cards seeded
  // into the facet.
  const isPersonality = tab === 'personality'
  const bigFive = isPersonality ? facet?.bigFive : undefined
  const thumbnails = useClaimThumbnails(claims.map((claim) => claim.id))

  return (
    <>
      <section className="grid gap-5">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--profile-soft) px-2.5 py-1 text-xs font-semibold text-(--profile-ink)">
                {header.tag}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold leading-tight text-(--color-sheet-ink)">
                {formatProfileHeading(header.eyebrow)}
              </h2>
              <p className="mt-1 text-sm text-(--color-sheet-ink-soft)">{header.subtitle}</p>
            </div>
          </div>
          <ParagraphBlock
            paragraph={facet?.paragraph}
            fallback={`Your ${header.tag.toLowerCase()} read grows as you capture moments on the island.`}
          />
        </div>
        {isPersonality ? null : (
          <div className="grid gap-3 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4">
            <StatRow label="Noticings" value={String(total)} />
            <StatRow label="Most common" value={ranked.mostCommon?.label ?? 'Still emerging'} />
            <StatRow
              label="Quietly emerging"
              value={ranked.quietlyEmerging?.label ?? 'Still emerging'}
            />
            <StatRow
              label="Last refined"
              value={formatRefined(facet?.lastRefinedAt) || 'Not yet'}
            />
          </div>
        )}
      </section>

      {isPersonality && bigFive?.tldr ? (
        <PersonalityTldr tldr={bigFive.tldr} />
      ) : (
        <TldrHero
          tab={tab}
          total={total}
          claims={claims}
          counts={counts}
          selectedClaimId={selectedClaimId}
          onSelectClaim={setSelectedClaimId}
          refined={formatRefined(facet?.lastRefinedAt)}
        />
      )}

      {facet?.openQuestion ? (
        <aside className="rounded-xl border border-(--profile-accent)/30 bg-(--profile-soft) p-4 text-(--profile-ink)">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
            Open question
          </p>
          <p className="mt-1 text-sm leading-6">{facet.openQuestion}</p>
        </aside>
      ) : null}

      {isPersonality && Array.isArray(bigFive?.traits) ? (
        <BigFiveCards traits={bigFive.traits} />
      ) : null}

      {isPersonality ? null : (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
              Collection
            </h3>
            {selectedClaimId ? (
              <button
                type="button"
                onClick={() => setSelectedClaimId(null)}
                className="rounded-full border border-(--color-sheet-divider) px-3 py-1 text-xs font-medium text-(--color-sheet-ink-soft) hover:bg-black/5"
              >
                Clear filter
              </button>
            ) : null}
          </div>
          {total === 0 ? (
            <div
              data-testid="profile-dimension-empty"
              className="rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5 text-sm text-(--color-sheet-ink-soft)"
            >
              Your {header.tag.toLowerCase()} read grows as you reflect. Capture a few from the
              island, and tiles will fill in here.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {claims.map((claim) => {
                const count = counts[claim.id] ?? 0
                const selected = selectedClaimId === claim.id
                return (
                  <li key={claim.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedClaimId(selected ? null : claim.id)}
                      className={cn(
                        'flex h-full w-full items-start gap-3 rounded-xl border p-4 text-left transition-[background,border-color,transform]',
                        selected
                          ? 'border-(--profile-accent) bg-(--profile-soft)'
                          : 'border-(--color-sheet-divider) bg-(--color-sheet-pane-left) hover:bg-black/5',
                        count === 0 && 'opacity-65',
                      )}
                    >
                      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_8px_20px_rgba(43,38,32,0.08)]">
                        <img
                          src={thumbnails[claim.id] || claimThumbnailDataUri(claim.id)}
                          alt=""
                          loading="lazy"
                          data-testid="profile-claim-thumbnail"
                          className="size-full object-cover"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-(--color-sheet-ink)">
                          {claim.label}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-(--color-sheet-ink-soft)">
                          {count === 0
                            ? 'No noticings yet'
                            : `${count} noticing${count === 1 ? '' : 's'}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
            Timeline
            {selectedClaimId ? (
              <span className="ml-2 normal-case tracking-normal text-(--profile-ink)">
                {claimLabel(selectedClaimId)}
              </span>
            ) : shouldCap ? (
              <span className="ml-2 normal-case tracking-normal">
                showing {quotes.length} of {visibleQuotes.length}
              </span>
            ) : null}
          </h3>
        </div>
        {visibleQuotes.length === 0 ? (
          <p className="rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5 text-sm text-(--color-sheet-ink-soft)">
            No noticings here yet — capture a few from the island.
          </p>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <TimelineQuote
                key={quote.id}
                quote={quote}
                tab={tab}
                profile={profile}
                backend={backend}
                applyBackendSnapshot={applyBackendSnapshot}
                overlayController={overlayController}
                captures={captures}
                moodPins={moodPins}
              />
            ))}
            {!hasFilter && visibleQuotes.length > cap ? (
              <li>
                <button
                  type="button"
                  onClick={() => setTimelineExpanded(!timelineExpanded)}
                  className="w-full rounded-xl border border-dashed border-(--color-sheet-divider) px-4 py-3 text-sm font-medium text-(--color-sheet-ink-soft) hover:bg-black/5"
                >
                  {timelineExpanded
                    ? 'Show fewer'
                    : `Show all ${visibleQuotes.length - quotes.length} more noticing${
                        visibleQuotes.length - quotes.length === 1 ? '' : 's'
                      }`}
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </>
  )
}

function ParagraphBlock({
  paragraph,
  fallback,
}: {
  paragraph: string | undefined
  fallback: string
}) {
  const [expanded, setExpanded] = useState(false)
  const text = paragraph?.trim()
  if (!text) {
    return <p className="max-w-2xl text-sm leading-6 text-(--color-sheet-ink-soft)">{fallback}</p>
  }
  const { thesis, evidence } = splitThesisAndEvidence(text)
  // Reset back to clamped whenever the underlying paragraph changes (e.g.
  // switching VIPS tabs) — otherwise the next dimension's evidence opens
  // already expanded.
  const hasEvidence = Boolean(evidence)
  // Show Read more only when there's real evidence to hide. Tight bodies
  // (one sentence, no expansion content) skip the toggle entirely.
  const showToggle = hasEvidence && evidence.length > 160
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-2xl text-[15px] font-medium leading-relaxed text-(--color-sheet-ink)">
        {thesis}
      </p>
      {hasEvidence ? (
        <p
          className={cn(
            'max-w-2xl text-[13px] leading-6 text-(--color-sheet-ink-soft)',
            showToggle && !expanded && 'line-clamp-2',
          )}
        >
          {evidence}
        </p>
      ) : null}
      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="self-start rounded-full px-2 py-0.5 -ml-2 text-xs font-semibold text-(--profile-ink) hover:bg-(--profile-soft)/60 transition-colors"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  )
}

function TldrHero({
  tab,
  total,
  claims,
  counts,
  selectedClaimId,
  refined,
  onSelectClaim,
}: {
  tab: VipsDimension
  total: number
  claims: Array<(typeof VIPS_TAXONOMY)[number]>
  counts: Record<string, number>
  selectedClaimId: string | null
  refined: string
  onSelectClaim: (claimId: string | null) => void
}) {
  if (total === 0) return null
  const voiced = claims
    .map((claim) => ({ ...claim, count: counts[claim.id] ?? 0 }))
    .filter((claim) => claim.count > 0)
    .sort((a, b) => b.count - a.count)
  const meta = [`${total} noticing${total === 1 ? '' : 's'}`, refined].filter(Boolean).join(' · ')

  return (
    <section className="rounded-2xl border border-(--profile-accent)/20 bg-[linear-gradient(135deg,var(--profile-soft),rgba(255,255,255,0.78))] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--profile-ink)">
        {voiced.length >= 3
          ? `Top voices in your ${PROFILE_HEADERS[tab].tag}`
          : `In your ${PROFILE_HEADERS[tab].tag}`}
      </p>
      <h3 className="mt-2 max-w-3xl text-xl font-semibold leading-snug text-(--color-sheet-ink)">
        {voiced.length >= 3
          ? tldrHeadline(tab, voiced.length)
          : 'Few noticings yet — capture a moment on the island to see what shows up.'}
      </h3>
      {voiced.length >= 3 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {voiced.slice(0, 5).map((claim) => {
            const selected = selectedClaimId === claim.id
            return (
              <button
                key={claim.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectClaim(selected ? null : claim.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors',
                  selected
                    ? 'border-(--profile-accent) bg-(--profile-accent) text-white'
                    : 'border-(--profile-accent)/25 bg-white/65 text-(--profile-ink) hover:bg-white',
                )}
              >
                {claim.label}
              </button>
            )
          })}
        </div>
      ) : null}
      {meta ? (
        <p className="mt-4 text-xs font-medium text-(--profile-ink) opacity-75">{meta}</p>
      ) : null}
    </section>
  )
}

const TRAIT_ICONS: Record<string, LucideIcon> = {
  curiosity: Sparkles,
  'social-energy': Users,
  warmth: Heart,
  'follow-through': Compass,
  'emotional-sensitivity': Waves,
}

const TRAIT_ACCENTS: Record<string, string> = {
  curiosity: '#E8A23A',
  'social-energy': '#5DA8C4',
  warmth: '#D17B68',
  'follow-through': '#6A7BA8',
  'emotional-sensitivity': '#8E6FB8',
}

function PersonalityTldr({ tldr }: { tldr: BigFiveTldr }) {
  return (
    <section
      data-testid="personality-tldr"
      className="rounded-2xl border border-(--profile-accent)/20 bg-[linear-gradient(135deg,var(--profile-soft),rgba(255,255,255,0.78))] p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--profile-ink)">
        {tldr.eyebrow ?? 'YOUR PERSONALITY AT A GLANCE'}
      </p>
      {tldr.headline ? (
        <h3 className="mt-2 max-w-3xl text-xl font-semibold leading-snug text-(--color-sheet-ink)">
          {tldr.headline}
        </h3>
      ) : null}
      {Array.isArray(tldr.poles) && tldr.poles.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tldr.poles.map((pole) => (
            <span
              key={pole}
              className="inline-flex items-center gap-2 rounded-full border border-(--profile-accent)/25 bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-(--profile-ink)"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-(--profile-accent)" />
              {pole.toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}
      {tldr.meta ? (
        <p className="mt-4 text-xs font-medium text-(--profile-ink) opacity-75">{tldr.meta}</p>
      ) : null}
    </section>
  )
}

/**
 * Big-Five Recognition cards — five horizontal cards on the Personality tab.
 * Each card carries an icon + colour signature, the hand-authored identity
 * tag as headline, the trait name as caption, and a mini-spectrum gauge with
 * a positioned dot. Tapping the card expands an inline disclosure with the
 * school readout and the two aspect scores.
 *
 * No numbers in the primary view — the dot communicates lean. Raw 0–20
 * aspect scores live inside the disclosure only.
 */
function BigFiveCards({ traits }: { traits: BigFiveTrait[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  if (traits.length === 0) return null

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section
      aria-label="Big Five trait cards"
      data-testid="bigfive-scaffold"
      className="flex flex-col gap-2.5"
    >
      {traits.map((trait) => {
        const isOpen = expanded.has(trait.id)
        const accent = TRAIT_ACCENTS[trait.id] ?? '#8E6FB8'
        const Icon = TRAIT_ICONS[trait.id] ?? Sparkles
        const position = Math.max(0, Math.min(1, Number(trait.position) || 0.5)) * 100
        const panelId = `bigfive-${trait.id}-panel`
        return (
          <article
            key={trait.id}
            data-trait-id={trait.id}
            style={{ ['--trait-accent' as string]: accent } as CSSProperties}
            className="overflow-hidden rounded-2xl border border-black/[0.10] bg-white/[0.62] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_14px_-10px_rgba(43,38,32,0.18)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--trait-accent)_38%,rgba(43,38,32,0.10))] focus-within:border-[color-mix(in_srgb,var(--trait-accent)_38%,rgba(43,38,32,0.10))]"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(trait.id)}
              data-testid={`bigfive-card-${trait.id}`}
              className="flex w-full cursor-pointer items-center gap-4 bg-transparent px-[18px] py-3.5 text-left max-[720px]:grid max-[720px]:grid-cols-[40px_minmax(0,1fr)_14px] max-[720px]:gap-x-3.5 max-[720px]:gap-y-2.5 max-[720px]:px-4"
            >
              <span
                aria-hidden
                style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
                className="grid size-10 shrink-0 place-items-center rounded-full text-(--trait-accent) max-[720px]:col-start-1 max-[720px]:row-start-1"
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 shrink basis-[220px] flex-col gap-0.5 max-[720px]:col-start-2 max-[720px]:row-start-1 max-[720px]:basis-auto">
                <span className="text-balance text-[15px] font-semibold leading-snug tracking-tight text-(--color-sheet-ink)">
                  {trait.tag ?? trait.name}
                </span>
                <span className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-black/55">
                  {trait.name}
                </span>
              </span>
              <span className="flex min-w-0 grow basis-[280px] items-center gap-3 max-[720px]:col-span-3 max-[720px]:row-start-2 max-[720px]:basis-auto max-[720px]:border-t max-[720px]:border-dashed max-[720px]:border-black/[0.08] max-[720px]:pt-1.5">
                <span className="max-w-[14ch] shrink-0 text-balance text-right text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-black/[0.52] max-[720px]:max-w-none max-[720px]:text-left">
                  {trait.poleLeft}
                </span>
                <span className="relative h-[3px] min-w-20 grow rounded-full bg-black/10">
                  <span
                    aria-hidden
                    style={{ left: `${position.toFixed(1)}%` }}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--trait-accent) shadow-[0_0_0_3px_color-mix(in_srgb,var(--trait-accent)_22%,transparent),0_1px_0_rgba(0,0,0,0.06)] transition-[left] duration-200 ease-out"
                  />
                </span>
                <span className="max-w-[14ch] shrink-0 text-balance text-left text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-black/[0.52] max-[720px]:max-w-none">
                  {trait.poleRight}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-3.5 shrink-0 text-black/45 transition-transform duration-200 max-[720px]:col-start-3 max-[720px]:row-start-1',
                  isOpen && 'rotate-180 text-black/80',
                )}
              />
            </button>
            {isOpen ? (
              <div
                id={panelId}
                className="border-t border-black/[0.06] px-[18px] pb-4 pt-3 max-[720px]:px-4"
              >
                {trait.schoolReadout ? (
                  <p className="text-pretty text-[13px] leading-[1.55] text-black/[0.74]">
                    {trait.schoolReadout}
                  </p>
                ) : null}
                {Array.isArray(trait.aspects) && trait.aspects.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3">
                    {trait.aspects.map((aspect) => (
                      <li
                        key={aspect.name}
                        className="border-t border-black/[0.06] pt-2 first:border-t-0 first:pt-0"
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] font-semibold tracking-tight text-(--trait-accent)">
                            {aspect.name}
                          </span>
                          <span className="text-[12px] font-semibold tabular-nums text-black/60">
                            {aspect.score}/20
                          </span>
                        </div>
                        {aspect.blurb ? (
                          <p className="text-pretty text-[12px] leading-[1.5] text-black/60">
                            {aspect.blurb}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}

function TimelineQuote({
  quote,
  tab,
  profile,
  backend,
  applyBackendSnapshot,
  overlayController,
  captures,
  moodPins,
}: {
  quote: ProfileQuote
  tab: VipsDimension
  profile: ProfileSlice | null
  backend: EngineState['backend']
  applyBackendSnapshot?: (snapshot: unknown) => void
  overlayController?: { open: (name: string, opts?: unknown) => void }
  captures?: EngineState['captures']
  moodPins?: EngineState['moodPins']
}) {
  const [armed, setArmed] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  const openSource = () => {
    if (!quote.sourceCaptureId || !overlayController) return
    const capture = captures?.findById?.(quote.sourceCaptureId)
    if (capture?.kind === 'ask') overlayController.open('ask', { readOnly: true, capture })
    if (capture?.kind === 'photo') overlayController.open('photo', { readOnly: true, capture })
    const pin = moodPins?.pins?.find((item) => item.id === quote.sourceCaptureId)
    if (pin) overlayController.open('mood', { readOnly: true, pin })
  }

  const forget = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setForgetting(true)
    window.setTimeout(async () => {
      const timelineEntryId = quote.backendTimelineEntryId
      if (timelineEntryId && backend?.forgetEvidence) {
        try {
          await backend.forgetEvidence({ timelineEntryId })
          const snapshot = await backend.refreshSnapshot?.()
          if (snapshot) applyBackendSnapshot?.(snapshot)
          else profile?.forgetQuote?.(tab, quote.id)
        } catch (err) {
          console.warn('[ProfileSheet] backend evidence forget failed', err)
          setForgetting(false)
        }
        return
      }
      profile?.forgetQuote?.(tab, quote.id)
    }, FORGET_FADE_MS)
  }

  return (
    <li
      data-forgetting={forgetting || undefined}
      className="rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4 transition-opacity data-[forgetting=true]:opacity-0"
    >
      <p className="text-[15px] italic leading-7 text-(--color-sheet-ink)">"{quote.text}"</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-(--profile-soft) px-2.5 py-1 text-xs font-semibold text-(--profile-ink)">
          {claimLabel(quote.canonicalClaimId)}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-(--color-sheet-ink-soft)">
          {(quote.confidence ?? 'medium').toUpperCase()}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={forget}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            armed
              ? 'bg-(--profile-accent) text-white'
              : 'bg-white text-(--color-sheet-ink-soft) hover:text-(--color-sheet-ink)',
          )}
        >
          {armed ? 'tap again to forget' : 'forget'}
        </button>
        {quote.sourceCaptureId ? (
          <button
            type="button"
            onClick={openSource}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--profile-ink) hover:underline"
          >
            see source reflection <ExternalLink aria-hidden className="size-3" />
          </button>
        ) : (
          <span className="text-xs text-(--color-sheet-ink-faint)">
            source distilled from many reflections
          </span>
        )}
      </div>
    </li>
  )
}

function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const bridge = useMemo(() => new ShareTokenBridge(), [])
  const [, forceRender] = useState(0)
  const [copied, setCopied] = useState(false)
  const [revokeArmed, setRevokeArmed] = useState(false)

  useEffect(() => bridge.subscribe(() => forceRender((value) => value + 1)), [bridge])

  useEffect(() => {
    if (!open) return
    bridge.ensureToken().catch(() => {})
  }, [bridge, open])

  useEffect(() => {
    return () => bridge.dispose()
  }, [bridge])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!revokeArmed) return
    const timer = window.setTimeout(() => setRevokeArmed(false), REVOKE_DISARM_MS)
    return () => window.clearTimeout(timer)
  }, [revokeArmed])

  if (!open) return null

  const showUrl = bridge.status === 'ready' || bridge.status === 'revoking'
  const showPlaceholder = bridge.status === 'idle' || bridge.status === 'creating'
  const showError = bridge.status === 'error'
  const isAuthError =
    bridge.errorCode === 'share_demo_unsupported' || bridge.errorCode === 'unauthenticated'

  const copyUrl = async () => {
    if (!bridge.url) return
    try {
      await navigator.clipboard?.writeText?.(bridge.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const revoke = () => {
    if (!revokeArmed) {
      setRevokeArmed(true)
      return
    }
    setRevokeArmed(false)
    bridge.revokeToken().catch(() => {})
  }

  return (
    <div
      className="absolute inset-0 z-30 grid place-items-center bg-[rgba(20,16,14,0.32)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      data-testid="share-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <section className="w-full max-w-lg rounded-2xl border border-(--color-sheet-divider) bg-white p-5 shadow-[0_24px_80px_rgba(43,38,32,0.22)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="share-dialog-title" className="text-xl font-semibold text-(--color-sheet-ink)">
              Share your profile
            </h2>
            <p className="mt-1 text-sm leading-6 text-(--color-sheet-ink-soft)">
              Generate a link for parents, teachers, or friends. Quotes are hidden by default.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="grid size-9 shrink-0 place-items-center rounded-full text-(--color-sheet-ink-soft) hover:bg-black/5"
          >
            ×
          </button>
        </header>

        <div className="mt-5 space-y-4">
          {showPlaceholder ? (
            <div className="flex items-center gap-3 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4 text-sm text-(--color-sheet-ink-soft)">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Generating your link…
            </div>
          ) : null}

          {showError ? (
            <div className="rounded-xl border border-(--color-onb-accent)/30 bg-(--color-onb-bg-cream) p-4">
              <p className="text-sm text-(--color-sheet-ink)">
                {bridge.errorMessage || 'Something went wrong.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {isAuthError ? (
                  <a
                    href="/api/auth/sign-in?returnTo=/"
                    className="inline-flex min-h-9 items-center rounded-full bg-(--color-onb-accent) px-4 text-sm font-semibold text-white"
                  >
                    Sign in to share
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => bridge.retry().catch(() => {})}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-(--color-sheet-ink) px-4 text-sm font-semibold text-white"
                  >
                    <RefreshCcw aria-hidden className="size-4" />
                    Try again
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {showUrl ? (
            <>
              <label
                htmlFor="share-dialog-url"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-(--color-sheet-ink-soft)"
              >
                Your link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-dialog-url"
                  readOnly
                  type="text"
                  value={bridge.url ?? ''}
                  className="min-w-0 flex-1 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) px-3 py-2 text-sm text-(--color-sheet-ink) outline-none"
                />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-(--color-sheet-ink) px-4 text-sm font-semibold text-white"
                >
                  {copied ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          ) : null}

          {bridge.status === 'ready' ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-4">
              <div>
                <p className="text-sm font-semibold text-(--color-sheet-ink)">
                  Show reflection quotes
                </p>
                <p className="text-xs text-(--color-sheet-ink-soft)">
                  {bridge.showQuotes
                    ? 'Visible — viewers will see verbatim quotes.'
                    : 'Hidden — viewers see compiled reads only.'}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={bridge.showQuotes}
                onClick={() => bridge.setShowQuotes(!bridge.showQuotes).catch(() => {})}
                className={cn(
                  'relative h-7 w-12 rounded-full transition-colors',
                  bridge.showQuotes ? 'bg-(--color-status-achieved)' : 'bg-(--color-sheet-divider)',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-1 size-5 rounded-full bg-white transition-transform',
                    bridge.showQuotes ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          ) : null}
        </div>

        {showUrl ? (
          <footer className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={bridge.status === 'revoking'}
              onClick={revoke}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                revokeArmed
                  ? 'bg-(--color-onb-accent) text-white'
                  : 'border border-(--color-sheet-divider) text-(--color-sheet-ink-soft) hover:bg-black/5',
              )}
            >
              {bridge.status === 'revoking'
                ? 'Revoking…'
                : revokeArmed
                  ? 'Tap again to revoke'
                  : 'Revoke link'}
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  )
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

function useBoundSubscribable(
  slice: MaybeSliceSubscribable | null | undefined,
): { subscribe: (cb: () => void) => () => void } | null {
  return useMemo(() => {
    if (!slice?.subscribe) return null
    return { subscribe: slice.subscribe.bind(slice) }
  }, [slice])
}

function claimThumbnailDataUri(claimId: string): string {
  const object = CLAIM_OBJECTS[claimId]
  const svg = claimObjectSvg(object)
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function claimObjectSvg(object: ClaimObject | undefined): string {
  const palette = claimObjectPalette(object)
  const subject = claimObjectMarkup(object, palette)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="bg" x1="18" y1="8" x2="80" y2="88" gradientUnits="userSpaceOnUse">
        <stop stop-color="${palette.bg1}"/>
        <stop offset="1" stop-color="${palette.bg2}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#4c382b" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="96" height="96" rx="18" fill="url(#bg)"/>
    <ellipse cx="48" cy="76" rx="24" ry="7" fill="#5b4738" opacity=".12"/>
    <g filter="url(#shadow)">${subject}</g>
  </svg>`
}

function claimObjectPalette(object: ClaimObject | undefined) {
  const species =
    object?.kind === 'tree' || object?.kind === 'flower' || object?.kind === 'fruit'
      ? object.species
      : undefined
  const leafColors: Record<string, string> = {
    mangrove: '#4C8C6A',
    oak: '#80A659',
    cherry: '#EAA6C7',
    pine: '#3B6B47',
    palm: '#7CB269',
    maple: '#D6743A',
    willow: '#9FBE85',
    banyan: '#6FA258',
  }
  const flowerColors: Record<string, string> = {
    daisy: '#F8D86C',
    pansy: '#7B5DA8',
    rose: '#D6587C',
    lily: '#F4DCA0',
    tulip: '#E0506E',
    hyacinth: '#B46AC8',
  }
  const fruitColors: Record<string, string> = {
    fig: '#6A3F62',
    pear: '#C9D659',
    plum: '#7B3F8E',
    apple: '#D64242',
    citrus: '#F1A22F',
    berry: '#B02A5E',
  }
  if (object?.kind === 'tree') {
    return { bg1: '#f8efe0', bg2: '#d9ead1', main: leafColors[species ?? ''] ?? '#80A659' }
  }
  if (object?.kind === 'flower') {
    return { bg1: '#fff2d8', bg2: '#f2d9e8', main: flowerColors[species ?? ''] ?? '#D6587C' }
  }
  if (object?.kind === 'fruit') {
    return { bg1: '#f3ecd2', bg2: '#e2efd7', main: fruitColors[species ?? ''] ?? '#D64242' }
  }
  if (object?.kind === 'pool') {
    return { bg1: '#e8f5f8', bg2: '#d6e7f2', main: '#80bfd6' }
  }
  return { bg1: '#eee8dc', bg2: '#ded7c8', main: '#98928c' }
}

function claimObjectMarkup(object: ClaimObject | undefined, palette: { main: string }): string {
  if (object?.kind === 'tree') {
    if (object.species === 'pine') {
      return `<rect x="43" y="50" width="10" height="28" rx="3" fill="#795338"/>
        <path d="M48 14 28 42h10L24 61h48L58 42h10z" fill="${palette.main}"/>`
    }
    if (object.species === 'palm') {
      return `<path d="M45 30c-4 14-1 28-3 47" stroke="#795338" stroke-width="9" stroke-linecap="round" fill="none"/>
        <path d="M49 29c-20-2-31 10-34 20M49 29c19-4 31 6 35 18M49 29c-8-15-24-19-38-11M49 29c10-14 27-16 39-7" stroke="${palette.main}" stroke-width="8" stroke-linecap="round" fill="none"/>`
    }
    if (object.species === 'maple') {
      return `<rect x="43" y="60" width="10" height="18" rx="3" fill="#795338"/>
        <path d="M48 10l7 17 17-5-9 15 17 4-15 10 10 15-18-5-4 18-5-15-8 15-2-18-18 6 10-16-15-10 17-4-9-15 17 5z" fill="${palette.main}"/>`
    }
    return `<rect x="42" y="48" width="12" height="30" rx="4" fill="#795338"/>
      <circle cx="48" cy="28" r="20" fill="${palette.main}"/>
      <circle cx="30" cy="40" r="14" fill="${palette.main}" opacity=".88"/>
      <circle cx="66" cy="40" r="14" fill="${palette.main}" opacity=".88"/>`
  }
  if (object?.kind === 'flower') {
    const petals = Array.from({ length: object.species === 'pansy' ? 5 : 8 }, (_, i) => {
      const angle = (i / (object.species === 'pansy' ? 5 : 8)) * Math.PI * 2
      const cx = 48 + Math.cos(angle) * 15
      const cy = 35 + Math.sin(angle) * 12
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="8" ry="11" fill="${palette.main}" transform="rotate(${((angle * 180) / Math.PI).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`
    }).join('')
    return `<path d="M48 48v30" stroke="#547c45" stroke-width="6" stroke-linecap="round"/>
      <path d="M48 62c-11-4-18 2-23 10" stroke="#547c45" stroke-width="4" stroke-linecap="round" fill="none"/>
      ${petals}<circle cx="48" cy="35" r="7" fill="#e7bd45"/>`
  }
  if (object?.kind === 'fruit') {
    return `<ellipse cx="48" cy="62" rx="28" ry="17" fill="#587b43"/>
      <circle cx="34" cy="50" r="9" fill="${palette.main}"/>
      <circle cx="52" cy="44" r="11" fill="${palette.main}"/>
      <circle cx="63" cy="58" r="8" fill="${palette.main}"/>
      <path d="M49 29c5-6 10-9 17-9" stroke="#6f8b48" stroke-width="5" stroke-linecap="round" fill="none"/>`
  }
  if (object?.kind === 'pool') {
    return `<ellipse cx="48" cy="55" rx="31" ry="20" fill="#c7b997"/>
      <ellipse cx="48" cy="53" rx="25" ry="15" fill="${palette.main}"/>
      <path d="M26 52c9 6 16 6 24 0s15-5 22 1" stroke="#e7fbff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75"/>`
  }
  return `<path d="M32 22h32l7 22-23 31-23-31z" fill="${palette.main}"/>
    <path d="M35 43h26M40 53h16" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".55"/>`
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-(--color-sheet-divider) pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-(--color-sheet-ink-soft)">
        {label}
      </span>
      <span className="max-w-[60%] text-right text-sm font-semibold text-(--color-sheet-ink)">
        {value}
      </span>
    </div>
  )
}

function isProfileTab(value: unknown): value is ProfileTab {
  return typeof value === 'string' && PROFILE_TABS.some((tab) => tab.id === value)
}

function isVipsTab(value: ProfileTab): value is VipsDimension {
  return VIPS_TAB_IDS.includes(value as VipsDimension)
}

function formatProfileHeading(heading: string): string {
  const normalized = heading.toLowerCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const MIN_THESIS_LEN = 40

function splitThesisAndEvidence(text: string): { thesis: string; evidence: string } {
  for (let i = MIN_THESIS_LEN; i < text.length - 1; i++) {
    const c = text.charAt(i)
    if ((c === '.' || c === '!' || c === '?') && text.charAt(i + 1) === ' ') {
      let j = i + 2
      while (j < text.length && text.charAt(j) === ' ') j++
      if (j >= text.length) {
        return { thesis: text.slice(0, i + 1).trim(), evidence: '' }
      }
      const next = text.charAt(j)
      if (next >= 'A' && next <= 'Z') {
        return {
          thesis: text.slice(0, i + 1).trim(),
          evidence: text.slice(i + 1).trim(),
        }
      }
    }
  }
  return { thesis: text, evidence: '' }
}

function themeVars(tab: ProfileTab): CSSProperties {
  if (!isVipsTab(tab)) {
    return {
      '--profile-accent': tab === 'relationships' ? '#D08A4A' : '#5C8FB0',
      '--profile-soft': tab === 'relationships' ? '#F6E4CC' : '#DDEAF3',
      '--profile-ink': tab === 'relationships' ? '#7A4413' : '#2F5773',
    } as CSSProperties
  }
  const theme = PROFILE_THEMES[tab]
  return {
    '--profile-accent': theme.accent,
    '--profile-soft': theme.soft,
    '--profile-ink': theme.ink,
  } as CSSProperties
}

function tldrHeadline(tab: VipsDimension, voicedCount: number): string {
  const ringPhrase =
    voicedCount >= 5
      ? 'keep surfacing'
      : voicedCount >= 3
        ? 'are showing up'
        : 'are starting to show'
  const noun: Record<VipsDimension, string> = {
    values: 'values',
    interests: 'interests',
    personality: 'traits',
    skills: 'skills',
  }
  return `These ${noun[tab]} ${ringPhrase} in your reflections`
}

function claimLabel(id: string): string {
  return CLAIM_LABEL_BY_ID.get(id) ?? id
}

function formatRefined(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

function submitBodyScopedAuthForm(
  action: string,
  method = 'post',
  extras: Record<string, string> | null = null,
) {
  const form = document.createElement('form')
  form.method = method
  form.action = action
  form.style.display = 'none'
  if (extras) {
    for (const [name, value] of Object.entries(extras)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }
  }
  document.body.appendChild(form)
  form.submit()
}

function clearStudentSpaceLocalStateInline() {
  try {
    const storage = window.localStorage
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith('ss:v1:')) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

export const VIPS_TABS = VIPS_TAB_IDS
