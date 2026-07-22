// U8: Character view behind Kira's contract — flyTo promise, species API,
// head anchor, walk invariants against the committed spec.

import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/engine/student-space/Game/State/State.js', () => {
  class StubState {
    static instance: StubState | null = null
    island: unknown
    time = { elapsed: 0, delta: 0.016 }
    static getInstance() {
      if (!StubState.instance) StubState.instance = new StubState()
      return StubState.instance
    }
  }
  return { default: StubState }
})
vi.mock('~/engine/student-space/Game/View/View.js', () => {
  class StubView {
    static instance: StubView | null = null
    scene = new (require('three').Scene)()
    static getInstance() {
      if (!StubView.instance) StubView.instance = new StubView()
      return StubView.instance
    }
  }
  return { default: StubView }
})

import Island from '~/engine/student-space/Game/State/Island.js'
import State from '~/engine/student-space/Game/State/State.js'
// @ts-expect-error vendored engine module is intentionally untyped
import { COMPANION_SPECIES_IDS as SPECIES_IDS_UNTYPED } from '~/engine/student-space/Game/State/schema.js'

const COMPANION_SPECIES_IDS = SPECIES_IDS_UNTYPED as Set<string>

import {
  advanceBehavior,
  type BehaviorEnv,
  createBehaviorState,
} from '~/engine/student-space/Game/State/characterBehavior.ts'
import { mulberry32 } from '~/engine/student-space/Game/State/islandSpecCore/rand.ts'
import { __setLoaderForTests } from '~/engine/student-space/Game/View/assetLoader.ts'
import Character from '~/engine/student-space/Game/View/Character.js'
import View from '~/engine/student-space/Game/View/View.js'

type StateStub = { island: Island; time: { elapsed: number; delta: number } }

function stubSkinnedGltf() {
  const scene = new THREE.Group()
  const bone = new THREE.Bone()
  bone.name = 'Head'
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.62, 1), new THREE.MeshStandardMaterial())
  scene.add(bone)
  scene.add(mesh)
  const track = new THREE.NumberKeyframeTrack('.scale[x]', [0, 1], [1, 1])
  const animations = [
    'Walking',
    'Wave_for_Help_2',
    'Talk_Passionately',
    'Wake_Up_and_Look_Up',
    'Stand_To_Side_Lying',
    'Swim_Forward',
  ].map((name) => new THREE.AnimationClip(name, 1, [track.clone()]))
  return { scene, animations }
}

function setup(): { state: StateStub; character: InstanceType<typeof Character> } {
  const state = (State as unknown as { getInstance(): StateStub }).getInstance()
  state.island = new Island()
  __setLoaderForTests(async () => ({ loadAsync: async () => stubSkinnedGltf() as never }))
  const character = new Character()
  return { state, character }
}

/** Advance engine time + the character's update in lockstep. */
function tick(
  state: StateStub,
  character: InstanceType<typeof Character>,
  steps: number,
  dt = 0.05,
) {
  for (let i = 0; i < steps; i++) {
    state.time.elapsed += dt
    state.time.delta = dt
    character.update()
  }
}

afterEach(() => {
  __setLoaderForTests(null)
  ;(State as unknown as { instance: unknown }).instance = null
  ;(View as unknown as { instance: unknown }).instance = null
  vi.restoreAllMocks()
})

