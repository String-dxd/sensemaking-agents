import { useEffect, useMemo, useRef, useState } from 'react'
import {
  OFFLINE_DEMO_STUDENTS,
  ONBOARDING_COPY,
} from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * Edupass sign-in landing (U19 React rewrite of
 * React Edupass login branch for the onboarding ceremony.
 *
 * Preserves the auth sequencing that matters:
 * - WorkOS link disposes the engine before `window.location.assign`.
 * - Demo submit disposes the engine, then submits through a fresh
 *   body-scoped form so removing `.onboarding-root` cannot cancel the POST.
 * - Offline fallback waits for the connecting beat, seeds a demo identity
 *   only when no backend owns identity, then returns to `greeting`.
 */
const CONNECTING_MS = 600
const ENTER_MS = 320

type StateLike = {
  backend?: unknown
  onboarding?: { complete?: () => unknown }
  persistence?: { flush?: () => unknown }
}

type ProfileLike = {
  setIdentity?: (identity: { name: string; className: string }) => unknown
}

type CameraLike = {
  startLandingOrbit?: (opts: {
    azimuthDegPerSec: number
    distance: number
    pitchDeg: number
  }) => void
  stopLandingOrbit?: () => void
}

function safeReturnPathname(value: string | null | undefined, fallback = '/') {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\'))
    return fallback
  return trimmed
}

function currentAuthReturnPathname() {
  if (typeof window === 'undefined') return '/'
  const raw = new URLSearchParams(window.location.search).get('returnPathname')
  return safeReturnPathname(raw)
}

function authActionHref({ demo = false } = {}) {
  const search = new URLSearchParams()
  if (demo) search.set('demo', '1')
  search.set('returnPathname', currentAuthReturnPathname())
  return `/api/auth/sign-in?${search.toString()}`
}

function disposeEngineForNavigation() {
  if (typeof window === 'undefined') return
  try {
    window.__studentSpaceGame?.dispose?.()
  } catch (err) {
    console.warn('[EdupassLogin] engine dispose before navigation failed', err)
  }
}

function submitBodyScopedAuthForm(action: string, method = 'post') {
  if (typeof document === 'undefined') return
  const form = document.createElement('form')
  form.method = method
  form.action = action
  form.style.display = 'none'
  document.body.appendChild(form)
  form.submit()
}

function completeBeforeDemoPost(state: StateLike | null | undefined) {
  try {
    state?.onboarding?.complete?.()
    state?.persistence?.flush?.()
    if (typeof window !== 'undefined' && window.location.hash === '#onboarding') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch {
    // Login skip was historically best-effort.
  }
}

export function EdupassLogin({
  reducedMotion,
  state,
  profile,
  camera,
  onAdvance,
}: {
  reducedMotion: boolean
  state: StateLike | null | undefined
  profile: ProfileLike | null | undefined
  camera: CameraLike | null | undefined
  onAdvance: () => void
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [connecting, setConnecting] = useState<'edupass' | 'demo' | 'offline' | null>(null)
  const edupassRef = useRef<HTMLAnchorElement | null>(null)
  const offlineTimerRef = useRef<number | null>(null)
  const demoAction = useMemo(() => authActionHref({ demo: true }), [])
  const edupassHref = useMemo(() => authActionHref(), [])

  useEffect(() => {
    document.body.classList.add('is-onb-landing')
    if (!reducedMotion) {
      camera?.startLandingOrbit?.({ azimuthDegPerSec: 4, distance: 18, pitchDeg: 12 })
      const frame = requestAnimationFrame(() => setVisible(true))
      const focusTimer = window.setTimeout(
        () => edupassRef.current?.focus({ preventScroll: true }),
        ENTER_MS,
      )
      return () => {
        cancelAnimationFrame(frame)
        window.clearTimeout(focusTimer)
        if (offlineTimerRef.current != null) window.clearTimeout(offlineTimerRef.current)
        camera?.stopLandingOrbit?.()
        document.body.classList.remove('is-onb-landing')
      }
    }

    setVisible(true)
    edupassRef.current?.focus({ preventScroll: true })
    return () => {
      if (offlineTimerRef.current != null) window.clearTimeout(offlineTimerRef.current)
      camera?.stopLandingOrbit?.()
      document.body.classList.remove('is-onb-landing')
    }
  }, [camera, reducedMotion])

  const begin = (kind: 'edupass' | 'demo' | 'offline') => {
    if (connecting) return false
    setConnecting(kind)
    return true
  }

  const onEdupassClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (!begin('edupass')) return
    disposeEngineForNavigation()
    window.location.assign(edupassHref)
  }

  const onDemoSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!begin('demo')) return
    disposeEngineForNavigation()
    submitBodyScopedAuthForm(demoAction, 'post')
  }

  const onOfflineClick = () => {
    if (!begin('offline')) return
    offlineTimerRef.current = window.setTimeout(
      () => {
        offlineTimerRef.current = null
        if (!state?.backend) {
          const pick =
            OFFLINE_DEMO_STUDENTS[Math.floor(Math.random() * OFFLINE_DEMO_STUDENTS.length)]
          if (pick) profile?.setIdentity?.({ name: pick.name, className: pick.className })
        }
        onAdvance()
      },
      reducedMotion ? 80 : CONNECTING_MS,
    )
  }

  const onSkipClick = () => {
    if (!begin('demo')) return
    completeBeforeDemoPost(state)
    disposeEngineForNavigation()
    submitBodyScopedAuthForm(demoAction, 'post')
  }

  return (
    <div
      data-testid="onboarding-edupass-login"
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-between overflow-hidden',
        'bg-transparent px-6 py-[max(2rem,env(safe-area-inset-bottom))]',
        'transition-opacity duration-[320ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,248,226,0.58),rgba(255,248,226,0.18)_42%,rgba(15,18,36,0.18)_100%)]"
      />

      <div className="relative z-[1] flex min-h-[42vh] flex-1 items-center justify-center">
        <div className="text-center drop-shadow-[0_8px_24px_rgba(15,18,36,0.18)]">
          <span className="block text-[clamp(34px,8vw,56px)] font-semibold tracking-[0.02em] text-(--color-onb-ink)">
            {ONBOARDING_COPY.login.wordmark}
          </span>
          <span className="mt-2 block text-sm font-medium tracking-[0.18em] text-(--color-onb-ink-soft) uppercase">
            {ONBOARDING_COPY.login.tagline}
          </span>
        </div>
      </div>

      <div className="relative z-[1] flex w-full max-w-[360px] flex-col items-center gap-3">
        <fieldset className="m-0 flex w-full flex-col items-stretch gap-2 border-0 p-0">
          <legend className="sr-only">Sign in</legend>
          <a
            ref={edupassRef}
            data-action="edupass"
            href={edupassHref}
            onClick={onEdupassClick}
            aria-disabled={connecting !== null}
            className={cn(
              'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold',
              'bg-(--color-onb-accent) text-white no-underline shadow-[0_10px_26px_rgba(255,138,92,0.36)]',
              'transition-[transform,background,opacity] duration-150 ease-out hover:-translate-y-px hover:bg-(--onb-accent-deep)',
              'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
              connecting && 'pointer-events-none opacity-60',
              connecting === 'edupass' && 'cursor-progress opacity-85',
            )}
          >
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-lg bg-white/95"
            >
              <span className="size-2.5 rounded-full bg-(--color-onb-accent)" />
            </span>
            <span>
              {connecting === 'edupass'
                ? `${ONBOARDING_COPY.login.connecting}...`
                : ONBOARDING_COPY.login.actions.edupass}
            </span>
          </a>

          <form data-action="demo" method="post" action={demoAction} onSubmit={onDemoSubmit}>
            <button
              type="submit"
              disabled={connecting !== null}
              className={cn(
                'min-h-12 w-full rounded-2xl border border-white/55 bg-white/80 px-5',
                'text-sm font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.14)]',
                'transition-[transform,background,opacity] duration-150 ease-out hover:-translate-y-px hover:bg-white',
                'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                connecting === 'demo' && 'cursor-progress opacity-85',
              )}
            >
              {connecting === 'demo'
                ? `${ONBOARDING_COPY.login.connecting}...`
                : ONBOARDING_COPY.login.actions.demo}
            </button>
          </form>

          <button
            type="button"
            data-action="offline"
            disabled={connecting !== null}
            onClick={onOfflineClick}
            className={cn(
              'min-h-10 rounded-2xl border border-transparent bg-transparent px-5',
              'text-xs font-semibold text-[rgba(43,38,32,0.62)] underline decoration-dotted underline-offset-[3px]',
              'transition-[color,opacity] duration-150 hover:text-[rgba(43,38,32,0.82)]',
              'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
              connecting === 'offline' && 'cursor-progress opacity-85',
            )}
          >
            {connecting === 'offline'
              ? `${ONBOARDING_COPY.login.connecting}...`
              : 'Continue offline'}
          </button>
        </fieldset>

        <p className="m-0 text-center text-xs text-(--color-onb-ink-faint)">
          {ONBOARDING_COPY.login.demoNote}
        </p>
        <button
          type="button"
          aria-label="Skip onboarding (dev)"
          onClick={onSkipClick}
          className="border-0 bg-transparent px-2 py-1 text-[11px] font-medium lowercase tracking-[0.04em] text-[rgba(43,38,32,0.45)] underline decoration-dotted decoration-transparent underline-offset-[3px] hover:text-[rgba(43,38,32,0.78)] hover:decoration-current"
        >
          Skip onboarding (dev)
        </button>
      </div>
    </div>
  )
}
