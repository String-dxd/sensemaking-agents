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
  /** Base sway amplitude in radians of blade bend per unit sway (the idle wiggle). */
  windStrength?: number
  /** Peak extra bend (radians) a fully susceptible blade gets at a gust crest —
   *  1.25 ≈ 72°, which on top of the base sway sweeps some blades nearly flat. */
  gustBend?: number
  baseColor?: THREE.ColorRepresentation
  tipColor?: THREE.ColorRepresentation
  /** Camera distance (world units) at which the sub-pixel width floor starts ramping in. */
  widenStart?: number
  /** Camera distance (world units) at which the width floor reaches its max. */
  widenEnd?: number
  /** Max extra width fraction added at/after widenEnd (e.g. 1.5 → up to 2.5x width). */
  widenMax?: number
  /** Camera distance at which blades start shrinking away (zoom-out declutter). */
  hideStart?: number
  /** Camera distance at which blades are fully hidden. */
  hideEnd?: number
  /** Max per-blade wind-direction offset in radians (±): blades sway toward/away
   *  from each other instead of moving as one sheet. */
  dirSpread?: number
  /** Radius (world units) of the character's bend-away reaction disc. */
  charRadius?: number
  /** Peak bend (radians) at the character's feet. */
  charBend?: number
  /** Inside this distance of the character, blades are fully faded out. */
  charFadeInner?: number
  /** Beyond this distance of the character, blades are fully opaque again. */
  charFadeOuter?: number
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGustBend;
uniform float uWidenStart;
uniform float uWidenEnd;
uniform float uWidenMax;
uniform float uHideStart;
uniform float uHideEnd;
uniform float uDirSpread;
uniform vec4 uCharPos;
uniform float uCharRadius;
uniform float uCharBend;
uniform float uCharFadeInner;
uniform float uCharFadeOuter;

attribute vec3 aOffset;
attribute vec2 aYawScale;
attribute vec2 aShadePhase;

varying vec2 vUv;
varying float vShade;
varying float vFade;

void main() {
  vUv = uv;
  vShade = aShadePhase.x;

  // Rotate the card by yaw, scale by blade height, translate to the offset.
  vec3 p = position * vec3(1.0, aYawScale.y, 1.0);

  // Distance behavior (maintainer-tuned): mid-range blades WIDEN a little so
  // they stay crisp instead of dissolving into sub-pixel noise, then past
  // uHideStart the whole card SHRINKS smoothly to nothing — zoomed-out views
  // deliberately hide the grass (declutter), and it grows back on zoom-in.
  float dist = distance(cameraPosition, aOffset);
  p.x *= 1.0 + uWidenMax * smoothstep(uWidenStart, uWidenEnd, dist);
  p *= 1.0 - smoothstep(uHideStart, uHideEnd, dist);

  float s = sin(aYawScale.x);
  float c = cos(aYawScale.x);
  vec3 world = aOffset + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

  // Per-blade wind direction: each blade's push rotates away from the global
  // uWindDir by up to ±uDirSpread radians (seeded by its phase), so
  // neighboring blades sway toward/away from EACH OTHER instead of moving as
  // one sheet (BOTW look — maintainer reference video).
  float dirOff = (fract(aShadePhase.y * 2.61803) - 0.5) * 2.0 * uDirSpread;
  float ds = sin(dirOff);
  float dc = cos(dirOff);
  vec2 bladeWindDir = vec2(dc * uWindDir.x - ds * uWindDir.y,
                           ds * uWindDir.x + dc * uWindDir.y);

  // Wind = base sway + a traveling gust front, expressed as a BEND ANGLE
  // (radians) about the blade base. The sin/cos rotation moves the tip along
  // the wind AND drops it toward the ground as it bends, so gust crests sweep
  // susceptible blades nearly flat (~80°) instead of stretching them sideways.
  // aShadePhase.x doubles as gust susceptibility: only some blades whip hard,
  // the rest just lean — reads as turbulence, not a uniform push.
  float sway = sin(uTime * 1.4 + aShadePhase.y + world.x * 0.9 + world.z * 0.7)
             + 0.5 * sin(uTime * 2.3 + aShadePhase.y * 1.7 + world.x * 1.6);
  float along = world.x * uWindDir.x + world.z * uWindDir.y;
  float gust = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(uTime * 0.7 - along * 0.35 + aShadePhase.y * 0.4));
  float suscept = 0.15 + 0.85 * aShadePhase.x;

  // Bend is now a 2-D VECTOR (radians): wind + character push compose, then
  // one sin/cos rotation about the base applies the total.
  vec2 bendVec = bladeWindDir * (uWindStrength * sway + uGustBend * gust * suscept);

  // Character reaction: blades inside uCharRadius bend AWAY from the
  // character, hardest at its feet. uCharPos.w is 1 when a character exists,
  // 0 otherwise (branchless off-switch).
  vec2 fromChar = world.xz - uCharPos.xz;
  float charDist = length(fromChar) + 1e-5;
  float push = uCharPos.w * uCharBend * (1.0 - smoothstep(0.0, uCharRadius, charDist));
  bendVec += (fromChar / charDist) * push;

  float bend = length(bendVec) * uv.y;
  vec2 bendDir = bendVec / max(length(bendVec), 1e-5);
  world.xz += bendDir * sin(bend) * p.y;
  world.y -= (1.0 - cos(bend)) * p.y; // tip sinks as it bends — the near-flat look

  // Character fade disc: alpha drops toward 0 near the character so it never
  // stands buried in blades (BOTW). Passed to the fragment via a varying.
  vFade = 1.0 - uCharPos.w * (1.0 - smoothstep(uCharFadeInner, uCharFadeOuter, charDist));

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uTipColor;

