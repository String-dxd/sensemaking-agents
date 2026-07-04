// `SEN_companion` — the versioned, document-level glTF vendor extension that
// carries everything that makes a compiled companion *alive* (plan 011 step 1;
// plan 000 §2.5). Precedent: Mozilla Hubs `MOZ_hubs_components` — a schema'd
// extension, not throwaway `extras`.
//
// THE DIVISION OF LABOUR (documented here because it is the whole contract):
//   - STANDARD glTF carries everything a *generic* GLTFLoader needs to show a
//     textured, skinned, animated character: geometry, skin + inverse binds,
//     morph targets, 11 clips, unlit face planes (KHR_materials_unlit + a
//     KHR_texture_transform per cell), a PBR body fallback material.
//   - `SEN_companion` carries the ALIVE layer the standard format can't
//     express: spring-bone rig params (VRMC_springBone vocabulary), colliders,
//     the drawn-face cell/gaze/blink control data, procedural idle params,
//     palette + toon `materialsMeta` (so a host can rebuild the studio-grade
//     toon materials), the clip manifest, a record-only studioLook, and an
//     OPTIONAL gzipped edit-spec for a studio round-trip.
//
// `extVersion` is the compatibility contract with every shipped roster
// character: additive changes only within a version; a breaking shape bumps
// the version and the runtime supports N and N-1. Unknown versions are
// rejected with a clear error (never silently mis-parsed).
//
// Pure TS: this module imports only `zod` and studio type vocabularies — no
// three, no DOM. The gltf-transform Extension class (bottom of file) is the
// only thing that touches the writer; it holds one opaque JSON blob at the
// document root.

import { Extension, type ReaderContext, type WriterContext } from '@gltf-transform/core'
import { z } from 'zod'

export const SEN_COMPANION_EXTENSION_NAME = 'SEN_companion'
/** Current extension shape version. Bump only on a breaking change. */
export const SEN_COMPANION_EXT_VERSION = 1

// --- embedded vocabularies (kept as plain zod so the runtime can validate the
// blob without importing the studio) ----------------------------------------

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
  .object({
    boneName: z.string().min(1),
    offset: Vec3Schema,
    radius: z.number(),
  })
  .strict()

const ColliderGroupSchema = z
  .object({
    name: z.string().min(1),
    colliders: z.array(SphereColliderSchema),
  })
  .strict()

/** [col, row] into the 4×4 atlas grid (plan 002 immutable cell contract). */
const AtlasCellSchema = z.tuple([z.number().int(), z.number().int()])
const CellMapSchema = z.record(z.string(), AtlasCellSchema)

const ExpressionPresetSchema = z
  .object({
    eyeL: z.string(),
    eyeR: z.string(),
    brow: z.string(),
    mouth: z.string(),
  })
  .strict()

const FaceSchema = z
  .object({
    /** glTF node index of each drawn face plane. */
    planeNodeIndices: z.record(z.string(), z.number().int().nonnegative()),
    /** glTF texture index of each atlas (eye/pupil/brow/mouth). */
    atlasTextureIndices: z.record(z.string(), z.number().int().nonnegative()),
    /** The plan-002 4×4 cell tables, embedded so the runtime is self-sufficient. */
    cellMaps: z
      .object({
        eye: CellMapSchema,
        mouth: CellMapSchema,
        brow: CellMapSchema,
        pupil: CellMapSchema,
      })
      .strict(),
    /** Eye cells that have no eye-white region → hide the pupil plane. */
    eyeCellsWithoutPupil: z.array(z.string()),
    /** Named expression presets (eye/brow/mouth cell names). */
    expressionPresets: z.record(z.string(), ExpressionPresetSchema),
    /** Which face planes carry a mirrored-U geometry (gaze x is negated there). */
    mirroredPlanes: z.array(z.string()),
    defaultExpression: z.string().min(1),
    /** UV extent of one atlas cell (== 1/4). */
    cellUv: z.number(),
    /** Max gaze offset as a fraction of one cell (plan 002 GAZE_MAX). */
    gazeMaxOffset: z.number(),
    /** Pupil-atlas cell name shown by default (round/big/…). */
    pupilCell: z.string().min(1),
    /** Blink cadence + toggle from the spec. */
    blink: z.object({ meanIntervalS: z.number(), enabled: z.boolean() }).strict(),
    /** Gaze mode + intensity from the spec. */
    gaze: z.object({ mode: z.string(), intensity: z.number() }).strict(),
  })
  .strict()

