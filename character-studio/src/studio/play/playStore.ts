// Play Mode store (plan 007 step 5) — DOM controls (PlayControls) and the
// in-canvas driver (PlayMode) share this. Studio-level, never persisted.

import { create } from 'zustand'
import type { GestureName, MachineState } from '../../core/motion/clipStateMachine'
import { RUN_SPEED, WALK_SPEED } from '../../core/motion/locomotion'

export type StudioMode = 'studio' | 'play'
export type CameraPreset = 'orbit' | 'follow' | 'face'

/** Preset speeds the state buttons command. */
export const STATE_SPEEDS: Record<MachineState, number> = {
  idle: 0,
  walk: WALK_SPEED,
  run: RUN_SPEED,
  sit: 0,
  talk: 0,
}

export interface PlayState {
  mode: StudioMode
  /** Requested machine state (the driver reconciles it with speed). */
  desiredState: MachineState
  /** Commanded ground speed (slider / state buttons). */
  speed: number
  cameraPreset: CameraPreset
  soak: boolean
  /** Bumps on each gesture button press; the driver consumes it. */
  gestureRequest: { name: GestureName; seq: number } | null
  /** Live readout published by the driver for the control strip. */
  liveState: MachineState
  setMode(mode: StudioMode): void
  requestState(state: MachineState): void
  setSpeed(speed: number): void
  setCameraPreset(preset: CameraPreset): void
  setSoak(soak: boolean): void
  requestGesture(name: GestureName): void
}

export const usePlayStore = create<PlayState>((set) => ({
  mode: 'studio',
  desiredState: 'idle',
  speed: 0,
  cameraPreset: 'orbit',
  soak: false,
  gestureRequest: null,
  liveState: 'idle',
  setMode: (mode) =>
    set(
      mode === 'play'
        ? { mode }
        : // Leaving play resets the session so re-entering starts clean.
          { mode, desiredState: 'idle', speed: 0, soak: false, gestureRequest: null },
    ),
  requestState: (state) => set({ desiredState: state, speed: STATE_SPEEDS[state] }),
  // Dragging the slider puts the machine under locomotion control: the
  // driver maps speed -> idle/walk/run (sit/talk are button-only states).
  setSpeed: (speed) =>
    set((prev) => ({
      speed,
      desiredState:
        prev.desiredState === 'sit' || prev.desiredState === 'talk'
          ? speed > 0.05
            ? 'walk'
            : prev.desiredState
          : prev.desiredState,
    })),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setSoak: (soak) => set({ soak }),
  requestGesture: (name) =>
    set((prev) => ({ gestureRequest: { name, seq: (prev.gestureRequest?.seq ?? 0) + 1 } })),
}))
