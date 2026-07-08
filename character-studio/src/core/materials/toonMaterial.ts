// Toon material factory (plan 005, step 2) — the Pokopia/AC "soft matte
// vinyl toy" shading model (plan 000 §2.3), implemented by extending
// MeshToonMaterial via onBeforeCompile so shadow-map receiving, skinning and
// morph targets keep working for free (plan 006 needs both). The injection
// only touches the FRAGMENT shader — the vertex chain (skinning_vertex,
// morphtarget_vertex, shadowmap chunks) is left byte-identical, and a unit
// test asserts that.
//
// The recipe (implemented exactly as documented):
//   1. per light: d = dot(N, L), wrap-biased: dw = (d + w) / (1 + w), w ≈ 0.35
//   2. soft step at the terminator: s = smoothstep(0.5 - softness, 0.5 + softness, dw)
//      with softness = rampSoftness * 0.5
//   3. color = mix(albedo * shadowTint, albedo * lightTint, s) — the shadow is
//      a TINTED (cool/violet) version of the albedo, never gray/black; plus an
//      optional warm 1D band at the terminator for fake-SSS (terminatorWarmth)
//   4. rim = pow(1 - dot(N, V), 3) * rimStrength * lightColor, masked to the
//      lit side (* s), added
//   5. ambient comes from the scene hemisphere light (high floor keeps
//      shadows pastel) through the stock RE_IndirectDiffuse path.
//
// Swappability: everything WebGL-specific is contained behind
// `createToonMaterial` — a future WebGPU/TSL port replaces this file only.

import * as THREE from 'three'
import type { MaterialAssign } from '../spec/schema'
import { hexToLinear, makeDebugMaskTexture, type Palette, resolvePalette } from './palette'

// --- defaults (tuned at the plan-005 step-6 look gate) -----------------------

export const DEFAULT_WRAP = 0.35
export const DEFAULT_TERMINATOR_WARMTH = 0.15
/** Warm band color for the fake-SSS terminator (linear-ish orange). */
const TERMINATOR_WARM_COLOR = 'vec3( 0.30, 0.08, 0.02 )'
/** smoothstep(0.5, 0.5, x) is undefined GLSL — clamp softness above zero. */
const MIN_SOFTNESS = 1e-3

// --- texture registry --------------------------------------------------------

export interface ResolvedTextures {
  /** Grayscale luminance (authored albedo). Null → flat white. */
  map: THREE.Texture | null
  /** Channel-packed palette mask (R/G/B/A → slots). Null → unmasked path. */
  maskMap: THREE.Texture | null
}

export type TextureResolver = (textureId: string) => ResolvedTextures

let debugMask: THREE.DataTexture | null = null

/**
 * Base registry: `authored` (the mesh's own plan-006 palette-mask pack —
 * resolved by the assembly's region-aware resolver; unmasked here so tests
 * and the placeholder keep working), `debug-spots` (procedural spots + belly
 * mask on the placeholder UVs) and `none`.
 */
export const defaultTextureResolver: TextureResolver = (textureId) => {
  if (textureId === 'debug-spots') {
    debugMask ??= makeDebugMaskTexture()
    return { map: null, maskMap: debugMask }
  }
  return { map: null, maskMap: null }
}

export const TEXTURE_IDS = ['authored', 'none', 'debug-spots'] as const

// --- uniforms ----------------------------------------------------------------

export interface ToonUniforms {
  uWrap: { value: number }
  uSoftness: { value: number }
  uRimStrength: { value: number }
  uTerminatorWarmth: { value: number }
  uShadowTint: { value: THREE.Color }
  uPaletteColors: { value: THREE.Color[] }
  uMaskMap: { value: THREE.Texture | null }
  uFaceMap: { value: THREE.Texture | null }
}

export interface ToonMaterialData {
  toonUniforms: ToonUniforms
  /** Boolean feature toggles; every entry participates in the program key.
   * `faceMap`/`paletteVertex` are optional so older define literals stay valid.
   * `paletteVertex` (plan 013 visual parity): palette weights come from the
   * geometry's `paletteChannels` vec4 attribute instead of a mask texture —
   * the procedural builders compute exact per-vertex channels, while the
   * authored mask PNGs were baked against the retired GLB UV unwraps. */
  toonDefines: { paletteMask: boolean; faceMap?: boolean; paletteVertex?: boolean }
}

