// Species-first UI store logic (advisor plan 009, step 5). Bare-node
// environment (no jsdom) — exercises the exported apply helpers +
// useCharacterStore/studioCommands directly; no components are rendered.
// `studioCommands` is a module singleton shared with SculptTool/lattice, so
// every depth assertion is relative to a recorded starting depth.

import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultCharacter } from '../../src/core/spec/defaults'
import { createCharacterFromSpecies } from '../../src/core/species/registry'
import { applySpecies, specForSpeciesApply } from '../../src/studio/panels/SpeciesSection'
import { useCharacterStore } from '../../src/studio/state/characterStore'
import { studioCommands } from '../../src/studio/state/commandStore'

function freshSpec() {
  const spec = createDefaultCharacter('biped-round', 'gentle')
  useCharacterStore.getState().setSpec(spec)
  return spec
}

beforeEach(() => {
  studioCommands.clear()
  freshSpec()
})

describe('species apply (plan 009 step 2 recipe)', () => {
  it('applies the preset while keeping identity fields + wardrobe', () => {
    // Seed designer-owned state: a worn item + a custom name.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: 'Mochi' }
      draft.wardrobe = [{ slot: 'headwear', itemId: 'cap' }]
    })
    const before = useCharacterStore.getState().spec

    applySpecies('owl')

    const spec = useCharacterStore.getState().spec
    const preset = createCharacterFromSpecies('owl')
    expect(spec.meta.species).toBe('owl')
    expect(spec.meta.id).toBe(before.meta.id)
    expect(spec.meta.createdAt).toBe(before.meta.createdAt)
    expect(spec.meta.name).toBe('Mochi')
    expect(spec.wardrobe).toEqual([{ slot: 'headwear', itemId: 'cap' }])
    expect(spec.anatomy.parts).toEqual(preset.anatomy.parts)
    expect(spec.anatomy.bodyMorphs).toEqual(preset.anatomy.bodyMorphs)
    expect(spec.palette).toEqual(preset.palette)
  })

  it('is ONE undoable command: undo restores the previous spec, redo re-applies', () => {
    const before = useCharacterStore.getState().spec
    const startDepth = studioCommands.depth()

    applySpecies('robin')
    const after = useCharacterStore.getState().spec

    expect(studioCommands.depth()).toBe(startDepth + 1)
    expect(after.meta.species).toBe('robin')

    studioCommands.undo()
    expect(useCharacterStore.getState().spec).toEqual(before)
    expect(studioCommands.depth()).toBe(startDepth)

    studioCommands.redo()
    expect(useCharacterStore.getState().spec).toEqual(after)
    expect(studioCommands.depth()).toBe(startDepth + 1)
  })

  it('specForSpeciesApply drops sculptDelta (sculpted against the old body)', () => {
    const spec = useCharacterStore.getState().spec
    const seeded = {
      ...spec,
      anatomy: {
        ...spec.anatomy,
        sculptDelta: {
          baseMeshId: 'body-biped-round',
          baseMeshVersion: 3,
          quantum: 0.0005,
          layers: [
            {
              assetId: 'body-biped-round',
              meshName: 'Body',
              meshVersion: 3,
              vertexCount: 8,
              indices: [0],
              values: [1, 0, 0],
            },
          ],
        },
      },
    }
    const next = specForSpeciesApply(seeded, 'owl')
    expect(next.anatomy.sculptDelta).toBeUndefined()
  })
})

describe('custom + archetype override', () => {
  it('picking Custom changes only meta.species', () => {
    applySpecies('owl')
    const before = useCharacterStore.getState().spec

    // Same plain patch the Custom card issues.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, species: 'custom' }
    })

    const spec = useCharacterStore.getState().spec
    expect(spec.meta.species).toBe('custom')
    expect(spec).toEqual({ ...before, meta: { ...before.meta, species: 'custom' } })
  })

  it('archetype override resets meta.species to custom', () => {
    applySpecies('robin')
    expect(useCharacterStore.getState().spec.meta.species).toBe('robin')

    // Same patch AnatomyPanel's Advanced archetype select issues.
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, archetype: 'biped-round', species: 'custom' }
    })

    expect(useCharacterStore.getState().spec.meta.species).toBe('custom')
  })
})
