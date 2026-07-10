// Mii-style color swatch row + body pattern cards (advisor plan 021 step
// 3/4). Two mounts of the SAME `SwatchRow` component: under SpeciesSection's
// species grid ("Animal" tab) and at the top of MaterialPanel's default view
// ("Materials" tab). `PatternCards` (step 4, only meaningful once plan 019's
// rasterizer is on the branch) lives here too since it shares the same
// "visual card, one tap applies" idiom and the Materials tab is its only
// mount point.
//
// Both apply through `studioCommands` as ONE undoable step each — the same
// pattern SpeciesSection's `applySpecies` established: snapshot the whole
// spec before/after and let `setSpec` do the swap, so a single ⌘Z restores
// the prior look.

import { useMemo } from 'react'
import { buildProceduralBody, type ProcBodyData } from '../../core/procgen/body'
import { resolvePatternChannels } from '../../core/materials'
import { bodyBuffers, rasterizeChannels } from '../../core/materials/patternRaster'
import { getSpecies } from '../../core/species/registry'
import type { Archetype, CharacterSpec } from '../../core/spec/schema'
import { useCharacterStore } from '../state/characterStore'
import { studioCommands } from '../state/commandStore'
import { FALLBACK_ASSIGN } from '../state/studioStores'

type Palette = CharacterSpec['palette']

// --- palette swatch row (step 3) --------------------------------------------

const rowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

const swatchButton = (active: boolean): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  padding: 0,
  cursor: 'pointer',
  border: active ? '2px solid #4a6cd4' : '1px solid #44444c',
  position: 'relative',
  overflow: 'hidden',
})

function palettesEqual(a: Palette, b: Palette): boolean {
  return a.primary === b.primary && a.secondary === b.secondary && a.belly === b.belly && a.accentA === b.accentA && a.accentB === b.accentB && a.padsNose === b.padsNose
}

/** Apply a palette variant's FULL palette as one undoable command (mirrors
 * SpeciesSection's `applySpecies`). */
export function applyPaletteVariant(label: string, palette: Palette): void {
  const { spec, setSpec } = useCharacterStore.getState()
  const before = spec
  const after: CharacterSpec = { ...spec, palette: { ...palette } }
  studioCommands.execute({
    label: `Palette: ${label}`,
    do: () => setSpec(after),
    undo: () => setSpec(before),
    tryCoalesce: () => false,
  })
}

/** Color swatch row for the current species' curated palette variants; a
 * no-op render (nothing legal to show) when the species has none. */
