// Ordered update registry for the per-frame simulation pipeline.
//
// Plan 000 §2.2: animation drives, physics follows. Every subsystem that
// needs a per-frame update (skeletal animation, spring-bone physics,
// procedural motion, render-adjacent bookkeeping) registers a callback
// against a phase, and `runFrame` executes phases in a fixed order —
// regardless of registration order. This lets plan 003 (procedural motion)
// and plan 007 (physics/spring-bones) land independently while keeping the
// contract that physics always reacts to animation, never the other way
// around.

export type FramePhase = 'animation' | 'physics' | 'procedural' | 'render'

export type FrameUpdateFn = (dt: number) => void

const PHASE_ORDER: readonly FramePhase[] = ['animation', 'physics', 'procedural', 'render']

const registry: Record<FramePhase, FrameUpdateFn[]> = {
  animation: [],
  physics: [],
  procedural: [],
  render: [],
}

/** Register a per-frame update callback for the given phase. */
export function registerUpdate(phase: FramePhase, fn: FrameUpdateFn): void {
  registry[phase].push(fn)
}

/** Remove a previously registered callback from the given phase. */
export function unregisterUpdate(phase: FramePhase, fn: FrameUpdateFn): void {
  const fns = registry[phase]
  const index = fns.indexOf(fn)
  if (index !== -1) {
    fns.splice(index, 1)
  }
}

/** Run one frame: execute every registered callback, phase by phase, in the fixed phase order. */
export function runFrame(dt: number): void {
  for (const phase of PHASE_ORDER) {
    for (const fn of registry[phase]) {
      fn(dt)
    }
  }
}

/** Test/dev helper: clear all registered callbacks. */
export function clearFrameLoop(): void {
  for (const phase of PHASE_ORDER) {
    registry[phase].length = 0
  }
}
