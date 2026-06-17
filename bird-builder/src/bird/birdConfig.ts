// Pure, framework-agnostic bird model + the durable export artifact (the "bird
// config"). NO three/r3f imports — headless-testable core, mirroring
// island-editor/src/terrain/islandSpec.ts.
//
// A config is an ASSEMBLY: which base bird, which item (+ its colors) is worn
// in each slot, and the feather palette recoloring the base. The geometry is
// authored art loaded at runtime; this config only references it by id.

import { ITEM_BY_ID, NONE_ITEM, SLOTS } from './slots'

export interface SlotColors {
  base: string
  accent?: string
}

export interface SlotState {
  /** Item id, or `'none'` for an empty slot. */
  itemId: string
  colors: SlotColors
}

export interface FeatherPalette {
  body: string
  accent: string
}

export interface BirdConfig {
  version: 1
  baseId: string
  /** slotId → worn item + its recolor. Every registered slot has an entry. */
  slots: Record<string, SlotState>
  featherPalette: FeatherPalette
}

export const DEFAULT_BASE_ID = 'masked'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** True for `#rgb`, `#rrggbb`, or `#rrggbbaa`. */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

/** The seed config — default base, every slot empty, masked feather palette. */
export function defaultBirdConfig(): BirdConfig {
  const slots: Record<string, SlotState> = {}
  for (const s of SLOTS) {
    slots[s.id] = { itemId: NONE_ITEM, colors: { base: '#ffffff' } }
  }
  return {
    version: 1,
    baseId: DEFAULT_BASE_ID,
    slots,
    featherPalette: { body: '#ff6b0d', accent: '#d11f1a' },
  }
}

/** Put an item in a slot, seeding its colors from the item's defaults. */
export function setSlotItem(config: BirdConfig, slotId: string, itemId: string): BirdConfig {
  const item = ITEM_BY_ID[itemId]
  const colors: SlotColors = item ? { ...item.defaultColors } : { base: '#ffffff' }
  return { ...config, slots: { ...config.slots, [slotId]: { itemId, colors } } }
}

/** Set one recolor channel on a slot's worn item. */
export function setSlotColor(
  config: BirdConfig,
  slotId: string,
  channel: 'base' | 'accent',
  hex: string,
): BirdConfig {
  const prev = config.slots[slotId] ?? { itemId: NONE_ITEM, colors: { base: '#ffffff' } }
  return {
    ...config,
    slots: { ...config.slots, [slotId]: { ...prev, colors: { ...prev.colors, [channel]: hex } } },
  }
}

// ── Validation ───────────────────────────────────────────────────────────────
// configError returns the first problem (descriptive, for export throws) or
// null when valid; isValidConfig is the boolean form (for lenient load paths).

export function configError(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null) return 'root must be an object'
  const o = obj as Record<string, unknown>
  if (o['version'] !== 1) return `version must be 1, got ${String(o['version'])}`
  if (typeof o['baseId'] !== 'string' || o['baseId'].length === 0) return 'baseId must be a non-empty string'

  const slots = o['slots']
  if (typeof slots !== 'object' || slots === null) return 'slots must be an object'
  for (const [slotId, raw] of Object.entries(slots as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) return `slots.${slotId} must be an object`
    const st = raw as Record<string, unknown>
    if (typeof st['itemId'] !== 'string') return `slots.${slotId}.itemId must be a string`
    const colors = st['colors']
    if (typeof colors !== 'object' || colors === null) return `slots.${slotId}.colors must be an object`
    const c = colors as Record<string, unknown>
    if (!isHexColor(c['base'])) return `slots.${slotId}.colors.base must be a hex color`
    if (c['accent'] !== undefined && !isHexColor(c['accent']))
      return `slots.${slotId}.colors.accent must be a hex color when present`
  }

  const fp = o['featherPalette']
  if (typeof fp !== 'object' || fp === null) return 'featherPalette must be an object'
  const f = fp as Record<string, unknown>
  if (!isHexColor(f['body'])) return 'featherPalette.body must be a hex color'
  if (!isHexColor(f['accent'])) return 'featherPalette.accent must be a hex color'

  return null
}

export function isValidConfig(obj: unknown): obj is BirdConfig {
  return configError(obj) === null
}
