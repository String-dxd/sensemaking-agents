import {
  DIMENSION_LABEL,
  PROFILE_DIMENSIONS,
  PROFILE_HEADERS,
  PROFILE_THEMES,
  type ProfileDimension,
} from '~/lib/profile-tokens'
import { cn } from '~/lib/utils'
import type {
  PublicProfileBody,
  PublicProfileDimension,
  PublicProfileEntry,
} from '~/server/load-public-profile.handler.server'
import { OwnerPreviewBanner } from './OwnerPreviewBanner'

const LAST_SYNCED_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export interface PublicProfilePageProps {
  profile: PublicProfileBody
  isOwner: boolean
}

export function PublicProfilePage({ profile, isOwner }: PublicProfilePageProps) {
  return (
    <div className="min-h-svh bg-[#fdfaf3] text-[#2b2620]">
      {isOwner ? <OwnerPreviewBanner /> : null}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:gap-12 md:py-16">
        <SideNav />
        <main className="flex min-w-0 flex-1 flex-col gap-12">
          <PageHeader profile={profile} />
          {PROFILE_DIMENSIONS.map((dimension) => {
            const body = profile.dimensions.find((d) => d.dimension === dimension)
            return (
              <DimensionSection
                key={dimension}
                dimension={dimension}
                body={body ?? null}
                nameSnapshot={profile.nameSnapshot}
                showQuotes={profile.showQuotes}
              />
            )
          })}
        </main>
      </div>
    </div>
  )
}

function PageHeader({ profile }: { profile: PublicProfileBody }) {
  const lastSynced = formatLastSynced(profile.lastSyncedAt)
  return (
    <header className="flex flex-col gap-2 border-b border-[#e6dcc9]/60 pb-6">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2b2620]/55">
        SenseMake profile
      </span>
      <h1 className="text-[clamp(1.8rem,4.5vw,2.6rem)] font-semibold leading-tight tracking-tight">
        {profile.nameSnapshot}
      </h1>
      <p className="text-sm text-[#2b2620]/60">
        A read across what they value, what pulls their attention, how they show up, and what
        they&rsquo;re getting good at.
        {lastSynced ? (
          <>
            {' '}
            <span aria-hidden="true">·</span> last synced {lastSynced}
          </>
        ) : null}
      </p>
    </header>
  )
}

function formatLastSynced(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return LAST_SYNCED_FORMATTER.format(date)
}

function SideNav() {
  return (
    <nav
      aria-label="Profile dimensions"
      className="sticky top-12 hidden h-fit shrink-0 flex-col gap-1 self-start md:flex md:w-44 lg:w-52"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2b2620]/45">
        Sections
      </span>
      {PROFILE_DIMENSIONS.map((dimension) => (
        <a
          key={dimension}
          href={`#${dimension}`}
          className="rounded-md px-2 py-1.5 text-sm text-[#2b2620]/70 transition-colors hover:bg-[#2b2620]/5 hover:text-[#2b2620]"
        >
          {DIMENSION_LABEL[dimension]}
        </a>
      ))}
    </nav>
  )
}

interface DimensionSectionProps {
  dimension: ProfileDimension
  body: PublicProfileDimension | null
  nameSnapshot: string
  showQuotes: boolean
}

function DimensionSection({ dimension, body, nameSnapshot, showQuotes }: DimensionSectionProps) {
  const header = PROFILE_HEADERS[dimension]
  const theme = PROFILE_THEMES[dimension]
  const compiled = body?.compiledTruth?.trim() ?? ''
  const openQuestion = body?.openQuestion?.trim() ?? ''
  const claimCount = body?.claimCount ?? 0
  const entries = body?.recentEntries ?? []

  return (
    <section
      id={dimension}
      className="scroll-mt-12"
      data-testid={`share-dimension-${dimension}`}
      style={{
        // CSS custom properties drive the dimension-themed elements below
        // without forcing a global className per dimension.
        // biome-ignore lint/style/useNamingConvention: CSS variables follow kebab-case.
        ['--facet-accent' as string]: theme.accent,
        ['--facet-soft' as string]: theme.soft,
        ['--facet-ink' as string]: theme.ink,
      }}
    >
      <div
        className="overflow-hidden rounded-2xl border border-[#e6dcc9]/60"
        style={{ background: `linear-gradient(135deg, ${theme.soft} 0%, #fdfaf3 60%)` }}
      >
        <div className="flex flex-col gap-2 px-6 pb-4 pt-6 sm:px-8">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: theme.ink }}
          >
            {header.eyebrow}
          </span>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2
              className="text-[clamp(1.4rem,3.2vw,1.9rem)] font-semibold leading-tight tracking-tight"
              style={{ color: theme.ink }}
            >
              {header.title}
            </h2>
            <span
              className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold"
              style={{ backgroundColor: theme.accent, color: theme.soft }}
            >
              {header.tag}
            </span>
          </div>
          <p className="text-sm text-[#2b2620]/60">{header.subtitle}</p>
        </div>
        <div className="space-y-4 px-6 pb-7 sm:px-8">
          {compiled ? (
            <p className="text-[15.5px] leading-relaxed text-[#2b2620]">{compiled}</p>
          ) : (
            <EmptyDimensionBlock dimensionTag={header.tag} name={nameSnapshot} />
          )}
          {openQuestion ? (
            <aside
              className="rounded-xl px-4 py-3 text-sm italic"
              style={{ backgroundColor: theme.soft, color: theme.ink }}
            >
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                Open question
              </span>
              {openQuestion}
            </aside>
          ) : null}
        </div>
      </div>

      {claimCount > 0 || entries.length > 0 ? (
        <ClaimTimeline entries={entries} theme={theme} showQuotes={showQuotes} />
      ) : null}
    </section>
  )
}

function EmptyDimensionBlock({ dimensionTag, name }: { dimensionTag: string; name: string }) {
  return (
    <p className="text-sm italic text-[#2b2620]/60" data-testid="share-empty-dimension">
      {name} hasn&rsquo;t surfaced any {dimensionTag} reads yet — check back later.
    </p>
  )
}

interface ClaimTimelineProps {
  entries: PublicProfileEntry[]
  theme: (typeof PROFILE_THEMES)[ProfileDimension]
  showQuotes: boolean
}

function ClaimTimeline({ entries, theme, showQuotes }: ClaimTimelineProps) {
  if (entries.length === 0) return null
  return (
    <div className="mt-6 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
        Recent noticings
      </h3>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              'rounded-xl border-l-[3px] bg-white/70 px-4 py-3 text-sm',
              showQuotes ? '' : 'border-dashed',
            )}
            style={{ borderLeftColor: theme.accent }}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className="rounded-full px-2 py-0.5 font-semibold"
                style={{ backgroundColor: theme.soft, color: theme.ink }}
              >
                {entry.canonicalLabel}
              </span>
              <StrengthChip strength={entry.strength} theme={theme} />
            </div>
            {showQuotes && entry.quote ? (
              <p className="mt-2 italic text-[#2b2620]/85">&ldquo;{entry.quote}&rdquo;</p>
            ) : (
              <p className="mt-2 text-[#2b2620]/55">A {entry.canonicalLabel.toLowerCase()} read.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StrengthChip({
  strength,
  theme,
}: {
  strength: PublicProfileEntry['strength']
  theme: (typeof PROFILE_THEMES)[ProfileDimension]
}) {
  const label =
    strength === 'high' ? 'Strong signal' : strength === 'medium' ? 'Repeating' : 'Light touch'
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: theme.ink, backgroundColor: 'rgba(43, 38, 32, 0.06)' }}
    >
      {label}
    </span>
  )
}
