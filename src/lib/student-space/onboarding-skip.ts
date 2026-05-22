import { OFFLINE_DEMO_STUDENTS } from '~/engine/student-space/Game/View/Onboarding/copy.js'

/**
 * Canonical "skip onboarding (dev)" routine for the React ceremony.
 *
 * Marks the ceremony complete, seeds an offline demo identity when there's
 * no backend, drains the persistence debounce synchronously so the write
 * survives the reload, and leaves `/onboarding` / `#onboarding` so the next
 * boot lands back on the island instead of replaying the ceremony.
 *
 * Shared between the React `SkipButton` (floating dev escape hatch) and any
 * inline skip affordance an individual stage renders.
 */
type SkipContext = {
  state?: {
    backend?: unknown
    onboarding?: { complete?: () => unknown }
    persistence?: { flush?: () => unknown }
  } | null
  profile?: { setIdentity?: (id: { name: string; className: string }) => unknown } | null
}

export function performOnboardingSkip(ctx: SkipContext): void {
  try {
    if (!ctx.state?.backend) {
      const pick = OFFLINE_DEMO_STUDENTS[Math.floor(Math.random() * OFFLINE_DEMO_STUDENTS.length)]
      if (pick) ctx.profile?.setIdentity?.({ name: pick.name, className: pick.className })
    }
    ctx.state?.onboarding?.complete?.()
    ctx.state?.persistence?.flush?.()
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname === '/onboarding' || window.location.hash === '#onboarding')
    ) {
      window.history.replaceState(null, '', '/')
    }
  } catch {
    // The original helper swallowed every error so a dev tap couldn't get
    // stuck on a half-applied skip — preserve that posture.
  }
  try {
    window.location.reload()
  } catch {
    // Same — reload may fail in test environments; swallow.
  }
}
