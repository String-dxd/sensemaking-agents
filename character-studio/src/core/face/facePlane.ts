// Face-plane geometry + unlit atlas materials (plan 002, step 2).
//
// Pure three, no React. Face parts are slightly curved plane meshes hovering
// ~1.5 mm off the head sphere (Wind Waker pattern); each displays one atlas
// cell selected by fractional UV offset. Face materials are ALWAYS unlit —
// drawn faces must not pick up scene shading (plan 005 must not toon-shade
// these).

import * as THREE from 'three'
import { type AtlasCell, CELL_UV, cellUvOffset } from './atlas'

/** Radial hover distance of the base face layer off the head surface (m). */
export const FACE_LAYER_RADIAL_OFFSET = 0.0015

/** Extra radial offset per layer above the base (pupils float over whites). */
export const FACE_LAYER_RADIAL_STEP = 0.0007

/** Max gaze offset, as a fraction of one atlas cell (plan 002: ±0.06). */
export const GAZE_MAX = 0.06

/**
 * A 4×4-segment plane whose vertices are projected onto a sphere of
 * `headRadius + radialOffset`, centred on local +z. Place it by rotating the
 * mesh around the head centre (the rig uses spherical coordinates). UVs span
 * [0,1]² with u toward +azimuth and v toward +elevation; `mirrorU` flips u so
 * the same authored art serves the opposite-side eye.
 */
export function makeFacePlaneGeometry(
  headRadius: number,
  angularWidth: number,
  angularHeight: number,
  radialOffset = FACE_LAYER_RADIAL_OFFSET,
  mirrorU = false,
): THREE.BufferGeometry {
  const segments = 4
  const r = headRadius + radialOffset
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let iy = 0; iy <= segments; iy++) {
    const phi = (iy / segments - 0.5) * angularHeight // elevation
    for (let ix = 0; ix <= segments; ix++) {
      const theta = (ix / segments - 0.5) * angularWidth // azimuth
      const nx = Math.sin(theta) * Math.cos(phi)
      const ny = Math.sin(phi)
      const nz = Math.cos(theta) * Math.cos(phi)
      positions.push(r * nx, r * ny, r * nz)
      normals.push(nx, ny, nz)
      const u = ix / segments
      uvs.push(mirrorU ? 1 - u : u, iy / segments)
    }
  }
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * (segments + 1) + ix
      const b = a + 1
      const c = a + segments + 1
      const d = c + 1
      // CCW seen from +z (outward). mirrorU only flips the uv attribute,
      // so the winding is identical for both orientations.
      indices.push(a, b, d, a, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

export interface AtlasMaterialOptions {
  map: THREE.Texture
  cell: AtlasCell
  /** Layer index used to scale polygonOffset (extra z-fight armor). */
  layerOffset?: number
}

// Cell selection strategy: we CLONE the atlas texture per part and use the
// texture's own offset/repeat (a texture clone shares the uploaded image, so
// the GPU cost is one sampler state, not a second upload). Chosen over an
// onBeforeCompile uniform because it keeps the material a stock
// MeshBasicMaterial (no shader-cache invalidation, trivially debuggable).
// The choice is swappable in exactly one place: setCell() below (plus
// makeAtlasMaterial's clone) — nothing else knows how cells are selected.

/** Unlit, transparent atlas material displaying one cell. */
export function makeAtlasMaterial({ map, cell, layerOffset = 0 }: AtlasMaterialOptions): THREE.MeshBasicMaterial {
  const tex = map.clone()
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.repeat.set(CELL_UV, CELL_UV)
  tex.needsUpdate = true
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1 - layerOffset,
    polygonOffsetUnits: -1 - layerOffset,
  })
  material.toneMapped = false // print-crisp colors under any tone mapping
  material.userData.kind = 'face-atlas'
  setCell(material, cell)
  return material
}

export interface PupilMaterialOptions {
  pupilMap: THREE.Texture
  /** The ORIGINAL eye-white atlas texture (offsets applied via uniforms). */
  maskMap: THREE.Texture
  pupilCell: AtlasCell
  /** The eye-white cell currently displayed by the eye under this pupil. */
  maskCell: AtlasCell
  layerOffset?: number
}

/**
 * Pupil/iris layer material: samples the pupil atlas offset by gaze, and
 * multiplies its alpha by the EYE-WHITE cell's alpha sampled at the same
 * face-plane UV — the pupil only ever shows inside the eye shape (Wind Waker
 * mechanic). Hand-rolled ShaderMaterial; unlit by construction.
 */
export function makePupilMaterial({
  pupilMap,
  maskMap,
  pupilCell,
  maskCell,
  layerOffset = 1,
}: PupilMaterialOptions): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      pupilMap: { value: pupilMap },
      maskMap: { value: maskMap },
      pupilOffset: { value: new THREE.Vector2(...cellUvOffset(pupilCell)) },
      maskOffset: { value: new THREE.Vector2(...cellUvOffset(maskCell)) },
      cellRepeat: { value: CELL_UV },
      // gaze in cell-fraction units, clamped to ±GAZE_MAX
      gaze: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D pupilMap;
      uniform sampler2D maskMap;
      uniform vec2 pupilOffset;
      uniform vec2 maskOffset;
      uniform float cellRepeat;
      uniform vec2 gaze;
      varying vec2 vUv;
      void main() {
        // sampling opposite the gaze moves the drawn pupil WITH the gaze
        vec2 pupilUv = pupilOffset + (vUv - gaze) * cellRepeat;
        vec2 maskUv = maskOffset + vUv * cellRepeat;
        vec4 pupil = texture2D(pupilMap, pupilUv);
        float mask = texture2D(maskMap, maskUv).a;
        gl_FragColor = vec4(pupil.rgb, pupil.a * mask);
        if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  material.polygonOffset = true
  material.polygonOffsetFactor = -1 - layerOffset
  material.polygonOffsetUnits = -1 - layerOffset
  material.toneMapped = false
  material.userData.kind = 'face-pupil'
  return material
}

/** Point a face material at a different atlas cell. */
export function setCell(material: THREE.Material, cell: AtlasCell): void {
  const [ox, oy] = cellUvOffset(cell)
  if (material.userData.kind === 'face-pupil') {
    ;(material as THREE.ShaderMaterial).uniforms.pupilOffset.value.set(ox, oy)
    return
  }
  const map = (material as THREE.MeshBasicMaterial).map
  if (map) map.offset.set(ox, oy)
}

/** Update a pupil material's mask to the eye-white cell currently shown. */
export function setMaskCell(material: THREE.ShaderMaterial, eyeCell: AtlasCell): void {
  const [ox, oy] = cellUvOffset(eyeCell)
  material.uniforms.maskOffset.value.set(ox, oy)
}

/**
 * Offset a pupil within its eye. `x`/`y` are in cell-fraction units and are
 * clamped to ±GAZE_MAX; +x looks screen-right, +y looks up (for un-mirrored
 * geometry — the rig flips x for the mirrored eye).
 */
export function setGaze(material: THREE.ShaderMaterial, x: number, y: number): void {
  const clamp = (v: number) => Math.min(GAZE_MAX, Math.max(-GAZE_MAX, v))
  material.uniforms.gaze.value.set(clamp(x), clamp(y))
}
