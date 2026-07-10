// UV atlas for the procedural body (plan 013) — ported verbatim from
// scripts/blender/bodies.py UV_* rectangles. Plan 015's TS mask rasterizer
// imports `UV_ATLAS` by name; keep it stable.
//
// The head island is the hard contract: src/core/face/faceComposite.ts pins
// HEAD_UV_ISLAND = [0, 0.45, 0.55, 1] and treats it as an EQUIRECTANGULAR
// spherical parameterization — u = front-centered azimuth (azimuth 0 → island
// u-center, wrap seam at the back), v = polar angle bottom-up. `headUv()`
// reproduces exactly that mapping so drawn faces land correctly.
//
// V-FLIP (glTF convention): bodies.py computes v BOTTOM-UP in Blender's UV
// space, but the shipped GLBs — the contract faceComposite + the palette masks
// were authored against — store the Blender→glTF EXPORT flip (v_gltf =
// 1 − v_blender; masks are loaded flipY=false, meshkit.rasterize_mask bakes the
// same `1−v`). The kit skips Blender, so it must emit the EXPORTED UVs directly:
// `islandUv` returns `1 − v_blender`. Verified against body-*.glb — e.g. the
// biped-round head TOP pole is uv.v=0.0 and the front equator is uv.v≈0.275,
// exactly the flip of the naive [0.45,1.0] Blender range. Without this the head
// samples the empty half of the face overlay and the drawn face vanishes.

import { type SurfacePiece } from './surface'

export type IslandName =
  | 'head'
  | 'torso'
  | 'armL'
  | 'armR'
  | 'handL'
  | 'handR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR'

export type UvRect = readonly [u0: number, v0: number, u1: number, v1: number]

/** UV islands, bodies.py:16-26 verbatim (head/torso front-centered). */
export const UV_ATLAS: Record<IslandName, UvRect> = {
  head: [0.0, 0.45, 0.55, 1.0],
  torso: [0.55, 0.45, 1.0, 1.0],
  armL: [0.0, 0.22, 0.2, 0.45],
  armR: [0.2, 0.22, 0.4, 0.45],
  handL: [0.4, 0.22, 0.5, 0.45],
  handR: [0.5, 0.22, 0.6, 0.45],
  legL: [0.6, 0.22, 0.8, 0.45],
  legR: [0.8, 0.22, 1.0, 0.45],
  footL: [0.0, 0.0, 0.25, 0.22],
  footR: [0.25, 0.0, 0.5, 0.22],
}

/**
 * Map a shell's (azimuth u01, polar v01) params into an island rect, in
 * EXPORTED glTF UV convention (v flipped — see file header). `frontCenter`
 * shifts azimuth so the front (azimuth 0) lands at the island's u-center and
 * the seam falls at the back — matching bodies.py `uv_front_center` and
 * faceComposite's `featureRect` (which places azimuth 0 at u0 + 0.5·uSpan).
 */
export function islandUv(rect: UvRect, u01: number, v01: number, frontCenter: boolean): [number, number] {
  const [u0, v0, u1, v1] = rect
  const uu = azimuthToIslandU(u01, frontCenter)
  return [u0 + uu * (u1 - u0), 1.0 - (v0 + v01 * (v1 - v0))]
}

/**
 * Azimuth u01 → island-normalized u. For u01 ∈ [0,1) this is exactly the old
 * `(u01 + 0.5) % 1` front-center shift / identity; the branch form (no modulo)
 * additionally lets seam-duplicated vertices carry u01 = source + 1 and land on
 * the island's u=1 edge instead of wrapping back to 0 — the wrap-seam split
 * (plan 017 r2) depends on this.
 */
export function azimuthToIslandU(u01: number, frontCenter: boolean): number {
  return frontCenter ? (u01 >= 0.5 ? u01 - 0.5 : u01 + 0.5) : u01
}

/** Head-island UV for an equirect param — the face-contract entry point. */
export function headUv(u01: number, v01: number): [number, number] {
  return islandUv(UV_ATLAS.head, u01, v01, true)
}

