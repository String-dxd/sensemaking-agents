import { beforeEach, describe, expect, it, vi } from 'vitest'

import ShareTokenBridge from '~/engine/student-space/Game/State/ShareTokenBridge.js'

function makeFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let i = 0
  return vi.fn(async () => {
    const next = responses[i++]
    if (!next) throw new Error('fetch sequence exhausted')
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 400),
      async json() {
        return next.body
      },
    } as unknown as Response
  })
}

describe('ShareTokenBridge state machine', () => {
  beforeEach(() => {
    ;(ShareTokenBridge as unknown as { instance: unknown }).instance = null
  })

  it('starts in idle state with no token', () => {
    const bridge = new ShareTokenBridge()
    expect(bridge.status).toBe('idle')
    expect(bridge.token).toBeNull()
    expect(bridge.url).toBeNull()
  })

  it('transitions idle → creating → ready on successful create', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: true,
        body: {
          ok: true,
          token: 'AAAA1111BBBB2222CCCC33',
          url: 'http://localhost/share/AAAA1111BBBB2222CCCC33',
        },
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    const transitions: string[] = []
    bridge.subscribe((b: ShareTokenBridge) => transitions.push(b.status))

    await bridge.ensureToken()

    expect(transitions).toContain('creating')
    expect(bridge.status).toBe('ready')
    expect(bridge.token).toBe('AAAA1111BBBB2222CCCC33')
    expect(bridge.url).toBe('http://localhost/share/AAAA1111BBBB2222CCCC33')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('routes 403 share_demo_unsupported to error state with the auth-error code', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: false,
        status: 403,
        body: {
          ok: false,
          error: { code: 'share_demo_unsupported', message: 'Sign in to share.' },
        },
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    await bridge.createToken()

    expect(bridge.status).toBe('error')
    expect(bridge.errorCode).toBe('share_demo_unsupported')
    expect(bridge.token).toBeNull()
  })

  it('revoke clears the in-memory token and returns to idle', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: true,
        body: { ok: true, token: 'AAAA1111BBBB2222CCCC33', url: '/share/AAAA1111BBBB2222CCCC33' },
      },
      { ok: true, body: { ok: true } },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    await bridge.ensureToken()
    expect(bridge.status).toBe('ready')

    await bridge.revokeToken()

    expect(bridge.status).toBe('idle')
    expect(bridge.token).toBeNull()
    expect(bridge.url).toBeNull()
  })

  it('setShowQuotes applies optimistically then trusts server echo', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: true,
        body: { ok: true, token: 'AAAA1111BBBB2222CCCC33', url: '/share/AAAA1111BBBB2222CCCC33' },
      },
      { ok: true, body: { ok: true, show_quotes: true } },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    await bridge.ensureToken()
    expect(bridge.showQuotes).toBe(false)

    const seen: boolean[] = []
    bridge.subscribe((b: ShareTokenBridge) => seen.push(b.showQuotes))
    await bridge.setShowQuotes(true)

    expect(seen[0]).toBe(true) // optimistic
    expect(bridge.showQuotes).toBe(true) // server echo confirms
  })

  it('setShowQuotes snaps back when server returns 4xx', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: true,
        body: { ok: true, token: 'AAAA1111BBBB2222CCCC33', url: '/share/AAAA1111BBBB2222CCCC33' },
      },
      {
        ok: false,
        status: 400,
        body: { ok: false, error: { code: 'redactions_failed', message: 'no' } },
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    await bridge.ensureToken()
    await bridge.setShowQuotes(true)

    expect(bridge.showQuotes).toBe(false)
    expect(bridge.status).toBe('error')
    expect(bridge.errorCode).toBe('redactions_failed')
  })

  it('retry after a redaction failure retries the toggle instead of revoking the link', async () => {
    const fetchMock = makeFetchSequence([
      {
        ok: true,
        body: { ok: true, token: 'AAAA1111BBBB2222CCCC33', url: '/share/AAAA1111BBBB2222CCCC33' },
      },
      {
        ok: false,
        status: 400,
        body: { ok: false, error: { code: 'redactions_failed', message: 'no' } },
      },
      { ok: true, body: { ok: true, show_quotes: true } },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const bridge = new ShareTokenBridge()
    await bridge.ensureToken()
    await bridge.setShowQuotes(true)

    expect(bridge.status).toBe('error')
    expect(bridge.token).toBe('AAAA1111BBBB2222CCCC33')

    await bridge.retry()

    expect(bridge.status).toBe('ready')
    expect(bridge.token).toBe('AAAA1111BBBB2222CCCC33')
    expect(bridge.showQuotes).toBe(true)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/share/redactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'AAAA1111BBBB2222CCCC33', show_quotes: true }),
      }),
    )
  })

  it('network error surfaces as error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused')
      }),
    )

    const bridge = new ShareTokenBridge()
    await bridge.createToken()

    expect(bridge.status).toBe('error')
    expect(bridge.errorCode).toBe('network_error')
  })
})
