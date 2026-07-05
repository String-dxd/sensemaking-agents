// StudioLook schema (plan 010, step 1) — replaces the `z.unknown()`
// passthrough `CharacterSpec.studioLook` had carried since plan 004. Studio
// lighting is the designer's portrait/relight rig: it never ships into the
// runtime GLB (plan 011 records it for re-edit fidelity only — plan 000 §2.3,
// plan 010's own "out of scope" note). Pure data + zod: this file is `core`
// and must never import React (mechanically enforced by
// `test/core-no-react.test.ts`).
//
// `lighting.ts` is intentionally standalone from `./schema` (no import in
// either direction) so `schema.ts` can import `StudioLookSchema` without a
// cycle — `hexColorSchema` is duplicated here rather than shared for that
// reason; keep the two definitions in sync if the color format ever changes.

import { z } from 'zod'

export const STUDIO_LOOK_VERSION = 1

// --- primitives --------------------------------------------------------------

/** 6-digit hex color, e.g. "#e8a15c" (mirrors `./schema`'s `hexColorSchema`). */
const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a 6-digit hex color like #e8a15c')

/** World-space (x, y, z) — mirrors the `gravityDir` tuple pattern in `springTypes.ts`. */
const vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof vec3Schema>

// --- environment ---------------------------------------------------------------

export const BACKGROUND_MODES = ['gradient', 'hdri', 'solid'] as const
export const BackgroundModeSchema = z.enum(BACKGROUND_MODES)
export type BackgroundMode = z.infer<typeof BackgroundModeSchema>

const EnvironmentSchema = z
  .object({
    /** Resolves through `../../assets/hdri/registry.ts`; also legal on `'none'`. */
    hdriId: z.string().min(1),
    intensity: z.number().min(0).max(2),
    rotationDeg: z.number().min(0).max(360),
    background: BackgroundModeSchema,
    /** Only meaningful when `background === 'solid'`. */
    backgroundColor: hexSchema.optional(),
  })
  .strict()
export type StudioEnvironment = z.infer<typeof EnvironmentSchema>

// --- lights --------------------------------------------------------------------

export const LIGHT_TYPES = ['key', 'fill', 'rim', 'accent'] as const
export const LightTypeSchema = z.enum(LIGHT_TYPES)
export type LightType = z.infer<typeof LightTypeSchema>

export const MAX_LIGHTS = 4

const StudioLightSchema = z
  .object({
    id: z.string().min(1),
    type: LightTypeSchema,
    color: hexSchema,
    intensity: z.number().min(0).max(8),
    position: vec3Schema,
    /** Look-at height above the origin (the character stands at y=0). */
    targetHeight: z.number().min(0).max(1.5),
    castShadow: z.boolean(),
    /** 0 = hard shadow, 1 = maximally soft (drives shadow-map radius/blur). */
    shadowSoftness: z.number().min(0).max(1),
  })
  .strict()
export type StudioLight = z.infer<typeof StudioLightSchema>

// --- portrait camera bookmark (step 4) ------------------------------------------

const PortraitCameraSchema = z
  .object({
    position: vec3Schema,
    target: vec3Schema,
    fov: z.number().min(10).max(120),
  })
  .strict()
export type PortraitCamera = z.infer<typeof PortraitCameraSchema>

// --- root ------------------------------------------------------------------------

export const StudioLookSchema = z
  .object({
    version: z.literal(1),
    environment: EnvironmentSchema,
    lights: z.array(StudioLightSchema).min(1).max(MAX_LIGHTS),
    ambientFloor: z.number().min(0).max(1).default(0.45),
    /** Roster-thumbnail camera bookmark (plan 010 step 4; plan 011/012 consume it). */
    portraitCamera: PortraitCameraSchema.optional(),
  })
  .strict()

export type StudioLook = z.infer<typeof StudioLookSchema>

// --- presets (plan 010 step 1) ---------------------------------------------------
//
// `three-point-soft` reproduces the mood of the plan-001 hardcoded rig it
// replaces (hemisphere + single warm key at [2,4,3]) plus a soft fill/rim so
// the toon ramp's terminator has somewhere to land on the shadow side. The
// other three explore the schema's range for the step-2/step-3 visual gates.

function preset(look: StudioLook): StudioLook {
  return StudioLookSchema.parse(look)
}

