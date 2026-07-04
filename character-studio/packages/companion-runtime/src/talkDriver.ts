// Talk driver (plan 007 step 4) — amplitude-driven mouth flaps, the
// met4citizen/TalkingHead pattern simplified (plan 000 §2.2): a 0–1
// amplitude signal indexes the atlas viseme cells. This is literally the AC
// model ("Animalese" + simple mouth); real grapheme lip-sync can land later
// because the atlas already reserves the viseme cells.
//
// No audio dependency: the amplitude source is a callable, and
// makeSpeechSynthAmplitude builds a deterministic synthetic one (syllabic
// noise under a phrase envelope) so Play Mode demos talking without TTS.
//
// Pure logic — no three, no React, injected seeded RNG only.

import { createValueNoise1d, type Rng } from './noise'

/** Mouth cells the driver writes (viseme cells + neutral micro-closes). */
export type VisemeCell = 'vMm' | 'vEe' | 'vAa' | 'vOh' | 'neutral'

/**
 * The one face capability the driver needs. `faceRig.setMouthOverride`
 * satisfies it: non-null overrides the expression's mouth cell, null hands
 * the mouth back to the expression.
 */
export interface TalkMouth {
  setMouthOverride(cell: VisemeCell | null): void
}

/** Amplitude in [0,1] at driver-time `t` seconds (monotonic per start()). */
export type AmplitudeSource = (t: number) => number

/** Amplitude -> cell thresholds (ascending openness). */
const T_MM = 0.1
const T_EE = 0.38
const T_AA = 0.68

/** Minimum time a cell stays on screen (anti-flicker), seconds. */
const HOLD_MIN = 0.06
const HOLD_MAX = 0.09

/** Falling-edge dip that can trigger a word-boundary micro-close. */
const DIP_FROM = 0.3
const DIP_TO = 0.12
const MICRO_CLOSE_CHANCE = 0.45
const NOD_CHANCE = 0.12

export interface TalkDriverOptions {
  /** Called (at seeded-rng rate) at word-ish boundaries — wire to gestureNod. */
  onNod?: () => void
}

export interface TalkDriver {
  start(source: AmplitudeSource): void
  stop(): void
  isTalking(): boolean
  /** Advance; call every frame (procedural phase). No-op while stopped. */
  update(dt: number): void
  /** Currently shown cell (null while stopped). */
  getCell(): VisemeCell | null
}

function amplitudeCell(amp: number): VisemeCell {
  if (amp < T_MM) return 'vMm'
  if (amp < T_EE) return 'vEe'
  if (amp < T_AA) return 'vAa'
  return 'vOh'
}

export function createTalkDriver(mouth: TalkMouth, rng: Rng, options: TalkDriverOptions = {}): TalkDriver {
  let source: AmplitudeSource | null = null
  let t = 0
  let cell: VisemeCell | null = null
  let heldFor = 0
  let holdTime = 0
  let prevAmp = 0
  /** One micro-close per dip: armed when amplitude rises past DIP_FROM. */
  let dipArmed = false

  function nextHold(): number {
    return HOLD_MIN + rng() * (HOLD_MAX - HOLD_MIN)
  }

  function show(next: VisemeCell): void {
    cell = next
    heldFor = 0
    holdTime = nextHold()
    mouth.setMouthOverride(next)
  }

  return {
    start(amplitudeSource: AmplitudeSource): void {
      source = amplitudeSource
      t = 0
      prevAmp = 0
      dipArmed = false
      show(amplitudeCell(amplitudeSource(0)))
    },
    stop(): void {
      source = null
      cell = null
      mouth.setMouthOverride(null)
    },
    isTalking: () => source !== null,
    getCell: () => cell,
    update(dt: number): void {
      if (!source || dt <= 0) return
      t += dt
      heldFor += dt
      const raw = source(t)
      const amp = raw < 0 ? 0 : raw > 1 ? 1 : raw

      let desired = amplitudeCell(amp)
      if (amp >= DIP_FROM) dipArmed = true
      if (dipArmed && prevAmp >= DIP_TO && amp < DIP_TO) {
        // Word-ish boundary: amplitude just dipped. Occasionally close the
        // mouth fully and occasionally nod along.
        dipArmed = false
        if (rng() < MICRO_CLOSE_CHANCE) desired = 'neutral'
        if (options.onNod && rng() < NOD_CHANCE) options.onNod()
      }
      prevAmp = amp

      if (desired !== cell && heldFor >= holdTime) show(desired)
    },
  }
}

/**
 * Deterministic speech-shaped amplitude (plan 007 step 4 stub): syllabic
 * value noise (~5 Hz) under a slow phrase envelope with soft inter-phrase
 * pauses. Same seed, same "speech".
 */
export function makeSpeechSynthAmplitude(rng: Rng): AmplitudeSource {
  const syllable = createValueNoise1d(rng)
  const phrase = createValueNoise1d(rng)
  return (t: number) => {
    // Value-noise lattice spacing is 1 unit -> t*5 gives the 4–6 Hz syllable
    // rhythm; the envelope gates phrases (~0.5–2 s) with eased edges.
    const syl = syllable(t * 5)
    const ph = phrase(t * 0.55)
    const gateU = Math.min(1, Math.max(0, (ph - 0.32) / 0.16))
    const gate = gateU * gateU * (3 - 2 * gateU)
    const amp = (syl * 1.5 - 0.2) * gate
    return amp < 0 ? 0 : amp > 1 ? 1 : amp
  }
}
