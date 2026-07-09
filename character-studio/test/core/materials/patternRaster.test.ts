// Pattern rasterizer tests (plan 019 / plan 015 step 1). @napi-rs/canvas is
// injected through the rasterizer's `createCanvas` seam (CANVAS TEST STRATEGY);
// production code uses THREE.DataTexture with no canvas dependency.

import { type Canvas, createCanvas, loadImage } from '@napi-rs/canvas'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildProceduralBody, type ProcBodyData } from '../../../src/core/procgen/body'
import {
  bodyBuffers,
  type CanvasLike,
  PATTERN_FIELDS,
  rasterizeChannels,
  resolvePatternChannels,
} from '../../../src/core/materials/patternRaster'
import { UV_ATLAS } from '../../../src/core/procgen/kit/uv'
import { assembleCharacter } from '../../../src/core/skeleton/assemble'
import { createDefaultCharacter } from '../../../src/core/spec/defaults'

const napiFactory = (w: number, h: number) => createCanvas(w, h) as unknown as CanvasLike

const CH = { primary: 0, secondary: 1, belly: 2, accent: 3 } as const

/** Nearest-pixel sample of a rasterized byte buffer at a glTF-space UV (u,v).
 * Row = v·size: glTF v points down, and flipY=false uploads row 0 at v=0
 * (verified against the live viewport — head TOP pole uv.v=0 samples row 0). */
function sample(bytes: Uint8Array | Uint8ClampedArray, size: number, u: number, v: number): [number, number, number, number] {
  const x = Math.min(size - 1, Math.max(0, Math.round(u * size)))
  const y = Math.min(size - 1, Math.max(0, Math.round(v * size)))
  const p = (y * size + x) * 4
  return [bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]]
}

/** UV of the piece vertex extremal in a world axis (max/min of x/y/z). */
function extremeVertexUv(body: ProcBodyData, piece: string, axis: 0 | 1 | 2, dir: 1 | -1): [number, number] {
  const { positions, uv } = bodyBuffers(body)
  const [s, e] = body.meta.shellRanges[piece]
  let best = -1
  let bestVal = -Infinity
  for (let i = s; i < e; i++) {
    const val = positions[i * 3 + axis] * dir
    if (val > bestVal) {
      bestVal = val
      best = i
    }
  }
  return [uv[best * 2], uv[best * 2 + 1]]
}

