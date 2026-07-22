// U9 regression net: the old bird is gone — no source file imports Kira.js or
// references the MaskedBower asset, and the asset itself is not shipped.
// (Kira.d.ts survives deliberately as the `view.kira` contract's type surface,
// re-exporting from Character.js/characterAsset.ts.)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(__dirname, '../../src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('old bird removal (U9)', () => {
  it('no source imports Kira.js or loadMaskedScene, and none references MaskedBower', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      if (file.endsWith('Kira.d.ts')) continue // the surviving type surface
      const src = readFileSync(file, 'utf8')
      if (/from\s+['"][^'"]*\/Kira\.js['"]/.test(src)) offenders.push(`${file}: imports Kira.js`)
      if (/loadMaskedScene|MaskedBower\.glb/.test(src))
        offenders.push(`${file}: old bird reference`)
    }
    expect(offenders).toEqual([])
  })

  it('the 11 MB bird asset and the retired tree/DRACO assets are not shipped', () => {
    const publicRoot = join(__dirname, '../../public')
    expect(existsSync(join(publicRoot, 'birds/MaskedBower.glb'))).toBe(false)
    expect(existsSync(join(publicRoot, 'trees'))).toBe(false)
    expect(existsSync(join(publicRoot, 'draco'))).toBe(false)
    // The editor GLB lane is what ships instead.
    expect(existsSync(join(publicRoot, 'models/character.glb'))).toBe(true)
    expect(existsSync(join(publicRoot, 'models/tree.glb'))).toBe(true)
  })

  it('Kira.js itself is deleted (Character.js owns the view slot)', () => {
    const viewDir = join(SRC_ROOT, 'engine/student-space/Game/View')
    expect(existsSync(join(viewDir, 'Kira.js'))).toBe(false)
    expect(existsSync(join(viewDir, 'Character.js'))).toBe(true)
  })
})
