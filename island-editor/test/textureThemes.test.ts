import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  currentTextureTheme,
  registerPaintedMaterial,
  registerPaintedModel,
  setTextureTheme,
  TEXTURE_THEMES,
  unregisterPaintedMaterial,
} from '../src/models/textureThemes'

// The registry holds module-level state (current theme + registered materials),
// so these tests run as one sequential story rather than isolated cases.

describe('texture theme registry', () => {
  it('exposes the four themes with classic first and off last', () => {
    expect(TEXTURE_THEMES[0]).toBe('classic')
    expect(TEXTURE_THEMES[TEXTURE_THEMES.length - 1]).toBe('off')
    expect(TEXTURE_THEMES).toContain('pastel')
    expect(TEXTURE_THEMES).toContain('storybook')
  })

  it("'off' strips the map and restores the explicit off tint", () => {
    setTextureTheme('classic')
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
    // Authored-white material (map carries the color): without an explicit
    // offTint the off look would be white — the register call must pass one.
    registerPaintedMaterial(mat, 'foliage-leaves', 0xffffff, 0x8fd062)
    setTextureTheme('off')
    expect(currentTextureTheme()).toBe('off')
    expect(mat.map).toBeNull()
    expect(mat.color.getHex()).toBe(0x8fd062)
    unregisterPaintedMaterial(mat)
  })

  it("defaults the off fallback to the material's authored color", () => {
    setTextureTheme('classic')
    const mat = new THREE.MeshStandardMaterial({ color: 0xa87a58 })
    registerPaintedMaterial(mat, 'bark-painted')
    setTextureTheme('off')
    expect(mat.color.getHex()).toBe(0xa87a58)
    unregisterPaintedMaterial(mat)
  })

  it('registerPaintedModel re-registers userData.paint materials after a dispose cycle', () => {
    setTextureTheme('classic')
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fd062 })
    mat.userData.paint = { map: 'bush-leaves', offTint: 0x8fd062 }
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)

    registerPaintedModel(mesh)
    // Simulate StrictMode's probe cleanup: the material is unregistered while
    // the mesh keeps rendering, so theme switches stop reaching it…
    unregisterPaintedMaterial(mat)
    mat.color.setHex(0x123456)
    setTextureTheme('off')
    expect(mat.color.getHex()).toBe(0x123456) // frozen — not following themes

    // …until the remount effect re-registers it, which re-applies the active
    // theme immediately from the userData.paint spec.
    registerPaintedModel(mesh)
    expect(mat.color.getHex()).toBe(0x8fd062)
    unregisterPaintedMaterial(mat)
    setTextureTheme('classic')
  })
})
