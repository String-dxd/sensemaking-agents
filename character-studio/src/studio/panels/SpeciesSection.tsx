// SpeciesSection (advisor plan 009, step 2) — the species-first "Animal"
// tab lead: a grid of species cards (bird-only studio, so no class filter
// chips); clicking a card applies the full curated preset in ONE undoable
// command; a Custom card unlocks the unfiltered part picker. The
// personality select moved here from the old AnatomyArchetypeSection
// (identity belongs to the Animal step); the archetype override lives in
// AnatomyPanel's Advanced disclosure now.
//
// Species-apply is the first non-sculpt edit migrated onto the studio-wide
// command stack (the follow-up commandStack.ts's header promises): specs
// are never mutated in place (`patch` is copy-on-write, `setSpec`
// replaces), so holding the before/after references is a safe snapshot —
// no deep clone needed. Note `setSpec` also clears the store's `dirty`
// flag (it is the "loading a file" path); accepted as-is per plan 009.

import {
  createCharacterFromSpecies,
  SPECIES_IDS,
  SPECIES_REGISTRY,
  type SpeciesId,
} from '../../core/species/registry'
import { PERSONALITY_FACE_DEFAULTS } from '../../core/spec/defaults'
import { type CharacterSpec, PERSONALITIES, type Personality } from '../../core/spec/schema'
import { PanelSection } from '../shell/PanelSection'
import { useCharacterStore } from '../state/characterStore'
import { studioCommands } from '../state/commandStore'

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 8,
  border: '1px solid #44444c',
  background: '#2a2a30',
  color: '#e8e8ec',
  fontSize: 12,
}

const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

/** Toggle-button styling shared by class chips and species cards (same
 * idiom as AnatomyPanel's thumbButton, text-sized instead of thumb-sized). */
const chipButton = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 8,
  border: active ? '2px solid #4a6cd4' : '1px solid #44444c',
  background: '#2a2a30',
  color: active ? '#e8e8ec' : '#9a9aa6',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1.2,
})

const cardButton = (active: boolean): React.CSSProperties => ({
  ...chipButton(active),
  padding: '10px 6px',
  textAlign: 'center',
})

/** Build the next spec for applying a species preset: the preset wholesale,
 * except identity fields the designer already owns (id, name, timestamps)
 * plus wardrobe + studio lighting (their own work — survives a species
 * switch). sculptDelta is intentionally dropped: it was sculpted against
 * the old body. Exported for the store-level test. */
export function specForSpeciesApply(spec: CharacterSpec, id: SpeciesId): CharacterSpec {
  const preset = createCharacterFromSpecies(id)
  return {
    ...preset,
    meta: {
      ...preset.meta,
      id: spec.meta.id,
      name: spec.meta.name,
      createdAt: spec.meta.createdAt,
      updatedAt: spec.meta.updatedAt,
    },
    wardrobe: spec.wardrobe,
    studioLook: spec.studioLook,
  }
}

/** Apply a species preset as ONE command on the studio undo stack, so a
 * single ⌘Z restores the entire previous character. */
export function applySpecies(id: SpeciesId): void {
  const { spec, setSpec } = useCharacterStore.getState()
  const before = spec
  const after = specForSpeciesApply(spec, id)
  studioCommands.execute({
    label: `Species: ${SPECIES_REGISTRY[id].label}`,
    do: () => setSpec(after),
    undo: () => setSpec(before),
    tryCoalesce: () => false,
  })
}

export function SpeciesSection() {
  const species = useCharacterStore((s) => s.spec.meta.species)
  const personality = useCharacterStore((s) => s.spec.meta.personality)
  const patch = useCharacterStore((s) => s.patch)

  // bird-only studio: every species is a bird, so no class filter chips
  const ids = SPECIES_IDS

  // Custom just unlocks the unfiltered picker — nothing else changes.
  // Plain patch, not a command (consistent with the panel's other
  // non-undoable edits today).
  const pickCustom = () => {
    patch((draft) => {
      draft.meta = { ...draft.meta, species: 'custom' }
    })
  }

  const setPersonality = (next: Personality) => {
    const face = PERSONALITY_FACE_DEFAULTS[next]
    patch((draft) => {
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {ids.map((id) => (
          <button type="button" key={id} style={cardButton(species === id)} onClick={() => applySpecies(id)}>
            {SPECIES_REGISTRY[id].label}
          </button>
        ))}
        <button type="button" style={cardButton(species === 'custom')} onClick={pickCustom}>
          Custom
        </button>
      </div>

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
