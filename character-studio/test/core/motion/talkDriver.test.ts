// Talk driver (plan 007 step 4): amplitude -> viseme mapping, anti-flicker
// hold, silence hand-off, micro-closes, determinism under seeded RNG.

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../src/core/motion/noise'
import {
  createTalkDriver,
  makeSpeechSynthAmplitude,
  type VisemeCell,
} from '../../../src/core/motion/talkDriver'

const H = 1 / 120 // fine steps so hold-time measurements are tight

function makeMouth() {
  const log: Array<{ t: number; cell: VisemeCell | null }> = []
  let t = 0
  return {
    log,
    tick(dt: number) {
      t += dt
    },
    setMouthOverride(cell: VisemeCell | null) {
      log.push({ t, cell })
    },
  }
}

describe('createTalkDriver', () => {
  it('maps amplitude bands to the viseme cells', () => {
    for (const [amp, cell] of [
      [0.05, 'vMm'],
      [0.2, 'vEe'],
      [0.5, 'vAa'],
      [0.9, 'vOh'],
    ] as const) {
      const mouth = makeMouth()
      const driver = createTalkDriver(mouth, mulberry32(1))
      driver.start(() => amp)
      expect(driver.getCell()).toBe(cell)
    }
  })

  it('enforces the minimum cell hold time (no flicker under a fast square wave)', () => {
    const mouth = makeMouth()
    const driver = createTalkDriver(mouth, mulberry32(7))
    // 25 Hz square wave between silent and loud — way faster than any mouth.
    driver.start((t) => (Math.floor(t * 50) % 2 === 0 ? 0.9 : 0.0))
    for (let i = 0; i < 2 / H; i++) {
      mouth.tick(H)
      driver.update(H)
    }
    const changes = mouth.log
    expect(changes.length).toBeGreaterThan(4) // it does keep flapping...
    for (let i = 1; i < changes.length; i++) {
      const gap = changes[i].t - changes[i - 1].t
      expect(gap).toBeGreaterThanOrEqual(0.06 - H - 1e-9) // ...but never faster than the hold
    }
  })

  it('closes to vMm or neutral within 150 ms of silence', () => {
    const mouth = makeMouth()
    const driver = createTalkDriver(mouth, mulberry32(3))
    driver.start((t) => (t < 0.5 ? 0.8 : 0))
    let sinceSilence = -1
    for (let i = 0; i < 1 / H; i++) {
      mouth.tick(H)
      driver.update(H)
      const t = (i + 1) * H
      if (t >= 0.5) {
        sinceSilence = t - 0.5
        const cell = driver.getCell()
        if (cell === 'vMm' || cell === 'neutral') break
        expect(sinceSilence).toBeLessThan(0.15)
      }
    }
    expect(sinceSilence).toBeGreaterThanOrEqual(0)
    expect(['vMm', 'neutral']).toContain(driver.getCell())
  })

  it('is deterministic under the same seed and amplitude source', () => {
    const run = () => {
      const mouth = makeMouth()
      const driver = createTalkDriver(mouth, mulberry32(42), { onNod: () => mouth.setMouthOverride(null) })
      driver.start(makeSpeechSynthAmplitude(mulberry32(99)))
      for (let i = 0; i < 10 / H; i++) {
        mouth.tick(H)
        driver.update(H)
      }
      return mouth.log
    }
    expect(run()).toEqual(run())
  })

  it('inserts neutral micro-closes at amplitude dips (word boundaries)', () => {
    const mouth = makeMouth()
    const driver = createTalkDriver(mouth, mulberry32(5))
    // Repeated loud "words" separated by dips.
    driver.start((t) => (t % 0.4 < 0.28 ? 0.8 : 0.0))
    for (let i = 0; i < 6 / H; i++) {
      mouth.tick(H)
      driver.update(H)
    }
    expect(mouth.log.some((e) => e.cell === 'neutral')).toBe(true)
  })

  it('stop() hands the mouth back to the expression (null override)', () => {
    const mouth = makeMouth()
    const driver = createTalkDriver(mouth, mulberry32(1))
    driver.start(() => 0.8)
    expect(driver.isTalking()).toBe(true)
    driver.stop()
    expect(driver.isTalking()).toBe(false)
    expect(driver.getCell()).toBe(null)
    expect(mouth.log[mouth.log.length - 1].cell).toBe(null)
    // update after stop is a no-op
    driver.update(H)
    expect(mouth.log[mouth.log.length - 1].cell).toBe(null)
  })
})

describe('makeSpeechSynthAmplitude', () => {
  it('is deterministic, bounded to [0,1], and has speech-like variation', () => {
    const a = makeSpeechSynthAmplitude(mulberry32(11))
    const b = makeSpeechSynthAmplitude(mulberry32(11))
    let loud = 0
    let silent = 0
    for (let i = 0; i < 3000; i++) {
      const t = i * 0.01
      const v = a(t)
      expect(v).toBe(b(t))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      if (v > 0.4) loud++
      if (v < 0.05) silent++
    }
    // Both talking and pausing happen (syllables under a phrase envelope).
    expect(loud).toBeGreaterThan(100)
    expect(silent).toBeGreaterThan(100)
  })
})
