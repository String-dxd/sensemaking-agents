// CharacterSpec — the versioned data model every studio panel edits, every
// save/load round-trips, and every export compiles (plan 004, step 1).
//
// MIGRATION RULE (read before touching this file): every change to any
// schema below — adding/removing/renaming a field, tightening/loosening a
// range, adding an enum member — MUST bump SPEC_VERSION and add a matching
// entry to `MIGRATIONS` in `./migrate.ts`. Retrofitting migrations after
// designers have saved rosters is how tools corrupt work; the machinery
// exists from v1 even though v1→v1 is an identity transform today.
//
// Every object schema below is `.strict()` (unknown keys are parse errors —
// this is what keeps the export contract honest); `studioLook` was a
// `z.unknown()` passthrough until plan 010 gave it a real shape
// (`./lighting.ts` — imported, not redefined, same pattern as the
// `motion.springRig` import below).
//
// Field names for `motion.springRig` mirror `../motion/springTypes.ts`
// exactly (plan 003) — imported, not redefined, and statically asserted
// below to stay in sync. Bone names mirror the canonical skeleton in
// `plans/000-architecture-and-strategy.md` §5 exactly.

import { z } from 'zod'
import { StudioLookSchema } from './lighting'
import type { SpringChainDef, SpringJointParams } from '../motion/springTypes'

export const SPEC_VERSION = 3

// --- primitives -------------------------------------------------------------

/** 6-digit hex color, e.g. "#e8a15c". */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'expected a 6-digit hex color like #e8a15c')

const unitSchema = z.number().min(0).max(1)

// --- enums (shared vocabulary) ----------------------------------------------

export const ARCHETYPES = ['biped-round', 'biped-slim', 'bird'] as const
export const ArchetypeSchema = z.enum(ARCHETYPES)
export type Archetype = z.infer<typeof ArchetypeSchema>

export const PERSONALITIES = ['gentle', 'cheerful', 'proud', 'gruff', 'calm', 'mischievous'] as const
export const PersonalitySchema = z.enum(PERSONALITIES)
export type Personality = z.infer<typeof PersonalitySchema>

/** Canonical skeleton bone names (plan 000 §5) — the ONLY legal values. */
export const BONE_NAMES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'jaw',
  'earL.1',
  'earL.2',
  'earR.1',
  'earR.2',
  'tail.1',
  'tail.2',
  'tail.3',
  'tail.4',
  'shoulderL',
  'upperArmL',
  'foreArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'foreArmR',
  'handR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'toesL',
  'upperLegR',
  'lowerLegR',
  'footR',
  'toesR',
  'socket.hat',
  'socket.face',
  'socket.muzzle',
  'socket.torso',
  'socket.back',
  'socket.handL',
  'socket.handR',
] as const
export const BoneNameSchema = z.enum(BONE_NAMES)
export type BoneName = z.infer<typeof BoneNameSchema>

export const PART_SLOTS = ['ears', 'muzzle', 'tail', 'brows', 'claws', 'crest', 'wings'] as const
export const PartSlotSchema = z.enum(PART_SLOTS)
export type PartSlot = z.infer<typeof PartSlotSchema>

export const WEAR_SLOTS = [
  'headwear',
  'eyewear',
  'top',
  'bottom',
  'outfit',
  'neck',
  'back',
  'handheldL',
  'handheldR',
] as const
export const WearSlotSchema = z.enum(WEAR_SLOTS)
export type WearSlot = z.infer<typeof WearSlotSchema>

export const PALETTE_SLOTS = ['primary', 'secondary', 'belly', 'accentA', 'accentB', 'padsNose'] as const
export const PaletteSlotSchema = z.enum(PALETTE_SLOTS)
export type PaletteSlot = z.infer<typeof PaletteSlotSchema>

export const REGIONS = ['body', 'ears', 'muzzle', 'tail', 'claws'] as const
export const RegionSchema = z.enum(REGIONS)
export type Region = z.infer<typeof RegionSchema>

