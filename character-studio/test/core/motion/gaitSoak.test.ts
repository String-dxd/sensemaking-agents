// Gait soak (plan 004 characterization) — measures whether the foot-IK
// stance gate (footIK.ts:200-202, `height < restHeight*1.35 && speed < 0.4`)
// actually engages while the real authored clips drive the real skeleton at
// locomotion ground speed, or whether it is inert as an audit pass claimed.
//
// HYPOTHESIS RESULT (measured 2026-07-06, plan 004 Step 2): NEITHER static
// reading cleanly won.
//
// Measured (this file, 600 ticks @ 1/60 s, 2 s warmup, real clips-core-v1.glb,
// real canonical skeleton, real locomotion + clipStateMachine + footIK stack):
//
//   idle (0 m/s):   stanceEngagementRatio = 1.000  plantedFootDriftMax = 0.000091 m         minWorldFootSpeedP10 ≈ 4e-16 m/s
//   walk (0.9 m/s): stanceEngagementRatio = 0.246  plantedFootDriftMax = 0.0045 m           minWorldFootSpeedP10 = 0.139 m/s
//   run  (2.2 m/s): stanceEngagementRatio = 0.000  plantedFootDriftMax = 0 (no windows)     minWorldFootSpeedP10 = 0.922 m/s
//
// Diagnosis (in-place clip traces + straight-line-vs-circle comparison):
//   - The clip-speed constants ARE right as cycle AVERAGES: played in place
//     at timeScale 1, the stance foot's world speed bottoms out at
//     ≈ 0.894 m/s (walk) / ≈ 1.798 m/s (run), matching WALK_CLIP_SPEED /
//     RUN_CLIP_SPEED. The audit's "gate can never engage" claim is wrong for
//     walk: the gate engages 24.6 % of ticks, and while a foot is pinned it
//     drifts only 4.5 mm (well inside the 2 cm skate budget).
//   - But cancellation is not INSTANTANEOUS. Within the walk contact window
//     the foot's residual world speed is ~0.32–0.55 m/s (XZ 0.25–0.40),
//     straddling the 0.4 m/s gate — hence partial engagement. Within the
//     run contact window (~4 ticks/cycle) the residual never drops below
//     ≈ 0.86 m/s, so the gate NEVER engages at run. This is steady-state
//     (identical numbers on a straight-line root with zero gait
//     transitions), which implicates the authored clips' non-constant
//     stance-foot speed profile — out of this plan's scope, so per plan 004
//     Step 3 no src/ change was made and the defect was reported instead.
//
// The pins below are the MEASURED baseline (with slack), not aspirational
// health bounds: idle is pinned healthy; walk pins partial engagement with
// tiny while-pinned drift; run pins the gate as inert. If a clip-side fix
// lands, flip walk/run to the healthy bounds (ratio > 0.5, drift < 0.02).
// Run with DEBUG_GAIT=1 to print the metrics.

import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import {
  AnimationClip,
  AnimationMixer,
  type KeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClipMachine } from '../../../src/core/motion/clipStateMachine'
import { createFootIK, type FootIkLeg } from '../../../src/core/motion/footIK'
import { createLocomotion, RUN_SPEED, WALK_SPEED } from '../../../src/core/motion/locomotion'
import { buildSkeleton, CANONICAL_BONES } from '../../../src/core/skeleton/canonical'

const GLB_PATH = fileURLToPath(new URL('../../../src/assets/clips/clips-core-v1.glb', import.meta.url))
const DT = 1 / 60
const TOTAL_TICKS = 600 // 10 s
const WARMUP_TICKS = 120 // 2 s

const REF_HIPS = (() => {
  const hips = CANONICAL_BONES.find((b) => b.name === 'hips')
  if (!hips) throw new Error('canonical skeleton has no hips bone')
  return hips.position
})()

/** Convert the real GLB's animations to THREE.AnimationClip via gltf-transform's raw sampler data. */
async function loadRealClips(): Promise<AnimationClip[]> {
  const doc = await new NodeIO().read(GLB_PATH)
  const clips: AnimationClip[] = []
  for (const anim of doc.getRoot().listAnimations()) {
    const tracks: KeyframeTrack[] = []
    for (const channel of anim.listChannels()) {
      const bone = channel.getTargetNode()?.getName()
      const path = channel.getTargetPath()
      const sampler = channel.getSampler()
      const input = sampler?.getInput()?.getArray()
      const output = sampler?.getOutput()?.getArray()
      if (!bone || !input || !output) continue
      const times = Array.from(input as Float32Array)
      const values = Array.from(output as Float32Array)
      if (path === 'rotation') {
        tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
      } else if (path === 'translation') {
        tracks.push(new VectorKeyframeTrack(`${bone}.position`, times, values))
      }
      // scale tracks: none present (clips.test.ts enforces this); skip if any slip through.
    }
    let duration = 0
    for (const t of tracks) duration = Math.max(duration, t.times[t.times.length - 1])
    clips.push(new AnimationClip(anim.getName(), duration, tracks))
  }
  return clips
}

