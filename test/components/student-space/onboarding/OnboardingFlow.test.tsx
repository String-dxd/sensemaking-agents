// @vitest-environment happy-dom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingFlow } from '~/components/student-space/onboarding/OnboardingFlow'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { EngineContext } from '~/lib/student-space/use-engine'
import { EngineOverlayProvider } from '~/lib/student-space/use-engine-overlay'

type OnboardingFixture = ReturnType<typeof makeOnboarding>

function makeOnboarding(initial: {
  stage?: string
  isDone?: boolean
  completedAt?: string | null
  firstMoodPinId?: string | null
  companionName?: string | null
  eggColorId?: string | null
}) {
  const subscribers = new Set<() => void>()
  let stage = initial.stage ?? 'pending'
  let firstMoodPinId = initial.firstMoodPinId ?? null
  let eggColorId = initial.eggColorId ?? null
  let companionName = initial.companionName ?? null
  const slice = {
    get stage() {
      return stage
    },
    get isDone() {
      return stage === 'done'
    },
    completedAt: initial.completedAt ?? null,
    get companionName() {
      return companionName
    },
    get eggColorId() {
      return eggColorId
    },
    get firstMoodPinId() {
      return firstMoodPinId
    },
    setStage(next: string): string {
      stage = next
      for (const cb of subscribers) cb()
      return next
    },
    setFirstMoodPinId(next: string): string {
      firstMoodPinId = next
      for (const cb of subscribers) cb()
      return next
    },
    setEggColor(next: string): string {
      eggColorId = next
      for (const cb of subscribers) cb()
      return next
    },
    setCompanionName(next: string): string {
      companionName = next
      for (const cb of subscribers) cb()
      return next
    },
    complete(): string {
      stage = 'done'
      for (const cb of subscribers) cb()
      return stage
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
      profile: { identity: { name: opts.studentName ?? 'Demo Student' }, setIdentity: vi.fn() },
      moodPins: {
        pins: [{ id: 'mood-pin-1', emotion: 'joy' }],
        add: vi.fn(() => ({ id: 'mood-pin-1' })),
      },
      weather: { setAmbient: vi.fn(), setIntensity: vi.fn() },
      day: { setManualHour: vi.fn(), clearManualHour: vi.fn(), setMood: vi.fn() },
    },
    view: {
      kira: {
        setOnboardingMode: vi.fn(),
        setSpecies: vi.fn(),
        flyTo: vi.fn(() => Promise.resolve()),
        perchX: 1,
        perchY: 2,
        perchZ: 3,
        perchYaw: 0,
      },
      camera: {
        restoreZoom: vi.fn(),
        resetToDefault: vi.fn(),
        zoomTo: vi.fn(),
        instance: {
          position: {
            clone: () => ({
              x: 0,
              y: 0,
              z: 0,
              set(x: number, y: number, z: number) {
                this.x = x
                this.y = y
                this.z = z
                return this
              },
            }),
          },
        },
      },
      flowers: {
        flowers: [{ x: 1, z: 2 }],
        setFirstSpeciesForEmotion: vi.fn(),
        bloomInstance: vi.fn(() => Promise.resolve()),
      },
      tree: { entries: [{}], growIn: vi.fn(() => Promise.resolve()) },
      sound: { playOneShot: vi.fn() },
      kiraDialogue: {
        setOnboardingMode: vi.fn(),
        sayOnboarding: vi.fn(),
        clearOnboardingBubble: vi.fn(),
      },
    },
  }
}