// --- anatomy ------------------------------------------------------------

const BoneScaleSchema = z
  .object({
    x: z.number().min(0.25).max(4),
    y: z.number().min(0.25).max(4),
    z: z.number().min(0.25).max(4),
  })
  .strict()

const PartEntrySchema = z
  .object({
    partId: z.string().min(1),
    morphs: z.record(z.string(), unitSchema),
    boneScales: z.record(BoneNameSchema, BoneScaleSchema).optional(),
  })
  .strict()

// Sculpt delta payload (plan 009, step 2). Fills the field plan 004 reserved
// as `{ baseMeshId, baseMeshVersion }` — additive on a reserved-OPTIONAL field
// that no saved spec ever carried, so SPEC_VERSION stays 1 (sanctioned by
// plan 009's scope; the migration rule above governs every future change).
//
// One layer per sculpted mesh primitive, sparse (only vertices with non-zero
// deltas) and quantized: `values` are INTEGER multiples of `quantum` meters
// (3 per index, geometry-local rest space). `meshVersion`/`vertexCount`
// guard against authored-asset changes (ASSET-CONTRACT.md: bumping
// baseMeshVersion invalidates saved sculpts loudly, never silently).
const SculptDeltaLayerSchema = z
  .object({
    /** Authored asset the mesh came from: `body-<archetype>` or a part id. */
    assetId: z.string().min(1),
    /** Mesh (primitive) name inside that asset. */
    meshName: z.string().min(1),
    meshVersion: z.number().int().nonnegative(),
    vertexCount: z.number().int().positive(),
    indices: z.array(z.number().int().nonnegative()),
    /** 3 integer quantum-multiples (x,y,z) per entry of `indices`. */
    values: z.array(z.number().int()),
  })
  .strict()
  .refine((layer) => layer.values.length === layer.indices.length * 3, {
    message: 'sculptDelta layer: values must hold exactly 3 components per index',
  })

const SculptDeltaRefSchema = z
  .object({
    baseMeshId: z.string().min(1),
    baseMeshVersion: z.number().int().nonnegative(),
    /** Serialization quantum in meters (SCULPT_QUANTUM at save time). */
    quantum: z.number().positive(),
    layers: z.array(SculptDeltaLayerSchema),
  })
  .strict()

export type SculptDeltaLayerPayload = z.infer<typeof SculptDeltaLayerSchema>
export type SculptDeltaPayload = z.infer<typeof SculptDeltaRefSchema>

const AnatomySchema = z
  .object({
    parts: z.record(PartSlotSchema, PartEntrySchema),
    bodyMorphs: z.record(z.string(), unitSchema),
    sculptDelta: SculptDeltaRefSchema.optional(),
  })
  .strict()

// --- face -----------------------------------------------------------------

const EyesSchema = z
  .object({
    pupilScale: z.number().min(0.5).max(1.5),
    irisColor: hexColorSchema,
  })
  .strict()

const BlinkSchema = z
  .object({
    meanIntervalS: z.number().min(0.5).max(15),
    enabled: z.boolean(),
  })
  .strict()

export const GAZE_MODES = ['idle', 'camera', 'target'] as const
const GazeSchema = z
  .object({
    mode: z.enum(GAZE_MODES),
    intensity: unitSchema,
  })
  .strict()

const FaceSchema = z
  .object({
    atlasId: z.string().min(1),
    /** Expression preset name (plan 002's EXPRESSION_PRESETS keys today; kept a
     * plain string so plan 006 can add personality-specific presets without a
     * spec migration). */
    expression: z.string().min(1),
    eyes: EyesSchema,
    blink: BlinkSchema,
    gaze: GazeSchema,
  })
  .strict()

// --- palette + materials ----------------------------------------------------

/** Full recolor map — every slot is required (unlike the partial maps below). */
const PaletteSchema = z
  .object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    belly: hexColorSchema,
    accentA: hexColorSchema,
    accentB: hexColorSchema,
    padsNose: hexColorSchema,
  })
  .strict()