interface GaitSample {
  footL: Vector3
  footR: Vector3
  stanceL: boolean
  stanceR: boolean
}

interface GaitMetrics {
  stanceEngagementRatio: number
  plantedFootDriftMax: number
  minWorldFootSpeedP10: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))
  return sorted[idx]
}

/** Run the real stack for `ticks` frames at commanded ground speed `targetSpeed`, sampling every tick. */
function runGait(clips: AnimationClip[], targetSpeed: number): GaitSample[] {
  const built = buildSkeleton()
  const root = built.bones[0]
  const hipsRest: readonly [number, number, number] = [REF_HIPS[0], REF_HIPS[1], REF_HIPS[2]]

  const mixer = new AnimationMixer(root)
  const machine = createClipMachine(mixer, clips, { hipsRebase: { from: hipsRest, to: hipsRest } })
  const locomotion = createLocomotion(root, { radius: 1.2 })
  const poleDir = new Vector3(0, 0, 1)

  const legs: FootIkLeg[] = (['L', 'R'] as const).flatMap((side) => {
    const upper = built.boneByName.get(`upperLeg${side}`)
    const lower = built.boneByName.get(`lowerLeg${side}`)
    const foot = built.boneByName.get(`foot${side}`)
    return upper && lower && foot ? [{ upper, lower, foot }] : []
  })
  if (legs.length !== 2) throw new Error('gaitSoak: expected exactly two legs (L, R)')
  const footIK = createFootIK(legs, { groundY: 0, poleDir })

  locomotion.setTargetSpeed(targetSpeed)

  const scratchQ = new Quaternion()
  const samples: GaitSample[] = []

  for (let i = 0; i < TOTAL_TICKS; i++) {
    locomotion.update(DT)
    machine.setState(locomotion.getGaitState())
    machine.setLocomotionTimeScale(locomotion.getGaitTimeScale())
    machine.update(DT)
    root.updateWorldMatrix(true, true)

    root.getWorldQuaternion(scratchQ)
    poleDir.set(0, 0, 1).applyQuaternion(scratchQ)
    footIK.update(DT)

    legs[0].foot.updateWorldMatrix(true, false)
    legs[1].foot.updateWorldMatrix(true, false)
    const footL = new Vector3().setFromMatrixPosition(legs[0].foot.matrixWorld)
    const footR = new Vector3().setFromMatrixPosition(legs[1].foot.matrixWorld)
    const debugL = footIK.getLegDebug(0)
    const debugR = footIK.getLegDebug(1)
    samples.push({ footL, footR, stanceL: debugL.stance, stanceR: debugR.stance })
  }

  return samples
}

function computeMetrics(samples: GaitSample[]): GaitMetrics {
  const post = samples.slice(WARMUP_TICKS)

  let stanceTicks = 0
  for (const s of post) if (s.stanceL || s.stanceR) stanceTicks++
  const stanceEngagementRatio = stanceTicks / post.length

  // Contiguous stance windows >= 5 ticks per foot; max XZ drift from window start.
  let plantedFootDriftMax = 0
  for (const key of ['stanceL', 'stanceR'] as const) {
    const footKey = key === 'stanceL' ? 'footL' : 'footR'
    let windowStart = -1
    for (let i = 0; i <= post.length; i++) {
      const inStance = i < post.length && post[i][key]
      if (inStance && windowStart === -1) windowStart = i
      if (!inStance && windowStart !== -1) {
        const windowEnd = i // exclusive
        if (windowEnd - windowStart >= 5) {
          const origin = post[windowStart][footKey]
          for (let j = windowStart; j < windowEnd; j++) {
            const p = post[j][footKey]
            const dx = p.x - origin.x
            const dz = p.z - origin.z
            const drift = Math.sqrt(dx * dx + dz * dz)
            if (drift > plantedFootDriftMax) plantedFootDriftMax = drift
          }
        }
        windowStart = -1
      }
    }
  }

  // Per-tick world foot speed of the slower foot (min of L/R), 10th percentile.
  const minSpeeds: number[] = []
  for (let i = 1; i < post.length; i++) {
    const speedL = post[i].footL.distanceTo(post[i - 1].footL) / DT
    const speedR = post[i].footR.distanceTo(post[i - 1].footR) / DT
    minSpeeds.push(Math.min(speedL, speedR))
  }
  minSpeeds.sort((a, b) => a - b)
  const minWorldFootSpeedP10 = percentile(minSpeeds, 0.1)

  return { stanceEngagementRatio, plantedFootDriftMax, minWorldFootSpeedP10 }
}

