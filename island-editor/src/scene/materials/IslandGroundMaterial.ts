// Ground material for the terraced island — fresh GLSL (three r171) keyed off
// the geometry attributes written by buildIslandGeometry (aTierFlat, aWallness,
// aSurface). Recipes adapted from the product island where they are ours (sand
// UV scale, wet-band idea keyed to sea level, flat grass tone + hash noise);
// lighting is a fresh BOTW-style painterly model (own curve/constants — not
// ported from any reference engine). Bruno's grass GLSL is NOT used (provenance
// 🔴 — see docs/plans/2026-06-12-asset-provenance-audit.md).
//
// Color space: raw ShaderMaterials get no automatic output conversion, so the
// fragment ends with #include <colorspace_fragment> (the sand/cliff textures
// must be loaded with THREE.SRGBColorSpace — see the loader in IslandTerrain).
//
// Shadows: `lights: true` + THREE.UniformsLib.lights wires this material into
// three's light/shadow uniform machinery (NUM_DIR_LIGHTS, USE_SHADOWMAP, the
// directionalShadowMap/-Matrix uniforms, etc. — all auto-injected by
// WebGLProgram). The vertex shader follows three's own chunk contract
// (beginnormal_vertex → defaultnormal_vertex → worldpos_vertex →
// shadowmap_vertex) so `vDirectionalShadowCoord` is written correctly; the
// fragment calls the standard getShadowMask() from shadowmask_pars_fragment.

import * as THREE from 'three'

export interface GroundTextures {
  sand: THREE.Texture
  cliff: THREE.Texture
}

export interface GroundOptions {
  grassColor?: THREE.ColorRepresentation
  /** World-space sun direction (normalized inside). Defaults to the Backdrop
   *  directional light's position [18, 20, 10]. */
  sunDirection?: THREE.Vector3
  /** Warm key-light tint (BOTW sun). */
  sunColor?: THREE.ColorRepresentation
  /** Cool ambient tint filling shadowed/up-facing surfaces (BOTW sky bounce). */
  skyColor?: THREE.ColorRepresentation
  seaLevel?: number
  /** World height of the beach tier's top (`spec.tierHeights[1]`). Cliff
   *  texture only begins above it — sand-only shoreline (plan 028). */
  beachTop?: number
}

const VERTEX = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>

varying vec3 vWorld;
varying vec3 vNormal;
varying float vTierFlat;
varying float vWallness;
varying float vSurface;

attribute float aTierFlat;
attribute float aWallness;
attribute float aSurface;

