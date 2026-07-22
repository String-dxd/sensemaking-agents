// The `view.kira` contract's type surface (world-port U8/U9). The runtime
// behind the slot is `Character.js` (the island editor's animated character);
// the slot keeps the name `view.kira` because ~27 `.kira` references exist
// across the React seam. `Kira.js` itself was deleted in U9 — the species
// catalog now lives in `../State/characterAsset.ts`; import it from there.

export type {
  CompanionSpecies as KiraSpecies,
  CompanionSpeciesId as KiraSpeciesId,
  CompanionSpeciesPalette as KiraSpeciesPalette,
} from '../State/characterAsset.ts'
export { SPECIES, SPECIES_BY_ID } from '../State/characterAsset.ts'
export { default as Kira } from './Character.js'