describe('Character — Kira contract', () => {
  it('spawns at the spec character home (cell 20,33 anchor)', () => {
    const { character } = setup()
    expect(character.perchX).toBeCloseTo(-4.3125, 3)
    expect(character.perchZ).toBeCloseTo(0.5625, 3)
    expect(Number.isFinite(character.perchY)).toBe(true)
    expect(character.group.position.x).toBeCloseTo(-4.3125, 3)
  })

  it('getHeadWorldPosition returns a finite Vector3 before the GLB resolves and tracks the head bone after', async () => {
    const { character } = setup()
    const out = new THREE.Vector3()
    character.getHeadWorldPosition(out) // pre-load placeholder path
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
    expect(out.y).toBeGreaterThan(character.group.position.y)
    await vi.waitFor(() =>
      expect((character as unknown as { _modelReady: boolean })._modelReady).toBe(true),
    )
    const after = new THREE.Vector3()
    character.getHeadWorldPosition(after)
    expect(Number.isFinite(after.y)).toBe(true)
    expect((character as unknown as { _headBone: unknown })._headBone).toBeTruthy()
  })

  it('setSpecies accepts all 7 schema ids without throwing, fires onSpeciesChange', () => {
    const { character } = setup()
    const seen: string[] = []
    const unsub = character.onSpeciesChange((id: string) => seen.push(id))
    for (const id of COMPANION_SPECIES_IDS) {
      character.setSpecies(id) // boot calls this — a throw kills the app
    }
    expect(seen.length).toBeGreaterThan(0)
    for (const id of seen) expect(COMPANION_SPECIES_IDS.has(id)).toBe(true)
    // legacy alias routes to the default instead of throwing
    character.setSpecies('ember')
    expect(COMPANION_SPECIES_IDS.has(character.speciesId)).toBe(true)
    unsub()
    character.cycleSpecies(1)
    expect(COMPANION_SPECIES_IDS.has(character.speciesId)).toBe(true)
  })

  it('flyTo resolves its Promise on arrival', async () => {
    const { state, character } = setup()
    await vi.waitFor(() =>
      expect((character as unknown as { _modelReady: boolean })._modelReady).toBe(true),
    )
    let resolved = false
    let atResolve: { x: number; z: number } | null = null
    const target = { x: character.perchX + 1.0, z: character.perchZ }
    const p = character
      .flyTo({ startPos: { x: character.perchX, z: character.perchZ }, endPos: target })
      .then(() => {
        resolved = true
        atResolve = { x: character.group.position.x, z: character.group.position.z }
      })
    // walk speed 0.5 u/s → 1 u ≈ 2 s + wake flourish 2.6 s; give it 8 s.
    // Ticks run synchronously; yield between batches so the promise callback
    // can capture the position before the wander resumes.
    for (let batch = 0; batch < 16 && !resolved; batch++) {
      tick(state, character, 10)
      await Promise.resolve()
    }
    await p
    expect(resolved).toBe(true)
    const arrivedAt = atResolve as { x: number; z: number } | null
    expect(arrivedAt).not.toBeNull()
    if (arrivedAt) {
      expect(Math.hypot(arrivedAt.x - target.x, arrivedAt.z - target.z)).toBeLessThan(0.5)
    }
  })

  it('flyTo resolves on interruption (a competing flyTo or onboarding reset)', async () => {
    const { character } = setup()
    let firstResolved = false
    const first = character.flyTo({ endPos: { x: 0, z: 0 } }).then(() => {
      firstResolved = true
    })
    character.setOnboardingMode(true) // ceremony reset interrupts
    await first
    expect(firstResolved).toBe(true)
  })

  it('flyTo resolves on timeout even if pathing stalls', async () => {
    const { state, character } = setup()
    await vi.waitFor(() =>
      expect((character as unknown as { _modelReady: boolean })._modelReady).toBe(true),
    )
    let resolved = false
    // Unreachable target far off-world: the leash refuses the route.
    const p = character.flyTo({ endPos: { x: 500, z: 500 } }).then(() => {
      resolved = true
    })
    // Advance past the timeout deadline (25 s) + wake flourish.
    tick(state, character, 700)
    await p
    expect(resolved).toBe(true)
  })

  it('setOnboardingMode parks at the perch and hides; off reveals', () => {
    const { character } = setup()
    character.setOnboardingMode(true)
    expect(character.group.visible).toBe(false)
    expect(character.group.position.x).toBeCloseTo(character.perchX, 5)
    character.setOnboardingMode(false)
    expect(character.group.visible).toBe(true)
  })

  it('walk never leaves the bird standing dry-phase on water (committed spec env)', () => {
    const { state } = setup()
    const island = state.island
    const env: BehaviorEnv = {
      heightAt: (x, z) => island.heightAt(x, z),
      shoreDistanceAt: (x, z) => island.shoreDistanceAt(x, z),
      seaLevel: island.seaLevel,
      worldSize: island.worldSize,
      rand: mulberry32(7),
    }
    const s = createBehaviorState(-4.3125, 0.5625, 0, mulberry32(3))
    for (let i = 0; i < 20000; i++) {
      advanceBehavior(s, 0.05, env)
      if (s.phase === 'walk' && !s.wet) {
        // A dry walking bird must have real footing — submerged ground while
        // still in the walk phase means the swim hand-off failed.
        expect(env.heightAt(s.x, s.z)).toBeGreaterThan(env.seaLevel - 0.02 - 1e-9)
      }
    }
    // The wander leash also keeps it inside the world bounds.
    expect(Math.abs(s.x)).toBeLessThanOrEqual(env.worldSize / 2)
    expect(Math.abs(s.z)).toBeLessThanOrEqual(env.worldSize / 2)
  })
})