void main() {
  // Chunk-standard names so <shadowmap_vertex> (which reads transformed,
  // transformedNormal and worldPosition) resolves correctly. worldpos_vertex
  // only defines worldPosition under USE_SHADOWMAP (and friends), so the
  // shader's own transform below must NOT borrow it — with shadows off it
  // wouldn't exist and the shader wouldn't compile.
  vec3 transformed = vec3(position);
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <worldpos_vertex>

  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vTierFlat = aTierFlat;
  vWallness = aWallness;
  vSurface = aSurface;

  gl_Position = projectionMatrix * viewMatrix * wp;

  #include <shadowmap_vertex>
}
`

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

uniform sampler2D uSandTexture;
uniform sampler2D uCliffTexture;
uniform vec3 uGrassColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uSeaLevel;
uniform float uBeachTop;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vTierFlat;
varying float vWallness;
varying float vSurface;

// Fresh value noise (own constants — not the app's islandHash).
float groundHash(vec2 p) {
  return fract(sin(dot(p, vec2(157.31, 269.17))) * 39481.9663);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = groundHash(i);
  float b = groundHash(i + vec2(1.0, 0.0));
  float c = groundHash(i + vec2(0.0, 1.0));
  float d = groundHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // ── Flat surfaces ──────────────────────────────────────────────────────────
  // Sand (tiers ≤ 1), world-space UV like the app's beach.
  vec3 sand = texture2D(uSandTexture, vWorld.xz * 0.36).rgb;
  float broad = groundNoise(vWorld.xz * 2.2);
  sand = mix(sand * 0.95, sand * 1.05, broad);
  // Wet-sand darkening where the ground sits near the waterline (keyed to
  // seaLevel, not the app's radial terms). Band end must stay below the beach
  // freeboard (tier 1 top − seaLevel, 0.05) so the flat top reads dry and the
  // wet gradient stays a rim effect.
  float wet = 1.0 - smoothstep(0.0, 0.04, abs(vWorld.y - uSeaLevel));
  sand = mix(sand, sand * vec3(0.72, 0.70, 0.62), wet * 0.45);

  // Grass (tiers ≥ 2): flat tone + two hash-noise octaves (±10% brightness).
  float gBroad = groundNoise(vWorld.xz * 2.0);
  float gGrain = groundNoise(vWorld.xz * 8.0);
  vec3 grass = mix(uGrassColor * 0.90, uGrassColor * 1.10, gBroad);
  grass += vec3((gGrain - 0.5) * 0.05);

  float grassF = smoothstep(1.25, 1.75, vTierFlat);
  vec3 flatColor = mix(sand, grass, grassF);

  // Painted grass (surface code 1): tint the ground under the instanced tufts
  // (GrassLayer) toward the grass tone so patch edges blend instead of sitting
  // on bare sand. Land only (tier ≥ 1) — paint on water cells stays invisible.
  float grassPaintF = smoothstep(0.5, 0.9, vSurface) * smoothstep(0.6, 1.0, vTierFlat);
  flatColor = mix(flatColor, uGrassColor * 0.85, grassPaintF * 0.55);

  // ── Walls ──────────────────────────────────────────────────────────────────
  // Cliff texture with a planar UV that follows the wall.
  vec2 cliffUv = vec2(vWorld.x + vWorld.z, vWorld.y * 2.4);
  vec3 cliff = texture2D(uCliffTexture, cliffUv).rgb;
  float cliffShade = groundNoise(vec2(vWorld.x + vWorld.z, vWorld.y) * 3.0);
  cliff = mix(cliff * 0.93, cliff * 1.06, cliffShade);

  // Wall mask. vWallness (from the terrace s) dips in vertical lanes along a
  // diagonal cliff — each column crosses a slightly different drop, so wallF
  // falls below 1 there and the flat sand/grass color bleeds UP the wall in
  // stripes. The geometric slope (how vertical the face is) has no such
  // per-column dip, so max() it in: a genuinely steep face reads as cliff
  // regardless of orientation. This only ADDS cliff to steep lanes, never
  // removes cliff the terrace term already covers.
  float slope = 1.0 - clamp(normalize(vNormal).y, 0.0, 1.0);
  float wallF = max(smoothstep(0.25, 0.45, vWallness), smoothstep(0.35, 0.6, slope));
  // Sand-only shoreline (plan 028): the beach tier's little drop to the sea
  // is geometrically steep, so it classified as cliff — a brown lip along
  // every shore. Cliff texture only begins ABOVE the beach top; at and below
  // it, steep faces keep the flat (sand) color, and the existing wet-sand
  // darkening handles the waterline.
  wallF *= smoothstep(uBeachTop + 0.02, uBeachTop + 0.30, vWorld.y);
  vec3 albedo = mix(flatColor, cliff, wallF);

  // ── Lighting — BOTW-style: warm sun, cool sky ambient, soft toon curve ────
  vec3 N = normalize(vNormal);
  float ndl = max(dot(N, normalize(uSunDirection)), 0.0);
  // Soft two-stop curve: painterly banding without a hard cel edge.
  float toon = smoothstep(0.0, 0.35, ndl) * 0.72 + smoothstep(0.3, 0.9, ndl) * 0.28;
  float shadowMask = getShadowMask();
  float direct = toon * shadowMask;
  // Sky ambient favors up-facing surfaces; shade never goes black, it goes cool.
  float skyF = N.y * 0.5 + 0.5;
  vec3 lightCol = uSunColor * direct * 0.9 + uSkyColor * (0.30 + skyF * 0.28);
  // Cool shade tint: shadowed albedo shifts toward sky blue (BOTW signature).
  albedo = mix(albedo * vec3(0.84, 0.90, 1.06), albedo, clamp(direct, 0.0, 1.0));
  gl_FragColor = vec4(albedo * lightCol, 1.0);

  #include <colorspace_fragment>
}
`

export function createIslandGroundMaterial(
  textures: GroundTextures,
  opts: GroundOptions = {},
): THREE.ShaderMaterial {
  const sun = (opts.sunDirection ?? new THREE.Vector3(18, 20, 10)).clone().normalize()

  // Merge in three's lights uniforms (ambientLightColor, directionalLights[],
  // directionalShadowMap/-Matrix, etc.) so `lights: true` below has the
  // uniform slots the injected chunks expect. UniformsUtils.merge clones
  // every value it copies — harmless for Color/Vector3, but a cloned Texture
  // is a distinct GL object, so texture (and the sun vector, for clarity)
  // uniform VALUES are assigned after the merge rather than passed into it.
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    {
      uSandTexture: { value: null as THREE.Texture | null },
      uCliffTexture: { value: null as THREE.Texture | null },
      uGrassColor: { value: new THREE.Color(opts.grassColor ?? 0x4a8f3f) },
      uSunDirection: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color(opts.sunColor ?? 0xffedcc) },
      uSkyColor: { value: new THREE.Color(opts.skyColor ?? 0x8fa8c8) },
      uSeaLevel: { value: opts.seaLevel ?? 0 },
      uBeachTop: { value: opts.beachTop ?? 0.05 },
    },
  ])
  uniforms.uSandTexture.value = textures.sand
  uniforms.uCliffTexture.value = textures.cliff
  uniforms.uSunDirection.value = sun

  return new THREE.ShaderMaterial({
    lights: true,
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
}
