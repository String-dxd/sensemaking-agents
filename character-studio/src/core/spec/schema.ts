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
// this is what keeps the export contract honest) EXCEPT `studioLook`, which
// is an intentional passthrough until plan 010 defines its shape.
//
// Field names for `motion.springRig` mirror `../motion/springTypes.ts`
// exactly (plan 003) — imported, not redefined, and statically asserted
// below to stay in sync. Bone names mirror the canonical skeleton in
// `plans/000-architecture-and-strategy.md` §5 exactly.

import { z } from 'zod'
import type { SpringChainDef, SpringJointParams } from '../motion/springTypes'

export const SPEC_VERSION = 1

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

export const PART_SLOTS = ['ears', 'muzzle', 'tail', 'brows', 'claws', 'crest'] as const
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

const SculptDeltaRefSchema = z
  .object({
    baseMeshId: z.string().min(1),
    /** Payload/versioning contract defined in plan 009. */
    baseMeshVersion: z.number().int().nonnegative(),
  })
  .strict()

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
    /** Plan 010 fills this in; intentionally unvalidated passthrough until then. */
    studioLook: z.unknown().optional(),
  })
  .strict()

export type CharacterSpec = z.infer<typeof CharacterSpecSchema>
export type PartEntry = z.infer<typeof PartEntrySchema>
export type BoneScale = z.infer<typeof BoneScaleSchema>
export type MaterialAssign = z.infer<typeof MaterialAssignSchema>
export type WornItem = z.infer<typeof WornItemSchema>
