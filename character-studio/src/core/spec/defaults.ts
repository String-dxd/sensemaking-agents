// Default CharacterSpec factory (plan 004, step 2).
//
// `createDefaultCharacter` always parses its own output through
// `CharacterSpecSchema` before returning — construction must never emit an
// invalid spec, so a schema change that silently breaks the factory fails
// loudly here instead of downstream.

import { DEFAULT_STUDIO_LOOK_PRESET, studioLookFromPreset } from './lighting'
import type { SpringChainDef, SpringJointParams } from '../motion/springTypes'
import {
  type Archetype,
  type CharacterSpec,
  CharacterSpecSchema,
  type Personality,
  SPEC_VERSION,
} from './schema'

// --- personality -> face defaults (관상/gwansang grammar, plan 000 §2.1b) ---
//
// Every value here is a default; the designer can override any of it per
// character. `atlasId` values resolve through the plan-006 atlas registry
// (`../face/atlasRegistry.ts`): gentle/cheerful/proud/gruff have authored
// 관상 art; calm/mischievous alias grammar-nearest sets until authored.
//
// `defaultExpression` is chosen from plan 002's existing EXPRESSION_PRESETS
// keys (neutral/happy/sad/angry/surprised/sleepy/love/dizzy/wink) — the only
// preset with a grin-shaped mouth is `happy`, so personalities whose 관상
// table entry calls for a grin/smirk mouth (cheerful, mischievous) resolve to
// `happy` here; personalities calling for a neutral/smug/downturned mouth
// (proud, gruff, calm) resolve to `neutral`. Plan 006 can add dedicated
// presets (e.g. a real smirk) without a spec migration since this field is a
// plain string.
export interface PersonalityFaceDefaults {
  atlasId: string
  pupilScale: number
  blinkMeanIntervalS: number
  gazeIntensity: number
  defaultExpression: string
}

export const PERSONALITY_FACE_DEFAULTS: Record<Personality, PersonalityFaceDefaults> = {
  gentle: {
    atlasId: 'face-gentle',
    pupilScale: 1.3,
    blinkMeanIntervalS: 4.5,
    gazeIntensity: 0.5,
    // neutral, not happy: gentle's 관상 signature is the wide-open pure
    // eyes + small soft smile (its neutral mouth cell). The happy preset's
    // closed-arc eyes hid exactly the trait that makes gentle read gentle.
    defaultExpression: 'neutral',
  },
  cheerful: {
    atlasId: 'face-cheerful',
    pupilScale: 1.25,
    blinkMeanIntervalS: 2.5,
    gazeIntensity: 0.7,
    defaultExpression: 'happy',
  },
  proud: {
    atlasId: 'face-proud',
    pupilScale: 1.0,
    blinkMeanIntervalS: 5.5,
    gazeIntensity: 0.85,
    defaultExpression: 'neutral',
  },
  gruff: {
    atlasId: 'face-gruff',
    pupilScale: 0.75,
    blinkMeanIntervalS: 7,
    gazeIntensity: 0.9,
    defaultExpression: 'neutral',
  },
  calm: {
    atlasId: 'face-calm',
    pupilScale: 1.1,
    blinkMeanIntervalS: 5,
    gazeIntensity: 0.4,
    defaultExpression: 'neutral',
  },
  mischievous: {
    atlasId: 'face-mischievous',
    pupilScale: 1.15,
    blinkMeanIntervalS: 3,
    gazeIntensity: 0.75,
    // neutral shows the authored asymmetric smirk + foxy upturned eyes
    // (dedicated atlas landed in the polish pass; happy hid both).
    defaultExpression: 'neutral',
  },
}

const DEFAULT_IRIS_COLOR = '#4a2f1f'

// --- default anatomy parts per archetype (plan 006) --------------------------
//
// PartIds live in `../skeleton/partRegistry.ts` (imported nowhere here to
// keep defaults dependency-light; partRegistry tests assert these ids exist).
const DEFAULT_PARTS: Record<Archetype, CharacterSpec['anatomy']['parts']> = {
  'biped-round': {
    ears: { partId: 'upright-pointy', morphs: {} },
    muzzle: { partId: 'short-cat', morphs: {} },
    tail: { partId: 'stub-round', morphs: {} },
    claws: { partId: 'mitten-none', morphs: {} },
    crest: { partId: 'none', morphs: {} },
  },
  'biped-slim': {
    ears: { partId: 'bunny-tall', morphs: {} },
    muzzle: { partId: 'short-cat', morphs: {} },
    tail: { partId: 'fluff-fox', morphs: {} },
    claws: { partId: 'mitten-none', morphs: {} },
    crest: { partId: 'none', morphs: {} },
  },
  bird: {
    muzzle: { partId: 'beak-small', morphs: {} },
    tail: { partId: 'feather-fan', morphs: {} },
    claws: { partId: 'mitten-none', morphs: {} },
    crest: { partId: 'feather-tuft', morphs: {} },
  },
}

// --- default spring rig per archetype ---------------------------------------
//
// Values copied (not imported — `src/core/**` must not depend on
// `src/studio/**`) from the plan-003 motion-feel-gate tuning in the studio
// viewport's placeholder-body component (`EAR_PARAMS`/`TAIL_PARAMS`/`CHAINS`,
// as of commit 69df998). See that component's comment for the tuning
// rationale (hop/shake/walk probes against the earL tip particle).
const EAR_PARAMS: SpringJointParams = {
  stiffness: 0.25,
  gravityPower: 30,
  gravityDir: [0, -1, 0],
  dragForce: 0.12,
  hitRadius: 0.02,
}

