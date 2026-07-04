// `SEN_companion` schema + reader for the runtime (plan 011 step 4).
//
// DUPLICATED from the studio's `src/core/export/senCompanion.ts` (STOP
// condition: sharing studio `core/` into this package would drag a bare
// `three` import + studio build graph in, breaking version-agnosticism). The
// shape MUST stay in lockstep: `test/schema-sync.test.ts` re-validates the
// same instance shape the studio exports, and the conformance suite compiles
// with the studio and parses here — a divergence fails both.
//
// The runtime never WRITES GLBs, so the gltf-transform Extension class is not
// duplicated; only the zod schema + a reader over the parsed GLTF JSON.

import { z } from 'zod'
import type { LoadedGLTF } from './three-types'

export const SEN_COMPANION_EXTENSION_NAME = 'SEN_companion'
export const SEN_COMPANION_EXT_VERSION = 1

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const SpringJointParamsSchema = z
  .object({
    stiffness: z.number(),
    gravityPower: z.number(),
    gravityDir: Vec3Schema,
    dragForce: z.number(),
    hitRadius: z.number(),
  })
  .strict()

const SpringChainDefSchema = z
  .object({
    name: z.string().min(1),
    boneNames: z.array(z.string().min(1)),
    joints: z.array(SpringJointParamsSchema),
    colliderGroupRefs: z.array(z.string()),
  })
  .strict()

const SphereColliderSchema = z
  .object({ boneName: z.string().min(1), offset: Vec3Schema, radius: z.number() })
  .strict()

const ColliderGroupSchema = z
  .object({ name: z.string().min(1), colliders: z.array(SphereColliderSchema) })
  .strict()

const AtlasCellSchema = z.tuple([z.number().int(), z.number().int()])
const CellMapSchema = z.record(z.string(), AtlasCellSchema)

const ExpressionPresetSchema = z
  .object({ eyeL: z.string(), eyeR: z.string(), brow: z.string(), mouth: z.string() })
  .strict()

const FaceSchema = z
  .object({
    planeNodeIndices: z.record(z.string(), z.number().int().nonnegative()),
    atlasTextureIndices: z.record(z.string(), z.number().int().nonnegative()),
    cellMaps: z
      .object({ eye: CellMapSchema, mouth: CellMapSchema, brow: CellMapSchema, pupil: CellMapSchema })
      .strict(),
    eyeCellsWithoutPupil: z.array(z.string()),
    expressionPresets: z.record(z.string(), ExpressionPresetSchema),
    mirroredPlanes: z.array(z.string()),
    defaultExpression: z.string().min(1),
    cellUv: z.number(),
    gazeMaxOffset: z.number(),
    pupilCell: z.string().min(1),
    blink: z.object({ meanIntervalS: z.number(), enabled: z.boolean() }).strict(),
    gaze: z.object({ mode: z.string(), intensity: z.number() }).strict(),
  })
  .strict()

const ProceduralParamsSchema = z
  .object({ breathAmpl: z.number(), swayAmpl: z.number(), blinkEnabled: z.boolean(), gazeEnabled: z.boolean() })
  .strict()

const MaterialMetaSchema = z
  .object({
    rampSoftness: z.number(),
    rimStrength: z.number(),
    shadowTint: hexSchema,
    outline: z.boolean().optional(),
    maskTextureIndex: z.number().int().nonnegative().nullable(),
  })
  .strict()

export const SenCompanionSchema = z
  .object({
    extVersion: z.number().int(),
    character: z
      .object({ id: z.string().min(1), name: z.string().min(1), archetype: z.string().min(1), personality: z.string().min(1).optional() })
      .strict(),
    springRig: z.array(SpringChainDefSchema),
    colliderGroups: z.array(ColliderGroupSchema),
    boneNodeIndices: z.record(z.string(), z.number().int().nonnegative()),
    face: FaceSchema,
    procedural: ProceduralParamsSchema,
    palette: z.record(z.string(), hexSchema),
    materialsMeta: z.record(z.string(), MaterialMetaSchema),
    clips: z.object({ setId: z.string().min(1), names: z.array(z.string()) }).strict(),
    studioLook: z.unknown().nullable(),
    editSpec: z.string().optional(),
  })
  .strict()

export type SenCompanionData = z.infer<typeof SenCompanionSchema>
export type SpringJointParams = z.infer<typeof SpringJointParamsSchema>
export type SpringChainDef = z.infer<typeof SpringChainDefSchema>
export type SphereCollider = z.infer<typeof SphereColliderSchema>
export type ColliderGroup = z.infer<typeof ColliderGroupSchema>
export type AtlasCell = z.infer<typeof AtlasCellSchema>

/** Parse + validate; reject an unknown extVersion with a clear error. */
export function parseSenCompanion(raw: unknown): SenCompanionData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${SEN_COMPANION_EXTENSION_NAME}: extension data is missing or not an object`)
  }
  const version = (raw as { extVersion?: unknown }).extVersion
  if (version !== SEN_COMPANION_EXT_VERSION) {
    throw new Error(
      `${SEN_COMPANION_EXTENSION_NAME}: unsupported extVersion ${String(version)} — this runtime supports version ${SEN_COMPANION_EXT_VERSION} (re-export the character, or upgrade the runtime)`,
    )
  }
  return SenCompanionSchema.parse(raw)
}

/** Read `SEN_companion` from a host-parsed GLTF. three's GLTFLoader ignores
 * unknown document extensions but exposes the raw JSON via `parser.json`. */
export function readSenCompanion(gltf: LoadedGLTF): SenCompanionData {
  const json = gltf.parser?.json as { extensions?: Record<string, unknown> } | undefined
  const raw =
    json?.extensions?.[SEN_COMPANION_EXTENSION_NAME] ??
    (gltf.userData as { gltfExtensions?: Record<string, unknown> } | undefined)?.gltfExtensions?.[
      SEN_COMPANION_EXTENSION_NAME
    ]
  if (raw === undefined) {
    throw new Error(
      `${SEN_COMPANION_EXTENSION_NAME}: extension not found on the parsed GLTF — is this a compiled .companion.glb? (host must expose gltf.parser.json)`,
    )
  }
  return parseSenCompanion(raw)
}
