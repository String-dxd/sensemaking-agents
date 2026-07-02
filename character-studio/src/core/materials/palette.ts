// Palette-driven recoloring (plan 005, step 1).
//
// Recolor mechanism: body textures are authored as grayscale luminance plus a
// channel-packed palette-mask texture whose R/G/B/A weights select palette
// slots. v1 contract (plan 006's authoring contract must match this exactly):
//
//   R = primary, G = secondary, B = belly, A = accentA
//
// accentB and padsNose ride a second mask if ever needed — v1 is one mask,
// four slots. Any unmasked remainder (1 - r - g - b - a, clamped) falls back
// to `primary`, so an all-zero mask renders as a plain primary-colored coat.
//
// Everything here is pure TS + three math objects — no React, no GL context.

import * as THREE from 'three'
import { mulberry32 } from '../motion/noise'
import { PALETTE_SLOTS, type PaletteSlot } from '../spec/schema'

/** The spec's palette shape (full recolor map, six required hex slots). */
export type Palette = Record<PaletteSlot, string>

/** Stable slot → uniform-array-index mapping (order = PALETTE_SLOTS). */
export const PALETTE_SLOT_INDEX: Record<PaletteSlot, number> = Object.fromEntries(
  PALETTE_SLOTS.map((slot, index) => [slot, index]),
) as Record<PaletteSlot, number>

/** Mask texture channel → palette slot (v1: one RGBA mask, four slots). */
export const MASK_CHANNEL_SLOTS = ['primary', 'secondary', 'belly', 'accentA'] as const

/** One sRGB channel (0..1) → linear (the standard IEC 61966-2-1 EOTF). */
export function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** `#rrggbb` → linear-sRGB triplet. Explicit so tests pin the conversion. */
export function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [
    srgbChannelToLinear(((value >> 16) & 0xff) / 255),
    srgbChannelToLinear(((value >> 8) & 0xff) / 255),
    srgbChannelToLinear((value & 0xff) / 255),
  ]
}

/**
 * Resolve a spec palette into the `uPaletteColors: vec3[6]` uniform value —
 * six linear-space colors in PALETTE_SLOT_INDEX order.
 */
export function resolvePalette(palette: Palette): THREE.Color[] {
  return PALETTE_SLOTS.map((slot) => {
    const [r, g, b] = hexToLinear(palette[slot])
    return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)
  })
}

/**
 * Reference implementation of the shader's mask → per-slot weight math
 * (kept in TS so the contract is unit-testable): the four mask channels
 * weight their slots, and the clamped remainder goes to `primary`.
 * Returns weights in PALETTE_SLOT_INDEX order (accentB/padsNose always 0
 * in the v1 single-mask contract).
 */
export function paletteWeightsFromMask(r: number, g: number, b: number, a: number): number[] {
  const rest = Math.max(0, 1 - (r + g + b + a))
  const weights = new Array<number>(PALETTE_SLOTS.length).fill(0)
  weights[PALETTE_SLOT_INDEX.primary] = r + rest
  weights[PALETTE_SLOT_INDEX.secondary] = g
  weights[PALETTE_SLOT_INDEX.belly] = b
  weights[PALETTE_SLOT_INDEX.accentA] = a
  return weights
}

// --- debug mask (demonstrates the recolor system before plan-006 art) -------

export const DEBUG_MASK_SIZE = 256
const DEBUG_MASK_SEED = 20260702
const SPOT_COUNT = 7

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Deterministic procedural palette mask for the placeholder UVs:
 * a soft belly patch (B channel) low on the front, plus a scatter of soft
 * spots (G = secondary). R (primary) takes the remainder explicitly so all
 * three used channels are exercised. Seeded — never `Math.random`.
 */
export function makeDebugMaskTexture(size: number = DEBUG_MASK_SIZE): THREE.DataTexture {
  const rand = mulberry32(DEBUG_MASK_SEED)
  const spots: Array<{ u: number; v: number; r: number }> = []
  for (let i = 0; i < SPOT_COUNT; i++) {
    spots.push({ u: rand(), v: 0.25 + rand() * 0.65, r: 0.045 + rand() * 0.05 })
  }

  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      // Belly: soft ellipse centred low on the front of the wrap.
      const du = (u - 0.5) / 0.24
      const dv = (v - 0.32) / 0.3
      const belly = 1 - smoothstep(0.7, 1, Math.sqrt(du * du + dv * dv))
      // Spots: soft discs (wrap-aware in u).
      let spot = 0
      for (const s of spots) {
        let su = Math.abs(u - s.u)
        su = Math.min(su, 1 - su)
        const d = Math.sqrt(su * su + (v - s.v) * (v - s.v))
        spot = Math.max(spot, 1 - smoothstep(s.r * 0.6, s.r, d))
      }
      const g = Math.max(0, spot * (1 - belly))
      const b = belly
      const r = Math.max(0, 1 - g - b)
      const idx = (y * size + x) * 4
      data[idx] = Math.round(r * 255)
      data[idx + 1] = Math.round(g * 255)
      data[idx + 2] = Math.round(b * 255)
      data[idx + 3] = 0 // accentA unused in the debug mask
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace // mask weights are data, not color
  texture.needsUpdate = true
  return texture
}