export type ToonMaterial = THREE.MeshToonMaterial & { userData: ToonMaterialData }

export interface ToonMaterialOptions {
  /** Wrap-lighting bias `w` (recipe step 1). */
  wrap?: number
  /** Fake-SSS warm band strength at the terminator (recipe step 3). */
  terminatorWarmth?: number
  /** Maps `assign.textureId` to textures; defaults to the debug registry. */
  resolveTexture?: TextureResolver
  /** Palette weights from the geometry's `paletteChannels` vec4 attribute
   * (procedural meshes). Overrides the mask-texture path. */
  vertexChannels?: boolean
}

// --- GLSL injection ----------------------------------------------------------

// Full replacement for <lights_toon_pars_fragment> (chunk source verified
// against three r185 — the RE_Direct_Toon signature provides geometryNormal
// and geometryViewDir). Note the toon template's outgoingLight only sums
// directDiffuse + indirectDiffuse, so the rim is added to directDiffuse.
const TOON_LIGHTING_PARS = /* glsl */ `
varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
uniform float uWrap;
uniform float uSoftness;
uniform float uRimStrength;
uniform float uTerminatorWarmth;
uniform vec3 uShadowTint;
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	// 1. wrap-biased NdotL
	float dw = ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( 1.0 + uWrap );
	// 2. soft step at the terminator
	float s = smoothstep( 0.5 - uSoftness, 0.5 + uSoftness, dw );
	// 3. tinted shadow (never gray) + fake-SSS warm band at the terminator
	vec3 ramp = mix( uShadowTint, vec3( 1.0 ), s );
	float band = 1.0 - min( abs( dw - 0.5 ) * 4.0, 1.0 );
	ramp += uTerminatorWarmth * band * ${TERMINATOR_WARM_COLOR};
	reflectedLight.directDiffuse += ramp * directLight.color * BRDF_Lambert( material.diffuseColor );
	// 4. rim, masked to the lit side
	float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
	reflectedLight.directDiffuse += rim * uRimStrength * s * directLight.color;
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	// 5. ambient floor from the scene hemisphere/IBL — keeps shadows pastel
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon
`

const MASK_PARS = /* glsl */ `
#include <map_pars_fragment>
#ifdef USE_PALETTE_MASK
	uniform sampler2D uMaskMap;
#endif
#ifdef USE_PALETTE_VERTEX
	varying vec4 vPaletteChannels;
#endif
#if defined( USE_PALETTE_MASK ) || defined( USE_PALETTE_VERTEX )
	uniform vec3 uPaletteColors[ 6 ];
#endif
#ifdef USE_FACE_MAP
	uniform sampler2D uFaceMap;
#endif
`

// albedo = luminance × Σ maskChannel_i · palette_i, unmasked remainder →
// primary (index 0). Mirrors paletteWeightsFromMask() in palette.ts exactly.
// The weights come from the mask texture, or — on procedural meshes — from
// the per-vertex channels (identical R/G/B/A semantics).
const MASK_FRAGMENT = /* glsl */ `
#include <map_fragment>
#if defined( USE_PALETTE_MASK ) || defined( USE_PALETTE_VERTEX )
	#ifdef USE_PALETTE_VERTEX
	vec4 paletteMask = clamp( vPaletteChannels, 0.0, 1.0 );
	#else
	vec4 paletteMask = texture2D( uMaskMap, vMapUv );
	#endif
	float paletteRest = max( 0.0, 1.0 - ( paletteMask.r + paletteMask.g + paletteMask.b + paletteMask.a ) );
	diffuseColor.rgb *= ( paletteMask.r + paletteRest ) * uPaletteColors[ 0 ]
		+ paletteMask.g * uPaletteColors[ 1 ]
		+ paletteMask.b * uPaletteColors[ 2 ]
		+ paletteMask.a * uPaletteColors[ 3 ];
#endif
`

// Vertex-side plumbing for USE_PALETTE_VERTEX: declare the attribute/varying
// and copy it through. Textually injected always, behaviorally inert unless
// the define is on — the skinning/morph-target chunks stay byte-identical.
const PALETTE_VERTEX_PARS = /* glsl */ `
#include <common>
#ifdef USE_PALETTE_VERTEX
	attribute vec4 paletteChannels;
	varying vec4 vPaletteChannels;
#endif
`

