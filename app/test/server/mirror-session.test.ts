import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintMirrorSessionHandler } from '~/server/mirror-session.handler.server'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.OPENAI_API_KEY

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test-fixture'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY
  } else {
    process.env.OPENAI_API_KEY = originalApiKey
  }
  vi.restoreAllMocks()
})

function makeFetchSpy(response: Response): ReturnType<typeof vi.fn> {
  const spy = vi.fn(() => Promise.resolve(response))
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

const NOW_UNIX = Math.floor(new Date('2026-05-08T20:30:00Z').getTime() / 1000)

// GA Realtime API response shape: top-level `value` + `expires_at`,
// session id nested under `session`. The legacy beta `client_secret`
// envelope is no longer returned.
const happyPayload = {
  value: 'ek_xyz',
  expires_at: NOW_UNIX + 60,
  session: { id: 'sess_abc', model: 'gpt-realtime-2' },
}

describe('mintMirrorSession server fn (GA Realtime API)', () => {
  it('mints an ephemeral client_secret and returns it to the browser', async () => {
    const spy = makeFetchSpy(new Response(JSON.stringify(happyPayload), { status: 200 }))

    const result = await mintMirrorSessionHandler({ studentId: 'demo' })

    expect(result).toEqual({
      ephemeralKey: 'ek_xyz',
      sessionId: 'sess_abc',
      expiresAt: new Date((NOW_UNIX + 60) * 1000).toISOString(),
      model: 'gpt-realtime-2',
      voice: 'alloy',
    })
    expect(spy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/client_secrets',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = spy.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as { session?: { model?: string; audio?: unknown } }
    expect(body.session?.model).toBe('gpt-realtime-2')
    expect(body.session?.audio).toBeDefined()
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test-fixture')
    // No `OpenAI-Beta` header on the GA endpoint.
    expect(headers['OpenAI-Beta']).toBeUndefined()
  })

  it('rejects an empty studentId at the Zod boundary before calling OpenAI', async () => {
    const spy = makeFetchSpy(new Response('', { status: 200 }))
    await expect(mintMirrorSessionHandler({ studentId: '' })).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })

  it('surfaces a typed error on OpenAI 401 without leaking the API key', async () => {
    makeFetchSpy(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }))
    await expect(mintMirrorSessionHandler({ studentId: 'demo' })).rejects.toThrowError(/401/)
  })

  it('rejects a malformed OpenAI response (missing value or session.id)', async () => {
    makeFetchSpy(
      new Response(JSON.stringify({ expires_at: NOW_UNIX + 60, session: {} }), { status: 200 }),
    )
    await expect(mintMirrorSessionHandler({ studentId: 'demo' })).rejects.toThrowError(/missing/)
  })

  it('rejects when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const spy = makeFetchSpy(new Response('', { status: 200 }))
    await expect(mintMirrorSessionHandler({ studentId: 'demo' })).rejects.toThrowError(
      /OPENAI_API_KEY/,
    )
    expect(spy).not.toHaveBeenCalled()
  })
})