const ProceduralParamsSchema = z
  .object({
    breathAmpl: z.number(),
    swayAmpl: z.number(),
    blinkEnabled: z.boolean(),
    gazeEnabled: z.boolean(),
  })
  .strict()

const MaterialMetaSchema = z
  .object({
    rampSoftness: z.number(),
    rimStrength: z.number(),
    shadowTint: hexSchema,
    outline: z.boolean().optional(),
    /** glTF texture index of the region's palette mask (null → flat primary). */
    maskTextureIndex: z.number().int().nonnegative().nullable(),
  })
  .strict()

export const SenCompanionSchema = z
  .object({
    extVersion: z.number().int(),
    character: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        archetype: z.string().min(1),
        personality: z.string().min(1).optional(),
      })
      .strict(),
    /** VRMC_springBone-vocabulary chain params; boneNames resolve via boneNodeIndices. */
    springRig: z.array(SpringChainDefSchema),
    colliderGroups: z.array(ColliderGroupSchema),
    /** boneName → glTF node index, so the runtime binds the rig against the parsed nodes
     * (three's GLTFLoader strips dots from names — indices are the stable handle). */
    boneNodeIndices: z.record(z.string(), z.number().int().nonnegative()),
    face: FaceSchema,
    procedural: ProceduralParamsSchema,
    palette: z.record(z.string(), hexSchema),
    materialsMeta: z.record(z.string(), MaterialMetaSchema),
    clips: z.object({ setId: z.string().min(1), names: z.array(z.string()) }).strict(),
    /** Record-only (the runtime ignores it); designer's portrait lighting. */
    studioLook: z.unknown().nullable(),
    /** OPTIONAL gzipped-then-base64 CharacterSpec JSON for a studio re-edit round-trip. */
    editSpec: z.string().optional(),
  })
  .strict()

export type SenCompanionData = z.infer<typeof SenCompanionSchema>

/**
 * Parse + validate a `SEN_companion` blob. Rejects an unknown `extVersion`
 * with a clear, actionable error BEFORE schema validation (so a future
 * character never silently mis-parses against an older runtime).
 */
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

// --- gltf-transform Extension -------------------------------------------------
//
// A single document-level property holding the opaque blob. This is what keeps
// the extension surviving meshopt compression and the round-trip through
// NodeIO/WebIO: gltf-transform only preserves `extensions` it has a registered
// Extension for (unregistered ones are dropped).

export class SENCompanionExtension extends Extension {
  static readonly EXTENSION_NAME = SEN_COMPANION_EXTENSION_NAME
  readonly extensionName = SEN_COMPANION_EXTENSION_NAME
  /** The document-level blob (set by the compiler, read back on parse). */
  private data: SenCompanionData | null = null

  setData(data: SenCompanionData): this {
    this.data = data
    return this
  }

  getData(): SenCompanionData | null {
    return this.data
  }

  read(context: ReaderContext): this {
    const json = context.jsonDoc.json
    const raw = json.extensions?.[SEN_COMPANION_EXTENSION_NAME]
    if (raw !== undefined) this.data = parseSenCompanion(raw)
    return this
  }

  write(context: WriterContext): this {
    if (this.data) {
      const json = context.jsonDoc.json
      json.extensions ??= {}
      json.extensions[SEN_COMPANION_EXTENSION_NAME] = this.data as unknown as Record<string, unknown>
    }
    return this
  }
}
