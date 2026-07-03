// Wardrobe item registry (plan 008, step 1) — the typed catalog the
// WardrobePanel picker and the dressing pass (./dress.ts) consume. Adding an
// item = drop a GLB (authored per src/assets/wardrobe/ASSET-CONTRACT
// "Wardrobe items" section) + one entry here; no other code.
//
// Every entry is validated against `WardrobeItemDefSchema` at module load
// (`buildWardrobeRegistry` throws on the first invalid entry), and every
// entry is PLAIN SERIALIZABLE DATA — no functions, no three objects — because
// plan 011 serializes worn-item metadata into the exported GLB.
//
// Attachment modes:
//   - socket   : rigid meshes parented to a socket bone (origin authored at
//                the socket's rest position; `attachBone` extra per mesh).
//   - skinned  : SkinnedMesh bound to canonical bones (± item-internal spring
//                bones declared in `springChains`); the dressing pass rebinds
//                onto the live body skeleton exactly like anatomy parts.
//   - mixed    : both in one GLB (backpack body rigid + strap tails skinned).
//
// Item-internal spring bones (scarf ends, drawstrings, straps) live INSIDE
// the item GLB, parented under a canonical bone. They are NOT canonical-
// skeleton bones (plan 000 §5 is untouched); the dressing pass grafts them
// onto the live skeleton and merges `springChains` into the character's
// spring rig — the part `springProfile` precedent, one level up.

import { z } from 'zod'
import type { SpringChainDef } from '../motion/springTypes'
import {
  BONE_NAMES,
  EAR_MODES,
  PALETTE_SLOTS,
  WEAR_SLOTS,
  type BoneName,
  type EarMode,
  type PaletteSlot,
  type WearSlot,
} from '../spec/schema'

// --- vocabulary ---------------------------------------------------------------

/** Body submesh regions a garment may hide (anti-poke-through, plan 000 §2.2). */
export const BODY_HIDE_REGIONS = ['torso', 'hips', 'upperLegs'] as const
export type BodyHideRegion = (typeof BODY_HIDE_REGIONS)[number]

const SOCKET_NAMES = BONE_NAMES.filter((n) => n.startsWith('socket.'))
const CANONICAL_BONE_SET = new Set<string>(BONE_NAMES)

// --- schema ---------------------------------------------------------------------

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
    boneNames: z.array(z.string().min(1)).min(1),
    joints: z.array(SpringJointParamsSchema),
    colliderGroupRefs: z.array(z.string()),
  })
  .strict()
  .refine((c) => c.joints.length === c.boneNames.length, {
    message: 'springChains: joints must match boneNames 1:1',
  })
  .refine((c) => c.boneNames.every((b) => !CANONICAL_BONE_SET.has(b)), {
    message: 'springChains: item chains must use item-internal bones, never canonical-skeleton bones',
  })

export const WardrobeItemDefSchema = z
  .object({
    slot: z.enum(WEAR_SLOTS),
    /** Panel display name. */
    label: z.string().min(1),
    /** GLB asset URL (Vite-resolved). */
    url: z.string().min(1),
    /** Channel-packed palette mask (R/G/B/A → primary/secondary/belly/accentA); null → flat primary. */
    maskUrl: z.string().min(1).nullable(),
    attach: z.enum(['socket', 'skinned', 'mixed']),
    /** Required for socket/mixed items: the socket rigid meshes mount on. */
    socket: z.enum(SOCKET_NAMES as [BoneName, ...BoneName[]]).optional(),
    /** Headwear only (AC hat-ears pattern); first entry is the item default. */
    earModes: z.array(z.enum(EAR_MODES)).min(1).optional(),
    /** Body submeshes to hide while worn (skinned tops/bottoms/outfits). */
    hideBodyRegions: z.array(z.enum(BODY_HIDE_REGIONS)).optional(),
    /** Spring chains over item-internal bones (scarf ends, drawstrings, straps). */
    springChains: z.array(SpringChainDefSchema).optional(),
    /** Palette slots the item's mask channels recolor (panel override pickers). */
    paletteSlots: z.array(z.enum(PALETTE_SLOTS)),
    /** Body-follow morph names baked into the garment GLB (subset of body morphs). */
    morphs: z.array(z.string().min(1)),
  })
  .strict()
  .refine((d) => d.earModes === undefined || d.slot === 'headwear', {
    message: 'earModes is a headwear-only field',
  })
  .refine((d) => d.attach === 'skinned' || d.socket !== undefined, {
    message: 'socket/mixed items must declare their socket',
  })
  .refine((d) => d.hideBodyRegions === undefined || ['top', 'bottom', 'outfit'].includes(d.slot), {
    message: 'hideBodyRegions only applies to top/bottom/outfit slots',
  })