// --- wrap-seam vertex split (plan 017 r2) --------------------------------------
// Every azimuthally-closed grid shares its seam column between the island's
// u=0 and u=1 edges, so one painted u per vertex forces ~1 column of triangles
// to span the whole island in UV — the GPU sweeps the sampled texel through the
// island interior and any bound mask TEXTURE shows a thin stripe down the seam
// (the wave-1 "stripe down the back", previously misattributed to mask blur).
// The fix is the standard one: duplicate the seam-column vertices (same
// position/params-v/channels/weights, azimuth u01 = source + 1 so
// `azimuthToIslandU` lands them on the u=1 edge) and rewire the wrap-side
// triangles onto the duplicates. Pole-fan triangles get the same treatment —
// the shared pole vertex carries a single u, so each fan triangle is rewired to
// its own pole copy at the fan wedge's mean azimuth.
//
// Duplicates are recorded in `piece.welds` (dup → source): the MeshBuilder
// carries them into `BuiltMesh.weldPairs`/`weldedIndices` so the manifold audit
// runs on the pre-split topology and vertex normals can be weld-averaged
// (otherwise the UV split becomes a lighting crease).

/**
 * Split a piece's azimuth wrap seam (and pole fans) for island-UV painting.
 * Mutates the piece in place; call after weights/channels are painted and
 * immediately before UVs are painted (paintUv does this).
 */
export function splitWrapSeam(piece: SurfacePiece, frontCenter: boolean): void {
  const welds = (piece.welds ??= [])
  const dupOf = new Map<string, number>()
  const duplicate = (src: number, u01: number): number => {
    const key = `${src}|${u01}`
    const hit = dupOf.get(key)
    if (hit !== undefined) return hit
    const di = piece.pos.length / 3
    piece.pos.push(piece.pos[src * 3], piece.pos[src * 3 + 1], piece.pos[src * 3 + 2])
    piece.params.push(u01, piece.params[src * 2 + 1])
    piece.uv.push(piece.uv[src * 2], piece.uv[src * 2 + 1])
    piece.channels.push(
      piece.channels[src * 4],
      piece.channels[src * 4 + 1],
      piece.channels[src * 4 + 2],
      piece.channels[src * 4 + 3],
    )
    for (const track of piece.weights.values()) track.push(track[src] ?? 0)
    welds.push([di, src])
    dupOf.set(key, di)
    return di
  }

  // Pass A — pole fans: rewire each fan triangle to its own pole copy at the
  // wrap-aware mean azimuth of its two ring vertices (the original pole vertex
  // goes dead — harmless, same as gridToPiece's removed-cap interiors).
  const isPole = (i: number): boolean => piece.params[i * 2 + 1] === 0 || piece.params[i * 2 + 1] === 1
  for (let t = 0; t < piece.tris.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i = piece.tris[t + k]
      if (!isPole(i)) continue
      const a = piece.params[piece.tris[t + ((k + 1) % 3)] * 2]
      const b = piece.params[piece.tris[t + ((k + 2) % 3)] * 2]
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const mean = hi - lo > 0.5 ? ((lo + 1 + hi) / 2) % 1 : (lo + hi) / 2
      piece.tris[t + k] = duplicate(i, mean)
      break
    }
  }

  // Pass B — wrap triangles: any triangle whose island-u span exceeds half the
  // island wraps the seam; its low-side vertices move to duplicates carrying
  // u01 = source + 1 (island u-edge 1 instead of 0).
  for (let t = 0; t < piece.tris.length; t += 3) {
    let min = Infinity
    let max = -Infinity
    for (let k = 0; k < 3; k++) {
      const uu = azimuthToIslandU(piece.params[piece.tris[t + k] * 2], frontCenter)
      if (uu < min) min = uu
      if (uu > max) max = uu
    }
    if (max - min <= 0.5) continue
    for (let k = 0; k < 3; k++) {
      const i = piece.tris[t + k]
      if (azimuthToIslandU(piece.params[i * 2], frontCenter) < 0.5) {
        piece.tris[t + k] = duplicate(i, piece.params[i * 2] + 1)
      }
    }
  }
}
