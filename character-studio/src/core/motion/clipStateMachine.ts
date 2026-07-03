// Clip state machine (plan 007 step 2) — the keyframed base layer of the
// three-layer motion stack (plan 000 §2.2: animation drives, physics follows).
//
// One canonical clip set (core-v1, authored in scripts/blender/clips.py on
// the canonical skeleton) plays as-is on every archetype (plan 000 §2.2:
// one skeleton, clips authored once — never remapped between rigs).
// Rotations transfer untouched; the only proportion-dependent data is the
// hips translation track, which `hipsRebase` rewrites at construction:
// value' = liveRest + (value − referenceRest) · deltaScale — the baseline
// lands exactly on the archetype's hips rest offset and the authored bounce/
// sway deltas scale with body height.
//
// Layering:
//   - BASE layer: one looping action per state (idle/walk/run/sitIdle/
//     talkIdle), crossfaded with per-pair durations. sit is entered/exited
//     through the sitDown/standUp one-shots (transition clips): sitDown's
//     last frame equals sitIdle's first (test-enforced in clips.test.ts) so
//     the hand-off fade blends near-identical poses.
//   - GESTURE layer: one-shot clips converted with
//     AnimationUtils.makeClipAdditive (gestures are authored to start AND end
//     on the rest pose, so the additive delta ramps from zero and returns to
//     zero — it composes over any base state without a pose pop). A weight
//     envelope ramps the action in/out. If additive ever misbehaves on a rig,
//     `fullBodyGestures: true` falls back to playing the raw clip as a base-
//     layer interruption (plan 007 documented fallback).
//
// `update(dt)` must run in the `animation` frame phase; the spring solver
// (physics phase) then treats the mixer-written pose as its target.
// Pure three — no React, no globals, no Math.random.

import {
  AdditiveAnimationBlendMode,
  type AnimationAction,
  type AnimationClip,
  type AnimationMixer,
  AnimationUtils,
  LoopOnce,
  LoopRepeat,
} from 'three'

export type MachineState = 'idle' | 'walk' | 'run' | 'sit' | 'talk'

export const GESTURE_NAMES = ['gestureWave', 'gestureNod', 'gestureShrug', 'gestureCheer'] as const
export type GestureName = (typeof GESTURE_NAMES)[number]

/** Base-layer looping clip per state. */
const BASE_CLIP: Record<MachineState, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  sit: 'sitIdle',
  talk: 'talkIdle',
}

const REQUIRED_CLIPS = [...Object.values(BASE_CLIP), 'sitDown', 'standUp', ...GESTURE_NAMES]

/** Crossfade durations (s) for specific state pairs; DEFAULT_FADE otherwise. */
const PAIR_FADES: Record<string, number> = {
  'idle|walk': 0.25,
  'walk|run': 0.15,
  'idle|run': 0.18,
  'idle|talk': 0.35,
}
const DEFAULT_FADE = 0.3
/** Fade into/out of the sit transition one-shots. */
const SIT_TRANSITION_FADE = 0.18
/** Hand-off fade at the end of sitDown/standUp (poses already match). */
const SIT_HANDOFF_FADE = 0.12
/** Gesture weight envelope. */
const GESTURE_FADE_IN = 0.15
const GESTURE_FADE_OUT = 0.25

function fadeBetween(a: MachineState, b: MachineState): number {
  return PAIR_FADES[`${a}|${b}`] ?? PAIR_FADES[`${b}|${a}`] ?? DEFAULT_FADE
}

export interface HipsRebase {
  /** Reference-skeleton hips rest local position (canonical: [0, 0.34, 0]). */
  from: readonly [number, number, number]
  /** Live skeleton's hips rest local position (captured at assembly). */
  to: readonly [number, number, number]
  /** Delta multiplier; defaults to to[1] / from[1] (body-height ratio). */
  deltaScale?: number
}

export interface ClipMachineOptions {
  /** Rewrite hips translation tracks for archetype proportions (see header). */
  hipsRebase?: HipsRebase
  /** Fallback mode: play gestures on the base layer instead of additively. */
  fullBodyGestures?: boolean
}

