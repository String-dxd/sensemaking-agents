// Ground material for the terraced island — fresh GLSL (three r171) keyed off
// the geometry attributes written by buildIslandGeometry (aTierFlat, aWallness,
// aSurface). Recipes adapted from the product island where they are ours (sand
// UV scale, wet-band idea keyed to sea level, flat grass tone + hash noise);
// lighting is a fresh simple lambert. Bruno's grass GLSL is NOT used (provenance
// 🔴 — see docs/plans/2026-06-12-asset-provenance-audit.md).
//
// Color space: raw ShaderMaterials get no automatic output conversion, so the
// fragment ends with #include <colorspace_fragment> (the sand/cliff textures
// must be loaded with THREE.SRGBColorSpace — see the loader in IslandTerrain).

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
  seaLevel?: number
}

const VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vTierFlat;
varying float vWallness;
varying float vSurface;

attribute float aTierFlat;
attribute float aWallness;
attribute float aSurface;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vTierFlat = aTierFlat;
  vWallness = aWallness;
  vSurface = aSurface;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D uSandTexture;
uniform sampler2D uCliffTexture;
uniform vec3 uGrassColor;
uniform vec3 uSunDirection;
uniform float uSeaLevel;

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
  // seaLevel, not the app's radial terms).
  float wet = 1.0 - smoothstep(0.0, 0.08, abs(vWorld.y - uSeaLevel));
  sand = mix(sand, sand * vec3(0.72, 0.70, 0.62), wet * 0.45);

  // Grass (tiers ≥ 2): flat tone + two hash-noise octaves (±10% brightness).
  float gBroad = groundNoise(vWorld.xz * 2.0);
  float gGrain = groundNoise(vWorld.xz * 8.0);
  vec3 grass = mix(uGrassColor * 0.90, uGrassColor * 1.10, gBroad);
  grass += vec3((gGrain - 0.5) * 0.05);

  float grassF = smoothstep(1.25, 1.75, vTierFlat);
  vec3 flatColor = mix(sand, grass, grassF);

  // Path: dirt-tint lane on flat ground, tier ≥ 1 (applied before lighting).
  float pathF = smoothstep(0.5, 0.9, vSurface) * smoothstep(0.6, 1.0, vTierFlat);
  flatColor = mix(flatColor, vec3(0.62, 0.47, 0.30), pathF * 0.7);

  // ── Walls ──────────────────────────────────────────────────────────────────
  // Cliff texture with a planar UV that follows the wall.
  vec2 cliffUv = vec2(vWorld.x + vWorld.z, vWorld.y * 2.4);
  vec3 cliff = texture2D(uCliffTexture, cliffUv).rgb;
  float cliffShade = groundNoise(vec2(vWorld.x + vWorld.z, vWorld.y) * 3.0);
  cliff = mix(cliff * 0.93, cliff * 1.06, cliffShade);

  float wallF = smoothstep(0.25, 0.45, vWallness);
  vec3 albedo = mix(flatColor, cliff, wallF);

  // ── Lighting — fresh simple lambert ───────────────────────────────────────
  float light = max(dot(normalize(vNormal), normalize(uSunDirection)), 0.0) * 0.65 + 0.35;
  gl_FragColor = vec4(albedo * light, 1.0);

  #include <colorspace_fragment>
}
`

export function createIslandGroundMaterial(
  textures: GroundTextures,
  opts: GroundOptions = {},
): THREE.ShaderMaterial {
  const sun = (opts.sunDirection ?? new THREE.Vector3(18, 20, 10)).clone().normalize()
  return new THREE.ShaderMaterial({
    uniforms: {
      uSandTexture: { value: textures.sand },
      uCliffTexture: { value: textures.cliff },
      uGrassColor: { value: new THREE.Color(opts.grassColor ?? 0x4a8f3f) },
      uSunDirection: { value: sun },
      uSeaLevel: { value: opts.seaLevel ?? 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
}
