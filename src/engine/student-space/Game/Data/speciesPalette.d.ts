export interface TreeColors {
  colorA: string
  colorB: string
}

export interface FlowerColors {
  petal: string
  centre?: string
  face?: string
}

export interface FruitColors {
  color: string
}

export type SpeciesColors = TreeColors | FlowerColors | FruitColors

export interface SpeciesPaletteData {
  v: 1
  tree: Record<string, TreeColors>
  flower: Record<string, FlowerColors>
  fruit: Record<string, FruitColors>
}

export function defaultSpeciesPalette(): SpeciesPaletteData
export function defaultSpeciesPaletteFromConstants(): SpeciesPaletteData
