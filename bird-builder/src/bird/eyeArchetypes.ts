// The 8 eye archetypes — a PURE lookup table of eye-param deltas that override
// the species character before the face is painted. This is the highest-leverage
// per-individual identity surface (the AC lesson: villagers of one species are
// distinguished mostly by the FACE). The DOM canvas painter (rig layer) reads the
// resolved character; this table never touches the canvas, so it stays pure +
// node-testable.

import type { EyeArchetype } from './genome'

// The subset of CharacterConfig fields an archetype may set (all eye-related).
export interface EyeParams {
  eyeWhite?: number
  pupil?: number
  eyeSquash?: number
  eyeTilt?: number
  pupilScaleX?: number
  pupilScaleY?: number
  pupilOffsetY?: number
  upperLid?: number
  lowerLid?: number
  brow?: number
  browW?: number
  lash?: boolean
  shine?: boolean
  eyeRingColor?: string | null
}

export const EYE_ARCHETYPE_PARAMS: Record<EyeArchetype, EyeParams> = {
  // Round, open, glossy — the friendly default.
  button: { eyeWhite: 0.21, pupil: 0.13, eyeSquash: 0.32, pupilScaleX: 0.92, pupilScaleY: 0.96, upperLid: 0.0, lowerLid: 0.0, brow: -0.04, shine: true },
  // Soft, slightly hooded, lashes off — gentle.
  sweet: { eyeWhite: 0.2, pupil: 0.12, eyeSquash: 0.46, pupilScaleX: 0.8, pupilScaleY: 1.02, upperLid: 0.08, brow: 0.04, shine: true, lash: false },
  // Narrow, tilted up, strong brow — keen.
  sharp: { eyeWhite: 0.18, pupil: 0.1, eyeSquash: 0.62, eyeTilt: 0.13, pupilScaleX: 0.7, pupilScaleY: 1.2, upperLid: 0.06, brow: -0.18, browW: 0.21 },
  // Heavy lids top and bottom, low pupils — relaxed.
  sleepy: { eyeWhite: 0.17, pupil: 0.09, eyeSquash: 0.55, pupilScaleY: 0.7, upperLid: 0.46, lowerLid: 0.07, brow: 0.0, shine: false },
  // Huge whites + big pupils — bright/surprised.
  wide: { eyeWhite: 0.25, pupil: 0.15, eyeSquash: 0.34, pupilScaleX: 0.95, pupilScaleY: 1.0, upperLid: 0.0, brow: 0.12, shine: true },
  // Big sparkle + pale ring — twinkly.
  star: { eyeWhite: 0.23, pupil: 0.14, eyeSquash: 0.4, pupilScaleX: 0.88, pupilScaleY: 1.0, upperLid: 0.02, brow: 0.06, shine: true, eyeRingColor: '#fff3c4' },
  // Down-angled brows, tilted, taut — bold/grumpy.
  angular: { eyeWhite: 0.18, pupil: 0.1, eyeSquash: 0.5, eyeTilt: 0.16, pupilScaleX: 0.74, pupilScaleY: 1.1, upperLid: 0.1, lowerLid: 0.02, brow: -0.24, browW: 0.22 },
  // Cool half-mast lids, slight down-tilt — unimpressed/chic.
  'half-lid': { eyeWhite: 0.18, pupil: 0.1, eyeSquash: 0.5, eyeTilt: -0.12, pupilScaleX: 0.72, pupilScaleY: 0.7, upperLid: 0.4, lowerLid: 0.04, brow: -0.08, lash: true },
}