export interface ClipMachine {
  /** Advance the mixer + transition/gesture bookkeeping. `animation` phase. */
  update(dt: number): void
  /** Request a state. Illegal direct exits from sit route through standUp. */
  setState(state: MachineState): void
  /** The state whose base clip currently owns the base layer. */
  getState(): MachineState
  /** The most recently requested state (may differ mid-transition). */
  getDesiredState(): MachineState
  /** True while sitDown/standUp owns the base layer. */
  isTransitioning(): boolean
  /** Play a one-shot gesture. Returns false (ignored) if one is active. */
  playGesture(name: GestureName): boolean
  getActiveGesture(): GestureName | null
  /** Playback-rate for walk/run only (gait sync: rootSpeed / clipRefSpeed). */
  setLocomotionTimeScale(scale: number): void
  /** Debug/test: a clip action's current effective weight (0 if never played). */
  getWeight(clipName: string): number
  /** Debug/test: a clip action's local time. */
  getTime(clipName: string): number
  /** Stop all actions (does not touch the mixer's other clips). */
  dispose(): void
}

export function createClipMachine(
  mixer: AnimationMixer,
  clips: AnimationClip[],
  options: ClipMachineOptions = {},
): ClipMachine {
  const { hipsRebase, fullBodyGestures = false } = options

  const byName = new Map<string, AnimationClip>()
  for (const clip of clips) byName.set(clip.name, clip)
  for (const name of REQUIRED_CLIPS) {
    if (!byName.has(name)) throw new Error(`clip machine: clip set is missing "${name}"`)
  }

  // Clone before mutating: loaded clips are shared by the asset cache.
  function prepared(name: string): AnimationClip {
    const clip = byName.get(name)!.clone()
    if (hipsRebase) {
      const { from, to } = hipsRebase
      const deltaScale = hipsRebase.deltaScale ?? to[1] / from[1]
      for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) continue
        // Translation is only authored on hips (clip-contract, test-enforced).
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = to[0] + (track.values[i] - from[0]) * deltaScale
          track.values[i + 1] = to[1] + (track.values[i + 1] - from[1]) * deltaScale
          track.values[i + 2] = to[2] + (track.values[i + 2] - from[2]) * deltaScale
        }
      }
    }
    return clip
  }

  const actions = new Map<string, AnimationAction>()
  for (const state of Object.keys(BASE_CLIP) as MachineState[]) {
    const action = mixer.clipAction(prepared(BASE_CLIP[state]))
    action.setLoop(LoopRepeat, Infinity)
    actions.set(BASE_CLIP[state], action)
  }
  for (const name of ['sitDown', 'standUp']) {
    const action = mixer.clipAction(prepared(name))
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    actions.set(name, action)
  }
  for (const name of GESTURE_NAMES) {
    const clip = prepared(name)
    if (!fullBodyGestures) {
      // Additive delta from the clip's own first frame (== rest pose, so the
      // delta starts and ends at zero).
      AnimationUtils.makeClipAdditive(clip)
      clip.blendMode = AdditiveAnimationBlendMode
    }
    const action = mixer.clipAction(clip)
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    actions.set(name, action)
  }

  function action(name: string): AnimationAction {
    const found = actions.get(name)
    if (!found) throw new Error(`clip machine: no action for "${name}"`)
    return found
  }

  // --- base layer -----------------------------------------------------------

  let current: MachineState = 'idle'
  let desired: MachineState = 'idle'
  /** Non-null while a sit transition one-shot owns the base layer. */
  let transition: { name: 'sitDown' | 'standUp'; act: AnimationAction; handedOff: boolean } | null = null
  let locomotionTimeScale = 1
  let baseAction: AnimationAction = action(BASE_CLIP.idle)
  baseAction.play()

  function applyLocomotionTimeScale(): void {
    for (const name of ['walk', 'run']) {
      action(name).setEffectiveTimeScale(locomotionTimeScale)
    }
  }
  applyLocomotionTimeScale()

  /** Start `next` and crossfade the current base-layer action into it. */
  function handBaseLayerTo(next: AnimationAction, duration: number): void {
    next.reset()
    next.enabled = true
    next.setEffectiveWeight(1)
    next.play()
    if (next !== baseAction) next.crossFadeFrom(baseAction, duration, false)
    baseAction = next
  }

  function beginSitTransition(name: 'sitDown' | 'standUp'): void {
    const act = action(name)
    handBaseLayerTo(act, SIT_TRANSITION_FADE)
    transition = { name, act, handedOff: false }
  }

  function fadeToState(next: MachineState): void {
    const duration = fadeBetween(current, next)
    handBaseLayerTo(action(BASE_CLIP[next]), duration)
    current = next
  }

  /** Steady-state arbitration: one transition decision per update. */
  function advanceBase(): void {
    if (transition) {
      const clipDuration = transition.act.getClip().duration
      if (!transition.handedOff && transition.act.time >= clipDuration - SIT_HANDOFF_FADE) {
        transition.handedOff = true
        if (transition.name === 'sitDown') {
          // sitDown's end pose == sitIdle's start pose: short blend, no pop.
          handBaseLayerTo(action(BASE_CLIP.sit), SIT_HANDOFF_FADE)
          current = 'sit'
        } else {
          // standUp ends on the rest pose; land on the desired state (idle
          // if the target is sit again — the next update re-enters).
          const landing = desired === 'sit' ? 'idle' : desired
          handBaseLayerTo(action(BASE_CLIP[landing]), SIT_HANDOFF_FADE)
          current = landing
        }
        transition = null
      }
      return
    }
    if (desired === current) return
    if (current === 'sit') {
      // Any exit from sit — including illegal direct jumps (sit -> run) —
      // routes through standUp.
      beginSitTransition('standUp')
    } else if (desired === 'sit') {
      beginSitTransition('sitDown')
    } else {
      fadeToState(desired)
    }
  }

  // --- gesture layer ----------------------------------------------------------

  let gesture: { name: GestureName; act: AnimationAction; elapsed: number } | null = null

  function playGesture(name: GestureName): boolean {
    if (gesture) return false
    const act = action(name)
    act.reset()
    act.enabled = true
    act.setEffectiveTimeScale(1)
    act.setEffectiveWeight(0)
    act.play()
    if (fullBodyGestures) {
      // Fallback path: the gesture interrupts the base layer and hands back.
      act.setEffectiveWeight(1)
      act.crossFadeFrom(baseAction, GESTURE_FADE_IN, false)
    }
    gesture = { name, act, elapsed: 0 }
    return true
  }

  function advanceGesture(dt: number): void {
    if (!gesture) return
    gesture.elapsed += dt
    const duration = gesture.act.getClip().duration
    if (fullBodyGestures) {
      // Hand the base layer back near the end (gesture ends on rest pose).
      if (gesture.elapsed >= duration - GESTURE_FADE_OUT) {
        const base = baseAction
        base.reset()
        base.enabled = true
        base.setEffectiveWeight(1)
        base.play()
        base.crossFadeFrom(gesture.act, GESTURE_FADE_OUT, false)
        gesture = null
      }
      return
    }
    // Additive path: weight envelope in/out (the delta itself also starts and
    // ends at zero, so this is belt-and-braces smoothing).
    const tIn = Math.min(1, gesture.elapsed / GESTURE_FADE_IN)
    const tOut = Math.min(1, Math.max(0, duration - gesture.elapsed) / GESTURE_FADE_OUT)
    gesture.act.setEffectiveWeight(Math.min(tIn, tOut))
    if (gesture.elapsed >= duration) {
      gesture.act.stop()
      gesture = null
    }
  }

  // --- public API -----------------------------------------------------------

  return {
    update(dt: number): void {
      advanceBase()
      advanceGesture(dt)
      mixer.update(dt)
    },
    setState(state: MachineState): void {
      desired = state
    },
    getState: () => current,
    getDesiredState: () => desired,
    isTransitioning: () => transition !== null,
    playGesture,
    getActiveGesture: () => gesture?.name ?? null,
    setLocomotionTimeScale(scale: number): void {
      locomotionTimeScale = scale
      applyLocomotionTimeScale()
    },
    getWeight: (clipName: string) => {
      const act = actions.get(clipName)
      // Never-played / stopped / clamp-finished actions contribute nothing
      // (three reports their DEFAULT weight, 1, until they first run).
      return act?.isRunning() ? act.getEffectiveWeight() : 0
    },
    getTime: (clipName: string) => actions.get(clipName)?.time ?? 0,
    dispose(): void {
      for (const act of actions.values()) {
        act.stop()
        mixer.uncacheClip(act.getClip())
      }
      gesture = null
      transition = null
    },
  }
}
