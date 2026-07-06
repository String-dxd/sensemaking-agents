// Anatomy panel (plan 006, step 5): per-slot part picker with lazy
// thumbnails and part-morph sliders (the curated controls), plus a
// collapsed Advanced disclosure holding the raw controls — body morphs,
// bone scales, and the archetype override (advisor plan 009 step 4).
// Everything writes through the characterStore's `patch` (one per animation
// frame during drags — same coalescing as MaterialPanel).
//
// History: plan 012 split out an `AnatomyArchetypeSection` for the "Animal"
// tab; plan 009 replaced that tab with SpeciesSection.tsx (species-first
// flow) — personality moved there, the archetype select moved into
// Advanced here, and the section export was deleted. Renders inside the
// shell's managed column via `PanelSection` — no fixed-position docking.

import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { BODY_MORPHS, getPart, type PartId, partsForSlot } from '../../core/skeleton/partRegistry'
import { getSpecies } from '../../core/species/registry'
import { defaultAnatomyParts, defaultSpringRig } from '../../core/spec/defaults'
import {
  ARCHETYPES,
  type Archetype,
  type BoneName,
  type CharacterSpec,
  PART_SLOTS,
  type PartSlot,
} from '../../core/spec/schema'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { useAdvancedMode } from '../state/studioStores'
import { getPartThumbnail } from './partThumbnails'

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
}

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

const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

/**
 * Curated boneScale groups (plan 006 step 5). boneScales live on part
 * entries (plan-004 schema) — each group writes to the entry of its host
 * slot: ear/tail scales ride their own parts; head rides the muzzle entry
 * (it is head-mounted), limbs ride the claws entry (it is limb-mounted).
 */
