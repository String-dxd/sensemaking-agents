// @vitest-environment happy-dom

/**
 * U16 React rewrite: OnboardingFlow + Greeting + SkipButton coverage.
 *
 * Replaces the engine-side `onboarding-flow-auth-skip.test.ts` (deleted with
 * the engine `OnboardingFlow.js` module). Validates:
 *  - wake-up rules: pending → login default; login + signed-in → greeting
 *    (or `done` if already completed); first-mood + committed pin →
 *    first-grow fast-forward
 *  - body.is-onboarding class is toggled for the duration of the ceremony
 *  - Greeting renders the personalised "Hi, {firstName}." copy
 *  - Greeting CTA advances the stage
 *  - SkipButton is hidden on `login` / `pending` / `done`, visible elsewhere
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingFlow } from '~/components/student-space/onboarding/OnboardingFlow'
import { EngineContext } from '~/lib/student-space/use-engine'

type OnboardingFixture = ReturnType<typeof makeOnboarding>

function makeOnboarding(initial: {
  stage?: string
  isDone?: boolean
  completedAt?: string | null
  firstMoodPinId?: string | null
}) {
  const subscribers = new Set<() => void>()
  let stage = initial.stage ?? 'pending'
  const slice = {
    get stage() {
      return stage
    },
    get isDone() {
      return stage === 'done'
    },
    completedAt: initial.completedAt ?? null,
    firstMoodPinId: initial.firstMoodPinId ?? null,
    setStage(next: string): string {
      stage = next
      for (const cb of subscribers) cb()
      return next
    },
    subscribe(cb: () => void) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
  return slice
}

function makeGame(opts: {
  onboarding: OnboardingFixture
  isSignedIn?: boolean
  studentName?: string
}) {
  return {
    state: {
      onboarding: opts.onboarding,
      auth: { isSignedIn: opts.isSignedIn ?? false },
      profile: { identity: { name: opts.studentName ?? 'Demo Student' } },
      weather: { setAmbient: vi.fn(), setIntensity: vi.fn() },
      day: { setManualHour: vi.fn(), clearManualHour: vi.fn() },
    },
    view: {
      kira: { setOnboardingMode: vi.fn() },
      kiraDialogue: { setOnboardingMode: vi.fn() },
    },
  }
}

function renderFlow(game: ReturnType<typeof makeGame>): {
  unmount: () => void
} {
  // Type-cast — the test fixture intentionally provides only the shape the
  // orchestrator reaches into, not the full `Game` API.
  const ctx = game as unknown as Parameters<typeof EngineContext.Provider>[0]['value']
  function Provider({ children }: { children: ReactNode }) {
    return <EngineContext.Provider value={ctx}>{children}</EngineContext.Provider>
  }
  return render(
    <Provider>
      <OnboardingFlow />
    </Provider>,
  )
}

beforeEach(() => {
  document.body.classList.remove('is-onboarding')
})

afterEach(() => {
  document.body.classList.remove('is-onboarding')
})

describe('OnboardingFlow (React)', () => {
  it('renders nothing when onboarding is already done', () => {
    const onboarding = makeOnboarding({ stage: 'done' })
    const game = makeGame({ onboarding })
    renderFlow(game)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.classList.contains('is-onboarding')).toBe(false)
  })

  it('renders nothing when the stage is "pending" (wake-up advances synchronously to login)', async () => {
    const onboarding = makeOnboarding({ stage: 'pending' })
    const game = makeGame({ onboarding })
    renderFlow(game)
    // Wake-up rule kicks off pending → login. The dialog shows up after that
    // tick; assert on the SkipButton which always renders.
    await waitFor(() => expect(screen.getByTestId('onboarding-skip')).toBeInTheDocument())
    expect(onboarding.stage).toBe('login')
  })

  it('fast-forwards login → greeting when the auth slice is already signed-in', async () => {
    const onboarding = makeOnboarding({ stage: 'login' })
    const game = makeGame({ onboarding, isSignedIn: true })
    renderFlow(game)
    await waitFor(() => expect(onboarding.stage).toBe('greeting'))
    expect(screen.getByTestId('onboarding-greeting')).toBeInTheDocument()
  })

  it('fast-forwards login → done for a returning signed-in student who already completed the ceremony', async () => {
    const onboarding = makeOnboarding({
      stage: 'login',
      completedAt: '2026-01-01T00:00:00.000Z',
    })
    const game = makeGame({ onboarding, isSignedIn: true })
    renderFlow(game)
    await waitFor(() => expect(onboarding.stage).toBe('done'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fast-forwards first-mood → first-grow when a mood pin has already been committed', async () => {
    const onboarding = makeOnboarding({ stage: 'first-mood', firstMoodPinId: 'mp-1' })
    const game = makeGame({ onboarding, isSignedIn: true })
    renderFlow(game)
    await waitFor(() => expect(onboarding.stage).toBe('first-grow'))
  })

  it('toggles body.is-onboarding during the ceremony and clears it on unmount', async () => {
    const onboarding = makeOnboarding({ stage: 'greeting' })
    const game = makeGame({ onboarding })
    const { unmount } = renderFlow(game)
    await waitFor(() => expect(document.body.classList.contains('is-onboarding')).toBe(true))
    unmount()
    expect(document.body.classList.contains('is-onboarding')).toBe(false)
  })

  it('flips Kira + kiraDialogue into onboarding mode for the ceremony duration', async () => {
    const onboarding = makeOnboarding({ stage: 'greeting' })
    const game = makeGame({ onboarding })
    const { unmount } = renderFlow(game)
    await waitFor(() => expect(game.view.kira.setOnboardingMode).toHaveBeenCalledWith(true))
    expect(game.view.kiraDialogue.setOnboardingMode).toHaveBeenCalledWith(true)
    unmount()
    expect(game.view.kira.setOnboardingMode).toHaveBeenLastCalledWith(false)
    expect(game.view.kiraDialogue.setOnboardingMode).toHaveBeenLastCalledWith(false)
  })

  it('parks the world at clear midday for the ceremony', async () => {
    const onboarding = makeOnboarding({ stage: 'greeting' })
    const game = makeGame({ onboarding })
    renderFlow(game)
    await waitFor(() => expect(game.state.day.setManualHour).toHaveBeenCalledWith(11.5))
    expect(game.state.weather.setAmbient).toHaveBeenCalledWith(false)
    expect(game.state.weather.setIntensity).toHaveBeenCalledWith(0)
  })

  describe('Greeting surface', () => {
    it("renders 'Hi, {firstName}.' from the profile identity", () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding, studentName: 'Mei Tan' })
      renderFlow(game)
      // The hello string uses the first whitespace-delimited token.
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hi, Mei.')
    })

    it('falls back to "there" when no profile name is available', () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding, studentName: '' })
      renderFlow(game)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hi, there.')
    })

    it('advances stage greeting → egg-color when the CTA is clicked', async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      await userEvent.click(screen.getByTestId('onboarding-greeting-cta'))
      expect(onboarding.stage).toBe('egg-color')
    })
  })

  describe('SkipButton', () => {
    it('is visible on the greeting stage', () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      const btn = screen.getByTestId('onboarding-skip')
      expect(btn).toBeInTheDocument()
      expect(btn.className).not.toContain('opacity-0')
    })

    it('is hidden (opacity-0 + pointer-events-none) on the login stage', () => {
      const onboarding = makeOnboarding({ stage: 'login' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      const btn = screen.getByTestId('onboarding-skip')
      expect(btn.className).toContain('opacity-0')
      expect(btn.className).toContain('pointer-events-none')
    })
  })
})
