import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { getPreset } from '~/lib/student-space/camera-tuner'
import { cn } from '~/lib/utils'

/**
 * Edupass sign-in landing.
 *
 * Preserves the auth sequencing that matters:
 * - WorkOS link disposes the engine before `window.location.assign`.
 * - Demo submit disposes the engine, then submits through a fresh
 *   body-scoped form so removing `.onboarding-root` cannot cancel the POST.
 */
const ENTER_MS = 320

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

const EDUPASS_BUTTON_CLASS = cn(
  'min-h-14 w-full gap-2 rounded-2xl px-5 text-base font-semibold',
  'bg-(--color-onb-accent) text-white no-underline shadow-[0_10px_26px_rgba(255,138,92,0.36)]',
  'transition-[transform,background,opacity] duration-150 ease-out hover:-translate-y-px hover:bg-(--onb-accent-deep)',
  'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
)

const DEMO_BUTTON_CLASS = cn(
  'min-h-12 w-full rounded-2xl border border-white/55 bg-white/80 px-5',
  'text-sm font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.14)]',
  'transition-[transform,background,opacity] duration-150 ease-out hover:-translate-y-px hover:bg-white',
  'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
)

export function EdupassLogin({
  reducedMotion,
  camera,
}: {
  reducedMotion: boolean
  camera: CameraLike | null | undefined
}) {
  const [visible, setVisible] = useState(reducedMotion)
  const [connecting, setConnecting] = useState<'edupass' | 'demo' | null>(null)
  const edupassRef = useRef<HTMLAnchorElement | null>(null)
  const demoAction = useMemo(() => authActionHref({ demo: true }), [])
  const edupassHref = useMemo(() => authActionHref(), [])

  useEffect(() => {
    document.body.classList.add('is-onb-landing')
    if (!reducedMotion) {
      camera?.startLandingOrbit?.(getPreset('login-orbit'))
      const frame = requestAnimationFrame(() => setVisible(true))
      const focusTimer = window.setTimeout(
        () => edupassRef.current?.focus({ preventScroll: true }),
        ENTER_MS,
      )
      return () => {
        cancelAnimationFrame(frame)
        window.clearTimeout(focusTimer)
        camera?.stopLandingOrbit?.()
        document.body.classList.remove('is-onb-landing')
      }
    }

    setVisible(true)
    edupassRef.current?.focus({ preventScroll: true })
    return () => {
      camera?.stopLandingOrbit?.()
      document.body.classList.remove('is-onb-landing')
    }
  }, [camera, reducedMotion])

  const begin = (kind: 'edupass' | 'demo') => {
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

      <div className="relative z-[1] flex min-h-[42vh] flex-1 items-start justify-center pt-[clamp(2rem,8vh,6rem)]">
        <div className="flex flex-col items-center text-center drop-shadow-[0_8px_24px_rgba(15,18,36,0.18)]">
          <span
            role="img"
            aria-label={ONBOARDING_COPY.login.wordmark}
            className="block aspect-[150/74] w-[clamp(180px,36vw,280px)] bg-white/65"
            style={{
              maskImage: 'url(/logo/SVG@2x.svg)',
              WebkitMaskImage: 'url(/logo/SVG@2x.svg)',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
            }}
          />
          <span className="mt-3 block text-[clamp(16px,1.8vw,20px)] font-medium text-white/90">
            {ONBOARDING_COPY.login.tagline}
          </span>
        </div>
      </div>

      <div className="relative z-[1] flex w-full max-w-[360px] flex-col items-center gap-3">
        <fieldset className="m-0 flex w-full flex-col items-stretch gap-2 border-0 p-0">
          <legend className="sr-only">Sign in</legend>
          <Button
            data-action="edupass"
            aria-disabled={connecting !== null}
            className={cn(
              EDUPASS_BUTTON_CLASS,
              connecting && 'pointer-events-none opacity-60',
              connecting === 'edupass' && 'cursor-progress opacity-85',
            )}
            render={
              <a ref={edupassRef} href={edupassHref} onClick={onEdupassClick}>
                <span>
                  {connecting === 'edupass'
                    ? `${ONBOARDING_COPY.login.connecting}...`
                    : ONBOARDING_COPY.login.actions.edupass}
                </span>
              </a>
            }
          />

          <form data-action="demo" method="post" action={demoAction} onSubmit={onDemoSubmit}>
            <Button
              type="submit"
              disabled={connecting !== null}
              className={cn(
                DEMO_BUTTON_CLASS,
                connecting === 'demo' && 'cursor-progress opacity-85',
              )}
            >
              {connecting === 'demo'
                ? `${ONBOARDING_COPY.login.connecting}...`
                : ONBOARDING_COPY.login.actions.demo}
            </Button>
          </form>
        </fieldset>
      </div>
    </div>
  )
}
