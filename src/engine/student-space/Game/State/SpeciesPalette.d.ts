import type { SpeciesPaletteData, SpeciesColors } from '../Data/speciesPalette'

export type PaletteEvent =
  | { type: 'paletteChanged'; kind: string; species: string; colors: SpeciesColors }
  | { type: 'paletteReplaced' }

export default class SpeciesPalette {
  static instance: SpeciesPalette | null
  static getInstance(): SpeciesPalette | null

  constructor()

  get(kind: string, species: string): Record<string, string> | null
  list(): SpeciesPaletteData
  setColor(kind: string, species: string, colors: Partial<SpeciesColors>): void
  isDiverged(): boolean
  revertToDefault(): void
  subscribe(cb: (event: PaletteEvent) => void): () => void
  hydrate(snapshot: unknown): void
  serialize(): SpeciesPaletteData
}
