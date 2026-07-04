// Wardrobe panel (plan 008, step 4): wear-slot tabs, item thumbnails (shared
// GLB thumbnail cache with the anatomy picker), per-item palette-override
// pickers driven by the item's declared paletteSlots, an earMode selector for
// ear-aware headwear, and "undress all". Everything writes through the
// characterStore's `patch` (raf-coalesced during color drags — the
// AnatomyPanel/MaterialPanel idiom).
//
// The panel keeps the spec tidy on wear (removes the entries the new item
// would evict: one per slot, outfit ⇄ top+bottom) — the dressing pass
// enforces the same rules anyway and its warnings are surfaced below.
//
// Docked in the "Wardrobe" mode-tab column (plan 012 — was a fixed-position
// BOTTOM-RIGHT card).

import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { CharacterSpec, EarMode, PaletteSlot, WearSlot, WornItem } from '../../core/spec/schema'
import {
  defaultEarMode,
  getItem,
  itemsForSlot,
  resolveWornItems,
  WARDROBE_REGISTRY,
  type WardrobeItemId,
  WEAR_SLOT_LABELS,
} from '../../core/wardrobe'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { getGlbThumbnail } from './partThumbnails'

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 8px',
  borderRadius: 8,
  border: active ? '1px solid #4a6cd4' : '1px solid #44444c',
  background: active ? '#31406e' : '#2a2a30',
  color: '#e8e8ec',
  cursor: 'pointer',
  fontSize: 11,
})

const thumbButton = (active: boolean): React.CSSProperties => ({
  width: 52,
  height: 52,
  padding: 0,
  borderRadius: 8,
  overflow: 'hidden',
  border: active ? '2px solid #4a6cd4' : '1px solid #44444c',
  background: '#2a2a30',
  color: '#9a9aa6',
  cursor: 'pointer',
  fontSize: 9,
  lineHeight: 1.1,
})

const smallButton: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  cursor: 'pointer',
  fontSize: 11,
}

const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

/** Wear slots that have registry items today, in schema order. */
const SLOTS_WITH_ITEMS = (['headwear', 'eyewear', 'top', 'bottom', 'outfit', 'neck', 'back', 'handheldL', 'handheldR'] as const).filter(
  (slot) => itemsForSlot(slot).length > 0,
)

/** The wear slots a newly worn item evicts (mirror of dress.ts `occupies`). */
function blockedSlots(slot: WearSlot): Set<WearSlot> {
  if (slot === 'outfit') return new Set(['outfit', 'top', 'bottom'])
  if (slot === 'top' || slot === 'bottom') return new Set([slot, 'outfit'])
  return new Set([slot])
}

const useSelectedSlot = create<{ slot: WearSlot; setSlot(s: WearSlot): void }>((set) => ({
  slot: 'headwear',
  setSlot: (slot) => set({ slot }),
}))

type SpecUpdater = (draft: CharacterSpec) => void

/** One store patch per animation frame during color drags (see MaterialPanel). */
function useRafPatch(): (updater: SpecUpdater) => void {
  const patch = useCharacterStore((s) => s.patch)
  const queue = useRef<SpecUpdater[]>([])
  const scheduled = useRef(false)
  return useCallback(
    (updater: SpecUpdater) => {
      queue.current.push(updater)
      if (scheduled.current) return
      scheduled.current = true
      requestAnimationFrame(() => {
        scheduled.current = false
        const updaters = queue.current
        queue.current = []
        if (updaters.length === 0) return
        patch((draft) => {
          for (const u of updaters) u(draft)
        })
      })
    },
    [patch],
  )
}

