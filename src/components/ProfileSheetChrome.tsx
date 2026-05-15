import type { FloatingAuthMenuState } from '~/components/FloatingWorldActions'
import type { SheetKey } from '~/components/SheetEntryRail'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { cn } from '~/lib/utils'

export const DIMENSION_LABEL: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

export const PROFILE_HEADERS: Record<
  VipsDimension,
  { eyebrow: string; tag: string; title: string; subtitle: string }
> = {
  values: {
    eyebrow: 'WHAT MATTERS TO ME',
    tag: 'Values',
    title: 'What you keep coming back to',
    subtitle: 'A pattern across your touchstones',
  },
  interests: {
    eyebrow: 'WHAT PULLS YOUR ATTENTION',
    tag: 'Interests',
    title: 'What lights you up',
    subtitle: 'Small sparks across your week',
  },
  personality: {
    eyebrow: 'HOW YOU TEND TO SHOW UP',
    tag: 'Personality',
    title: 'Who you are in the room',
    subtitle: 'Patterns in how others recognise you',
  },
  skills: {
    eyebrow: "WHAT YOU'RE GETTING GOOD AT",
    tag: 'Skills',
    title: "What's growing in your hands",
    subtitle: "Things you've practised into shape",
  },
}

export const PROFILE_THEMES: Record<
  VipsDimension,
  {
    accent: string
    soft: string
    ink: string
    tab: string
    callout: string
    border: string
    text: string
  }
> = {
  values: {
    accent: '#A07659',
    soft: '#EAD7BE',
    ink: '#6A4A26',
    tab: 'border-[#A07659] bg-[#EAD7BE] text-[#6A4A26]',
    callout: 'bg-[#EAD7BE] text-[#6A4A26]',
    border: 'border-[#A07659]',
    text: 'text-[#6A4A26]',
  },
  interests: {
    accent: '#FF8E8E',
    soft: '#FDE0E0',
    ink: '#A84D4D',
    tab: 'border-[#FF8E8E] bg-[#FDE0E0] text-[#A84D4D]',
    callout: 'bg-[#FDE0E0] text-[#A84D4D]',
    border: 'border-[#FF8E8E]',
    text: 'text-[#A84D4D]',
  },
  personality: {
    accent: '#8E6FB8',
    soft: '#E8DDF2',
    ink: '#4C3470',
    tab: 'border-[#8E6FB8] bg-[#E8DDF2] text-[#4C3470]',
    callout: 'bg-[#E8DDF2] text-[#4C3470]',
    border: 'border-[#8E6FB8]',
    text: 'text-[#4C3470]',
  },
  skills: {
    accent: '#82B16A',
    soft: '#DDEDC6',
    ink: '#3F6F2A',
    tab: 'border-[#82B16A] bg-[#DDEDC6] text-[#3F6F2A]',
    callout: 'bg-[#DDEDC6] text-[#3F6F2A]',
    border: 'border-[#82B16A]',
    text: 'text-[#3F6F2A]',
  },
}

export interface ProfileStudentIdentity {
  name: string
  detail: string | null
}

export interface ProfileStudentChromeProps {
  authMenu?: FloatingAuthMenuState
  studentProfile?: ProfileStudentIdentity | null
  activeDimension: VipsDimension
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
        {VIPS_DIMENSIONS.map((dimension) => {
          const isActive = openSheet ? openSheet === dimension : activeDimension === dimension
          return (
            <button
              key={dimension}
              type="button"
              onClick={() => onOpenSheet?.(dimension)}
              disabled={disabled}
              aria-expanded={isActive}
              aria-controls={sheetPanelId}
              data-testid={`profile-tab-${dimension}`}
              className={cn(
                'h-8 shrink-0 rounded-full border border-transparent px-3.5 text-sm font-medium text-[#2b2620]/55 transition-colors',
                'hover:bg-white/60 hover:text-[#2b2620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive && PROFILE_THEMES[dimension].tab,
                disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              {DIMENSION_LABEL[dimension]}
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
    <form action="/api/auth/sign-out" method="post" className="shrink-0">
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
