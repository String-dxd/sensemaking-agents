import { ArrowRight, BookOpen } from 'lucide-react'
import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import type { FloatingAuthMenuState } from '~/components/FloatingWorldActions'
import type { SheetKey } from '~/components/SheetEntryRail'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { cn } from '~/lib/utils'

export interface ProfilePageOverview {
  dimension: VipsDimension
  compiledTruth: string
  claimCount: number
  updatedAt: string | null
}

export interface ProfileSheetViewProps {
  authMenu?: FloatingAuthMenuState
  openSheet: SheetKey | null
  onOpenSheet: (key: SheetKey) => void
  pageOverviews?: ProfilePageOverview[]
  sheetPanelId: string
  disabled?: boolean
}

export function ProfileSheetView({
  authMenu = { status: 'signed-out' },
  openSheet,
  onOpenSheet,
  pageOverviews,
  sheetPanelId,
  disabled = false,
}: ProfileSheetViewProps) {
  const overviews = normalizeProfilePageOverviews(pageOverviews)

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2"
      data-testid="profile-sheet"
    >
      <header className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Profile
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            {authMenu.status === 'signed-in' ? authMenu.label : 'Your space'}
          </h2>
          {authMenu.status === 'signed-in' && authMenu.detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{authMenu.detail}</p>
          ) : null}
        </div>
        <div className="text-sm">
          {authMenu.status === 'signed-in' ? (
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-full bg-muted px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"
              >
                sign out
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded-full bg-foreground px-3 py-1.5 text-background hover:bg-foreground/90"
                href={workosSignInHref('/?sheet=profile')}
              >
                sign in
              </a>
              <form action={demoSignInHref('/?sheet=profile')} method="post">
                <button
                  type="submit"
                  className="rounded-full bg-muted px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"
                >
                  use demo account
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <section className="border-b border-border/70 pb-5">
        <button
          type="button"
          onClick={() => onOpenSheet('reflections')}
          disabled={disabled}
          aria-controls={sheetPanelId}
          aria-expanded={openSheet === 'reflections'}
          data-testid="profile-open-library"
          className="group flex w-full items-center justify-between gap-4 rounded-md border border-border bg-background/80 px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background/80"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <BookOpen aria-hidden className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Library</span>
              <span className="block text-sm text-muted-foreground">
                View previously recorded thoughts.
              </span>
            </span>
          </span>
          <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Pages
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile dimensions compiled from confirmed reflections.
          </p>
        </div>

        <ProfilePageOverviewGrid
          openSheet={openSheet}
          overviews={overviews}
          onOpenSheet={onOpenSheet}
          sheetPanelId={sheetPanelId}
          disabled={disabled}
        />
      </section>
    </section>
  )
}

function ProfilePageOverviewGrid({
  openSheet,
  overviews,
  onOpenSheet,
  sheetPanelId,
  disabled,
}: {
  openSheet: SheetKey | null
  overviews: ProfilePageOverview[]
  onOpenSheet: (key: SheetKey) => void
  sheetPanelId: string
  disabled: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="profile-page-overviews">
      {overviews.map((overview) => {
        const label = DIMENSION_LABEL[overview.dimension]
        const isOpen = openSheet === overview.dimension
        const hasCompiledTruth = overview.compiledTruth.trim().length > 0
        return (
          <button
            key={overview.dimension}
            type="button"
            onClick={() => onOpenSheet(overview.dimension)}
            disabled={disabled}
            aria-expanded={isOpen}
            aria-controls={sheetPanelId}
            data-testid={`profile-page-card-${overview.dimension}`}
            className={cn(
              'group flex min-h-36 flex-col justify-between rounded-md border border-border bg-background/80 p-4 text-left shadow-sm transition-colors',
              'hover:border-border/80 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isOpen && 'border-border bg-muted/50',
              disabled && 'cursor-not-allowed opacity-50 hover:bg-background/80',
            )}
          >
            <span>
              <span className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {formatClaimCount(overview.claimCount)}
                </span>
              </span>
              <span className="mt-3 block text-sm leading-relaxed text-foreground">
                {hasCompiledTruth
                  ? truncateOverview(overview.compiledTruth)
                  : 'No current read yet. Confirm and connect thoughts to fill this page.'}
              </span>
            </span>
            <span className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {overview.updatedAt
                  ? `Refined ${formatOverviewDate(overview.updatedAt)}`
                  : 'Not refined yet'}
              </span>
              <ArrowRight
                aria-hidden
                className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}

const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

function normalizeProfilePageOverviews(
  pageOverviews: ProfilePageOverview[] | undefined,
): ProfilePageOverview[] {
  const byDimension = new Map(pageOverviews?.map((overview) => [overview.dimension, overview]))
  return VIPS_DIMENSIONS.map(
    (dimension): ProfilePageOverview =>
      byDimension.get(dimension) ?? {
        dimension,
        compiledTruth: '',
        claimCount: 0,
        updatedAt: null,
      },
  )
}

function truncateOverview(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 180) return trimmed
  return `${trimmed.slice(0, 177).trimEnd()}...`
}

function formatClaimCount(count: number): string {
  if (count === 0) return '0 entries'
  if (count === 1) return '1 entry'
  return `${count} entries`
}

function formatOverviewDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
