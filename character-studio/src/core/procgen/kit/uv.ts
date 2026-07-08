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
  const uu = frontCenter ? (u01 + 0.5) % 1.0 : u01
  return [u0 + uu * (u1 - u0), 1.0 - (v0 + v01 * (v1 - v0))]
}

/** Head-island UV for an equirect param — the face-contract entry point. */
export function headUv(u01: number, v01: number): [number, number] {
  return islandUv(UV_ATLAS.head, u01, v01, true)
}
