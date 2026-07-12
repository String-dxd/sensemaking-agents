import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SAVE_FILE, handleIslandRoute, islandSavePlugin } from '../server/islandSavePlugin'
import { serializeSpec } from '../src/editor/specIO'
import { seedIsland } from '../src/terrain/seed'

// Minimal fakes: an EventEmitter req (method/url + data/end events) and a res
// capturing statusCode/headers/end payload — the shapes handleIslandRoute needs.
function fakeReq(method: string, url: string) {
  const req = new EventEmitter() as EventEmitter & { method: string; url: string }
  req.method = method
  req.url = url
  return req
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    end(body?: string) {
      this.ended = true
      this.body = body
    },
  }
}

/** Drive a POST through the handler synchronously (fs writes are sync). */
function post(root: string, url: string, body: string) {
  const req = fakeReq('POST', url)
  const res = fakeRes()
  let nextCalled = false
  handleIslandRoute(req, res, () => {
    nextCalled = true
  }, root)
  req.emit('data', Buffer.from(body))
  req.emit('end')
  return { res, nextCalled }
}

function get(root: string, url: string) {
  const req = fakeReq('GET', url)
  const res = fakeRes()
  let nextCalled = false
  handleIslandRoute(req, res, () => {
    nextCalled = true
  }, root)
  return { res, nextCalled }
}

describe('islandSavePlugin route handler', () => {
  const root = mkdtempSync(join(tmpdir(), 'island-save-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('404s a load before any save', () => {
    const { res, nextCalled } = get(root, '/api/island/load')
    expect(res.statusCode).toBe(404)
    expect(res.ended).toBe(true)
    expect(nextCalled).toBe(false)
  })

  it('round-trips: POST body lands byte-identical in saves/island.json, GET returns it', () => {
    const json = serializeSpec(seedIsland())
    const saved = post(root, '/api/island/save', json)
    expect(saved.res.statusCode).toBe(204)
    expect(saved.nextCalled).toBe(false)
    expect(readFileSync(join(root, SAVE_FILE), 'utf8')).toBe(json)

    const loaded = get(root, '/api/island/load')
    expect(loaded.res.statusCode).toBe(200)
    expect(loaded.res.headers['Content-Type']).toBe('application/json')
    expect(loaded.res.body).toBe(json)
  })

  it('400s invalid JSON and non-spec JSON without touching the file', () => {
    const before = readFileSync(join(root, SAVE_FILE), 'utf8')
    const bad = post(root, '/api/island/save', '{not json')
    expect(bad.res.statusCode).toBe(400)
    const shapeless = post(root, '/api/island/save', '{"hello":"world"}')
    expect(shapeless.res.statusCode).toBe(400)
    expect(readFileSync(join(root, SAVE_FILE), 'utf8')).toBe(before)
  })

  it('413s a body beyond the 2 MB cap', () => {
    const { res } = post(root, '/api/island/save', `{"version":5,"pad":"${'x'.repeat(2 * 1024 * 1024)}"}`)
    expect(res.statusCode).toBe(413)
  })

  it('passes non-API URLs through to next()', () => {
    const { nextCalled, res } = get(root, '/index.html')
    expect(nextCalled).toBe(true)
    expect(res.ended).toBe(false)
  })

  it('exposes a named vite plugin with a configureServer hook', () => {
    const plugin = islandSavePlugin(root)
    expect(plugin.name).toBe('island-save')
    expect(typeof plugin.configureServer).toBe('function')
  })
})
