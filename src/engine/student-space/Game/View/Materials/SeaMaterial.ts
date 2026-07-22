// Ported from island-editor/src/scene/materials/SeaMaterial.ts — behavior kept
// in sync via shared test vectors (see State/islandSpecCore/terrainGrid.ts).
//
// All shore effects are driven by the grid-derived signed shore-distance field
// (State/islandSpecCore/shoreField.ts) sampled from a single-channel float
// DataTexture — this replaces the retired analytic silhouette(theta) ocean.
//
// r149 PORT NOTES (KTD-4): output conversion via `encodings_fragment` (the
// r152+ chunk rename silently no-ops on the runtime three — guarded by
// test/engine/colorspace-guard.test.ts).
//
// ENGINE ADDITION (KTD-8): a `uSkyTint` day-cycle uniform, driven from the
// day-cycle state in the view's update() — the engine analog of the retired
// ocean's sky-reactive tint path, so evening scenes don't show a noon-bright
// sea. The editor renders a fixed noon; uSkyTint defaults to white (no-op).

import * as THREE from 'three'
import type { ShoreField } from '../../State/islandSpecCore/shoreField.ts'

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
  const tex = new THREE.DataTexture(
    field.data,
    field.res,
    field.res,
    THREE.RedFormat,
    THREE.FloatType,
  )
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // Tiny 2-sine ripple — gentle open-water motion.
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
// Day-cycle tint (engine addition, KTD-8): the sky-bottom color of the current
// day keyframe, white at the editor's fixed noon.
uniform vec3 uSkyTint;
// Swim wake: .xy = character world x/z, .w = 1 while swimming else 0
// (.z unused — reserved as an intensity channel). Runtime-driven only.
uniform vec4 uSwim;

varying vec3 vWorld;

