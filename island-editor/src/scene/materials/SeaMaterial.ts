// Clean-room sea: no TinySkies-derived layers (see
// docs/plans/2026-06-12-asset-provenance-audit.md); candidate back-port for
// audit task T2f.
//
// All shore effects are driven by the grid-derived signed shore-distance field
// (shoreField.ts) sampled from a single-channel float DataTexture — this
// replaces the app's analytic silhouette(theta) radial hack and works for any
// drawn shore outline, including carved interior rivers/ponds. The shore stack is a
// port of the app's SHORE FOAM / SHORELINE FLOW layers (Game/View/Island.js
// _buildWater): wet tint, pale wash, contact lip, foam lip, moving wash,
// foam-cells band, short bubbles, and the time-free foam-flow modulation (the
// app's TinySkies-derived contour-ripple, open-water-blob, and sparkle layers
// are deliberately excluded — the editor stays clean-room; a signature guard
// in test/materials.test.ts enforces this).
// The app varies these along the shore with theta (its island is
// radial); here the theta terms become world-position sines at matching
// spatial frequency (theta·k on an r≈9 island ≈ k/9 rad per world unit) so the
// same look tracks any drawn outline. The vertex ripple is a tiny fresh 2-sine
// (own structure, own numbers).
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

/** Refresh an existing shore DataTexture, reallocating the backing image if the
 *  field's resolution has changed (e.g. an imported spec with different
 *  `grid.cols`) — otherwise updates the buffer in place. */