describe('rasterizeChannels', () => {
  const bird = buildProceduralBody('bird')
  const size = 256

  it('fills the torso-front centre with the belly channel and the head cap with secondary', () => {
    const { uv, indices } = bodyBuffers(bird)
    const bytes = rasterizeChannels({ uv, indices, channels: bird.channels }, size).toDataTexture().image.data as Uint8Array

    // Torso front-centre (max +z on the torso) → belly-dominant (013 default).
    const [tu, tv] = extremeVertexUv(bird, 'torso', 2, 1)
    const [, , tBelly] = sample(bytes, size, tu, tv)
    expect(tBelly).toBeGreaterThan(120)

    // Head cap (max +y on the head) → secondary-dominant (bird crown default).
    const [hu, hv] = extremeVertexUv(bird, 'head', 1, 1)
    const [, hSec] = sample(bytes, size, hu, hv)
    expect(hSec).toBeGreaterThan(120)
  })

  it('is deterministic (two runs → identical bytes)', () => {
    const { uv, indices } = bodyBuffers(bird)
    const a = rasterizeChannels({ uv, indices, channels: bird.channels }, size).toDataTexture().image.data as Uint8Array
    const b = rasterizeChannels({ uv, indices, channels: bird.channels }, size).toDataTexture().image.data as Uint8Array
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('round-trips through PNG bytes (decode → same channels)', async () => {
    const { uv, indices } = bodyBuffers(bird)
    // Fully-opaque probe pixels require accentA=1 texels. Round 5 moved the
    // accent-painted legs/feet OFF the body (they are parts now), so paint
    // the head range accent for this test — the PNG round-trip contract is
    // about the encoder, not about which body region carries accent.
    const channels = bird.channels.slice()
    const [hs, he] = bird.meta.shellRanges.head
    for (let i = hs; i < he; i++) channels[i * 4 + 3] = 1
    const result = rasterizeChannels({ uv, indices, channels }, size, napiFactory)
    const texBytes = result.toDataTexture().image.data as Uint8Array
    const png = result.pngBytes()
    expect(png.length).toBeGreaterThan(0)

    const img = await loadImage(Buffer.from(png))
    const cv = createCanvas(size, size) as unknown as Canvas
    const ctx = cv.getContext('2d')
    ctx.drawImage(img as unknown as Parameters<typeof ctx.drawImage>[0], 0, 0)
    const decoded = ctx.getImageData(0, 0, size, size).data

    // Sample a handful of FULLY-OPAQUE pixels; PNG is lossless there so RGB
    // must match exactly. (Canvas decode premultiplies, so alpha<255 texels —
    // the rasterizer's blur margin — are legitimately lossy. Plan 023 removed
    // the bird's welded arms, which moved the old fixed sample points into
    // that margin; scanning for opaque texels makes the probe robust.)
    const opaque: number[] = []
    for (let p = 0; p < texBytes.length && opaque.length < 64; p += 4) {
      if (texBytes[p + 3] === 255) opaque.push(p / 4)
    }
    expect(opaque.length).toBeGreaterThanOrEqual(3)
    for (const px of [opaque[0], opaque[Math.floor(opaque.length / 2)], opaque[opaque.length - 1]]) {
      const a = [texBytes[px * 4], texBytes[px * 4 + 1], texBytes[px * 4 + 2]]
      const b = [decoded[px * 4], decoded[px * 4 + 1], decoded[px * 4 + 2]]
      expect(b).toEqual(a)
    }
  })

  it('island-aware blur does not bleed one UV island into a neighbour (seam fix)', () => {
    // Two touching islands tiled with small quads (realistic triangle size):
    // head rect painted SECONDARY, torso rect BELLY. They share the u=0.55 edge.
    // UV_ATLAS rects are Blender-space; geometry UVs are glTF-flipped, so tile
    // in the flipped rect (like islandUv does).
    const uvs: number[] = []
    const chans: number[] = []
    const idx: number[] = []
    const tileRect = (blenderRect: readonly [number, number, number, number], ch: number, n = 8) => {
      const rect = [blenderRect[0], 1 - blenderRect[3], blenderRect[2], 1 - blenderRect[1]] as const
      const [u0, v0, u1, v1] = rect
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const base = uvs.length / 2
          const cu0 = u0 + ((u1 - u0) * c) / n
          const cu1 = u0 + ((u1 - u0) * (c + 1)) / n
          const cv0 = v0 + ((v1 - v0) * r) / n
          const cv1 = v0 + ((v1 - v0) * (r + 1)) / n
          uvs.push(cu0, cv0, cu1, cv0, cu1, cv1, cu0, cv1)
          for (let k = 0; k < 4; k++) {
            chans.push(0, 0, 0, 0)
            chans[chans.length - 4 + ch] = 1
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
      }
    }
    tileRect(UV_ATLAS.head, CH.secondary)
    tileRect(UV_ATLAS.torso, CH.belly)
    const uv = new Float32Array(uvs)
    const channels = new Float32Array(chans)
    const indices = new Uint32Array(idx)
    const s = 128
    const bytes = rasterizeChannels({ uv, indices, channels }, s).toDataTexture().image.data as Uint8Array

    // Torso interior just past the shared u=0.55 boundary: belly, NO head bleed.
    // (glTF-space head/torso islands span v∈[0,0.55]; probe mid-island.)
    const [, tSec, tBelly] = sample(bytes, s, 0.57, 0.3)
    expect(tBelly).toBeGreaterThan(200)
    expect(tSec).toBeLessThan(30)
    // Head interior just before the boundary: secondary, NO torso bleed.
    const [, hSec, hBelly] = sample(bytes, s, 0.53, 0.3)
    expect(hSec).toBeGreaterThan(200)
    expect(hBelly).toBeLessThan(30)
  })
})

describe('PATTERN_FIELDS (AC-exact bird set)', () => {
  const bird = buildProceduralBody('bird')
  const { positions } = bodyBuffers(bird)

  const channelAt = (out: Float32Array, i: number, ch: number) => out[i * 4 + ch]
  const frontTorsoVertex = () => extremeIdx('torso', 2, 1)
  const backTorsoVertex = () => extremeIdx('torso', 2, -1)
  const headVertex = () => extremeIdx('head', 2, 1)

  function extremeIdx(piece: string, axis: 0 | 1 | 2, dir: 1 | -1): number {
    const [s, e] = bird.meta.shellRanges[piece]
    let best = -1
    let bestVal = -Infinity
    for (let i = s; i < e; i++) {
      const val = positions[i * 3 + axis] * dir
      if (val > bestVal) {
        bestVal = val
        best = i
      }
    }
    return best
  }

  it('penguin: white belly front, dark back, dark head', () => {
    const out = PATTERN_FIELDS['pattern-penguin'](bird)
    expect(channelAt(out, frontTorsoVertex(), CH.belly)).toBeGreaterThan(0.7)
    expect(channelAt(out, backTorsoVertex(), CH.secondary)).toBeGreaterThan(0.7)
    // dark head somewhere on the back of the head
    expect(channelAt(out, extremeIdx('head', 2, -1), CH.secondary)).toBeGreaterThan(0.7)
  })

  it('eagle: white head, dark body (legs are parts since round 5 — no tarsi on the body)', () => {
    const out = PATTERN_FIELDS['pattern-eagle'](bird)
    expect(channelAt(out, headVertex(), CH.belly)).toBeGreaterThan(0.9)
    expect(channelAt(out, backTorsoVertex(), CH.secondary)).toBeGreaterThan(0.7)
    // round 5: the whole visible leg is a skinned part (bird-toes) — the
    // body carries no leg pieces, so the old tarsus-stripe probe is gone
    expect(bird.meta.shellRanges.legL).toBeUndefined()
  })

  it('owl: facial disc belly on the front head + argyle variation across the chest', () => {
    const out = PATTERN_FIELDS['pattern-owl'](bird)
    // Front-centre head vertex sits in the facial disc → belly present.
    expect(channelAt(out, headVertex(), CH.belly)).toBeGreaterThan(0.3)
    // Chest argyle: front torso vertices show belly variation across cells.
    const [s, e] = bird.meta.shellRanges.torso
    const { rx } = bird.meta.torso
    let maxB = 0
    let minB = 1
    for (let i = s; i < e; i++) {
      if (positions[i * 3 + 2] / rx > 0.4) {
        const b = channelAt(out, i, CH.belly)
        maxB = Math.max(maxB, b)
        minB = Math.min(minB, b)
      }
    }
    expect(maxB - minB).toBeGreaterThan(0.2) // diamonds, not a flat belly
  })

  it('peacock: green back saddle + tarsus stripes; head stays primary', () => {
    const out = PATTERN_FIELDS['pattern-peacock'](bird)
    expect(channelAt(out, backTorsoVertex(), CH.secondary)).toBeGreaterThan(0.6)
    expect(channelAt(out, headVertex(), CH.belly)).toBeLessThan(0.05)
    expect(channelAt(out, headVertex(), CH.secondary)).toBeLessThan(0.05)
  })

  it('robin: crisp saturated breast bib', () => {
    const out = PATTERN_FIELDS['pattern-robin'](bird)
    expect(channelAt(out, frontTorsoVertex(), CH.belly)).toBeGreaterThan(0.9)
  })

  it('resolvePatternChannels falls back to the plain authored channels', () => {
    const out = resolvePatternChannels('authored', bird)
    expect(out).toEqual(bird.channels)
    expect(out).not.toBe(bird.channels) // a copy, not the shared buffer
  })
})

describe('assemble: mask-vs-vertexChannels preference (plan 019 guard)', () => {
  it('a body WITH a rasterized mask uses paletteMask; WITHOUT one keeps paletteVertex', () => {
    const spec = createDefaultCharacter('bird')
    spec.anatomy.parts = {} // no parts → assembly needs no part registry
    spec.materials.body = { ...(spec.materials.body ?? { rampSoftness: 0.2, rimStrength: 0.3, shadowTint: '#b8a8c8' }), textureId: 'authored' }
    const mask = new THREE.DataTexture(new Uint8Array([255, 0, 0, 0]), 1, 1, THREE.RGBAFormat)

    const withMask = assembleCharacter(spec, {}, {
      bodyScene: buildProceduralBody('bird').scene,
      partScenes: {},
      texturesByRegion: { body: { map: null, maskMap: mask } },
    })
    expect(withMask.regionMaterials.body?.userData.toonDefines.paletteMask).toBe(true)
    expect(withMask.regionMaterials.body?.userData.toonDefines.paletteVertex).toBe(false)

    const withoutMask = assembleCharacter(spec, {}, {
      bodyScene: buildProceduralBody('bird').scene,
      partScenes: {},
      texturesByRegion: {},
    })
    expect(withoutMask.regionMaterials.body?.userData.toonDefines.paletteVertex).toBe(true)
    expect(withoutMask.regionMaterials.body?.userData.toonDefines.paletteMask).toBe(false)
  })
})
