import * as THREE from 'three'
import type { PatternSpec } from '../bird/genome'

// Procedural plumage PATTERNS as a CanvasTexture (the same proven mechanism as
// the face painter — no WebGPU/TSL, runs on the existing WebGLRenderer). The
// canvas is painted in the zone's base color, then the pattern is inked over it
// in object/UV space (so it does NOT swim under the turntable autoRotate). The
// returned texture is used as the zone mesh's `map`; buildProceduralBird disposes
// it with the rest of the bird (stress-test #4).

const W = 512
const H = 256

export function makePlumagePattern(baseColor: string, pattern: PatternSpec): THREE.CanvasTexture | null {
  if (pattern.type === 'none') return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = pattern.color
  ctx.strokeStyle = pattern.color

  // scale 0..1 → density. More scale = finer/denser pattern.
  const s = Math.max(0.05, Math.min(1, pattern.scale))

  switch (pattern.type) {
    case 'stripe': {
      const bands = Math.round(3 + s * 12)
      const bandW = W / (bands * 2)
      for (let i = 0; i < bands * 2; i += 2) {
        ctx.fillRect(i * bandW, 0, bandW, H)
      }
      break
    }
    case 'chevron': {
      const rows = Math.round(3 + s * 9)
      const rowH = H / rows
      ctx.lineWidth = Math.max(4, rowH * 0.22)
      for (let r = 0; r <= rows; r++) {
        const y = r * rowH
        ctx.beginPath()
        const teeth = Math.round(4 + s * 8)
        const step = W / teeth
        for (let i = 0; i <= teeth; i++) {
          const x = i * step
          const yy = i % 2 === 0 ? y : y + rowH * 0.5
          if (i === 0) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
      break
    }
    case 'speckle': {
      const count = Math.round(40 + s * 360)
      // Deterministic scatter (no Math.random — stable across rebuilds).
      let seed = 0x9e3779b9
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 0xffffffff
      }
      const r = 2 + s * 6
      for (let i = 0; i < count; i++) {
        ctx.beginPath()
        ctx.arc(rnd() * W, rnd() * H, r * (0.6 + rnd() * 0.8), 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'gradient': {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, baseColor)
      g.addColorStop(1, pattern.color)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      break
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
