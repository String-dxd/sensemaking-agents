// Versioned migration into the current BirdGenome (v2). The SINGLE chokepoint:
// every entry path (URL-hash decode, localStorage load, JSON import) runs this
// BEFORE genomeError validation, so a stale v1 bird upgrades in place instead of
// resetting to defaults. PURE — no three/DOM. v1 = BirdConfig (one masked GLB +
// 2-channel featherPalette + slots); v2 folds it into the 6-zone GLB lane.

import type { BirdConfig } from './birdConfig'
import { type BirdGenome, MASKED_GLB_URL, type PlumagePalette } from './genome'

// Masked hero defaults for the zones v1 never carried (from the engine palette).
const MASKED_BEAK = '#2a1a14'
const MASKED_LEGS = '#3a2418'
const MASKED_EYE = '#1a1a1a'

/** Mix a #rgb/#rrggbb toward white by t∈[0,1]. Pure (no three). */
function lightenHex(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffd3a5'
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  const hx = (c: number) => mix(c).toString(16).padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

function migrateV1toV2(v1: BirdConfig): BirdGenome {
  const fp = v1.featherPalette ?? { body: '#ff6b0d', accent: '#d11f1a' }
  const palette: PlumagePalette = {
    back: fp.body,
    belly: lightenHex(fp.body, 0.55),
    accent: fp.accent,
    beak: MASKED_BEAK,
    legs: MASKED_LEGS,
    eye: MASKED_EYE,
  }
  return {
    version: 2,
    // v1 only ever had baseId 'masked' (a GLB), so every v1 bird lands in the
    // GLB lane with its 2-channel recolor folded into 6 zones.
    base: { kind: 'glb', species: 'masked', glbUrl: MASKED_GLB_URL, palette },
    identity: { name: '', personality: 'bright' },
    slots: v1.slots ?? {},
  }
}

/**
 * Returns a v2-shaped candidate (validate with genomeError afterwards). v2 passes
 * through; v1 upgrades; anything else is returned untouched so validation rejects
 * it with a descriptive error.
 */
export function migrate(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed
  const o = parsed as Record<string, unknown>
  if (o.version === 2) return parsed
  if (o.version === 1) return migrateV1toV2(o as unknown as BirdConfig)
  return parsed
}
