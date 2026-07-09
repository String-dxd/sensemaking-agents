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

/** Torso belly: a crisp front oval at full strength with a narrow soft edge
 * (Animal-Crossing flat regions — no wide airbrush falloff, no back saddle:
 * the rest of the body reads as one solid primary). */
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
    // breast oval: centered high on the chest so it meets the head bib at the
    // neck seam (robin breast, not a low belly blob)
    const dv = (y - (cy + ry * 0.12)) / (ry * 0.75)
    // front hemisphere gate, narrow transition so the oval doesn't wrap
    const front = smoothstep(0.05, 0.15, z / rxSafe)
    // full 1.0 inside the oval, ~0.08-wide soft edge at the rim
    return (1.0 - smoothstep(0.82, 0.9, Math.hypot(du, dv))) * front
  })
}

/** Head face-patch (belly tone): a crisp full-strength patch on the front of
 * the head with a narrow edge. No secondary "cap" — a solid head reads
 * cleaner on the chibi bird. */
export function headChannels(piece: SurfacePiece, center: Vec3, r: number, _archetype: string): void {
  const pos = piece.pos
  setChannel(piece, CH_BELLY, (i) => {
    const dx = (pos[i * 3] - center[0]) / r
    const dy = (pos[i * 3 + 1] - center[1]) / r
    const dz = (pos[i * 3 + 2] - center[2]) / r
    // rounded bib: front-gated, narrowed sideways so it reads as a face/chin
    // patch instead of a visor band wrapping the whole head width
    const side = 1.0 - smoothstep(0.45, 0.65, Math.abs(dx))
    return smoothstep(0.35, 0.5, dz) * (1.0 - smoothstep(0.1, 0.22, dy)) * side
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
