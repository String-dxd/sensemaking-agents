import { describe, expect, it } from 'vitest'
import type { SpringChainDef } from '../../../src/core/motion/springTypes'
import {
  buildWardrobeRegistry,
  defaultEarMode,
  getItem,
  itemsForSlot,
  WARDROBE_ITEM_IDS,
  WARDROBE_REGISTRY,
} from '../../../src/core/wardrobe/itemRegistry'
import { BONE_NAMES, WEAR_SLOTS } from '../../../src/core/spec/schema'

const CANONICAL = new Set<string>(BONE_NAMES)

describe('WARDROBE_REGISTRY', () => {
  it('ships at least 10 items across at least 6 wear slots', () => {
    expect(WARDROBE_ITEM_IDS.length).toBeGreaterThanOrEqual(10)
    const slots = new Set(WARDROBE_ITEM_IDS.map((id) => WARDROBE_REGISTRY[id].slot))
    expect(slots.size).toBeGreaterThanOrEqual(6)
  })

  it('is fully serializable (plan 011 exports item metadata)', () => {
    const roundTripped = JSON.parse(JSON.stringify(WARDROBE_REGISTRY))
    expect(roundTripped).toEqual(WARDROBE_REGISTRY)
  })

  it('declares spring chains only over item-internal (non-canonical) bones, joints 1:1', () => {
    for (const id of WARDROBE_ITEM_IDS) {
      for (const chain of WARDROBE_REGISTRY[id].springChains ?? []) {
        expect(chain.joints.length, `${id}/${chain.name}`).toBe(chain.boneNames.length)
        for (const bone of chain.boneNames) {
          expect(CANONICAL.has(bone), `${id}/${chain.name}: "${bone}" must not be canonical`).toBe(false)
        }
      }
    }
  })

  it('spring-chain and bone names are unique across the whole registry', () => {
    const seenBones = new Set<string>()
    const seenChains = new Set<string>()
    for (const id of WARDROBE_ITEM_IDS) {
      for (const chain of WARDROBE_REGISTRY[id].springChains ?? []) {
        expect(seenChains.has(chain.name), `duplicate chain name ${chain.name}`).toBe(false)
        seenChains.add(chain.name)
        for (const bone of chain.boneNames) {
          expect(seenBones.has(bone), `duplicate item bone ${bone}`).toBe(false)
          seenBones.add(bone)
        }
      }
    }
  })

  it('item bone names survive GLTFLoader name sanitization (no dots/brackets)', () => {
    for (const id of WARDROBE_ITEM_IDS) {
      for (const chain of WARDROBE_REGISTRY[id].springChains ?? []) {
        for (const bone of chain.boneNames) {
          expect(bone, `${id}: item bone "${bone}"`).toMatch(/^[a-zA-Z0-9_]+$/)
        }
      }
    }
  })

  it('itemsForSlot partitions the registry; every slot value is legal', () => {
    const seen: string[] = []
    for (const slot of WEAR_SLOTS) {
      for (const id of itemsForSlot(slot)) {
        expect(WARDROBE_REGISTRY[id].slot).toBe(slot)
        seen.push(id)
      }
    }
    expect(seen.sort()).toEqual([...WARDROBE_ITEM_IDS].sort())
  })

  it('getItem resolves ids and returns null for unknown ids', () => {
    expect(getItem('hoodie')?.label).toBe('Hoodie')
    expect(getItem('no-such-item')).toBeNull()
  })

  it('defaultEarMode returns the first declared mode, null for non-ear-aware items', () => {
    expect(defaultEarMode(WARDROBE_REGISTRY['cap-baseball'])).toBe('under')
    expect(defaultEarMode(WARDROBE_REGISTRY.strawhat)).toBe('through')
    expect(defaultEarMode(WARDROBE_REGISTRY.mug)).toBeNull()
  })
})

describe('buildWardrobeRegistry validation', () => {
  const base = {
    slot: 'headwear',
    label: 'Test',
    url: 'stub://item.glb',
    maskUrl: null,
    attach: 'socket',
    socket: 'socket.hat',
    paletteSlots: ['primary'],
    morphs: [],
  }

  it('accepts a minimal valid entry', () => {
    expect(() => buildWardrobeRegistry({ ok: { ...base } })).not.toThrow()
  })

  it('rejects earModes outside the headwear slot', () => {
    expect(() =>
      buildWardrobeRegistry({ bad: { ...base, slot: 'back', socket: 'socket.back', earModes: ['under'] } }),
    ).toThrow(/headwear-only/)
  })

  it('rejects socket items without a socket', () => {
    const { socket: _socket, ...noSocket } = base
    expect(() => buildWardrobeRegistry({ bad: noSocket })).toThrow(/declare their socket/)
  })

  it('rejects hideBodyRegions outside top/bottom/outfit', () => {
    expect(() =>
      buildWardrobeRegistry({ bad: { ...base, hideBodyRegions: ['torso'] } }),
    ).toThrow(/top\/bottom\/outfit/)
  })

  it('rejects spring chains over canonical-skeleton bones', () => {
    const chain: SpringChainDef = {
      name: 'bad',
      boneNames: ['earL.1'],
      joints: [{ stiffness: 0.2, gravityPower: 10, gravityDir: [0, -1, 0], dragForce: 0.1, hitRadius: 0.02 }],
      colliderGroupRefs: [],
    }
    expect(() => buildWardrobeRegistry({ bad: { ...base, springChains: [chain] } })).toThrow(/never canonical/)
  })

  it('rejects joints/boneNames length mismatches', () => {
    const chain: SpringChainDef = {
      name: 'bad',
      boneNames: ['itemBone1', 'itemBone2'],
      joints: [{ stiffness: 0.2, gravityPower: 10, gravityDir: [0, -1, 0], dragForce: 0.1, hitRadius: 0.02 }],
      colliderGroupRefs: [],
    }
    expect(() => buildWardrobeRegistry({ bad: { ...base, springChains: [chain] } })).toThrow(/1:1/)
  })

  it('rejects unknown fields (strict schema)', () => {
    expect(() => buildWardrobeRegistry({ bad: { ...base, bogus: true } })).toThrow(/bad/)
  })
})
