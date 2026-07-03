// Structural validation of the committed core-v1 clip GLB (plan 007 step 1).
//
// The contract this enforces (see scripts/blender/clips.py + plan 007):
//   - all 11 contract clips present, names exact
//   - durations match the contract table
//   - loop clips close: first and last sampled values identical within 1e-3
//   - NO tracks target spring-chain bones (springs own them), sockets, root,
//     or jaw; no scale tracks at all; translation only on hips
//   - one-shot gestures end on the rest pose (rotations ~identity, so the
//     gesture layer hands cleanly back to the base state)
//   - animations-only GLB: no meshes, no lights/cameras, within size budget

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { type Animation, type Document, NodeIO } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { SPRING_CHAIN_BONES } from '../../../src/core/skeleton/canonical'

const GLB_PATH = fileURLToPath(new URL('../../../src/assets/clips/clips-core-v1.glb', import.meta.url))

const FPS = 30
const LOOP_CLIPS: Record<string, number> = {
  idle: 150 / FPS,
  walk: 27 / FPS,
  run: 18 / FPS,
  sitIdle: 120 / FPS,
  talkIdle: 90 / FPS,
}
const ONESHOT_CLIPS: Record<string, number> = {
  sitDown: 24 / FPS,
  standUp: 24 / FPS,
  gestureWave: 45 / FPS,
  gestureNod: 30 / FPS,
  gestureShrug: 36 / FPS,
  gestureCheer: 60 / FPS,
}
const ALL_CLIPS = { ...LOOP_CLIPS, ...ONESHOT_CLIPS }

function channelInfo(anim: Animation) {
  return anim.listChannels().map((channel) => {
    const sampler = channel.getSampler()
    const input = sampler?.getInput()?.getArray()
    const output = sampler?.getOutput()?.getArray()
    if (!sampler || !input || !output) throw new Error(`channel without sampler data in ${anim.getName()}`)
    return {
      bone: channel.getTargetNode()?.getName() ?? '',
      path: channel.getTargetPath(),
      times: Array.from(input),
      values: Array.from(output),
      components: output.length / input.length,
    }
  })
}

describe('clips-core-v1.glb', () => {
  let doc: Document
  const byName = new Map<string, Animation>()

  beforeAll(async () => {
    doc = await new NodeIO().read(GLB_PATH)
    for (const anim of doc.getRoot().listAnimations()) byName.set(anim.getName(), anim)
  })

  it('exists, is animations-only, and fits the 5 MB budget', () => {
    expect(existsSync(GLB_PATH)).toBe(true)
    expect(statSync(GLB_PATH).size).toBeLessThanOrEqual(5 * 1024 * 1024)
    expect(doc.getRoot().listMeshes()).toHaveLength(0)
    expect(doc.getRoot().listCameras()).toHaveLength(0)
  })

  it('contains exactly the 11 contract clips', () => {
    expect([...byName.keys()].sort()).toEqual(Object.keys(ALL_CLIPS).sort())
  })

  it.each(Object.entries(ALL_CLIPS))('%s has the contract duration', (name, seconds) => {
    const anim = byName.get(name)
    if (!anim) throw new Error(`missing clip ${name}`)
    let end = 0
    for (const { times } of channelInfo(anim)) end = Math.max(end, times[times.length - 1])
    expect(Math.abs(end - seconds)).toBeLessThan(1.5 / FPS)
  })

  it.each(Object.keys(ALL_CLIPS))('%s never targets spring bones, sockets, root or jaw and never scales', (name) => {
    const anim = byName.get(name)
    if (!anim) throw new Error(`missing clip ${name}`)
    const forbidden = new Set<string>([...SPRING_CHAIN_BONES, 'root', 'jaw'])
    for (const { bone, path } of channelInfo(anim)) {
      expect(forbidden.has(bone), `${name}: track targets spring/root bone ${bone}`).toBe(false)
      expect(bone.startsWith('socket.'), `${name}: track targets socket ${bone}`).toBe(false)
      expect(path, `${name}: scale track on ${bone}`).not.toBe('scale')
      if (path === 'translation') expect(bone, `${name}: translation on non-hips bone ${bone}`).toBe('hips')
    }
  })

  it.each(Object.keys(LOOP_CLIPS))('%s loops: first and last sampled pose identical', (name) => {
    const anim = byName.get(name)
    if (!anim) throw new Error(`missing clip ${name}`)
    for (const { bone, path, values, components } of channelInfo(anim)) {
      for (let i = 0; i < components; i++) {
        const first = values[i]
        const last = values[values.length - components + i]
        expect(Math.abs(last - first), `${name} ${bone}.${path}[${i}]`).toBeLessThan(1e-3)
      }
    }
  })

  // sitDown ends on the SIT pose (covered by the continuity test below);
  // every other one-shot must hand back to the rest pose.
  it.each(Object.keys(ONESHOT_CLIPS).filter((n) => n !== 'sitDown'))('%s ends on the rest pose', (name) => {
    const anim = byName.get(name)
    if (!anim) throw new Error(`missing clip ${name}`)
    for (const { bone, path, values, components } of channelInfo(anim)) {
      const tail = values.slice(-components)
      if (path === 'rotation') {
        // identity quaternion (either sign)
        expect(Math.abs(Math.abs(tail[3]) - 1), `${name} ${bone} end rotation`).toBeLessThan(1e-3)
      }
      // translation: the exporter re-adds rest, so "rest" here is the hips
      // rest position of the reference skeleton.
      if (path === 'translation') {
        // hips only (enforced above); rest local y for the reference skeleton is 0.34
        expect(Math.abs(tail[0]), `${name} hips end x`).toBeLessThan(1e-3)
        expect(Math.abs(tail[1] - 0.34), `${name} hips end y`).toBeLessThan(1.5e-3)
        expect(Math.abs(tail[2]), `${name} hips end z`).toBeLessThan(1e-3)
      }
    }
  })

  it('sitDown ends exactly where sitIdle begins (shared SIT_POSE)', () => {
    const down = byName.get('sitDown')
    const idle = byName.get('sitIdle')
    if (!down || !idle) throw new Error('missing sit clips')
    const endOf = new Map<string, number[]>()
    for (const { bone, path, values, components } of channelInfo(down)) {
      endOf.set(`${bone}.${path}`, values.slice(-components))
    }
    for (const { bone, path, values, components } of channelInfo(idle)) {
      const start = values.slice(0, components)
      const end = endOf.get(`${bone}.${path}`)
      if (!end) continue // sitIdle may key bones sitDown doesn't (both rest-relative)
      for (let i = 0; i < components; i++) {
        expect(Math.abs(start[i] - end[i]), `${bone}.${path}[${i}]`).toBeLessThan(0.02)
      }
    }
  })
})
