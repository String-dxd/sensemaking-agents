// r149 compatibility shims for TypeScript engine modules (KTD-4).
//
// @types/three is pinned at 0.184 repo-wide while the app's runtime three is
// r149, so the pre-r152 color-management API (`texture.encoding`,
// `THREE.sRGBEncoding`) no longer exists IN THE TYPES — but it is the only
// API that actually works at runtime (the r152+ names silently no-op; see
// test/engine/colorspace-guard.test.ts). These helpers keep the correct
// runtime calls type-safe without sprinkling casts.

/** THREE.sRGBEncoding — the r149 constant (removed from @types/three@0.184). */
export const SRGB_ENCODING = 3001

/** Set `texture.encoding = THREE.sRGBEncoding` (r149 API) on a texture whose
 *  0.184 type no longer declares the property. */
export function markTextureSRGB(texture: object): void {
  ;(texture as { encoding?: number }).encoding = SRGB_ENCODING
}
