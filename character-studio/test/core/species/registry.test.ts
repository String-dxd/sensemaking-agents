import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { migrateSpec } from '../../../src/core/spec/migrate'
import { CharacterSpecSchema } from '../../../src/core/spec/schema'
import { getPart, PART_REGISTRY, partsForSlot } from '../../../src/core/skeleton/partRegistry'
import {
  createCharacterFromSpecies,
  SPECIES_IDS,
  SPECIES_REGISTRY,
  speciesForClass,
} from '../../../src/core/species/registry'

const fixturePath = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url))

describe('species registry', () => {
  it('every species builds a schema-valid spec tagged with its own id', () => {
    for (const id of SPECIES_IDS) {
      const spec = createCharacterFromSpecies(id)
      expect(() => CharacterSpecSchema.parse(spec)).not.toThrow()
      expect(spec.meta.species).toBe(id)
    }
  })

  it('every preset part exists in PART_REGISTRY, occupies the right slot, and is anatomically legal for its class', () => {
    for (const id of SPECIES_IDS) {
      const def = SPECIES_REGISTRY[id]
      for (const [slot, entry] of Object.entries(def.parts)) {
        const part = getPart(entry.partId)
        expect(part, `${id}.${slot}: unknown part id ${entry.partId}`).not.toBeNull()
        expect(part?.slot, `${id}.${slot}: part ${entry.partId} is not in slot ${slot}`).toBe(slot)
        expect(
          part?.classes.includes(def.class),
          `${id}.${slot}: part ${entry.partId} (classes ${part?.classes}) is not legal for class ${def.class}`,
        ).toBe(true)
      }
    }
  })

  it("partsForSlot filters by class: 'muzzle' bird-only returns beaks, mammal-only returns non-beaks, unfiltered returns all six", () => {
    const birdMuzzles = partsForSlot('muzzle', 'bird')
    const mammalMuzzles = partsForSlot('muzzle', 'mammal')
    const allMuzzles = partsForSlot('muzzle')

    // plan 010 added beak-hooked / bill-duck (bird-only)
    expect(birdMuzzles.sort()).toEqual(['beak-hooked', 'beak-round', 'beak-small', 'bill-duck'])
    expect(mammalMuzzles.sort()).toEqual(['boxy-dog', 'short-cat'])
    expect(allMuzzles).toHaveLength(6)
    for (const id of birdMuzzles) {
      expect(PART_REGISTRY[id].classes).toContain('bird')
    }
    for (const id of mammalMuzzles) {
      expect(PART_REGISTRY[id].classes).toContain('mammal')
    }
  })

  it('migrates both saved v1 fixtures to v2 with meta.species defaulted to custom', () => {
    for (const name of ['hero-shiba.character.json', 'default-dog.character.json']) {
      const raw = JSON.parse(readFileSync(fixturePath(name), 'utf8'))
      const migrated = migrateSpec(raw)
      expect(migrated.meta.specVersion).toBe(2)
      expect(migrated.meta.species).toBe('custom')
    }
  })

  it('speciesForClass partitions the Core-8 into 5 mammals and 3 birds', () => {
    expect(speciesForClass('mammal').sort()).toEqual(['bear-cub', 'fox', 'rabbit', 'shiba', 'tabby-cat'].sort())
    expect(speciesForClass('bird').sort()).toEqual(['duckling', 'owl', 'robin'].sort())
  })
})