void main() {
  // World XZ → shore-field UV. ClampToEdge freezes d at the border texel's
  // value outside the grid — grow d by the world distance past the grid square
  // so outside coverage the water always deepens like real offshore distance.
  vec2 shoreUv = (vWorld.xz + uWorldSize * 0.5) / uWorldSize;
  vec2 clampedUv = clamp(shoreUv, 0.0, 1.0);
  float d = texture2D(uShoreTex, clampedUv).r;
  d += length((shoreUv - clampedUv) * uWorldSize);

  // Depth gradient — shallow at the shore, deep away from it.
  vec3 col = mix(uSea, uDeep, smoothstep(0.0, 8.0, d));

  /* ----- SHORE FOAM -------------------------------------------------------
   * The signed distance field d plays the role of the legacy radial
   * rawShoreDist directly. Band widths and mix weights preserved. */
  float rawShoreDist = d;
  float shoreT = clamp(rawShoreDist / 6.0, 0.0, 1.0);
  float noiseOff = sin(vWorld.x * 1.2 + vWorld.z * 0.8) * 0.05;
  // Along-shore wobble of the foam edge as world-space sines.
  float shoreWave = sin(vWorld.x * 0.78 + vWorld.z * 0.31)
                  + sin(vWorld.z * 1.44 - vWorld.x * 0.52 + 1.7) * 0.45
                  + noiseOff * 4.0;
  float shoreDist = rawShoreDist + shoreWave * 0.035;

  float wetTint = (1.0 - smoothstep(0.02, 0.36, shoreDist))
                * smoothstep(-0.18, 0.02, shoreDist);
  float paleWash = smoothstep(0.10, 0.55, shoreDist)
                 * (1.0 - smoothstep(1.05, 1.85, shoreDist));
  float contactLip = smoothstep(-0.08, 0.02, rawShoreDist)
                   * (1.0 - smoothstep(0.16, 0.34, rawShoreDist));
  float foamLip = smoothstep(-0.02, 0.10, shoreDist)
                * (1.0 - smoothstep(0.22, 0.42, shoreDist));
  col = mix(col, vec3(0.10, 0.55, 0.58), wetTint * 0.32);
  col = mix(col, vec3(0.62, 0.90, 0.82), max(paleWash * 0.50, contactLip * 0.32));

  // Aqua wash pulsing gently outward through the shallow band.
  float movingWashPhase = sin(shoreDist * 2.4 + uTime * 1.05
                            + (vWorld.x + vWorld.z) * 0.18 + noiseOff * 6.0) * 0.5 + 0.5;
  float movingWash = smoothstep(0.36, 0.84, movingWashPhase)
                   * smoothstep(0.22, 0.60, shoreDist)
                   * (1.0 - smoothstep(2.0, 3.4, shoreDist));
  col = mix(col, vec3(0.70, 0.98, 0.88), movingWash * 0.12);

  // Foam-cells band: lacy texture-authored sea foam near the shore, slow
  // scroll.
  vec2 foamCellUv = vWorld.xz * 0.18 + vec2(uTime * 0.04, -uTime * 0.025);
  float foamCells = smoothstep(0.56, 0.84, texture2D(uFoamCells, foamCellUv).r);
  float foamBand = smoothstep(0.1, 0.35, d) * (1.0 - smoothstep(1.1, 1.6, d));
  col = mix(col, uFoam, foamCells * foamBand * 0.30);

  // Short-bubbles: a tight bright band right on the shore line, slight drift.
  vec2 bubbleUv = vWorld.xz * 0.16 + vec2(uTime * 0.012, uTime * 0.009);
  float shortBubbles = smoothstep(0.42, 0.74, texture2D(uShortBubbles, bubbleUv).r);
  float shortBubbleBand = (1.0 - smoothstep(0.01, 0.38, shoreT))
                        * smoothstep(0.00, 0.045, shoreT);
  shortBubbles *= shortBubbleBand;

  /* ----- SHORELINE FLOW ---------------------------------------------------
   * Modulates the halo's brightness along the shoreline; time-free so the
   * white lip stays locked while the aqua layers above keep moving. */
  float flowA = 0.5 + 0.5 * sin(vWorld.x * 0.33 + vWorld.z * 0.14);
  float flowB = 0.5 + 0.5 * sin(vWorld.z * 0.55 - vWorld.x * 0.21 + 1.7);
  float foamFlow = mix(flowA, flowB, 0.5);
  vec3 shoreWhite = vec3(0.96, 1.0, 0.92);
  col = mix(col, shoreWhite, max(contactLip * 0.46, foamLip * (0.52 + foamFlow * 0.20)));
  col = mix(col, shoreWhite, shortBubbles * 0.62);

  /* ----- SWIM WAKE --------------------------------------------------------
   * Expanding foam rings around the swimming character. Rings fade in from
   * the body (not under it) and out by ~0.85 world units. */
  float swimD = distance(vWorld.xz, uSwim.xy);
  float swimRing = smoothstep(0.80, 0.99, 0.5 + 0.5 * sin(swimD * 12.0 - uTime * 11.0));
  float swimWake = uSwim.w * swimRing
                 * smoothstep(0.06, 0.22, swimD)
                 * (1.0 - smoothstep(0.30, 0.85, swimD));
  col = mix(col, shoreWhite, swimWake * 0.30);

  // Day-cycle tint (engine addition, KTD-8) — same 0.35 blend the retired
  // curved-earth ocean used for its sky-reactive wash.
  col = mix(col, col * uSkyTint, 0.35);

  // Atmospheric horizon fade: flat plane — lighten open water toward a pale
  // haze with distance, then dissolve alpha to 0 at the far rim so the plane
  // melts into the sky instead of ending on a visible line. The haze color
  // also picks up the day tint so a night horizon isn't daylight-pale.
  float rr = length(vWorld.xz);
  vec3 haze = vec3(0.62, 0.78, 0.86) * mix(vec3(1.0), uSkyTint, 0.5);
  col = mix(col, haze, smoothstep(uWorldSize * 1.0, uWorldSize * 5.0, rr) * 0.6);
  float rim = 1.0 - smoothstep(uWorldSize * 2.5, uWorldSize * 7.0, rr);

  // Slight base transparency so shallow shelves read through the water;
  // multiplied by the horizon rim so the edge is fully transparent.
  gl_FragColor = vec4(col, 0.94 * rim);

  #include <encodings_fragment>
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
      uSkyTint: { value: new THREE.Color(0xffffff) },
      uSwim: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
  })
}
