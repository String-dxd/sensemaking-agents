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
type SeedPin = {
  id: string
  createdAt: string
  entryDate: string
  emotion: string
  intensity: number
  cause: null
  note: null
}
type SkipContext = {
  state?: {
    backend?: unknown
    onboarding?: { complete?: () => unknown }
    persistence?: { flush?: () => unknown }
    moodPins?: { pins?: unknown[]; hydrate?: (snapshot: SeedPin[]) => unknown }
  } | null
  profile?: { setIdentity?: (id: { name: string; className: string }) => unknown } | null
}

const DEMO_MOOD_EMOTIONS = ['joy', 'anxiety', 'sadness', 'envy', 'ennui', 'fear', 'joy'] as const

function seedDemoMoodWeek(moodPins: NonNullable<SkipContext['state']>['moodPins']) {
  if (!moodPins?.hydrate) return
  if (Array.isArray(moodPins.pins) && moodPins.pins.length > 0) return
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const pins: SeedPin[] = DEMO_MOOD_EMOTIONS.map((emotion, offset) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (DEMO_MOOD_EMOTIONS.length - 1 - offset))
    const entryDate = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return {
      id: `demo-mood-${entryDate}`,
      createdAt: day.toISOString(),
      entryDate,
      emotion,
      intensity: 0.45 + ((offset * 13) % 35) / 100,
      cause: null,
      note: null,
    }
  })
  moodPins.hydrate(pins)
}

export function performOnboardingSkip(ctx: SkipContext): void {
  try {
    if (!ctx.state?.backend) {
      const pick = OFFLINE_DEMO_STUDENTS[Math.floor(Math.random() * OFFLINE_DEMO_STUDENTS.length)]
      if (pick) ctx.profile?.setIdentity?.({ name: pick.name, className: pick.className })
      seedDemoMoodWeek(ctx.state?.moodPins)
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