export type WardrobeItemDef = z.infer<typeof WardrobeItemDefSchema> & {
  // narrow the zod output types back to the shared vocabulary
  slot: WearSlot
  socket?: BoneName
  earModes?: EarMode[]
  hideBodyRegions?: BodyHideRegion[]
  springChains?: SpringChainDef[]
  paletteSlots: PaletteSlot[]
}

export type WardrobeRegistryLike = Record<string, WardrobeItemDef>

/** Panel display names for the wear slots. */
export const WEAR_SLOT_LABELS: Record<WearSlot, string> = {
  headwear: 'Hat',
  eyewear: 'Eyes',
  top: 'Top',
  bottom: 'Bottom',
  outfit: 'Outfit',
  neck: 'Neck',
  back: 'Back',
  handheldL: 'L hand',
  handheldR: 'R hand',
}

/** Validate a registry candidate; throws with the offending item id. */
export function buildWardrobeRegistry<T extends Record<string, unknown>>(candidate: T): { [K in keyof T]: WardrobeItemDef } {
  for (const [itemId, def] of Object.entries(candidate)) {
    const result = WardrobeItemDefSchema.safeParse(def)
    if (!result.success) {
      throw new Error(`wardrobe registry: item "${itemId}" is invalid — ${result.error.issues[0]?.message ?? result.error.message}`)
    }
  }
  return candidate as { [K in keyof T]: WardrobeItemDef }
}

// --- spring-chain presets --------------------------------------------------------

const chain = (
  name: string,
  boneNames: string[],
  params: { stiffness: number; gravityPower: number; dragForce: number; hitRadius: number },
  colliderGroupRefs: string[] = [],
): SpringChainDef => ({
  name,
  boneNames,
  joints: boneNames.map(() => ({
    stiffness: params.stiffness,
    gravityPower: params.gravityPower,
    gravityDir: [0, -1, 0] as [number, number, number],
    dragForce: params.dragForce,
    hitRadius: params.hitRadius,
  })),
  colliderGroupRefs,
})

// Tuning notes (plan 003 vocabulary): garment chains are authored ALONG the
// body surface, so gravity must stay well below stiffness or the equilibrium
// sag (≈ g·dt²·(1−k)/k) buries the mesh in the torso — the chains reference
// the plan-008 "torso" collider group as a backstop while trailing. Scarf
// ends are trailing cloth (loosest); drawstrings are short cords (stiffest);
// backpack strap tails sit between the two.
const SCARF_CHAINS = [
  chain('scarfEndL', ['scarfL1', 'scarfL2', 'scarfL3'], { stiffness: 0.42, gravityPower: 8, dragForce: 0.14, hitRadius: 0.02 }, ['torso']),
  chain('scarfEndR', ['scarfR1', 'scarfR2', 'scarfR3'], { stiffness: 0.42, gravityPower: 8, dragForce: 0.14, hitRadius: 0.02 }, ['torso']),
]

const HOODIE_CHAINS = [
  chain('hoodieDrawL', ['hoodieDrawL1', 'hoodieDrawL2'], { stiffness: 0.5, gravityPower: 6, dragForce: 0.12, hitRadius: 0.012 }, ['torso']),
  chain('hoodieDrawR', ['hoodieDrawR1', 'hoodieDrawR2'], { stiffness: 0.5, gravityPower: 6, dragForce: 0.12, hitRadius: 0.012 }, ['torso']),
]

const BACKPACK_CHAINS = [
  chain('packStrapL', ['packStrapL1', 'packStrapL2'], { stiffness: 0.45, gravityPower: 8, dragForce: 0.12, hitRadius: 0.015 }, ['torso']),
  chain('packStrapR', ['packStrapR1', 'packStrapR2'], { stiffness: 0.45, gravityPower: 8, dragForce: 0.12, hitRadius: 0.015 }, ['torso']),
]

// --- the registry ------------------------------------------------------------------

const itemUrl = (file: string) => new URL(`../../assets/wardrobe/${file}`, import.meta.url).href
const maskUrl = (file: string) => new URL(`../../assets/wardrobe/textures/${file}`, import.meta.url).href