function renderFlow(game: ReturnType<typeof makeGame>) {
  // Type-cast — the test fixture intentionally provides only the shape the
  // orchestrator reaches into, not the full `Game` API.
  const ctx = game as unknown as Parameters<typeof EngineContext.Provider>[0]['value']
  const rootRoute = createRootRoute({
    component: () => (
      <EngineContext.Provider value={ctx}>
        <EngineOverlayProvider>
          <OnboardingFlow />
        </EngineOverlayProvider>
      </EngineContext.Provider>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/onboarding',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, onboardingRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { router, ...render(<RouterProvider router={router} />) }
}

beforeEach(() => {
  document.body.classList.remove('is-onboarding')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
    // Wake-up rule kicks off pending → login. The login surface owns its own
    // inline skip affordance, so the floating skip button is not mounted.
    await waitFor(() => expect(screen.getByTestId('onboarding-edupass-login')).toBeInTheDocument())
    expect(onboarding.stage).toBe('login')
    expect(screen.queryByTestId('onboarding-skip')).toBeNull()
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
    it("renders 'Hi, {firstName}.' from the profile identity", async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding, studentName: 'Mei Tan' })
      renderFlow(game)
      // The hello string uses the first whitespace-delimited token.
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hi, Mei.')
    })

    it('falls back to "there" when no profile name is available', async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding, studentName: '' })
      renderFlow(game)
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hi, there.')
    })

    it('marks the React-owned stage slot visible for the fade substrate', async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      const slot = await screen.findByTestId('onboarding-stage-slot')
      expect(slot).toHaveClass('opacity-100')
      expect(slot).toHaveAttribute('data-stage', 'greeting')
    })

    it('advances stage greeting → egg-color when the CTA is clicked', async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      await userEvent.click(await screen.findByTestId('onboarding-greeting-cta'))
      expect(onboarding.stage).toBe('egg-color')
    })
  })

  describe('EggHatcher surface', () => {
    it('commits color, name, profile identity, and advances through hatch', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'egg-color' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await userEvent.click(await screen.findByTestId('egg-color-satin'))
      await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
      expect(onboarding.eggColorId).toBe('satin')
      expect(onboarding.stage).toBe('egg-name')

      await userEvent.type(await screen.findByLabelText('Name your companion.'), 'Pip')
      await userEvent.click(await screen.findByRole('button', { name: 'Hatch the egg' }))
      expect(onboarding.companionName).toBe('Pip')
      expect(game.state.profile.setIdentity).toHaveBeenCalledWith({
        companionSpecies: 'satin',
        companionName: 'Pip',
      })
      expect(game.view.kira.setSpecies).toHaveBeenCalledWith('satin')
      expect(onboarding.stage).toBe('egg-hatch')

      await waitFor(() => expect(onboarding.stage).toBe('first-chat'))
    })
  })

  describe('FirstChat surface', () => {
    it('flies Kira in, speaks the intro, and advances to first-mood from the primary chip', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'first-chat', companionName: 'Pip' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Tell me how I feel now' })).toBeInTheDocument(),
      )

      expect(game.view.kira.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ reducedMotion: true }),
      )
      expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith("Hi. I'm Pip.")

      await userEvent.click(screen.getByRole('button', { name: 'Tell me how I feel now' }))
      expect(onboarding.stage).toBe('first-mood')
    })

    it('chat-more plays the explainer on first tap, then re-shows the action chips', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'first-chat' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Tell me more' })).toBeInTheDocument(),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Tell me more' }))
      await waitFor(() =>
        expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
          'Anything else on your mind?',
        ),
      )

      for (const beat of ONBOARDING_COPY.kira.firstChatExplainer) {
        expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(beat)
      }
      expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
        'Anything else on your mind?',
      )
      expect(screen.getByRole('button', { name: 'Tell me how I feel now' })).toBeInTheDocument()
    })

    it('chat-more falls back to the listening beat after the explainer is seen', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'first-chat' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Tell me more' })).toBeInTheDocument(),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Tell me more' }))
      await waitFor(() =>
        expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
          'Anything else on your mind?',
        ),
      )

      game.view.kiraDialogue.sayOnboarding.mockClear()
      await userEvent.click(screen.getByRole('button', { name: 'Tell me more' }))
      await waitFor(() =>
        expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
          'Anything else on your mind?',
        ),
      )
      expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
        "Take your time. I'm listening.",
      )
      for (const beat of ONBOARDING_COPY.kira.firstChatExplainer) {
        expect(game.view.kiraDialogue.sayOnboarding).not.toHaveBeenCalledWith(beat)
      }
    })
  })

  describe('FirstMood surface', () => {
    it('commits the picked mood, stores the pin id, tints the day, and advances', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'first-mood' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await userEvent.click(await screen.findByTestId('mood-tile-joy'))
      expect(game.state.moodPins.add).toHaveBeenCalledWith({ emotion: 'joy', intensity: 2 })
      expect(onboarding.firstMoodPinId).toBe('mood-pin-1')
      expect(game.state.day.setMood).toHaveBeenCalledWith('joy')
      expect(game.view.kiraDialogue.sayOnboarding).toHaveBeenCalledWith(
        "Noticed. I'll hold that one.",
      )

      await waitFor(() => expect(onboarding.stage).toBe('first-grow'))
    })
  })

  describe('IslandReveal surface', () => {
    it('runs bloom, tree, and begin beats before completing onboarding', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true })),
      )
      const onboarding = makeOnboarding({ stage: 'first-grow', firstMoodPinId: 'mood-pin-1' })
      const game = makeGame({ onboarding })
      renderFlow(game)

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Show me what just bloomed' }),
        ).toBeInTheDocument(),
      )
      expect(game.state.day.setManualHour).toHaveBeenCalledWith(18.5)
      expect(game.view.flowers.setFirstSpeciesForEmotion).toHaveBeenCalledWith('joy', '#FFD66B')

      await userEvent.click(screen.getByRole('button', { name: 'Show me what just bloomed' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'What else is here?' })).toBeInTheDocument(),
      )
      expect(onboarding.stage).toBe('tree-narration')
      expect(game.view.sound.playOneShot).toHaveBeenCalledWith('bloom')
      expect(game.view.flowers.bloomInstance).toHaveBeenCalledWith(0, { duration: 520 })

      await userEvent.click(screen.getByRole('button', { name: 'What else is here?' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Begin' })).toBeInTheDocument())
      expect(onboarding.stage).toBe('closing')
      expect(game.view.sound.playOneShot).toHaveBeenCalledWith('grow')
      expect(game.view.tree.growIn).toHaveBeenCalledWith(0, { duration: 1400 })

      await userEvent.click(screen.getByRole('button', { name: 'Begin' }))
      await waitFor(() => expect(onboarding.stage).toBe('done'))
      expect(game.view.camera.resetToDefault).toHaveBeenCalledWith(200)
      expect(game.view.kiraDialogue.clearOnboardingBubble).toHaveBeenCalled()
    })
  })

  describe('SkipButton', () => {
    it('is visible on the greeting stage', async () => {
      const onboarding = makeOnboarding({ stage: 'greeting' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      const btn = await screen.findByTestId('onboarding-skip')
      expect(btn).toBeInTheDocument()
      expect(btn.className).not.toContain('opacity-0')
    })

    it('is not mounted on the login stage', async () => {
      const onboarding = makeOnboarding({ stage: 'login' })
      const game = makeGame({ onboarding })
      renderFlow(game)
      await screen.findByTestId('onboarding-edupass-login')
      expect(screen.queryByTestId('onboarding-skip')).toBeNull()
    })
  })
})
