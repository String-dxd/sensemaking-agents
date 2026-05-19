import type { SheetKey } from '~/components/SheetEntryRail'
import {
  isNonVipsProfileTab,
  PROFILE_TAB_LABEL,
  PROFILE_TAB_THEMES,
  PROFILE_TABS,
  type ProfileTab,
} from '~/data/profile-tabs'
import { clearStudentSpaceLocalState } from '~/lib/clear-student-space-local-state'
import { DIMENSION_LABEL, PROFILE_HEADERS, PROFILE_THEMES } from '~/lib/profile-tokens'
import { signOutEngine } from '~/lib/sign-out-engine'
import { cn } from '~/lib/utils'

export { DIMENSION_LABEL, PROFILE_HEADERS, PROFILE_THEMES }

/**
 * Signed-in/signed-out chrome state shared by the profile sheet and the
 * `VipsPageView`. Defined here (the live module) so the dormant
 * `FloatingWorldActions` can be removed without dragging live code with it.
 * `FloatingWorldActions` re-exports the type for backwards compatibility.
 */
export type FloatingAuthMenuState =
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      label: string
      detail: string | null
      kind: 'workos' | 'demo' | 'dev-bypass'
    }

export interface ProfileStudentIdentity {
  name: string
  detail: string | null
}

/**
 * Resolve the theme for any ProfileTab — VIPS dimensions read from
 * PROFILE_THEMES, the two non-VIPS tabs (Relationships / Choices) read from
 * PROFILE_TAB_THEMES. The two record types are shape-compatible.
 */
export function getProfileTabTheme(tab: ProfileTab) {
  return isNonVipsProfileTab(tab) ? PROFILE_TAB_THEMES[tab] : PROFILE_THEMES[tab]
}

export interface ProfileStudentChromeProps {
  authMenu?: FloatingAuthMenuState
  studentProfile?: ProfileStudentIdentity | null
  /**
   * Tab currently considered active. Accepts any `ProfileTab` (VIPS dimension
   * or one of the non-VIPS tabs) so the chrome can highlight Relationships /
   * Choices the same way as Values / Interests / etc.
   */
  activeDimension: ProfileTab
  openSheet?: SheetKey | null
  onOpenSheet?: (key: SheetKey) => void
  sheetPanelId?: string
  disabled?: boolean
  className?: string
}

export function ProfileStudentChrome({
  authMenu = { status: 'signed-out' },
  studentProfile,
  activeDimension,
  openSheet,
  onOpenSheet,
  sheetPanelId,
  disabled = false,
  className,
}: ProfileStudentChromeProps) {
  const identity = getStudentIdentity(authMenu, studentProfile)

  return (
    <div className={cn('border-b border-[#e6dcc9]/80 bg-[#fdfaf3]/90', className)}>
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-4 px-6 pb-4 pt-10">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fae1ce] text-[26px] font-semibold text-[#b5532a] shadow-[inset_0_-2px_0_rgba(0,0,0,0.04)]"
          role="img"
          aria-label={`${identity.name} avatar`}
          data-testid="profile-student-avatar"
        >
          {identity.initial}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#2b2620]">
            {identity.name}
          </h2>
          <p className="mt-1 text-sm text-[#2b2620]/60">{identity.detail}</p>
        </div>
        <AuthAction authMenu={authMenu} />
      </div>
      <nav
        aria-label="Profile dimensions"
        className="mx-auto flex w-full max-w-[760px] gap-2 overflow-x-auto px-6 py-3"
        data-testid="profile-tabs"
      >
        {PROFILE_TABS.map((tab) => {
          const isActive = openSheet ? openSheet === tab : activeDimension === tab
          const activeThemeClass = isNonVipsProfileTab(tab)
            ? PROFILE_TAB_THEMES[tab].tab
            : PROFILE_THEMES[tab].tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onOpenSheet?.(tab)}
              disabled={disabled}
              aria-expanded={isActive}
              aria-controls={sheetPanelId}
              data-testid={`profile-tab-${tab}`}
              className={cn(
                'h-8 shrink-0 rounded-full border border-transparent px-3.5 text-sm font-medium text-[#2b2620]/55 transition-colors',
                'hover:bg-white/60 hover:text-[#2b2620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive && activeThemeClass,
                disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              {PROFILE_TAB_LABEL[tab]}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function AuthAction({ authMenu }: { authMenu: FloatingAuthMenuState }) {
  if (authMenu.status !== 'signed-in') return null
  return (
    <form
      action="/api/auth/sign-out"
      method="post"
      className="shrink-0"
      // Tear down the engine BEFORE clearing localStorage so Persistence's
      // 250ms debounce can't race the wipe and re-create the `ss:v1:*` keys
      // we just removed. dispose() flushes pending writes synchronously and
      // revokes the rAF loop / window listeners. Then the clear runs, then
      // the form POST fires.
      onSubmit={() => {
        signOutEngine()
        clearStudentSpaceLocalState()
      }}
    >
      <button
        type="submit"
        className="rounded-full bg-[#f1ede5] px-3 py-1.5 text-sm text-[#2b2620]/65 transition-colors hover:text-[#2b2620]"
      >
        sign out
      </button>
    </form>
  )
}

function getStudentIdentity(
  authMenu: FloatingAuthMenuState,
  studentProfile: ProfileStudentIdentity | null | undefined,
) {
  if (studentProfile?.name.trim()) {
    const name = studentProfile.name.trim()
    return {
      name,
      detail: studentProfile.detail?.trim() || 'Profile',
      initial: name.charAt(0).toUpperCase() || 'S',
    }
  }

  if (authMenu.status !== 'signed-in') {
    return { name: 'Student', detail: 'Sec 3B', initial: 'S' }
  }

  const name = authMenu.kind === 'demo' ? 'Student' : authMenu.label
  const detail = authMenu.kind === 'demo' ? 'Sec 3B' : authMenu.detail || 'Profile'
  return { name, detail, initial: name.charAt(0).toUpperCase() || 'S' }
}
