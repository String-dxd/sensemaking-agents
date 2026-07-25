import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVER_DIR = join(process.cwd(), 'src/server')

/**
 * Wrappers that are genuinely server-only and are therefore exempt from the
 * client-bundle boundary.
 *
 * ADDING AN ENTRY HERE IS A SECURITY DECISION, NOT A TEST FIX. A
 * `*.functions.ts` file exists to be called from the browser; if one of them
 * needs a server-only static import, the correct fix is almost always to move
 * that import behind the `await import('./x.handler.server')` boundary the
 * other 24 wrappers use (see submit-student-space-reflection.functions.ts).
 * Only exempt a file after confirming no client code imports it, and say so in
 * the comment next to the entry.
 */
const serverOnlyExemptions: readonly string[] = [
  // (empty at time of writing — every *.functions.ts wrapper is client-facing)
]

const forbiddenImports = [
  /\.handler\.server['"]/,
  /['"]~\/db\/client['"]/,
  /['"]openai['"]/,
  /['"]@anthropic-ai\/sdk['"]/,
  /['"]@workos\/authkit-tanstack-react-start['"]/,
  /['"]@tanstack\/react-start\/server['"]/,
]

const clientFacingServerFunctionFiles = readdirSync(SERVER_DIR)
  .filter((name) => name.endsWith('.functions.ts'))
  .filter((name) => !serverOnlyExemptions.includes(name))
  .sort()

describe('client-facing server function import boundary', () => {
  it('discovers the server-function wrappers (guards against path rot)', () => {
    // A zero-length list would make the boundary assertion below vacuously
    // pass — e.g. after a directory rename or a change in naming convention.
    expect(clientFacingServerFunctionFiles.length).toBeGreaterThan(0)
  })

  it('exempts nothing that no longer exists (guards against stale exemptions)', () => {
    const present = new Set(
      readdirSync(SERVER_DIR).filter((name) => name.endsWith('.functions.ts')),
    )
    for (const exempt of serverOnlyExemptions) {
      expect(present.has(exempt), `stale exemption: ${exempt} no longer exists`).toBe(true)
    }
  })

  it('keeps wrappers free of server-only static imports', () => {
    for (const file of clientFacingServerFunctionFiles) {
      const source = readFileSync(join(SERVER_DIR, file), 'utf8')
      for (const forbidden of forbiddenImports) {
        const hasForbiddenStaticImport = source
          .split('\n')
          .some((line) => line.startsWith('import ') && forbidden.test(line))
        expect(hasForbiddenStaticImport, `${file} must not statically import ${forbidden}`).toBe(
          false,
        )
      }
    }
  })
})
