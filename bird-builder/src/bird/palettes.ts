// Curated color presets. Pure data. Palette discipline (the AC lesson): a small
// shared set of swatches + a handful of feather presets, not an open color
// space. Feather presets are seeded from the engine's 7 bowerbird species
// (body/accent), so the builder's bird palettes match the product's vocabulary.

export interface FeatherPreset {
  id: string
  label: string
  palette: { body: string; accent: string }
}

export const FEATHER_PRESETS: FeatherPreset[] = [
  { id: 'flame', label: 'Flame', palette: { body: '#e63946', accent: '#ffb347' } },
  { id: 'masked', label: 'Masked', palette: { body: '#ff6b0d', accent: '#d11f1a' } },
  { id: 'regent', label: 'Regent', palette: { body: '#ffd23f', accent: '#f4a261' } },
  { id: 'emerald', label: 'Emerald', palette: { body: '#3aab48', accent: '#f4e07a' } },
  { id: 'satin', label: 'Satin', palette: { body: '#2c7dd2', accent: '#5fb8ff' } },
  { id: 'twilight', label: 'Twilight', palette: { body: '#5a4cb8', accent: '#9a8aff' } },
  { id: 'lilac', label: 'Lilac', palette: { body: '#a065d8', accent: '#c08ee8' } },
]

export const FEATHER_PRESET_BY_ID: Record<string, FeatherPreset> = Object.fromEntries(
  FEATHER_PRESETS.map((p) => [p.id, p]),
)

/** ≤15 curated swatches for the clothing/accessory color pickers. */
export const SWATCHES: string[] = [
  '#ffffff',
  '#1a1a1a',
  '#e4572e',
  '#f4a261',
  '#ffd23f',
  '#3a7d44',
  '#3aab48',
  '#2c7dd2',
  '#5fb8ff',
  '#5a4cb8',
  '#9a8aff',
  '#a065d8',
  '#d11f1a',
  '#f6e05e',
  '#e9c46a',
]
