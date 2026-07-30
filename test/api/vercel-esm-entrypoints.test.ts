import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vercel Node ESM entrypoints', () => {
  it('uses explicit extensions for imports preserved in the serverless bundle', () => {
    const entrypoint = readFileSync(join(process.cwd(), 'api/index.ts'), 'utf8')
    const adapter = readFileSync(join(process.cwd(), 'api/request-adapter.ts'), 'utf8')

    expect(entrypoint).toContain("from './request-adapter.js'")
    expect(adapter).toContain("from './request-body-limits.js'")
  })
})
