// @vitest-environment happy-dom

/**
 * `OnboardingFlow.start()` auto-skip-login behavior (U2's plan-core R1).
 *
 * When the host already resolved a signed-in session (any of WorkOS / demo
 * cookie / DEV_BYPASS_AUTH), the flow must advance past the dummy
 * EdupassLogin surface and land at the greeting beat directly. When
 * signed-out (or when the auth slice is missing), the flow falls through
 * to the legacy login behaviour so first-arrival sign-in is still reachable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface OnboardingStub {
  stage: string
  isDone: boolean
  completedAt?: string | null
  setStage: (next: string) => string
  subscribe: (cb: (event: unknown) => void) => () => void
  firstMoodPinId: string | null
}

interface MockState {
  onboarding: OnboardingStub
  auth?: { isSignedIn: boolean } | null
  weather?: { setAmbient: () => void; setIntensity: () => void }
  day?: { setManualHour: () => void; clearManualHour: () => void }
}

function makeOnboarding(initialStage = 'login'): OnboardingStub {
  const subscribers = new Set<(event: unknown) => void>()
  return {
    stage: initialStage,
    completedAt: null,
    get isDone() {
      return this.stage === 'done'
    },
    firstMoodPinId: null,
    setStage(next) {
      this.stage = next
      for (const cb of subscribers) cb({ kind: 'stage', stage: next })
      return next
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
}

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

// @ts-expect-error vendored JS module is intentionally untyped.
import OnboardingFlow from '~/engine/student-space/Game/View/Onboarding/OnboardingFlow.js'

interface OnboardingFlowHandle {
  start(): Promise<void>
  dispose?: () => void
}

const fakeView = {
  kira: { setOnboardingMode: vi.fn() },
  kiraDialogue: { setOnboardingMode: vi.fn() },
  overlayController: undefined,
}

beforeEach(() => {
  document.body.innerHTML = '<div class="game"></div>'
  fakeView.kira.setOnboardingMode.mockClear()
  fakeView.kiraDialogue.setOnboardingMode.mockClear()
})

afterEach(() => {
  ;(state as { instance: unknown }).instance = null
  // OnboardingFlow stores itself on a static field; clear it so the next
  // test boots a fresh flow.
  // biome-ignore lint/suspicious/noExplicitAny: vendored JS module
  ;(OnboardingFlow as any).instance = null
  document.body.innerHTML = ''
  document.body.className = ''
})

function mountState(stage: string, auth: MockState['auth']) {
  const mock: MockState = {
    onboarding: makeOnboarding(stage),
    auth,
    weather: { setAmbient: () => {}, setIntensity: () => {} },
    day: { setManualHour: () => {}, clearManualHour: () => {} },
  }
  ;(state as { instance: unknown }).instance = mock
  return mock
}

describe('OnboardingFlow auth-aware skip', () => {
  it('signed-in: skips the login stage and lands on greeting on first start', async () => {
    const mock = mountState('login', { isSignedIn: true })
    const flow = new OnboardingFlow(fakeView) as OnboardingFlowHandle
    // Start the flow but don't await — once the stage advances past 'login',
    // dispose breaks the loop so we never need to actually render Greeting.
    const startPromise = flow.start()
    // Give the microtask queue a chance to run the synchronous skip path.
    await Promise.resolve()
    await Promise.resolve()
    expect(mock.onboarding.stage).toBe('greeting')
    flow.dispose?.()
    // The loop in start() is still running; tear it down by marking done.
    mock.onboarding.setStage('done')
    await startPromise.catch(() => {})
  })

  it('signed-in completed user: login-only entry returns to done instead of replaying onboarding', async () => {
    const mock = mountState('login', { isSignedIn: true })
    mock.onboarding.completedAt = '2026-05-20T00:00:00.000Z'
    const flow = new OnboardingFlow(fakeView) as OnboardingFlowHandle
    await flow.start()
    expect(mock.onboarding.stage).toBe('done')
  })

  it('signed-out: keeps the login stage and renders the dummy surface', async () => {
    const mock = mountState('login', { isSignedIn: false })
    const flow = new OnboardingFlow(fakeView) as OnboardingFlowHandle
    const startPromise = flow.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(mock.onboarding.stage).toBe('login')
    flow.dispose?.()
    mock.onboarding.setStage('done')
    await startPromise.catch(() => {})
  })

  it('missing auth slice: degrades to the dummy login surface (no crash)', async () => {
    const mock = mountState('login', null)
    const flow = new OnboardingFlow(fakeView) as OnboardingFlowHandle
    const startPromise = flow.start()
    await Promise.resolve()
    await Promise.resolve()
    // `state.auth?.isSignedIn` short-circuits to undefined → falsy → no skip.
    expect(mock.onboarding.stage).toBe('login')
    flow.dispose?.()
    mock.onboarding.setStage('done')
    await startPromise.catch(() => {})
  })

  it('already-done: returns immediately and does not advance stage', async () => {
    const mock = mountState('done', { isSignedIn: true })
    const flow = new OnboardingFlow(fakeView) as OnboardingFlowHandle
    await flow.start()
    expect(mock.onboarding.stage).toBe('done')
  })
})