function ItemThumb({ itemId, active, onPick }: { itemId: WardrobeItemId | null; active: boolean; onPick(): void }) {
  const [src, setSrc] = useState<string | null>(null)
  const def = itemId ? getItem(itemId) : null
  useEffect(() => {
    let alive = true
    if (itemId && def) getGlbThumbnail(`wardrobe:${itemId}`, def.url).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [itemId, def])
  return (
    <button type="button" title={def?.label ?? 'none'} style={thumbButton(active)} onClick={onPick}>
      {src ? <img src={src} alt={def?.label ?? 'item'} style={{ width: '100%', height: '100%' }} /> : <span>{def?.label ?? 'none'}</span>}
    </button>
  )
}

export function WardrobePanel() {
  const wardrobe = useCharacterStore((s) => s.spec.wardrobe)
  const palette = useCharacterStore((s) => s.spec.palette)
  const rafPatch = useRafPatch()
  const slot = useSelectedSlot((s) => s.slot)
  const setSlot = useSelectedSlot((s) => s.setSlot)

  const wornInSlot = (s: WearSlot): WornItem | undefined => wardrobe.find((w) => w.slot === s)
  const worn = wornInSlot(slot)
  const wornDef = worn ? getItem(worn.itemId) : null
  const { warnings } = resolveWornItems(wardrobe, WARDROBE_REGISTRY)

  const wearItem = (wearSlot: WearSlot, itemId: WardrobeItemId | null) => {
    rafPatch((draft) => {
      const blocked = blockedSlots(wearSlot)
      const kept = draft.wardrobe.filter((w) => !blocked.has(w.slot))
      if (!itemId) {
        draft.wardrobe = kept
        return
      }
      const def = WARDROBE_REGISTRY[itemId]
      const entry: WornItem = { slot: def.slot, itemId }
      const ear = defaultEarMode(def)
      if (ear) entry.earMode = ear
      draft.wardrobe = [...kept, entry]
    })
  }

  const patchWorn = (wearSlot: WearSlot, update: (entry: WornItem) => WornItem) => {
    rafPatch((draft) => {
      draft.wardrobe = draft.wardrobe.map((w) => (w.slot === wearSlot ? update({ ...w }) : w))
    })
  }

  const setOverride = (paletteSlot: PaletteSlot, color: string) =>
    patchWorn(slot, (entry) => ({ ...entry, paletteOverrides: { ...entry.paletteOverrides, [paletteSlot]: color } }))

  return (
    <PanelSection
      title="Wardrobe"
      actions={
        <button
          type="button"
          style={smallButton}
          disabled={wardrobe.length === 0}
          onClick={() => rafPatch((draft) => void (draft.wardrobe = []))}
        >
          Undress all
        </button>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {SLOTS_WITH_ITEMS.map((s) => (
          <button key={s} type="button" style={tabStyle(s === slot)} onClick={() => setSlot(s)}>
            {WEAR_SLOT_LABELS[s]}
            {wornInSlot(s) ? ' •' : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <ItemThumb itemId={null} active={!worn} onPick={() => wearItem(slot, null)} />
        {itemsForSlot(slot).map((itemId) => (
          <ItemThumb key={itemId} itemId={itemId} active={worn?.itemId === itemId} onPick={() => wearItem(slot, itemId)} />
        ))}
      </div>

      {worn && wornDef?.earModes ? (
        <label style={labelColStyle}>
          <span style={{ opacity: 0.7 }}>Ears ({wornDef.label})</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {wornDef.earModes.map((mode) => (
              <button
                key={mode}
                type="button"
                style={tabStyle(worn.earMode === mode)}
                onClick={() => patchWorn(slot, (entry) => ({ ...entry, earMode: mode as EarMode }))}
              >
                {mode}
              </button>
            ))}
          </div>
        </label>
      ) : null}

      {worn && wornDef && wornDef.paletteSlots.length > 0 ? (
        <div style={labelColStyle}>
          <span style={{ opacity: 0.7 }}>{wornDef.label} colors</span>
          {wornDef.paletteSlots.map((paletteSlot) => (
            <label key={paletteSlot} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={worn.paletteOverrides?.[paletteSlot] ?? palette[paletteSlot]}
                onChange={(e) => setOverride(paletteSlot, e.target.value)}
              />
              <span>
                {paletteSlot}
                {worn.paletteOverrides?.[paletteSlot] ? ' (override)' : ''}
              </span>
            </label>
          ))}
          {worn.paletteOverrides && Object.keys(worn.paletteOverrides).length > 0 ? (
            <button
              type="button"
              style={smallButton}
              onClick={() => patchWorn(slot, ({ paletteOverrides: _drop, ...entry }) => entry)}
            >
              Reset to body palette
            </button>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div style={{ color: '#e0b060', fontSize: 11 }}>
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      ) : null}
    </PanelSection>
  )
}