const PALETTE_VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
#ifdef USE_PALETTE_VERTEX
	vPaletteChannels = paletteChannels;
#endif
`

// Drawn-face overlay (advisor plan 002): the head-UV face texture is
// composited as the LAST write to gl_FragColor.rgb — injected at
// <dithering_fragment>, which sits after tonemapping/colorspace/fog in the
// toon template — so the face stays print-crisp/unlit under any tone
// mapping (facePlane.ts contract: drawn faces never pick up scene shading).
// The texel is sRGB-decoded to linear by the sampler; linearToOutputTexel
// (defined in every program prelude, same transfer colorspace_fragment
// applies) converts it to output space before the mix.
const FACE_FRAGMENT = /* glsl */ `
#ifdef USE_FACE_MAP
	vec4 faceTexel = texture2D( uFaceMap, vMapUv );
	faceTexel = linearToOutputTexel( faceTexel );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, faceTexel.rgb, faceTexel.a );
#endif
#include <dithering_fragment>
`

/** Exported for tests: the injection applied inside onBeforeCompile. */
export function injectToonShader(shader: { uniforms: Record<string, unknown>; fragmentShader: string; vertexShader?: string }, uniforms: ToonUniforms): void {
  Object.assign(shader.uniforms, uniforms)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <map_pars_fragment>', MASK_PARS)
    .replace('#include <map_fragment>', MASK_FRAGMENT)
    .replace('#include <lights_toon_pars_fragment>', TOON_LIGHTING_PARS)
    .replace('#include <dithering_fragment>', FACE_FRAGMENT)
  if (shader.vertexShader !== undefined) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', PALETTE_VERTEX_PARS)
      .replace('#include <begin_vertex>', PALETTE_VERTEX_MAIN)
  }
}

/** Program cache key from the boolean define set (variant explosion control). */
export function toonProgramCacheKey(defines: ToonMaterialData['toonDefines']): string {
  return `toon|mask:${defines.paletteMask ? 1 : 0}|face:${defines.faceMap ? 1 : 0}|vch:${defines.paletteVertex ? 1 : 0}`
}

/** Rebuild `material.defines` from the toonDefines flag set — the single
 * place define objects are written, so flag toggles never clobber each other. */
function syncToonDefines(material: ToonMaterial): void {
  const defines: Record<string, string> = {}
  if (material.userData.toonDefines.paletteMask) defines.USE_PALETTE_MASK = ''
  if (material.userData.toonDefines.faceMap) defines.USE_FACE_MAP = ''
  if (material.userData.toonDefines.paletteVertex) defines.USE_PALETTE_VERTEX = ''
  material.defines = defines
}

// A 1×1 white luminance fallback keeps USE_MAP (and vMapUv) alive so the
// palette-mask path always has UVs, even with no authored texture.
let whiteTexture: THREE.DataTexture | null = null
function getWhiteTexture(): THREE.DataTexture {
  if (!whiteTexture) {
    whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat)
    whiteTexture.needsUpdate = true
  }
  return whiteTexture
}

// --- factory -------------------------------------------------------------

/**
 * Build the studio toon material for one region from its spec MaterialAssign
 * and the character palette. Reads every MaterialAssign field: rampSoftness /
 * rimStrength / shadowTint drive uniforms, textureId resolves through the
 * texture registry. (`outline` is not a surface property — the viewport
 * applies it as a separate inverted-hull pass via ./outline.ts.)
 */
export function createToonMaterial(assign: MaterialAssign, palette: Palette, opts: ToonMaterialOptions = {}): ToonMaterial {
  const resolveTexture = opts.resolveTexture ?? defaultTextureResolver
  const textures = opts.vertexChannels ? { map: null, maskMap: null } : resolveTexture(assign.textureId ?? 'none')

  const uniforms: ToonUniforms = {
    uWrap: { value: opts.wrap ?? DEFAULT_WRAP },
    uSoftness: { value: Math.max(assign.rampSoftness * 0.5, MIN_SOFTNESS) },
    uRimStrength: { value: assign.rimStrength },
    uTerminatorWarmth: { value: opts.terminatorWarmth ?? DEFAULT_TERMINATOR_WARMTH },
    uShadowTint: { value: new THREE.Color().setRGB(...hexToLinear(assign.shadowTint), THREE.LinearSRGBColorSpace) },
    uPaletteColors: { value: resolvePalette(palette) },
    uMaskMap: { value: textures.maskMap },
    uFaceMap: { value: null },
  }

  const material = new THREE.MeshToonMaterial() as ToonMaterial
  material.userData = {
    toonUniforms: uniforms,
    toonDefines: { paletteMask: textures.maskMap !== null, faceMap: false, paletteVertex: opts.vertexChannels ?? false },
  }
  material.map = textures.map ?? getWhiteTexture()
  syncToonDefines(material)
  if (material.userData.toonDefines.paletteMask || material.userData.toonDefines.paletteVertex) {
    material.color.setRGB(1, 1, 1)
  } else {
    // Unmasked path: flat primary coat (recolored live via applyPalette).
    material.color.setRGB(...hexToLinear(palette.primary), THREE.LinearSRGBColorSpace)
  }
  material.onBeforeCompile = (shader) => injectToonShader(shader, uniforms)
  material.customProgramCacheKey = () => toonProgramCacheKey(material.userData.toonDefines)
  return material
}

// --- live updates (no recompile) ----------------------------------------

/** Push rampSoftness / rimStrength / shadowTint into the live uniforms. */
export function applyMaterialAssign(material: ToonMaterial, assign: MaterialAssign): void {
  const u = material.userData.toonUniforms
  u.uSoftness.value = Math.max(assign.rampSoftness * 0.5, MIN_SOFTNESS)
  u.uRimStrength.value = assign.rimStrength
  u.uShadowTint.value.setRGB(...hexToLinear(assign.shadowTint), THREE.LinearSRGBColorSpace)
}

/** Push a (re)colored palette into the live uniforms. */
export function applyPalette(material: ToonMaterial, palette: Palette): void {
  const u = material.userData.toonUniforms
  const colors = resolvePalette(palette)
  for (let i = 0; i < colors.length; i++) u.uPaletteColors.value[i].copy(colors[i])
  if (!material.userData.toonDefines.paletteMask && !material.userData.toonDefines.paletteVertex) {
    material.color.setRGB(...hexToLinear(palette.primary), THREE.LinearSRGBColorSpace)
  }
}

/**
 * Swap the mask/texture path at runtime (`textureId` change). Toggling the
 * mask define forces a program change — customProgramCacheKey reads the live
 * define set, so three's program cache dedupes correctly across materials.
 */
export function applyTextureId(material: ToonMaterial, assign: MaterialAssign, palette: Palette, resolveTexture: TextureResolver = defaultTextureResolver): void {
  // Vertex-channel materials own their palette weights — textureId swaps
  // must not re-enable the (UV-mismatched) mask path on procedural meshes.
  if (material.userData.toonDefines.paletteVertex) return
  const textures = resolveTexture(assign.textureId ?? 'none')
  const wantMask = textures.maskMap !== null
  material.userData.toonUniforms.uMaskMap.value = textures.maskMap
  material.map = textures.map ?? getWhiteTexture()
  if (wantMask !== material.userData.toonDefines.paletteMask) {
    material.userData.toonDefines.paletteMask = wantMask
    syncToonDefines(material)
    if (wantMask) material.color.setRGB(1, 1, 1)
    else material.color.setRGB(...hexToLinear(palette.primary), THREE.LinearSRGBColorSpace)
    material.needsUpdate = true
  }
}

/**
 * Attach/detach the drawn-face overlay texture (advisor plan 002 — the
 * faceComposite CanvasTexture in the head mesh's own UVs). null detaches.
 * Toggling presence flips the USE_FACE_MAP define (program change); texture
 * swaps with the define already on are uniform-only.
 */
export function setFaceMap(material: ToonMaterial, texture: THREE.Texture | null): void {
  material.userData.toonUniforms.uFaceMap.value = texture
  const wantFace = texture !== null
  if (wantFace !== (material.userData.toonDefines.faceMap ?? false)) {
    material.userData.toonDefines.faceMap = wantFace
    syncToonDefines(material)
    material.needsUpdate = true
  }
}
