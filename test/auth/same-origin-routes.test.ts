// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSameOriginRequest } from '~/auth/same-origin'
import { runConnectorCronHandler } from '~/server/run-connector.handler.server'

const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url))
const REQUEST_URL = 'https://app.example/api/x'

function post(headers: Record<string, string> = {}): Request {
  return new Request(REQUEST_URL, { method: 'POST', headers })
}

describe('isSameOriginRequest — positive-proof truth table', () => {
  const cases: Array<[string, Record<string, string>, boolean]> = [
    ['matching Origin', { Origin: 'https://app.example' }, true],
    ['mismatched Origin', { Origin: 'https://evil.example' }, false],
    ['no Origin, Sec-Fetch-Site: same-origin', { 'Sec-Fetch-Site': 'same-origin' }, true],
    ['no Origin, Sec-Fetch-Site: cross-site', { 'Sec-Fetch-Site': 'cross-site' }, false],
    // The regression this suite exists for: a curl-style request that proves
    // nothing must be refused, not waved through.
    ['neither Origin nor Sec-Fetch-Site', {}, false],
  ]

  for (const [label, headers, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      expect(isSameOriginRequest(post(headers))).toBe(expected)
    })
  }

  it('prefers Origin over Sec-Fetch-Site when both are present', () => {
    const request = post({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' })
    expect(isSameOriginRequest(request)).toBe(false)
  })
})

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('same-origin primitive stays single-sourced', () => {
  it('is defined exactly once, in src/auth/same-origin.ts', () => {
    // A second definition means someone re-forked the security primitive —
    // import ~/auth/same-origin instead. The forked copies this test replaced
    // were the *old* permissive logic and silently reopened a curl bypass.
    const definers = sourceFiles(SRC_DIR)
      .filter((file) => readFileSync(file, 'utf8').includes('function isSameOriginRequest'))
      .map((file) => file.slice(SRC_DIR.length + 1).replaceAll('\\', '/'))

    expect(definers).toEqual(['auth/same-origin.ts'])
  })

  const GATED_ROUTES = [
    'routes/api/share/create.tsx',
    'routes/api/share/revoke.tsx',
    'routes/api/share/redactions.tsx',
    'routes/api/island/snapshot.tsx',
    'routes/api/openai/realtime-mirror.tsx',
    'routes/api/my-world/faq/editor/session.tsx',
    'routes/api/my-world/faq/editor/logout.tsx',
    'routes/api/my-world/faq/editor/publish.tsx',
    'routes/api/my-world/faq/editor/restore.tsx',
  ]

  for (const route of GATED_ROUTES) {
    it(`${route} imports the hardened gate`, () => {
      const source = readFileSync(join(SRC_DIR, route), 'utf8')
      expect(source).toContain("from '~/auth/same-origin'")
    })
  }
})

describe('cron bearer secret comparison', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function cronRequest(headers: Record<string, string> = {}): Request {
    return new Request('https://app.test/api/cron/run-connector', { headers })
  }

  it('rejects a wrong secret of the same length', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    const response = await runConnectorCronHandler(cronRequest({ Authorization: 'Bearer secrez' }))

    expect(response.status).toBe(401)
    expect((await response.json()).status).toBe('auth_error')
  })

  it('rejects a length-mismatched header without throwing', async () => {
    // timingSafeEqual throws on unequal-length buffers; hashing both sides
    // first is what keeps this a 401 instead of a 500.
    vi.stubEnv('CRON_SECRET', 'secret')
    const response = await runConnectorCronHandler(cronRequest({ Authorization: 'x' }))

    expect(response.status).toBe(401)
    expect((await response.json()).status).toBe('auth_error')
  })

  it('stays fail-closed when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await runConnectorCronHandler(cronRequest({ Authorization: 'Bearer secret' }))

    expect(response.status).toBe(401)
    expect((await response.json()).status).toBe('auth_error')
  })

  it('still accepts the correct bearer secret', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    const response = await runConnectorCronHandler(
      cronRequest({ Authorization: 'Bearer secret' }),
      { listAttachedStudentIds: async () => [] },
    )

    expect(response.status).toBe(200)
  })
})
