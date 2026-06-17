import { describe, expect, it } from 'vitest'
import {
  configError,
  defaultBirdConfig,
  isHexColor,
  isValidConfig,
  setSlotColor,
  setSlotItem,
} from '../src/bird/birdConfig'
import { ITEM_BY_ID, itemsForSlot, NONE_ITEM, SLOTS } from '../src/bird/slots'

describe('birdConfig', () => {
  it('defaultBirdConfig is valid, masked base, every slot empty', () => {
    const c = defaultBirdConfig()
    expect(c.version).toBe(1)
    expect(c.baseId).toBe('masked')
    expect(Object.keys(c.slots).sort()).toEqual(SLOTS.map((s) => s.id).sort())
    for (const s of SLOTS) expect(c.slots[s.id].itemId).toBe(NONE_ITEM)
    expect(isHexColor(c.featherPalette.body)).toBe(true)
    expect(isHexColor(c.featherPalette.accent)).toBe(true)
    expect(isValidConfig(c)).toBe(true)
  })

  it('setSlotItem seeds colors from the item defaults', () => {
    const c = setSlotItem(defaultBirdConfig(), 'head', 'cap')
    expect(c.slots.head.itemId).toBe('cap')
    expect(c.slots.head.colors).toEqual(ITEM_BY_ID.cap.defaultColors)
  })

  it('setSlotItem with none resets to a neutral color', () => {
    const dressed = setSlotItem(defaultBirdConfig(), 'head', 'cap')
    const cleared = setSlotItem(dressed, 'head', NONE_ITEM)
    expect(cleared.slots.head.itemId).toBe(NONE_ITEM)
    expect(cleared.slots.head.colors.base).toBe('#ffffff')
  })

  it('setSlotColor updates one channel immutably', () => {
    const c0 = setSlotItem(defaultBirdConfig(), 'head', 'cap')
    const c1 = setSlotColor(c0, 'head', 'base', '#123456')
    expect(c1.slots.head.colors.base).toBe('#123456')
    expect(c0.slots.head.colors.base).toBe(ITEM_BY_ID.cap.defaultColors.base) // original untouched
  })

  it('itemsForSlot only returns that slot’s items', () => {
    for (const item of itemsForSlot('head')) expect(item.slot).toBe('head')
  })

  it('isHexColor accepts #rgb/#rrggbb/#rrggbbaa and rejects junk', () => {
    for (const ok of ['#fff', '#ffffff', '#ffffffff', '#AbC123']) expect(isHexColor(ok)).toBe(true)
    for (const bad of ['red', '#xyz', '#12', '', 123, null, undefined]) expect(isHexColor(bad)).toBe(false)
  })

  it('configError pinpoints the first problem and passes a valid config', () => {
    expect(configError(defaultBirdConfig())).toBeNull()
    expect(configError(null)).toMatch(/object/)
    expect(configError({ ...defaultBirdConfig(), version: 2 })).toMatch(/version/)
    expect(configError({ ...defaultBirdConfig(), baseId: '' })).toMatch(/baseId/)
    const badPalette = defaultBirdConfig()
    badPalette.featherPalette = { body: 'red', accent: '#fff' }
    expect(configError(badPalette)).toMatch(/featherPalette\.body/)
  })
})
