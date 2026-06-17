// The clothing/accessory slot registry + the V1 item catalog. Pure data — no
// three/r3f imports. The slot taxonomy follows the costume benchmark (Club
// Penguin / Sims slots adapted to a bird); the V1 catalog is intentionally
// small (procedural placeholder meshes, built in the rig layer keyed by item
// id) — it exists to prove the swap/recolor/attach runtime. The real catalog
// arrives as authored GLBs via the art pipeline (see ASSET-CONTRACT.md).

export type SlotKind = 'skinned' | 'rigid'

export interface SlotDef {
  id: string
  label: string
  /** skinned = rebind to the base skeleton; rigid = portal to a bone. */
  kind: SlotKind
  /** Preferred attach bone for rigid items (resolved with fallback at runtime). */
  attachBone?: string
  /** Recolor channels this slot's items expose. */
  channels: ('base' | 'accent')[]
}

/** V1 ships Outfit (skinned) + Headwear + Held (rigid). More slots are SHOULD/COULD. */
export const SLOTS: SlotDef[] = [
  { id: 'body', label: 'Outfit', kind: 'skinned', channels: ['base', 'accent'] },
  { id: 'head', label: 'Headwear', kind: 'rigid', attachBone: 'MB_Head', channels: ['base', 'accent'] },
  { id: 'held', label: 'Held', kind: 'rigid', attachBone: 'Wing.R', channels: ['base'] },
]

export const SLOT_BY_ID: Record<string, SlotDef> = Object.fromEntries(SLOTS.map((s) => [s.id, s]))

export interface ItemDef {
  id: string
  slot: string
  label: string
  defaultColors: { base: string; accent?: string }
}

/** `'none'` is the always-available empty choice for every slot. */
export const NONE_ITEM = 'none'

/** V1 placeholder catalog. `id` keys a procedural mesh builder in the rig layer. */
export const ITEMS: ItemDef[] = [
  { id: 'cap', slot: 'head', label: 'Cap', defaultColors: { base: '#e4572e', accent: '#ffffff' } },
  { id: 'beanie', slot: 'head', label: 'Beanie', defaultColors: { base: '#2b6cb0', accent: '#f6e05e' } },
  { id: 'scarf', slot: 'body', label: 'Scarf', defaultColors: { base: '#d11f1a', accent: '#ffffff' } },
  { id: 'leaf', slot: 'held', label: 'Leaf', defaultColors: { base: '#3aab48' } },
]

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

export function itemsForSlot(slotId: string): ItemDef[] {
  return ITEMS.filter((i) => i.slot === slotId)
}