describe('gait soak: foot-IK stance engagement during real gait (plan 004)', () => {
  let clips: AnimationClip[]

  beforeAll(async () => {
    clips = await loadRealClips()

    // SANITY GATE: conversion must actually produce moving bones, or every
    // measurement below would be vacuously "healthy" for the wrong reason.
    const built = buildSkeleton()
    const root = built.bones[0]
    const mixer = new AnimationMixer(root)
    const action = mixer.clipAction(clips.find((c) => c.name === 'walk')!)
    action.play()
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const hips = built.boneByName.get('hips')!
    for (let i = 0; i < 30; i++) {
      mixer.update(1 / 60)
      hips.updateWorldMatrix(true, false)
      const y = hips.matrixWorld.elements[13]
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    expect(maxY - minY, 'clip conversion sanity gate: hips Y did not move — conversion is broken').toBeGreaterThan(
      0.001,
    )
  })

  it('idle (0 m/s): both feet planted, zero drift', () => {
    const samples = runGait(clips, 0)
    const metrics = computeMetrics(samples)
    if (process.env.DEBUG_GAIT) console.info('idle metrics', metrics)

    expect(metrics.stanceEngagementRatio, `idle stanceEngagementRatio=${metrics.stanceEngagementRatio}`).toBe(1)
    expect(metrics.plantedFootDriftMax, `idle plantedFootDriftMax=${metrics.plantedFootDriftMax}`).toBeLessThanOrEqual(
      0.001,
    )
  })

  it('walk (0.9 m/s): stance gate engages PARTIALLY (measured 0.246); pinned drift stays tiny', () => {
    const samples = runGait(clips, WALK_SPEED)
    const metrics = computeMetrics(samples)
    if (process.env.DEBUG_GAIT) console.info('walk metrics', metrics)

    // MEASURED BASELINE (see header): the average-speed calibration gets the
    // gate under 0.4 m/s only near mid-stance, so engagement is partial —
    // 0.246 measured; pinned with slack. A regression to ~0 (gate inert) or
    // a jump past 0.5 (calibration became instantaneous / gate widened)
    // should both trip this pin and force a re-characterization.
    expect(
      metrics.stanceEngagementRatio,
      `walk stanceEngagementRatio=${metrics.stanceEngagementRatio}`,
    ).toBeGreaterThan(0.15)
    expect(
      metrics.stanceEngagementRatio,
      `walk stanceEngagementRatio=${metrics.stanceEngagementRatio}`,
    ).toBeLessThan(0.5)
    // While the gate IS engaged, the pin works: 4.5 mm measured drift.
    expect(metrics.plantedFootDriftMax, `walk plantedFootDriftMax=${metrics.plantedFootDriftMax}`).toBeLessThan(0.02)
    // The slower foot's world speed does approach zero-ish at mid-stance
    // (0.139 m/s measured) — the audit's "always ≥ 0.9 m/s" reading is wrong.
    expect(
      metrics.minWorldFootSpeedP10,
      `walk minWorldFootSpeedP10=${metrics.minWorldFootSpeedP10}`,
    ).toBeLessThan(0.4)
  })

  it('run (2.2 m/s): stance gate NEVER engages (measured 0 — known defect, clip-side)', () => {
    const samples = runGait(clips, RUN_SPEED)
    const metrics = computeMetrics(samples)
    if (process.env.DEBUG_GAIT) console.info('run metrics', metrics)

    // MEASURED BASELINE (see header): the run clip's stance foot never gets
    // below ~0.86 m/s in world space (0.922 measured at p10), so the 0.4 m/s
    // gate is inert at run speed. Pinned as-is; a clip-side fix should flip
    // these to ratio > 0.5 / drift < 0.02.
    expect(metrics.stanceEngagementRatio, `run stanceEngagementRatio=${metrics.stanceEngagementRatio}`).toBe(0)
    expect(
      metrics.minWorldFootSpeedP10,
      `run minWorldFootSpeedP10=${metrics.minWorldFootSpeedP10}`,
    ).toBeGreaterThan(0.4)
  })
})
