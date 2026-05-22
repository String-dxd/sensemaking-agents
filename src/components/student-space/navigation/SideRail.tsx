import { useLocation } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { Compass, History, Home, Mail, RotateCcw, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStudentSpaceNavigate } from '~/lib/student-space/route-sync'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

export const SHEET_HREFS = {
  home: '/',
  letters: '/letters',
  history: '/history',
  profile: '/profile',
  trajectory: '/trajectory',
} as const

type RailItemId = keyof typeof SHEET_HREFS

const RAIL_ITEMS: Array<{
  id: RailItemId
  label: string
  Icon: LucideIcon
}> = [
  { id: 'home', label: 'Island', Icon: Home },
  { id: 'letters', label: 'Letters', Icon: Mail },
  { id: 'history', label: 'History', Icon: History },
  { id: 'profile', label: 'Profile', Icon: User },
  { id: 'trajectory', label: 'Path Finder', Icon: Compass },
]

type GameLike = {
  state?: {
    onboarding?: {
      stage?: string
      isDone?: boolean
      reset?: () => void
      subscribe?: (cb: () => void) => () => void
    }
    persistence?: { flush?: () => void }
  }
}

export function SideRail({ game }: { game: unknown }) {
  const navigate = useStudentSpaceNavigate()
  const location = useLocation()
  const { isOnboarding } = useEngineOverlay()
  const [pendingPathname, setPendingPathname] = useState<string | null>(null)
  const typedGame = game as GameLike | null
  const onboarding = typedGame?.state?.onboarding
  useEngineSliceVersion(
    onboarding?.subscribe ? (onboarding as { subscribe: (cb: () => void) => () => void }) : null,
  )

  useEffect(() => {
    if (!pendingPathname) return
    if (normalizePathname(location.pathname) === pendingPathname) {
      setPendingPathname(null)
    }
  }, [location.pathname, pendingPathname])

  const onboardingStage = onboarding?.stage
  const onboardingActive = Boolean(
    onboarding &&
      !onboarding.isDone &&
      onboardingStage &&
      onboardingStage !== 'done' &&
      onboardingStage !== 'pending',
  )

  if (isOnboarding || onboardingActive || location.pathname === '/onboarding') return null

  const handleNavigate = (href: string) => {
    setPendingPathname(normalizePathname(href))
    navigate(href)
  }

  const restartOnboarding = () => {
    try {
      typedGame?.state?.onboarding?.reset?.()
      typedGame?.state?.persistence?.flush?.()
    } catch {
      // Best effort; reload still drives the ceremony hash path.
    }
    if (typeof window === 'undefined') return
    window.location.assign('/onboarding')
  }

  const activeKey = activeKeyFromPathname(pendingPathname ?? location.pathname)

  return (
    <nav
      aria-label="World navigation"
      className={cn(
        'fixed top-(--inset-frame) bottom-(--inset-frame) left-(--inset-frame) z-[70]',
        'flex w-[calc(var(--width-rail)-10px)] flex-col items-center justify-between rounded-2xl border border-transparent bg-transparent py-3 shadow-none',
        'max-[640px]:right-(--inset-frame) max-[640px]:top-auto max-[640px]:h-14 max-[640px]:w-auto max-[640px]:flex-row max-[640px]:px-2 max-[640px]:py-0',
      )}
    >
      <div className="flex flex-col gap-1 max-[640px]:flex-row">
        {RAIL_ITEMS.map(({ id, label, Icon }) => {
          const href = SHEET_HREFS[id]
          const active = activeKey === id
          return (
            <RailButton
              key={id}
              label={label}
              active={active}
              onClick={() => handleNavigate(href)}
              Icon={Icon}
            />
          )
        })}
      </div>
      <div className="flex flex-col gap-1 max-[640px]:flex-row">
        <RailButton
          label="Restart onboarding"
          onClick={restartOnboarding}
          Icon={RotateCcw}
          compact
        />
      </div>
    </nav>
  )
}

function normalizePathname(pathnameOrHref: string): string {
  const [beforeHash = '/'] = pathnameOrHref.split('#')
  const [pathname = '/'] = beforeHash.split('?')
  const segments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

function activeKeyFromPathname(pathname: string): RailItemId | null {
  const normalized = normalizePathname(pathname)
  if (normalized === '/') return 'home'
  const [head] = normalized.replace(/^\/+/, '').split('/')
  if (head === 'letters' || head === 'history' || head === 'profile' || head === 'trajectory') {
    return head
  }
  return null
}

function RailButton({
  label,
  active = false,
  compact = false,
  Icon,
  onClick,
}: {
  label: string
  active?: boolean
  compact?: boolean
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-current={active ? 'page' : undefined}
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'group relative grid size-11 cursor-pointer place-items-center rounded-xl border border-transparent transition-[transform,background-color,border-color,color,box-shadow] active:scale-[0.96]',
        'bg-transparent text-(--color-sheet-ink-soft) shadow-none',
        'hover:border-white/70 hover:bg-white/70 hover:text-(--color-sheet-ink)',
        'data-[active]:border-white data-[active]:bg-white data-[active]:text-(--color-sheet-ink) data-[active]:shadow-lg data-[active]:shadow-black/12',
        compact && 'text-(--color-sheet-ink-faint)',
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span
        className={cn(
          'pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-10 -translate-y-1/2 translate-x-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap opacity-0 shadow-lg shadow-black/12 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-[640px]:hidden',
          'bg-white text-(--color-sheet-ink)',
        )}
      >
        {label}
      </span>
    </button>
  )
}