export const STUDIO_LOOK_PRESETS = {
  'three-point-soft': preset({
    version: 1,
    environment: { hdriId: 'studio_small_08', intensity: 0.6, rotationDeg: 0, background: 'gradient' },
    lights: [
      {
        id: 'key',
        type: 'key',
        color: '#fff4e6',
        intensity: 2.2,
        position: [2, 4, 3],
        targetHeight: 0.9,
        castShadow: true,
        shadowSoftness: 0.5,
      },
      {
        id: 'fill',
        type: 'fill',
        color: '#cfe0ff',
        intensity: 0.7,
        position: [-2.5, 1.8, 2],
        targetHeight: 0.8,
        castShadow: false,
        shadowSoftness: 0,
      },
      {
        id: 'rim',
        type: 'rim',
        color: '#ffffff',
        intensity: 0.9,
        position: [-1, 3, -3],
        targetHeight: 1.1,
        castShadow: false,
        shadowSoftness: 0,
      },
    ],
    ambientFloor: 0.45,
  }),

  'golden-hour': preset({
    version: 1,
    // HDRI stays IBL-only: the photoreal golden_bay backdrop (parked cars,
    // buildings) clashed with the toon character — a deep warm dusk solid
    // keeps the mood and lets the low key sell the hour (polish pass).
    environment: {
      hdriId: 'golden_bay',
      intensity: 0.9,
      rotationDeg: 30,
      background: 'solid',
      backgroundColor: '#241820',
    },
    lights: [
      {
        id: 'key',
        type: 'key',
        color: '#ffbe6e',
        intensity: 2.6,
        position: [3.2, 1.4, 1.6],
        targetHeight: 0.9,
        castShadow: true,
        shadowSoftness: 0.7,
      },
      {
        id: 'fill',
        type: 'fill',
        color: '#ff8a5c',
        intensity: 0.5,
        position: [-2, 1.2, 2.4],
        targetHeight: 0.8,
        castShadow: false,
        shadowSoftness: 0,
      },
      {
        // cool dusk-sky kicker opposite the sun — separates the shadow side
        // from the warm backdrop instead of letting it go monochrome
        id: 'rim',
        type: 'rim',
        color: '#7a9cff',
        intensity: 1.1,
        position: [-2.2, 2.4, -2.6],
        targetHeight: 1.0,
        castShadow: false,
        shadowSoftness: 0,
      },
    ],
    ambientFloor: 0.38,
  }),

  'cool-studio': preset({
    version: 1,
    // brighter navy bg + stronger key / weaker fill: the original flattened
    // the character into a muddy silhouette on near-black (polish pass)
    environment: { hdriId: 'brown_photostudio_02', intensity: 0.5, rotationDeg: 0, background: 'solid', backgroundColor: '#25304a' },
    lights: [
      {
        id: 'key',
        type: 'key',
        color: '#dce8ff',
        intensity: 2.4,
        position: [1.6, 3.6, 3.2],
        targetHeight: 0.9,
        castShadow: true,
        shadowSoftness: 0.4,
      },
      {
        id: 'fill',
        type: 'fill',
        color: '#a8c0ff',
        intensity: 0.65,
        position: [-2.6, 2.2, 1.6],
        targetHeight: 0.85,
        castShadow: false,
        shadowSoftness: 0,
      },
      {
        id: 'rim',
        type: 'rim',
        color: '#e8f0ff',
        intensity: 0.7,
        position: [0, 2.6, -3.2],
        targetHeight: 1.0,
        castShadow: false,
        shadowSoftness: 0,
      },
    ],
    ambientFloor: 0.5,
  }),

  'dramatic-rim': preset({
    version: 1,
    environment: { hdriId: 'studio_small_03', intensity: 0.25, rotationDeg: 200, background: 'solid', backgroundColor: '#0c0c10' },
    lights: [
      {
        id: 'key',
        type: 'key',
        color: '#f0e0d0',
        intensity: 1.5,
        position: [1.2, 2.4, 2.4],
        targetHeight: 0.9,
        castShadow: true,
        shadowSoftness: 0.3,
      },
      {
        // pulled to the side-back so the blue edge actually catches the
        // silhouette (dead-behind barely registered through the toon ramp)
        id: 'rim',
        type: 'rim',
        color: '#8fd0ff',
        intensity: 4.2,
        position: [-2.2, 2.6, -2.4],
        targetHeight: 1.0,
        castShadow: false,
        shadowSoftness: 0,
      },
      {
        // subtle magenta kicker — at 1.4 it washed the whole lower body pink
        id: 'accent',
        type: 'accent',
        color: '#ff6ad0',
        intensity: 0.7,
        position: [2.4, 0.6, -2.2],
        targetHeight: 0.6,
        castShadow: false,
        shadowSoftness: 0,
      },
    ],
    ambientFloor: 0.15,
  }),
} satisfies Record<string, StudioLook>

export const STUDIO_LOOK_PRESET_IDS = Object.keys(STUDIO_LOOK_PRESETS) as Array<keyof typeof STUDIO_LOOK_PRESETS>
export type StudioLookPresetId = (typeof STUDIO_LOOK_PRESET_IDS)[number]

export const DEFAULT_STUDIO_LOOK_PRESET: StudioLookPresetId = 'three-point-soft'

/** Fresh clone of a preset — callers mutate the result freely. */
export function studioLookFromPreset(id: StudioLookPresetId): StudioLook {
  return structuredClone(STUDIO_LOOK_PRESETS[id])
}