const MaterialAssignSchema = z
  .object({
    rampSoftness: unitSchema,
    rimStrength: unitSchema,
    shadowTint: hexColorSchema,
    textureId: z.string().min(1).optional(),
    outline: z.boolean().optional(),
  })
  .strict()

const MaterialsSchema = z.record(RegionSchema, MaterialAssignSchema)

// --- wardrobe ---------------------------------------------------------------

export const EAR_MODES = ['through', 'under', 'replace'] as const
export type EarMode = (typeof EAR_MODES)[number]
const WornItemSchema = z
  .object({
    slot: WearSlotSchema,
    itemId: z.string().min(1),
    paletteOverrides: z.record(z.string(), hexColorSchema).optional(),
    /** Headwear only (AC hat-ears pattern). */
    earMode: z.enum(EAR_MODES).optional(),
  })
  .strict()

const WardrobeSchema = z.array(WornItemSchema)

// --- motion -----------------------------------------------------------------
//
// Zod-ified from ../motion/springTypes.ts. Field names must stay identical —
// the `_assert*` consts below fail to typecheck if the shapes drift apart.

const SpringJointParamsSchema = z
  .object({
    stiffness: z.number(),
    gravityPower: z.number(),
    gravityDir: z.tuple([z.number(), z.number(), z.number()]),
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

// Compile-time equality check against the plan-003 source of truth. If either
// type gains/loses/renames a field, one of these assignments stops
// typechecking — that's the point (schema.ts must import, not fork, the
// vocabulary).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : false) : false
// Exported (not just declared) so `noUnusedLocals` doesn't flag these —
// they exist purely to fail `pnpm typecheck` if the shapes drift apart.
export const _assertSpringJointParamsMatchesCore: AssertEqual<
  z.infer<typeof SpringJointParamsSchema>,
  SpringJointParams
> = true
export const _assertSpringChainDefMatchesCore: AssertEqual<
  z.infer<typeof SpringChainDefSchema>,
  SpringChainDef
> = true

const ProceduralParamsSchema = z
  .object({
    breathAmpl: unitSchema,
    swayAmpl: unitSchema,
    blinkEnabled: z.boolean(),
    gazeEnabled: z.boolean(),
  })
  .strict()

const MotionSchema = z
  .object({
    clipSetId: z.string().min(1),
    springRig: z.array(SpringChainDefSchema),
    procedural: ProceduralParamsSchema,
  })
  .strict()

// --- meta -------------------------------------------------------------------

const MetaSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(64),
    specVersion: z.literal(SPEC_VERSION),
    archetype: ArchetypeSchema,
    personality: PersonalitySchema.default('gentle'),
    /** Species preset id (src/core/species/registry.ts) or 'custom'.
     * Plain string, not an enum: adding a species must not require a spec
     * migration; unknown ids degrade to custom (registry lookup miss). */
    species: z.string().min(1).default('custom'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    author: z.string().min(1).optional(),
  })
  .strict()

// --- root ---------------------------------------------------------------

export const CharacterSpecSchema = z
  .object({
    meta: MetaSchema,
    anatomy: AnatomySchema,
    face: FaceSchema,
    palette: PaletteSchema,
    materials: MaterialsSchema,
    wardrobe: WardrobeSchema,
    motion: MotionSchema,
    /** Designer's studio/portrait lighting rig (plan 010) — studio-only, never baked into the runtime GLB. */
    studioLook: StudioLookSchema.optional(),
  })
  .strict()

export type CharacterSpec = z.infer<typeof CharacterSpecSchema>
export type PartEntry = z.infer<typeof PartEntrySchema>
export type BoneScale = z.infer<typeof BoneScaleSchema>
export type MaterialAssign = z.infer<typeof MaterialAssignSchema>
export type WornItem = z.infer<typeof WornItemSchema>