export function SwatchRow() {
  const speciesId = useCharacterStore((s) => s.spec.meta.species)
  const palette = useCharacterStore((s) => s.spec.palette)
  const variants = getSpecies(speciesId)?.paletteVariants
  if (!variants || variants.length === 0) return null

  return (
    <div style={labelColStyle}>
      <span style={{ opacity: 0.7 }}>Colors</span>
      <div style={rowStyle} role="group" aria-label="Color variants">
        {variants.map((v) => (
          <button
            type="button"
            key={v.id}
            title={v.label}
            style={swatchButton(palettesEqual(palette, v.palette))}
            onClick={() => applyPaletteVariant(v.label, v.palette)}
          >
            <span style={{ position: 'absolute', inset: 0, background: v.palette.primary }} />
            <span
              style={{
                position: 'absolute',
                inset: '30%',
                borderRadius: '50%',
                background: v.palette.belly,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

const labelColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

// --- body pattern cards (step 4, plan 019 rasterizer) -----------------------

/** Patterns legal per archetype (mirrors patternRegistry.ts's own bird vs.
 * ported-mammal grouping comments; kept local since patternRegistry.ts is
 * 017/018/019 territory, not touched here). */
const BIRD_PATTERNS = ['pattern-robin', 'pattern-owl', 'pattern-duckling', 'pattern-penguin', 'pattern-eagle', 'pattern-chicken', 'pattern-peacock']
const MAMMAL_PATTERNS: Record<'biped-round' | 'biped-slim', string[]> = {
  'biped-round': ['pattern-shiba', 'pattern-bear'],
  'biped-slim': ['pattern-tabby', 'pattern-fox', 'pattern-rabbit'],
}

function patternsForArchetype(archetype: Archetype): string[] {
  return archetype === 'bird' ? BIRD_PATTERNS : (MAMMAL_PATTERNS[archetype] ?? [])
}

const PATTERN_LABELS: Record<string, string> = {
  'pattern-robin': 'Robin',
  'pattern-owl': 'Owl',
  'pattern-duckling': 'Duckling',
  'pattern-penguin': 'Penguin',
  'pattern-eagle': 'Eagle',
  'pattern-chicken': 'Chicken',
  'pattern-peacock': 'Peacock',
  'pattern-shiba': 'Shiba points',
  'pattern-tabby': 'Tabby stripes',
  'pattern-fox': 'Fox socks',
  'pattern-bear': 'Bear muzzle',
  'pattern-rabbit': 'Rabbit underside',
}

const PREVIEW_SIZE = 64
const bodyCache = new Map<Archetype, ProcBodyData>()
function bodyFor(archetype: Archetype): ProcBodyData {
  let b = bodyCache.get(archetype)
  if (!b) {
    b = buildProceduralBody(archetype)
    bodyCache.set(archetype, b)
  }
  return b
}

const previewCache = new Map<string, string>()

/** Small rasterized-mask preview colorized with the LIVE palette (reuses
 * plan 019's rasterizer at 64² instead of `getBodyMask`'s fixed 1024², and
 * bakes actual palette hex, not the fixed preview palette used by part
 * thumbnails — a card needs to preview what the pattern looks like on THIS
 * character). Memoized by (archetype, pattern, palette). */
function patternCardThumbnail(patternId: string, archetype: Archetype, palette: Palette): string {
  const key = `${archetype}:${patternId}:${palette.primary}:${palette.secondary}:${palette.belly}:${palette.accentA}`
  const hit = previewCache.get(key)
  if (hit) return hit

  const body = bodyFor(archetype)
  const channels = resolvePatternChannels(patternId, body)
  const { uv, indices } = bodyBuffers(body)
  const raster = rasterizeChannels({ uv, indices, channels }, PREVIEW_SIZE)
  const bytes = raster.toDataTexture().image.data as Uint8Array

  const primary = hexToRgb(palette.primary)
  const secondary = hexToRgb(palette.secondary)
  const belly = hexToRgb(palette.belly)
  const accent = hexToRgb(palette.accentA)

  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_SIZE
  canvas.height = PREVIEW_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(PREVIEW_SIZE, PREVIEW_SIZE)
  for (let p = 0; p < bytes.length; p += 4) {
    const r = bytes[p] / 255
    const g = bytes[p + 1] / 255
    const b = bytes[p + 2] / 255
    const a = bytes[p + 3] / 255
    const rest = Math.max(0, 1 - (r + g + b + a))
    const wr = r + rest
    img.data[p] = wr * primary[0] + g * secondary[0] + b * belly[0] + a * accent[0]
    img.data[p + 1] = wr * primary[1] + g * secondary[1] + b * belly[1] + a * accent[1]
    img.data[p + 2] = wr * primary[2] + g * secondary[2] + b * belly[2] + a * accent[2]
    img.data[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL()
  previewCache.set(key, url)
  return url
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return [200, 160, 100]
  return [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16), Number.parseInt(m[3], 16)]
}

const patternCardButton = (active: boolean): React.CSSProperties => ({
  width: 64,
  height: 64,
  padding: 0,
  borderRadius: 8,
  overflow: 'hidden',
  border: active ? '2px solid #4a6cd4' : '1px solid #44444c',
  cursor: 'pointer',
  background: '#2a2a30',
})

/** Body pattern picker (plan 021 step 4): a "Plain" card (textureId
 * 'authored') plus every pattern legal for the current archetype, tapping
 * sets `materials.body.textureId` through the same command path Materials'
 * other region edits use (`patch`, coalesced per animation frame — palette
 * swatches above use `studioCommands` because they replace the whole
 * palette; a textureId flip is a single field write, so a plain `patch`
 * call is the existing idiom here). */
export function PatternCards() {
  const archetype = useCharacterStore((s) => s.spec.meta.archetype)
  const palette = useCharacterStore((s) => s.spec.palette)
  const materials = useCharacterStore((s) => s.spec.materials)
  const patch = useCharacterStore((s) => s.patch)
  const assign = materials.body ?? FALLBACK_ASSIGN
  const current = assign.textureId ?? 'authored'

  const patterns = useMemo(() => patternsForArchetype(archetype), [archetype])

  const setTexture = (id: string) => {
    patch((draft) => {
      const currentAssign = draft.materials.body ?? FALLBACK_ASSIGN
      draft.materials = { ...draft.materials, body: { ...currentAssign, textureId: id } }
    })
  }

  return (
    <div style={labelColStyle}>
      <span style={{ opacity: 0.7 }}>Pattern</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Body pattern">
        <button type="button" title="Plain" style={patternCardButton(current === 'authored')} onClick={() => setTexture('authored')}>
          <img
            src={patternCardThumbnail('authored', archetype, palette)}
            alt="Plain"
            style={{ width: '100%', height: '100%' }}
          />
        </button>
        {patterns.map((id) => (
          <button type="button" key={id} title={PATTERN_LABELS[id] ?? id} style={patternCardButton(current === id)} onClick={() => setTexture(id)}>
            <img src={patternCardThumbnail(id, archetype, palette)} alt={PATTERN_LABELS[id] ?? id} style={{ width: '100%', height: '100%' }} />
          </button>
        ))}
      </div>
    </div>
  )
}
