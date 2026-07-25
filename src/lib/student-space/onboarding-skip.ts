import { OFFLINE_DEMO_STUDENTS } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { addSgDays, sgToday } from '~/lib/entry-date'

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
  const todayKey = sgToday()
  const pins: SeedPin[] = DEMO_MOOD_EMOTIONS.map((emotion, offset) => {
    const entryDate = addSgDays(todayKey, -(DEMO_MOOD_EMOTIONS.length - 1 - offset)) ?? todayKey
    // Noon SGT so the instant is unambiguously inside the day it is keyed to.
    const createdAt = new Date(`${entryDate}T12:00:00+08:00`).toISOString()
    return {
      id: `demo-mood-${entryDate}`,
      createdAt,
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
