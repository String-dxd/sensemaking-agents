// BOTW-style procedural grass blade shader (plan 020). One tapered blade card
// (5 verts / 3 tris, base at y=0, unit height, uv.y 0 at base → 1 at tip) is
// instanced per blade via InstancedBufferGeometry; per-instance attributes:
//
//   aOffset     vec3 — blade base world position (terrain height baked in)
//   aYawScale   vec2 — (yaw radians, world height)
//   aShadePhase vec2 — (0..1 shade jitter, 0..2π wind phase)
//
// Wind lives entirely in the vertex shader (per-blade phase, tip-weighted
// bend, traveling gust) — per-instance JS springs don't scale to ~131k blades,
// which is why this is NOT the tree canopy spring (useCanopyWind stays as-is).
// The fragment is a plain base→tip gradient darkened by the per-blade shade
// jitter: no lights/shadow chunks — the gradient + the ground's painted
// under-tint + jitter carry the look at this scale (a cheap fixed sun term or
// sampling the terrain toon ramp is a noted future knob, not a tweak).
//
// Color space: fragment ends with #include <colorspace_fragment> (raw
// ShaderMaterials get no automatic output conversion in three r171).

import * as THREE from 'three'

export interface GrassBladeOptions {
  /** Normalized in the material; matches the scene's general gust direction. */
  windDir?: THREE.Vector2
  /** Dimensionless lean ratio (sway amplitude): tip push as a fraction of blade height per unit sway. */
  windStrength?: number
  baseColor?: THREE.ColorRepresentation
  tipColor?: THREE.ColorRepresentation
  /** Camera distance (world units) at which the sub-pixel width floor starts ramping in. */
  widenStart?: number
  /** Camera distance (world units) at which the width floor reaches its max. */
  widenEnd?: number
  /** Max extra width fraction added at/after widenEnd (e.g. 2.5 → up to 3.5x width). */
  widenMax?: number
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWidenStart;
uniform float uWidenEnd;
uniform float uWidenMax;

attribute vec3 aOffset;
attribute vec2 aYawScale;
attribute vec2 aShadePhase;

varying vec2 vUv;
varying float vShade;

void main() {
  vUv = uv;
  vShade = aShadePhase.x;

  // Rotate the card by yaw, scale by blade height, translate to the offset.
  vec3 p = position * vec3(1.0, aYawScale.y, 1.0);

  // Sub-pixel guard: widen the card with view distance so a blade never
  // projects below ~a pixel and pops out of existence when zoomed out
  // (maintainer report: grass "lazy renders" with zoom / at the island's
  // far side). Near-camera width is unchanged.
  float dist = distance(cameraPosition, aOffset);
  p.x *= 1.0 + uWidenMax * smoothstep(uWidenStart, uWidenEnd, dist);

  float s = sin(aYawScale.x);
  float c = cos(aYawScale.x);
  vec3 world = aOffset + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

  // Traveling gust: two detuned sines over time + world position, phase-offset
  // per blade; only the tip bends (uv.y² weight) so the base stays planted.
  // uWindStrength is a dimensionless lean ratio (tip push as a fraction of
  // blade height per unit sway), so the lean angle stays constant across
  // blade heights instead of flattening short blades.
  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float tip = uv.y * uv.y;
  world.xz += uWindDir * sway * uWindStrength * tip * aYawScale.y;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uTipColor;

varying vec2 vUv;
varying float vShade;

void main() {
  // BOTW gradient: deep base → sunny tip, darkened by the per-blade jitter.
  vec3 col = mix(uBaseColor, uTipColor, vUv.y) * mix(0.82, 1.0, vShade);
  gl_FragColor = vec4(col, 1.0);

  #include <colorspace_fragment>
}
`

export function createGrassBladeMaterial(opts: GrassBladeOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDir: { value: (opts.windDir ?? new THREE.Vector2(0.8, 0.6)).clone().normalize() },
      uWindStrength: { value: opts.windStrength ?? 0.12 },
      uWidenStart: { value: opts.widenStart ?? 8.0 },
      uWidenEnd: { value: opts.widenEnd ?? 30.0 },
      uWidenMax: { value: opts.widenMax ?? 2.5 },
      // Base reads deeper than the ground's 0x4a8f3f under-tint so blades
      // stand out against painted cells; tips are the reference's yellow-green.
      uBaseColor: { value: new THREE.Color(opts.baseColor ?? 0x2e6b2a) },
      uTipColor: { value: new THREE.Color(opts.tipColor ?? 0xa8d84f) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: false,
  })
}