export function updateShoreDataTexture(tex: THREE.DataTexture, field: ShoreField): void {
  if ((tex.image.data as Float32Array).length !== field.data.length) {
    tex.image = { data: field.data, width: field.res, height: field.res }
  } else {
    ;(tex.image.data as Float32Array).set(field.data)
  }
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
// Swim wake (plan 027): .xy = bird world x/z, .w = 1 while swimming else 0
// (.z unused — reserved as an intensity channel). Runtime-driven only.
uniform vec4 uSwim;

varying vec3 vWorld;

void main() {
  // World XZ → shore-field UV. ClampToEdge freezes d at the border texel's
  // value outside the grid — if the island reaches the grid edge that value is
  // SMALL, so the shore bands would smear in axis-aligned streaks all the way
  // to the horizon. Grow d by the world distance past the grid square instead,
  // so outside coverage the water always deepens like real offshore distance.
  vec2 shoreUv = (vWorld.xz + uWorldSize * 0.5) / uWorldSize;
  vec2 clampedUv = clamp(shoreUv, 0.0, 1.0);
  float d = texture2D(uShoreTex, clampedUv).r;
  d += length((shoreUv - clampedUv) * uWorldSize);

  // Depth gradient — shallow at the shore, deep away from it.
  vec3 col = mix(uSea, uDeep, smoothstep(0.0, 8.0, d));

  /* ----- SHORE FOAM (ported from the app's _buildWater) ------------------
   * The app measures rawShoreDist = r - shoreR along its radial silhouette;
   * here the signed distance field d plays that role directly. Band widths
   * and mix weights are the app's numbers verbatim. */
  float rawShoreDist = d;
  float shoreT = clamp(rawShoreDist / 6.0, 0.0, 1.0);
  float noiseOff = sin(vWorld.x * 1.2 + vWorld.z * 0.8) * 0.05;
  // App: sin(theta*7) + sin(theta*13 + 1.7)*0.45 — along-shore wobble of the
  // foam edge. Rewritten as two world-space sines at the equivalent spatial
  // frequencies so the wobble follows any drawn outline.
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
  // App phase term theta*1.6 → (x+z)*0.18 (same along-shore frequency).
  float movingWashPhase = sin(shoreDist * 2.4 + uTime * 1.05
                            + (vWorld.x + vWorld.z) * 0.18 + noiseOff * 6.0) * 0.5 + 0.5;
  float movingWash = smoothstep(0.36, 0.84, movingWashPhase)
                   * smoothstep(0.22, 0.60, shoreDist)
                   * (1.0 - smoothstep(2.0, 3.4, shoreDist));
  col = mix(col, vec3(0.70, 0.98, 0.88), movingWash * 0.12);

  // NOTE: the app's "contour ripples" layer is TinySkies-derived (see the
  // provenance audit + the signature guard in test/materials.test.ts) and is
  // deliberately NOT ported — the editor stays clean-room.

  // Foam-cells band: the editor's own lacy texture-authored sea foam near the
  // shore, slow scroll — kept at its original width/strength (the app's
  // equivalent layer is nearly invisible without its open-water blob backing).
  // Scroll ~4× the app's rate: at the ported 0.45× clock the pattern read as
  // frozen; this keeps it lazily drifting without turning into a current.
  vec2 foamCellUv = vWorld.xz * 0.18 + vec2(uTime * 0.04, -uTime * 0.025);
  float foamCells = smoothstep(0.56, 0.84, texture2D(uFoamCells, foamCellUv).r);
  float foamBand = smoothstep(0.1, 0.35, d) * (1.0 - smoothstep(1.1, 1.6, d));
  col = mix(col, uFoam, foamCells * foamBand * 0.30);

  // Short-bubbles: a tight bright band right on the shore line.
  // Slight drift (the app samples these statically) so the shore specks live.
  vec2 bubbleUv = vWorld.xz * 0.16 + vec2(uTime * 0.012, uTime * 0.009);
  float shortBubbles = smoothstep(0.42, 0.74, texture2D(uShortBubbles, bubbleUv).r);
  float shortBubbleBand = (1.0 - smoothstep(0.01, 0.38, shoreT))
                        * smoothstep(0.00, 0.045, shoreT);
  shortBubbles *= shortBubbleBand;

  /* ----- SHORELINE FLOW ---------------------------------------------------
   * Modulates the halo's brightness along the shoreline; time-free so the
   * white lip stays locked while the aqua layers above keep moving.
   * App: theta*3 and theta*5 → world-space sines at matching frequency. */
  float flowA = 0.5 + 0.5 * sin(vWorld.x * 0.33 + vWorld.z * 0.14);
  float flowB = 0.5 + 0.5 * sin(vWorld.z * 0.55 - vWorld.x * 0.21 + 1.7);
  float foamFlow = mix(flowA, flowB, 0.5);
  vec3 shoreWhite = vec3(0.96, 1.0, 0.92);
  col = mix(col, shoreWhite, max(contactLip * 0.46, foamLip * (0.52 + foamFlow * 0.20)));
  col = mix(col, shoreWhite, shortBubbles * 0.62);

  /* ----- SWIM WAKE (plan 027) --------------------------------------------
   * Expanding foam rings around the swimming bird. uTime runs at 0.45x wall
   * clock (SeaSurface), so ring phase uses a higher multiplier. Rings fade
   * in from the body (not under it) and out by ~1.2 world units. */
  float swimD = distance(vWorld.xz, uSwim.xy);
  float swimRing = smoothstep(0.62, 0.95, 0.5 + 0.5 * sin(swimD * 12.0 - uTime * 11.0));
  float swimWake = uSwim.w * swimRing
                 * smoothstep(0.08, 0.28, swimD)
                 * (1.0 - smoothstep(0.45, 1.2, swimD));
  col = mix(col, shoreWhite, swimWake * 0.7);

  // Atmospheric horizon fade: this is a flat plane (the studio stage skips the
  // app's curved-earth), so without a fade its far edge reads as a hard square
  // against the sky. Lighten the open water toward a pale haze with distance,
  // then dissolve alpha to 0 at the far rim so the plane melts into the sky
  // instead of ending on a visible line. Radii are in world units.
  float rr = length(vWorld.xz);
  col = mix(col, vec3(0.62, 0.78, 0.86), smoothstep(uWorldSize * 1.0, uWorldSize * 5.0, rr) * 0.6);
  float rim = 1.0 - smoothstep(uWorldSize * 2.5, uWorldSize * 7.0, rr);

  // Slight base transparency so carved riverbeds read through shallow water;
  // multiplied by the horizon rim so the edge is fully transparent.
  gl_FragColor = vec4(col, 0.94 * rim);

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
      // Swim wake (plan 027) — runtime-driven from SeaSurface's useFrame via
      // the characterPose singleton; no constructor option.
      uSwim: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
  })
}
