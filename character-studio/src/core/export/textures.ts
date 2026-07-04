// Texture + face-UV helpers for the compiler (plan 011 step 2).
//
// TEXTURE STRATEGY (documented deviation, plan-sanctioned): face atlases and
// palette masks ship as **PNG inside the GLB**, not KTX2. Rationale:
//   1. The plan's own STOP condition permits PNG for the FACE atlas whenever
//      KTX2 would degrade the drawn strokes — the face is the most quality-
//      sensitive texture and UASTC's block artifacts show on 1-px linework.
//   2. `compileCharacter` must run in BOTH node (CLI) and the browser
//      (ExportPanel) with identical output; a wasm KTX2 encoder in a browser
//      worker is the plan's own "if unreliable, fall back to PNG" branch.
//   3. The assets are tiny (256²–512² atlases, low-poly meshes), so meshopt on
//      geometry keeps the GLB far under the 8 MB budget without texture
//      transcoding (measured in the conformance suite).
// KTX2/UASTC is the documented future production optimization; the format and
// runtime already tolerate it (the runtime never assumes PNG).
//
// Pure TS: only @gltf-transform/core + @gltf-transform/extensions. No three, no DOM.

import type { Document, Texture, TextureInfo } from '@gltf-transform/core'
import { KHRTextureTransform } from '@gltf-transform/extensions'

/** glTF sampler wrap enum (KHR/GL): clamp-to-edge. */
export const WRAP_CLAMP_TO_EDGE = 33071
/** glTF sampler filter enum: linear. */
export const FILTER_LINEAR = 9729

/**
 * KHR_texture_transform values that select one 4×4 atlas cell, correcting for
 * the studio→glTF vertical-flip.
 *
 * The studio samples atlases as `three` textures with `flipY = true`
 * (atlas.ts is authored bottom-up for exactly that). glTF textures are always
 * top-left origin (`flipY = false`). For an unchanged plane-UV attribute, the
 * identical texel is selected by flipping V in the transform:
 *   studio  (flipY=true):  sample = image(offset+uv·repeat) mirrored in V
 *   ⇒ glTF: offset = (col·c, 1 − row·c),  scale = (c, −c)      where c = cellUv
 * (derivation checked against the studio sampler in the conformance suite;
 *  the runtime re-derives the SAME formula in `faceCellOffset`.)
 */
export function faceCellTransform(
  cell: readonly [number, number],
  cellUv = 0.25,
): { offset: [number, number]; scale: [number, number] } {
  const [col, row] = cell
  return { offset: [col * cellUv, 1 - row * cellUv], scale: [cellUv, -cellUv] }
}

/** Embed PNG bytes as a glTF texture (shared image; no transcoding). */
export function embedPngTexture(doc: Document, name: string, png: Uint8Array): Texture {
  return doc.createTexture(name).setMimeType('image/png').setImage(png)
}

/** Configure a texture slot as a clamped, linear-filtered atlas cell sampler. */
export function assignCellTexture(
  _doc: Document,
  transformExt: KHRTextureTransform,
  info: TextureInfo,
  cell: readonly [number, number],
  cellUv = 0.25,
): void {
  info.setWrapS(WRAP_CLAMP_TO_EDGE).setWrapT(WRAP_CLAMP_TO_EDGE)
  info.setMinFilter(FILTER_LINEAR).setMagFilter(FILTER_LINEAR)
  const { offset, scale } = faceCellTransform(cell, cellUv)
  info.setExtension(
    'KHR_texture_transform',
    transformExt.createTransform().setOffset(offset).setScale(scale),
  )
}

/** Ensure a single KHRTextureTransform extension instance per document. */
export function textureTransformExtension(doc: Document): KHRTextureTransform {
  const existing = doc
    .getRoot()
    .listExtensionsUsed()
    .find((e): e is KHRTextureTransform => e.extensionName === KHRTextureTransform.EXTENSION_NAME)
  return existing ?? doc.createExtension(KHRTextureTransform)
}
