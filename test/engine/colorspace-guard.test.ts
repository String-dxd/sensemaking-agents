// Color-space API guard (KTD-4 / R14). Runtime three is r149: the r152+
// color-management names typecheck against @types/three@0.184 but SILENTLY
// NO-OP at runtime. This permanent regression net scans every engine source
// for them and fails with a pointer to the KTD. r149 code must use
// `texture.encoding = THREE.sRGBEncoding`, `renderer.outputEncoding`, and the
// `encodings_fragment` shader chunk instead.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configureColorPipeline } from '~/engine/student-space/Game/View/Renderer.js'

const ENGINE_ROOT = join(__dirname, '../../src/engine/student-space')

/** r152+ color-management API names that no-op on runtime three@0.149. */
const FORBIDDEN =
  /\b(outputColorSpace|SRGBColorSpace|LinearSRGBColorSpace|NoColorSpace|colorSpace|colorspace_fragment|ColorManagement)\b/

/** Scan source text for forbidden r152+ names; returns offending lines. */
function findForbiddenColorApis(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (FORBIDDEN.test(line)) hits.push({ line: i + 1, text: line.trim() })
  }
  return hits
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|ts|tsx|glsl|vert|frag)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

describe('color-space guard — no r152+ APIs in engine code (runtime three is r149)', () => {
  it('no engine source uses the r152+ color-management API', () => {
    const offenders: string[] = []
    for (const file of walk(ENGINE_ROOT)) {
      for (const hit of findForbiddenColorApis(readFileSync(file, 'utf8'))) {
        offenders.push(`${file.slice(ENGINE_ROOT.length + 1)}:${hit.line} → ${hit.text}`)
      }
    }
    expect(
      offenders,
      `r152+ color APIs silently no-op on runtime three@0.149 (KTD-4 in the island ` +
        `world-port plan). Use texture.encoding = THREE.sRGBEncoding / ` +
        `renderer.outputEncoding / the encodings_fragment chunk instead.\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the scanner flags r152 forms and passes r149 forms', () => {
    expect(findForbiddenColorApis('tex.colorSpace = THREE.SRGBColorSpace')).toHaveLength(1)
    expect(findForbiddenColorApis('renderer.outputColorSpace = "srgb"')).toHaveLength(1)
    expect(findForbiddenColorApis('#include <colorspace_fragment>')).toHaveLength(1)
    expect(findForbiddenColorApis('tex.encoding = THREE.sRGBEncoding')).toHaveLength(0)
    expect(findForbiddenColorApis('renderer.outputEncoding = THREE.sRGBEncoding')).toHaveLength(0)
    expect(findForbiddenColorApis('#include <encodings_fragment>')).toHaveLength(0)
  })

  it('configureColorPipeline sets sRGB output + ACES filmic at exposure 1.1', () => {
    const stub = { outputEncoding: 0, toneMapping: 0, toneMappingExposure: 0 }
    configureColorPipeline(stub)
    expect(stub.outputEncoding).toBe(3001) // THREE.sRGBEncoding (r149 constant)
    expect(stub.toneMapping).toBe(4) // THREE.ACESFilmicToneMapping
    expect(stub.toneMappingExposure).toBe(1.1)
  })
})