export const WARDROBE_REGISTRY = buildWardrobeRegistry({
  // --- headwear (rigid on socket.hat; AC hat-ears pattern) -----------------
  'cap-baseball': {
    slot: 'headwear',
    label: 'Baseball cap',
    url: itemUrl('cap-baseball.glb'),
    maskUrl: maskUrl('item-cap-baseball.mask.png'),
    attach: 'socket',
    socket: 'socket.hat',
    earModes: ['under', 'through'],
    paletteSlots: ['primary', 'accentA'],
    morphs: [],
  },
  beanie: {
    slot: 'headwear',
    label: 'Beanie',
    url: itemUrl('beanie.glb'),
    maskUrl: maskUrl('item-beanie.mask.png'),
    attach: 'socket',
    socket: 'socket.hat',
    earModes: ['under'],
    paletteSlots: ['primary', 'secondary'],
    morphs: [],
  },
  strawhat: {
    slot: 'headwear',
    label: 'Straw hat',
    url: itemUrl('strawhat.glb'),
    maskUrl: maskUrl('item-strawhat.mask.png'),
    attach: 'socket',
    socket: 'socket.hat',
    earModes: ['through'],
    paletteSlots: ['primary', 'accentA'],
    morphs: [],
  },

  // --- eyewear (rigid on socket.face) ---------------------------------------
  'sunglasses-round': {
    slot: 'eyewear',
    label: 'Round sunglasses',
    url: itemUrl('sunglasses-round.glb'),
    maskUrl: maskUrl('item-sunglasses-round.mask.png'),
    attach: 'socket',
    socket: 'socket.face',
    paletteSlots: ['primary', 'accentA'],
    morphs: [],
  },
  'glasses-square': {
    slot: 'eyewear',
    label: 'Square glasses',
    url: itemUrl('glasses-square.glb'),
    maskUrl: maskUrl('item-glasses-square.mask.png'),
    attach: 'socket',
    socket: 'socket.face',
    paletteSlots: ['primary'],
    morphs: [],
  },

  // --- tops (skinned; hide the body underneath) -------------------------------
  'tee-basic': {
    slot: 'top',
    label: 'Basic tee',
    url: itemUrl('tee-basic.glb'),
    maskUrl: maskUrl('item-tee-basic.mask.png'),
    attach: 'skinned',
    hideBodyRegions: ['torso', 'hips'],
    paletteSlots: ['primary', 'secondary'],
    morphs: ['bellyRound', 'chubby', 'slim'],
  },
  hoodie: {
    slot: 'top',
    label: 'Hoodie',
    url: itemUrl('hoodie.glb'),
    maskUrl: maskUrl('item-hoodie.mask.png'),
    attach: 'skinned',
    hideBodyRegions: ['torso', 'hips'],
    springChains: HOODIE_CHAINS,
    paletteSlots: ['primary', 'secondary', 'accentA'],
    morphs: ['bellyRound', 'chubby', 'slim'],
  },

  // --- neck ---------------------------------------------------------------------
  scarf: {
    slot: 'neck',
    label: 'Scarf',
    url: itemUrl('scarf.glb'),
    maskUrl: maskUrl('item-scarf.mask.png'),
    attach: 'skinned',
    springChains: SCARF_CHAINS,
    paletteSlots: ['primary', 'secondary'],
    morphs: [],
  },

  // --- back -----------------------------------------------------------------------
  'backpack-mini': {
    slot: 'back',
    label: 'Mini backpack',
    url: itemUrl('backpack-mini.glb'),
    maskUrl: maskUrl('item-backpack-mini.mask.png'),
    attach: 'mixed',
    socket: 'socket.back',
    springChains: BACKPACK_CHAINS,
    paletteSlots: ['primary', 'accentA'],
    morphs: [],
  },

  // --- handheld (proves the slot) ----------------------------------------------
  mug: {
    slot: 'handheldL',
    label: 'Mug',
    url: itemUrl('mug.glb'),
    maskUrl: maskUrl('item-mug.mask.png'),
    attach: 'socket',
    socket: 'socket.handL',
    paletteSlots: ['primary', 'secondary'],
    morphs: [],
  },
}) satisfies WardrobeRegistryLike

export type WardrobeItemId = keyof typeof WARDROBE_REGISTRY

export const WARDROBE_ITEM_IDS = Object.keys(WARDROBE_REGISTRY) as WardrobeItemId[]

/** Item ids for one wear slot, registry order (panel picker rows). */
export function itemsForSlot(slot: WearSlot): WardrobeItemId[] {
  return WARDROBE_ITEM_IDS.filter((id) => WARDROBE_REGISTRY[id].slot === slot)
}

export function getItem(itemId: string): WardrobeItemDef | null {
  return (WARDROBE_REGISTRY as Record<string, WardrobeItemDef>)[itemId] ?? null
}

/** The item's default ear mode (first declared), if it is ear-aware headwear. */
export function defaultEarMode(def: WardrobeItemDef): EarMode | null {
  return def.earModes?.[0] ?? null
}
