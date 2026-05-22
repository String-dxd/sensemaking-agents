import { useEffect, useRef } from 'react'
import type { Game } from '~/engine/student-space/Game'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'

/**
 * Bridges a not-yet-migrated engine onboarding surface (EggHatcher,
 * FirstChat, FirstMood, IslandReveal, EdupassLogin) into the React
 * orchestrator. The engine class still draws its own DOM into
 * `.onboarding-root`; this component owns the mount/unmount lifecycle and
 * surface-swap ordering that `OnboardingFlow.js._renderStage` used to handle.
 *
 * Deleted as each engine surface is fully migrated to React in U17–U19.
 */

// Stage → engine surface owner; mirrors the engine orchestrator's
// `STAGE_OWNER` map. 'greeting' is handled by the React component;
// every other not-yet-`done` stage routes through here.
const STAGE_OWNER: Record<string, EngineOwner> = {
  login: 'login',
  'egg-color': 'egg',
  'egg-name': 'egg',
  'egg-hatch': 'egg',
  'first-chat': 'first-chat',
  'first-mood': 'first-mood',
  'first-grow': 'reveal',
  'tree-narration': 'reveal',
  closing: 'reveal',
}

type EngineOwner = 'login' | 'egg' | 'first-chat' | 'first-mood' | 'reveal'

type EngineSurface = {
  setAdvance: (cb: (next: string) => void) => void
  mount: (root: HTMLElement, ctx: unknown) => Promise<void> | void
  unmount?: () => Promise<void> | void
  setStage?: (stage: string) => Promise<void> | void
}

type EngineSurfaceCtor = new (flow: unknown) => EngineSurface

async function loadSurface(owner: EngineOwner): Promise<EngineSurfaceCtor | null> {
  // The `default` exports are uniformly the engine surface class. Each
  // `import()` is a literal so bundlers can split it.
  const mod = await (() => {
    switch (owner) {
      case 'login':
        // @ts-expect-error untyped engine module
        return import('~/engine/student-space/Game/View/Onboarding/EdupassLogin.js')
      case 'egg':
        // @ts-expect-error untyped engine module
        return import('~/engine/student-space/Game/View/Onboarding/EggHatcher.js')
      case 'first-chat':
        // @ts-expect-error untyped engine module
        return import('~/engine/student-space/Game/View/Onboarding/FirstChat.js')
      case 'first-mood':
        // @ts-expect-error untyped engine module
        return import('~/engine/student-space/Game/View/Onboarding/FirstMood.js')
      case 'reveal':
        // @ts-expect-error untyped engine module
        return import('~/engine/student-space/Game/View/Onboarding/IslandReveal.js')
    }
  })()
  return (mod as { default?: EngineSurfaceCtor }).default ?? null
}

function buildCtx(game: Game, stage: string, reducedMotion: boolean) {
  type GameRich = {
    state?: {
      profile?: unknown
      onboarding?: unknown
      moodPins?: unknown
      day?: unknown
      weather?: unknown
      auth?: unknown
    }
    view?: unknown
  }
  const g = game as unknown as GameRich
  const state = g.state
  return {
    stage,
    copy: ONBOARDING_COPY,
    reducedMotion,
    state,
    profile: state?.profile,
    onboarding: state?.onboarding,
    moodPins: state?.moodPins,
    view: g.view,
    setStage: (next: string) => {
      ;(state?.onboarding as { setStage?: (next: string) => unknown } | undefined)?.setStage?.(next)
    },
  }
}

export function EngineStageMount({
  game,
  stage,
  rootRef,
  reducedMotion,
}: {
  game: Game | null
  stage: string
  rootRef: { current: HTMLDivElement | null }
  reducedMotion: boolean
}) {
  const owner = STAGE_OWNER[stage] ?? null
  // Holds the active engine surface across renders so a sub-stage tick
  // (e.g. egg-color → egg-name within the same `egg` owner) reuses the
  // surface instead of unmounting it.
  const activeRef = useRef<{ owner: EngineOwner | null; surface: EngineSurface | null }>({
    owner: null,
    surface: null,
  })
  // Serialise mount/unmount so a rapid stage change doesn't interleave
  // an async exit fade with the next surface's entry.
  const pendingRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!game || !owner) return
    let cancelled = false
    const root = rootRef.current

    pendingRef.current = pendingRef.current.then(async () => {
      if (cancelled || !root) return

      // Same owner with a sub-stage hook → forward to setStage() and bail.
      const active = activeRef.current
      if (active.owner === owner && active.surface?.setStage) {
        try {
          await active.surface.setStage(stage)
        } catch (err) {
          console.error('[onboarding] setStage failed', err)
        }
        return
      }

      // Swap surfaces — tear down the old one before mounting the new.
      if (active.surface) {
        try {
          await active.surface.unmount?.()
        } catch (err) {
          console.error('[onboarding] unmount failed', err)
        }
        active.surface = null
        active.owner = null
      }

      if (cancelled) return
      const Ctor = await loadSurface(owner)
      if (cancelled || !Ctor || !rootRef.current) return

      const surface = new Ctor({})
      surface.setAdvance((next: string) => {
        ;(
          game as unknown as {
            state?: { onboarding?: { setStage?: (next: string) => unknown } }
          }
        ).state?.onboarding?.setStage?.(next)
      })
      try {
        await surface.mount(rootRef.current, buildCtx(game, stage, reducedMotion))
      } catch (err) {
        console.error('[onboarding] mount failed', err)
        return
      }
      if (cancelled) {
        try {
          await surface.unmount?.()
        } catch {
          // already cancelled; swallow
        }
        return
      }
      activeRef.current = { owner, surface }
    })

    return () => {
      cancelled = true
    }
  }, [game, stage, owner, rootRef, reducedMotion])

  // Tear down on full unmount (orchestrator closed or ceremony finished).
  useEffect(() => {
    return () => {
      const active = activeRef.current
      if (!active.surface) return
      const surface = active.surface
      activeRef.current = { owner: null, surface: null }
      pendingRef.current = pendingRef.current.then(async () => {
        try {
          await surface.unmount?.()
        } catch {
          // dispose is internally defensive; swallow residual errors
        }
      })
    }
  }, [])

  return null
}

export { STAGE_OWNER }
