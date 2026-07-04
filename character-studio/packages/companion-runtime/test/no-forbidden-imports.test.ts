import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The runtime MUST run in the vanilla-JS product engine: no react/drei/r3f, no
// studio imports, and no bare `three` (three is injected, peer-only). This gate
// scans every src module's import specifiers.

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return tsFiles(full)
    return name.endsWith('.ts') ? [full] : []
  })
}

const FORBIDDEN = [
  { re: /from ['"]react['"]/, why: 'react' },
  { re: /from ['"]react-dom/, why: 'react-dom' },
  { re: /from ['"]@react-three\//, why: 'r3f / drei' },
  { re: /from ['"]three['"]/, why: 'bare three (must be injected, not imported)' },
  { re: /from ['"]three\//, why: 'three subpath (must be injected)' },
  { re: /from ['"][.][.]\/[.][.]\/[.][.]\/src\//, why: 'studio src (../../../src) — duplicate instead' },
  { re: /from ['"][.][.]\/[.][.]\/[.][.]\/[.][.]\//, why: 'reaching outside the package' },
]

describe('companion-runtime has no forbidden imports', () => {
  const files = tsFiles(SRC).filter((f) => !f.endsWith('.d.ts'))

  it('scans a non-trivial set of source files', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  // Strip // line-comments and /* */ block-comments so doc examples (which
  // legitimately show `import … from 'three'`) don't trip the gate.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  for (const file of tsFiles(SRC).filter((f) => !f.endsWith('.d.ts'))) {
    it(`${file.split('/src/')[1]} imports only zod + local modules`, () => {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const { re, why } of FORBIDDEN) {
        expect(re.test(src), `${file} must not import ${why}`).toBe(false)
      }
    })
  }
})