const BONE_SCALE_GROUPS: Array<{ label: string; slot: PartSlot; bones: BoneName[] }> = [
  { label: 'Head', slot: 'muzzle', bones: ['head'] },
  { label: 'Ears', slot: 'ears', bones: ['earL.1', 'earL.2', 'earR.1', 'earR.2'] },
  { label: 'Tail', slot: 'tail', bones: ['tail.1', 'tail.2', 'tail.3', 'tail.4'] },
  { label: 'Arms', slot: 'claws', bones: ['upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR'] },
  { label: 'Legs', slot: 'claws', bones: ['upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'footL', 'footR'] },
]

const useSelectedSlot = create<{ slot: PartSlot; setSlot(s: PartSlot): void }>((set) => ({
  slot: 'ears',
  setSlot: (slot) => set({ slot }),
}))

type SpecUpdater = (draft: CharacterSpec) => void

/** One store patch per animation frame during slider drags (see MaterialPanel). */
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

function PartThumb({ partId, active, onPick }: { partId: PartId; active: boolean; onPick(): void }) {
  const [src, setSrc] = useState<string | null>(null)
  const def = getPart(partId)
  useEffect(() => {
    let alive = true
    if (def?.url) getPartThumbnail(partId).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [partId, def?.url])
  return (
    <button type="button" title={def?.label ?? partId} style={thumbButton(active)} onClick={onPick}>
      {src ? (
        <img src={src} alt={def?.label ?? partId} style={{ width: '100%', height: '100%' }} />
      ) : (
        <span>{def?.url ? def.label : 'none'}</span>
      )}
    </button>
  )
}

/** "Anatomy" mode-tab content: per-slot parts + part morphs (the curated
 * controls), with body morphs / bone scales / archetype override demoted to
 * a collapsed Advanced disclosure (plan 009 step 4). The old
 * AnatomyArchetypeSection's personality select moved to SpeciesSection; its
 * archetype select lives in Advanced below. */
export function AnatomyPanel() {
  const parts = useCharacterStore((s) => s.spec.anatomy.parts)
  const bodyMorphs = useCharacterStore((s) => s.spec.anatomy.bodyMorphs)
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
  // Class-legal part filtering (plan 009 step 3): a species preset locks the
  // picker to its class; 'custom'/unknown ids resolve undefined -> unfiltered.
  const speciesId = useCharacterStore((s) => s.spec.meta.species)
  const klass = getSpecies(speciesId)?.class
  const advanced = useAdvancedMode((s) => s.advanced)
  const setAdvanced = useAdvancedMode((s) => s.setAdvanced)
  const rafPatch = useRafPatch()
  const slot = useSelectedSlot((s) => s.slot)
  const setSlot = useSelectedSlot((s) => s.setSlot)

  const setArchetype = (next: Archetype) => {
    rafPatch((draft) => {
      // An archetype override means the species preset no longer applies.
      draft.meta = { ...draft.meta, archetype: next, species: 'custom' }
      // coherent swap: default part loadout + spring rig for the new body
      draft.anatomy = { ...draft.anatomy, parts: defaultAnatomyParts(next), bodyMorphs: { ...draft.anatomy.bodyMorphs } }
      draft.motion = { ...draft.motion, springRig: defaultSpringRig(next) }
    })
  }

  const pickPart = (pickSlot: PartSlot, partId: PartId) => {
    rafPatch((draft) => {
      const previous = draft.anatomy.parts[pickSlot]
      draft.anatomy = {
        ...draft.anatomy,
        parts: { ...draft.anatomy.parts, [pickSlot]: { partId, morphs: {}, boneScales: previous?.boneScales } },
      }
    })
  }

  const setPartMorph = (morphSlot: PartSlot, name: string, value: number) => {
    rafPatch((draft) => {
      const entry = draft.anatomy.parts[morphSlot]
      if (!entry) return
      draft.anatomy = {
        ...draft.anatomy,
        parts: { ...draft.anatomy.parts, [morphSlot]: { ...entry, morphs: { ...entry.morphs, [name]: value } } },
      }
    })
  }

  const setBodyMorph = (name: string, value: number) => {
    rafPatch((draft) => {
      draft.anatomy = { ...draft.anatomy, bodyMorphs: { ...draft.anatomy.bodyMorphs, [name]: value } }
    })
  }

  const setGroupScale = (group: (typeof BONE_SCALE_GROUPS)[number], value: number) => {
    rafPatch((draft) => {
      const entry = draft.anatomy.parts[group.slot]
      if (!entry) return
      const boneScales = { ...entry.boneScales }
      for (const bone of group.bones) boneScales[bone] = { x: value, y: value, z: value }
      draft.anatomy = {
        ...draft.anatomy,
        parts: { ...draft.anatomy.parts, [group.slot]: { ...entry, boneScales } },
      }
    })
  }

  const selectedEntry = parts[slot]
  const selectedDef = selectedEntry ? getPart(selectedEntry.partId) : null

  return (
    <PanelSection
      title="Anatomy"
      actions={
        <button
          type="button"
          style={{ ...selectStyle, cursor: 'pointer' }}
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? 'Advanced ▾' : 'Advanced ▸'}
        </button>
      }
    >
      <label style={labelColStyle}>
        <span style={{ opacity: 0.7 }}>Slot</span>
        <select style={selectStyle} value={slot} onChange={(e) => setSlot(e.target.value as PartSlot)}>
          {PART_SLOTS.filter((s) => s !== 'brows').map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {partsForSlot(slot, klass).map((partId) => (
          <PartThumb key={partId} partId={partId} active={selectedEntry?.partId === partId} onPick={() => pickPart(slot, partId)} />
        ))}
      </div>

      {selectedDef && selectedDef.morphs.length > 0 && selectedEntry ? (
        <div style={labelColStyle}>
          <span style={{ opacity: 0.7 }}>{selectedDef.label} morphs</span>
          {selectedDef.morphs.map((name) => (
            <label key={name} style={labelColStyle}>
              <span>
                {name}: {(selectedEntry.morphs[name] ?? 0).toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selectedEntry.morphs[name] ?? 0}
                onChange={(e) => setPartMorph(slot, name, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      ) : null}

      {/* Advanced (plan 009 step 4): raw controls, collapsed by default —
          the curated flow is species preset + parts + part morphs above. */}
      {advanced ? (
        <>
          <label style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Archetype</span>
            <select style={selectStyle} value={archetype} onChange={(e) => setArchetype(e.target.value as Archetype)}>
              {ARCHETYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <div style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Body morphs</span>
            {BODY_MORPHS.map((name) => (
              <label key={name} style={labelColStyle}>
                <span>
                  {name}: {(bodyMorphs[name] ?? 0).toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={bodyMorphs[name] ?? 0}
                  onChange={(e) => setBodyMorph(name, Number(e.target.value))}
                />
              </label>
            ))}
          </div>

          <div style={labelColStyle}>
            <span style={{ opacity: 0.7 }}>Bone scales</span>
            {BONE_SCALE_GROUPS.filter((g) => parts[g.slot]).map((group) => {
              const current = parts[group.slot]?.boneScales?.[group.bones[0]]?.x ?? 1
              return (
                <label key={group.label} style={labelColStyle}>
                  <span>
                    {group.label}: {current.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.8}
                    step={0.01}
                    value={current}
                    onChange={(e) => setGroupScale(group, Number(e.target.value))}
                  />
                </label>
              )
            })}
          </div>
        </>
      ) : null}
    </PanelSection>
  )
}
