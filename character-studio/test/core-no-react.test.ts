import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Plan 000 §2/§7: `src/core/**` must be pure TS with no React/r3f
// dependency. This is the mechanical enforcement of that boundary for every
// later plan that adds files under `src/core`.

const CORE_DIR = join(__dirname, '..', 'src', 'core')

const FORBIDDEN_PATTERNS = [/from ['"]react['"]/, /from ['"]@react-three/]

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

describe('src/core module boundary', () => {
  it('contains no imports from react or @react-three/*', () => {
    const files = listFilesRecursive(CORE_DIR)
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const contents = readFileSync(file, 'utf-8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(contents)) {
          violations.push(`${file} matches ${pattern}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
