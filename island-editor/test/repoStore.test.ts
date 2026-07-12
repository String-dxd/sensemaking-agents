import { describe, expect, it } from 'vitest'
import { loadSpecFromRepo, saveSpecToRepo } from '../src/editor/repoStore'
import { serializeSpec } from '../src/editor/specIO'
import { seedIsland } from '../src/terrain/seed'
import { CURRENT_SPEC_VERSION } from '../src/terrain/terrainGrid'

/** Response-shaped stub — repoStore only touches ok/status/text(). */
function stubResponse(status: number, body = '') {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

function stubFetch(status: number, body = '') {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit | undefined })
    return stubResponse(status, body)
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('saveSpecToRepo', () => {
  it('POSTs the serialized spec to /api/island/save and resolves on 204', async () => {
    const spec = seedIsland()
    const { impl, calls } = stubFetch(204)
    await expect(saveSpecToRepo(spec, impl)).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/island/save')
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[0].init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(calls[0].init?.body).toBe(serializeSpec(spec))
  })

  it('throws with the response text on a non-2xx status', async () => {
    const { impl } = stubFetch(500, 'disk on fire')
    await expect(saveSpecToRepo(seedIsland(), impl)).rejects.toThrow(/500.*disk on fire/)
  })
})

describe('loadSpecFromRepo', () => {
  it('GETs /api/island/load and resolves a validated spec', async () => {
    const { impl, calls } = stubFetch(200, serializeSpec(seedIsland()))
    const spec = await loadSpecFromRepo(impl)
    expect(calls[0].url).toBe('/api/island/load')
    expect(spec.version).toBe(CURRENT_SPEC_VERSION)
    expect(spec.worldSize).toBe(seedIsland().worldSize)
    expect(spec.grid.tiers).toEqual(seedIsland().grid.tiers)
  })

  it('throws the friendly message on 404', async () => {
    const { impl } = stubFetch(404)
    await expect(loadSpecFromRepo(impl)).rejects.toThrow('No island saved in the repo yet — press Save first.')
  })

  it('throws on other non-2xx statuses', async () => {
    const { impl } = stubFetch(500, 'boom')
    await expect(loadSpecFromRepo(impl)).rejects.toThrow(/500.*boom/)
  })

  it('throws on a malformed body (validation)', async () => {
    const { impl } = stubFetch(200, '{"version":999}')
    await expect(loadSpecFromRepo(impl)).rejects.toThrow(/version/)
  })
})
