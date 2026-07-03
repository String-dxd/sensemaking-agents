// Clean-room sea: no TinySkies-derived layers (see
// docs/plans/2026-06-12-asset-provenance-audit.md); candidate back-port for
// audit task T2f.
//
// All shore effects are driven by the grid-derived signed shore-distance field
// (shoreField.ts) sampled from a single-channel float DataTexture — this
// replaces the app's analytic silhouette(theta) radial hack and works for any
// drawn shore outline, including carved interior rivers/ponds. The fragment contains
// ONLY: depth gradient, crisp shore lip, wet tint, and the two foam-texture
// bands. The vertex ripple is a tiny fresh 2-sine (own structure, own numbers).
//
// Color space: fragment ends with #include <colorspace_fragment> (raw
// ShaderMaterials get no automatic output conversion in three r171).

import * as THREE from 'three'
import type { ShoreField } from '../../terrain/shoreField'

export interface SeaTextures {
  foamCells: THREE.Texture
  shortBubbles: THREE.Texture
}

export interface SeaOptions {
  /** World size of the shore field's square coverage (UV mapping). Required. */
  worldSize: number
  seaColor?: THREE.ColorRepresentation
  deepColor?: THREE.ColorRepresentation
  foamColor?: THREE.ColorRepresentation
}

// ── Shore DataTexture ────────────────────────────────────────────────────────

/** Wrap a shore-distance field as a single-channel float DataTexture. Clamped
 *  edges: sampling outside the grid returns the border distance (deep water). */
export function createShoreDataTexture(field: ShoreField): THREE.DataTexture {
  const tex = new THREE.DataTexture(field.data, field.res, field.res, THREE.RedFormat, THREE.FloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

/** Refresh an existing shore DataTexture in place (same resolution). */
export function updateShoreDataTexture(tex: THREE.DataTexture, field: ShoreField): void {
  ;(tex.image.data as Float32Array).set(field.data)
  tex.needsUpdate = true
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // Tiny fresh 2-sine ripple — gentle open-water motion, nothing ported.
  wp.y += sin(wp.x * 0.9 + uTime * 0.7) * 0.015 + sin(wp.z * 1.3 - uTime * 0.5) * 0.012;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uSea;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform sampler2D uShoreTex;
uniform float uWorldSize;
uniform sampler2D uFoamCells;
uniform sampler2D uShortBubbles;
uniform float uTime;

varying vec3 vWorld;

void main() {
  // World XZ → shore-field UV; ClampToEdge means far outside the grid we read
  // the border's large positive distance → deep water.
  vec2 shoreUv = (vWorld.xz + uWorldSize * 0.5) / uWorldSize;
  float d = texture2D(uShoreTex, clamp(shoreUv, 0.0, 1.0)).r;

  // Depth gradient — shallow at the shore, deep away from it.
  vec3 col = mix(uSea, uDeep, smoothstep(0.0, 8.0, d));

  // Wet tint hugging the waterline (slightly darker teal just off the shore).
  float wetT = (1.0 - smoothstep(0.0, 0.35, d)) * smoothstep(-0.2, 0.0, d);
  col = mix(col, vec3(0.10, 0.55, 0.58), wetT * 0.30);

  // Foam-cells band: lacy texture-authored foam near the shore, slow scroll.
  vec2 foamCellUv = vWorld.xz * 0.18 + vec2(uTime * 0.01, -uTime * 0.006);
  float foamCells = smoothstep(0.56, 0.84, texture2D(uFoamCells, foamCellUv).r);
  float foamBand = smoothstep(0.1, 0.35, d) * (1.0 - smoothstep(1.1, 1.6, d));
  col = mix(col, uFoam, foamCells * foamBand * 0.30);

  // Short-bubbles: a tight band right on the shore line.
  float bubbles = smoothstep(0.42, 0.74, texture2D(uShortBubbles, vWorld.xz * 0.16).r);
  float bubbleBand = smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.3, 0.5, d));
  col = mix(col, uFoam, bubbles * bubbleBand * 0.55);

  // Crisp white shore lip (the app's own halo idea, driven by d).
  float lip = smoothstep(-0.05, 0.02, d) * (1.0 - smoothstep(0.2, 0.3, d));
  col = mix(col, vec3(0.96, 1.0, 0.94), lip * 0.5);

  // Slight transparency so carved riverbeds read through shallow water.
  gl_FragColor = vec4(col, 0.94);

  #include <colorspace_fragment>
}
`

export function createSeaMaterial(
  textures: SeaTextures,
  shoreTex: THREE.DataTexture,
  opts: SeaOptions,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSea: { value: new THREE.Color(opts.seaColor ?? 0x2a8ca0) },
      uDeep: { value: new THREE.Color(opts.deepColor ?? 0x1560a0) },
      uFoam: { value: new THREE.Color(opts.foamColor ?? 0xb3ffff) },
      uShoreTex: { value: shoreTex },
      uWorldSize: { value: opts.worldSize },
      uFoamCells: { value: textures.foamCells },
      uShortBubbles: { value: textures.shortBubbles },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
  })
}