varying vec2 vUv;
varying float vShade;
varying float vFade;

void main() {
  // Sharp blade with soft alpha edges (uv.x 0..1 across the card) + the
  // character fade disc. Rendered with alphaToCoverage (MSAA), NOT alpha
  // blending — ~262k instances in one mesh cannot be depth-sorted.
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float alpha = edge * vFade;
  if (alpha < 0.02) discard;
  // BOTW gradient: deep base → sunny tip, darkened by the per-blade jitter.
  vec3 col = mix(uBaseColor, uTipColor, vUv.y) * mix(0.82, 1.0, vShade);
  gl_FragColor = vec4(col, alpha);

  #include <colorspace_fragment>
}
`

export function createGrassBladeMaterial(opts: GrassBladeOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDir: { value: (opts.windDir ?? new THREE.Vector2(0.8, 0.6)).clone().normalize() },
      uWindStrength: { value: opts.windStrength ?? 0.12 },
      uGustBend: { value: opts.gustBend ?? 1.25 },
      uWidenStart: { value: opts.widenStart ?? 8.0 },
      uWidenEnd: { value: opts.widenEnd ?? 20.0 },
      uWidenMax: { value: opts.widenMax ?? 1.5 },
      uHideStart: { value: opts.hideStart ?? 22.0 },
      uHideEnd: { value: opts.hideEnd ?? 32.0 },
      uDirSpread: { value: opts.dirSpread ?? 0.6 },
      // xyz = character world position, w = 1 when a character exists (0 = no
      // character, which turns both the bend and the fade disc off branchless).
      uCharPos: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCharRadius: { value: opts.charRadius ?? 1.4 },
      uCharBend: { value: opts.charBend ?? 0.9 },
      uCharFadeInner: { value: opts.charFadeInner ?? 0.35 },
      uCharFadeOuter: { value: opts.charFadeOuter ?? 0.9 },
      // Base reads deeper than the ground's 0x4a8f3f under-tint so blades
      // stand out against painted cells; tips are the reference's yellow-green.
      uBaseColor: { value: new THREE.Color(opts.baseColor ?? 0x2e6b2a) },
      uTipColor: { value: new THREE.Color(opts.tipColor ?? 0xa8d84f) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    // Soft edges + the character fade disc use alpha-to-coverage (MSAA), NOT
    // alpha blending: ~262k instances render in ONE mesh and cannot be
    // depth-sorted, so `transparent: true` would z-artifact against itself.
    // On non-MSAA contexts this degrades to a hard threshold — acceptable.
    transparent: false,
    alphaToCoverage: true,
  })
}
