// Per-vertex palette-mask channel evaluation (plan 013), ported from
// scripts/blender/bodies.py _torso_channels/_head_channels + the limb accents.
// Channels are R/G/B/A = primary/secondary/belly/accentA (bodies.py CH_*).
// Plan 015's TS rasterizer bakes these fields (and the species patterns, which
// are further field functions of the same shape) into mask textures — so the
// kit stores them per-vertex on the built body (ProcBodyData.channels).

import { setChannel, smoothstep, type SurfacePiece, type Vec3, vertexCount } from './surface'

export const CH_PRIMARY = 0
export const CH_SECONDARY = 1
export const CH_BELLY = 2
export const CH_ACCENT = 3

/** Torso belly (front ellipse) + back saddle (secondary). bodies.py:349-359. */
export function torsoChannels(
  piece: SurfacePiece,
  cy: number,
  ry: number,
  rx: number,
  _archetype: string,
): void {
  const pos = piece.pos
  const rxSafe = Math.max(rx, 1e-9)
  setChannel(piece, CH_BELLY, (i) => {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const du = x / (rx * 0.85)
    const dv = (y - (cy - ry * 0.12)) / (ry * 0.62)
    const front = smoothstep(0.0, 0.35, z / rxSafe)
    return (1.0 - smoothstep(0.55, 1.0, Math.hypot(du, dv))) * front
  })
  setChannel(piece, CH_SECONDARY, (i) => {
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const back = smoothstep(0.15, 0.75, -z / rxSafe) * smoothstep(cy - ry * 0.5, cy + ry * 0.45, y)
    return back * 0.9
  })
}

/** Head face-patch (belly tone) + cap (secondary). bodies.py:362-371. */
export function headChannels(piece: SurfacePiece, center: Vec3, r: number, archetype: string): void {
  const pos = piece.pos
  setChannel(piece, CH_BELLY, (i) => {
    const dy = (pos[i * 3 + 1] - center[1]) / r
    const dz = (pos[i * 3 + 2] - center[2]) / r
    const face = smoothstep(0.25, 0.75, dz) * smoothstep(0.55, -0.1, dy)
    return face * 0.9
  })
  setChannel(piece, CH_SECONDARY, (i) => {
    const dy = (pos[i * 3 + 1] - center[1]) / r
    const dz = (pos[i * 3 + 2] - center[2]) / r
    const cap = archetype === 'bird' ? smoothstep(0.05, 0.6, dy) : smoothstep(0.3, 0.8, dy) * smoothstep(0.25, -0.35, dz)
    return cap * 0.9
  })
}

/** Flat accent over an entire piece (hands + feet). bodies.py:270,310. */
export function accentAll(piece: SurfacePiece, value: number): void {
  const n = vertexCount(piece)
  for (let i = 0; i < n; i++) piece.channels[i * 4 + CH_ACCENT] = Math.min(Math.max(value, 0), 1)
}

/** Accent gradient toward a chain tip (wing tips). bodies.py:230. */
export function tipAccent(piece: SurfacePiece, e0: number, e1: number, value: number): void {
  setChannel(piece, CH_ACCENT, (i) => smoothstep(e0, e1, piece.params[i * 2 + 1]) * value)
}
