// Anatomy panel (plan 006, step 5): archetype selector, per-slot part picker
// with lazy thumbnails, morph sliders (body + selected part), and a curated
// safe boneScale set. Everything writes through the characterStore's `patch`
// (one per animation frame during drags — same coalescing as MaterialPanel).
//
// Plan 012 split this into two mode-tab sections (chrome-only — no handler
// logic changed, just which JSX lives in which exported component):
//   - `AnatomyArchetypeSection` — the "Animal" tab (archetype + personality).
//   - `AnatomyPanel` — the "Anatomy" tab (slot/part picker, morphs, bone
//     scales), still the panel's original export name.
// Both render inside the shell's managed column via `PanelSection` — no more
// fixed-position docking (was BOTTOM-LEFT, colliding with SculptPanel).

import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { BODY_MORPHS, getPart, type PartId, partsForSlot } from '../../core/skeleton/partRegistry'
import { defaultAnatomyParts, defaultSpringRig, PERSONALITY_FACE_DEFAULTS } from '../../core/spec/defaults'
import {
  ARCHETYPES,
  type Archetype,
  type BoneName,
  type CharacterSpec,
  PART_SLOTS,
  type PartSlot,
  PERSONALITIES,
  type Personality,
} from '../../core/spec/schema'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
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

/** "Animal" mode-tab content: archetype + personality (관상 face defaults).
 * The builder flow's first step — choose the animal. */
export function AnatomyArchetypeSection() {
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
  const personality = useCharacterStore((s) => s.spec.meta.personality)
  const rafPatch = useRafPatch()

  const setArchetype = (next: Archetype) => {
    rafPatch((draft) => {
      draft.meta = { ...draft.meta, archetype: next }
      // coherent swap: default part loadout + spring rig for the new body
      draft.anatomy = { ...draft.anatomy, parts: defaultAnatomyParts(next), bodyMorphs: { ...draft.anatomy.bodyMorphs } }
      draft.motion = { ...draft.motion, springRig: defaultSpringRig(next) }
    })
  }

  const setPersonality = (next: Personality) => {
    const face = PERSONALITY_FACE_DEFAULTS[next]
    rafPatch((draft) => {
      draft.meta = { ...draft.meta, personality: next }
      draft.face = {
        ...draft.face,
        atlasId: face.atlasId,
        expression: face.defaultExpression,
        eyes: { ...draft.face.eyes, pupilScale: face.pupilScale },
        blink: { ...draft.face.blink, meanIntervalS: face.blinkMeanIntervalS },
        gaze: { ...draft.face.gaze, intensity: face.gazeIntensity },
      }
    })
  }

  return (
    <PanelSection title="Animal">
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

      <label style={labelColStyle}>
        <span style={{ opacity: 0.7 }}>Personality (관상 face)</span>
        <select style={selectStyle} value={personality} onChange={(e) => setPersonality(e.target.value as Personality)}>
          {PERSONALITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </PanelSection>
  )
}

/** "Anatomy" mode-tab content: per-slot parts, morphs, bone scales. */
export function AnatomyPanel() {
  const parts = useCharacterStore((s) => s.spec.anatomy.parts)
  const bodyMorphs = useCharacterStore((s) => s.spec.anatomy.bodyMorphs)
  const rafPatch = useRafPatch()
  const slot = useSelectedSlot((s) => s.slot)
  const setSlot = useSelectedSlot((s) => s.setSlot)

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
    <PanelSection title="Anatomy">
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
        {partsForSlot(slot).map((partId) => (
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
    </PanelSection>
  )
}