const TAIL_PARAMS: SpringJointParams = {
  stiffness: 0.3,
  gravityPower: 25,
  gravityDir: [0, -1, 0],
  dragForce: 0.1,
  hitRadius: 0.02,
}

const BIPED_SPRING_RIG: SpringChainDef[] = [
  {
    name: 'earL',
    boneNames: ['earL.1', 'earL.2'],
    joints: [{ ...EAR_PARAMS }, { ...EAR_PARAMS }],
    colliderGroupRefs: ['head'],
  },
  {
    name: 'earR',
    boneNames: ['earR.1', 'earR.2'],
    joints: [{ ...EAR_PARAMS }, { ...EAR_PARAMS }],
    colliderGroupRefs: ['head'],
  },
  {
    name: 'tail',
    boneNames: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
    joints: [{ ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }],
    colliderGroupRefs: [],
  },
]

// Bird archetype: tail-feather chain only (no ears) — reuses the canonical
// `tail.*` bones with the same tuned TAIL_PARAMS.
const BIRD_SPRING_RIG: SpringChainDef[] = [
  {
    name: 'tailFeathers',
    boneNames: ['tail.1', 'tail.2', 'tail.3', 'tail.4'],
    joints: [{ ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }, { ...TAIL_PARAMS }],
    colliderGroupRefs: [],
  },
]

export function defaultSpringRig(archetype: Archetype): SpringChainDef[] {
  // biped-round and biped-slim share the same default chain set (ears + tail)
  // today — the sketch only calls out biped-round explicitly; biped-slim gets
  // the same rig pending plan-006 proportions.
  return archetype === 'bird' ? BIRD_SPRING_RIG.map((c) => ({ ...c })) : BIPED_SPRING_RIG.map((c) => ({ ...c }))
}

// Default per-region toon material params (plan 005 step 6 look gate).
// shadowTint is a slightly cool violet — the shadow side must read pastel,
// never gray (plan 000 §2.3). `authored` = the region mesh's own plan-006
// palette-mask pack (assembly resolves it per region).
const DEFAULT_MATERIAL_ASSIGN = {
  rampSoftness: 0.2,
  rimStrength: 0.3,
  shadowTint: '#b8a8c8',
  outline: false,
  textureId: 'authored',
} as const

const DEFAULT_MATERIALS: CharacterSpec['materials'] = {
  body: { ...DEFAULT_MATERIAL_ASSIGN },
  ears: { ...DEFAULT_MATERIAL_ASSIGN },
  muzzle: { ...DEFAULT_MATERIAL_ASSIGN },
  tail: { ...DEFAULT_MATERIAL_ASSIGN },
  claws: { ...DEFAULT_MATERIAL_ASSIGN },
}

const DEFAULT_PALETTE = {
  primary: '#e8a15c',
  secondary: '#f0b06a',
  belly: '#fdf1e0',
  accentA: '#8a5a34',
  accentB: '#3a2a20',
  padsNose: '#5a3a2a',
} as const

/** Default part loadout for an archetype (AnatomyPanel archetype switch). */
export function defaultAnatomyParts(archetype: Archetype): CharacterSpec['anatomy']['parts'] {
  return structuredClone(DEFAULT_PARTS[archetype])
}

/**
 * Build a fresh, schema-valid CharacterSpec for a given archetype and
 * personality (default `'gentle'`). Always parses its own output.
 */
export function createDefaultCharacter(archetype: Archetype, personality: Personality = 'gentle'): CharacterSpec {
  const faceDefaults = PERSONALITY_FACE_DEFAULTS[personality]
  const now = new Date().toISOString()

  const candidate: CharacterSpec = {
    meta: {
      id: crypto.randomUUID(),
      name: 'New Character',
      specVersion: SPEC_VERSION,
      archetype,
      personality,
      species: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    anatomy: {
      parts: structuredClone(DEFAULT_PARTS[archetype]),
      bodyMorphs: {},
    },
    face: {
      atlasId: faceDefaults.atlasId,
      expression: faceDefaults.defaultExpression,
      eyes: {
        pupilScale: faceDefaults.pupilScale,
        irisColor: DEFAULT_IRIS_COLOR,
      },
      blink: {
        meanIntervalS: faceDefaults.blinkMeanIntervalS,
        enabled: true,
      },
      gaze: {
        mode: 'idle',
        intensity: faceDefaults.gazeIntensity,
      },
    },
    palette: { ...DEFAULT_PALETTE },
    materials: structuredClone(DEFAULT_MATERIALS),
    wardrobe: [],
    motion: {
      clipSetId: 'core-v1',
      springRig: defaultSpringRig(archetype),
      procedural: {
        breathAmpl: 0.5,
        swayAmpl: 0.5,
        blinkEnabled: true,
        gazeEnabled: true,
      },
    },
    studioLook: studioLookFromPreset(DEFAULT_STUDIO_LOOK_PRESET),
  }

  return CharacterSpecSchema.parse(candidate)
}
