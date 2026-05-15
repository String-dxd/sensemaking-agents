import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import type { FloatingAuthMenuState } from '~/components/FloatingWorldActions'
import {
  DIMENSION_LABEL,
  PROFILE_HEADERS,
  PROFILE_THEMES,
  ProfileStudentChrome,
  type ProfileStudentIdentity,
} from '~/components/ProfileSheetChrome'
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
  studentProfile?: ProfileStudentIdentity | null
  openSheet: SheetKey | null
  onOpenSheet: (key: SheetKey) => void
  pageOverviews?: ProfilePageOverview[]
  sheetPanelId: string
  disabled?: boolean
}

export function ProfileSheetView({
  authMenu = { status: 'signed-out' },
  studentProfile,
  openSheet,
  onOpenSheet,
  pageOverviews,
  sheetPanelId,
  disabled = false,
}: ProfileSheetViewProps) {
  const overviews = normalizeProfilePageOverviews(pageOverviews)
  const activeDimension = isVipsDimensionSheet(openSheet) ? openSheet : 'values'
  const activeOverview =
    overviews.find((overview) => overview.dimension === activeDimension) ??
    makeEmptyOverview(activeDimension)
  const header = PROFILE_HEADERS[activeDimension]
  const theme = PROFILE_THEMES[activeDimension]
  const hasCompiledTruth = activeOverview.compiledTruth.trim().length > 0

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-[1.75rem] bg-[#fdfaf3] text-[#2b2620]"
      data-testid="profile-sheet"
    >
      <ProfileStudentChrome
        authMenu={authMenu}
        studentProfile={studentProfile}
        activeDimension={activeDimension}
        openSheet={isVipsDimensionSheet(openSheet) ? openSheet : activeDimension}
        onOpenSheet={onOpenSheet}
        sheetPanelId={sheetPanelId}
        disabled={disabled}
      />

      <section className="mx-auto w-full max-w-[760px] px-6 py-5">
        {authMenu.status === 'signed-out' ? <SignedOutActions /> : null}
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
            {header.eyebrow}
          </p>
          <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
            {header.tag}
          </span>
        </div>
        <h2 className="mt-2 text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
          {header.title}
        </h2>
        <p className="mt-2 text-sm text-[#2b2620]/60">{header.subtitle}</p>

        {hasCompiledTruth ? (
          <p className="mt-6 text-[15.5px] leading-relaxed" data-testid="profile-active-summary">
            {activeOverview.compiledTruth}
          </p>
        ) : (
          <p
            className="mt-6 text-sm leading-relaxed text-[#2b2620]/60"
            data-testid="profile-active-summary-empty"
          >
            Profile evidence will appear here after confirmed reflections are connected.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenSheet(activeDimension)}
            disabled={disabled}
            aria-controls={sheetPanelId}
            data-testid={`profile-open-active-${activeDimension}`}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              theme.tab,
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            Open {DIMENSION_LABEL[activeDimension]}
          </button>
          <button
            type="button"
            onClick={() => onOpenSheet('reflections')}
            disabled={disabled}
            aria-controls={sheetPanelId}
            data-testid="profile-open-library"
            className="rounded-full bg-[#f1ede5] px-4 py-2 text-sm font-medium text-[#2b2620]/70 transition-colors hover:text-[#2b2620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Calendar
          </button>
        </div>
      </section>
    </section>
  )
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

function makeEmptyOverview(dimension: VipsDimension): ProfilePageOverview {
  return {
    dimension,
    compiledTruth: '',
    claimCount: 0,
    updatedAt: null,
  }
}

function isVipsDimensionSheet(value: SheetKey | null): value is VipsDimension {
  return value != null && (VIPS_DIMENSIONS as readonly string[]).includes(value)
}

function SignedOutActions() {
  return (
    <div className="mb-5 flex flex-wrap gap-2" data-testid="profile-signed-out-actions">
      <a
        className="rounded-full bg-[#2b2620] px-3 py-1.5 text-sm text-[#fdfaf3] hover:bg-[#2b2620]/90"
        href={workosSignInHref('/?sheet=profile')}
      >
        sign in
      </a>
      <form action={demoSignInHref('/?sheet=profile')} method="post">
        <button
          type="submit"
          className="rounded-full bg-[#f1ede5] px-3 py-1.5 text-left text-sm text-[#2b2620]/70 hover:text-[#2b2620]"
        >
          use demo account
        </button>
      </form>
    </div>
  )
}
