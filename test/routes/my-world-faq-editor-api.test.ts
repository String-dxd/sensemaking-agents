// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const assertEnabledMock = vi.hoisted(() => vi.fn())
const unlockMock = vi.hoisted(() => vi.fn())
const revokeMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/my-world-faq-editor-session.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/auth/my-world-faq-editor-session.server')>()
  return {
    ...actual,
    assertMyWorldFaqEditorEnabled: assertEnabledMock,
    unlockMyWorldFaqEditor: unlockMock,
    revokeMyWorldFaqEditorSessionFromRequest: revokeMock,
  }
})

import {
  MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT,
  MyWorldFaqEditorAuthError,
} from '~/auth/my-world-faq-editor-session.server'
import { handleMyWorldFaqEditorLogoutPost } from '~/routes/api/my-world/faq/editor/logout'
import { handleMyWorldFaqEditorSessionPost } from '~/routes/api/my-world/faq/editor/session'

function post(
  pathname: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  assertEnabledMock.mockReset()
  unlockMock.mockReset()
  revokeMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('My World FAQ editor APIs', () => {
  it('rejects cross-origin and headerless unlock before the auth handler', async () => {
    const crossOrigin = post(
      '/api/my-world/faq/editor/session',
      { displayName: 'FAQ Teammate', password: 'secret' },
      { Origin: 'https://evil.example' },
    )
    const headerless = new Request('http://localhost/api/my-world/faq/editor/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    await expect(
      handleMyWorldFaqEditorSessionPost({ request: crossOrigin }),
    ).resolves.toMatchObject({ status: 403 })
    await expect(handleMyWorldFaqEditorSessionPost({ request: headerless })).resolves.toMatchObject(
      { status: 403 },
    )
    expect(unlockMock).not.toHaveBeenCalled()
  })

  it('creates a private session response with the local development cookie', async () => {
    const securityLog = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    unlockMock.mockResolvedValue({
      identity: {
        auditId: 'audit-id',
        displayName: 'FAQ Teammate',
        idleExpiresAt: '2026-07-29T10:30:00.000Z',
        absoluteExpiresAt: '2026-07-29T18:00:00.000Z',
        tokenDigest: 'a'.repeat(64),
      },
      rawToken: 'a'.repeat(43),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    })

    const response = await handleMyWorldFaqEditorSessionPost({
      request: post('/api/my-world/faq/editor/session', {
        displayName: 'FAQ Teammate',
        password: 'secret',
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Cookie')
    expect(response.headers.get('set-cookie')).toContain(MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT)
    expect(await response.json()).toMatchObject({
      ok: true,
      displayName: 'FAQ Teammate',
    })
    const logged = JSON.stringify(securityLog.mock.calls)
    expect(logged).not.toContain('FAQ Teammate')
    expect(logged).not.toContain('secret')
    expect(logged).not.toContain('a'.repeat(43))
  })

  it('fails disabled before password work and keeps credentials generic', async () => {
    assertEnabledMock.mockImplementationOnce(() => {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE')
    })
    const disabled = await handleMyWorldFaqEditorSessionPost({
      request: post('/api/my-world/faq/editor/session', {
        displayName: 'FAQ Teammate',
        password: 'secret',
      }),
    })
    expect(disabled.status).toBe(404)
    expect(unlockMock).not.toHaveBeenCalled()

    unlockMock.mockRejectedValueOnce(new MyWorldFaqEditorAuthError('INVALID_CREDENTIALS'))
    const invalid = await handleMyWorldFaqEditorSessionPost({
      request: post('/api/my-world/faq/editor/session', {
        displayName: 'FAQ Teammate',
        password: 'wrong',
      }),
    })
    expect(invalid.status).toBe(401)
    expect(await invalid.json()).toEqual({
      ok: false,
      error: 'The password or session is not valid.',
    })
  })

  it('rejects the wrong media type with a private response', async () => {
    const request = new Request('http://localhost/api/my-world/faq/editor/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost',
        'Content-Type': 'text/plain',
      },
      body: 'no',
    })
    const response = await handleMyWorldFaqEditorSessionPost({ request })
    expect(response.status).toBe(415)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(unlockMock).not.toHaveBeenCalled()
  })

  it('allows logout while the editor flag is off and always clears the cookie', async () => {
    revokeMock.mockResolvedValue(true)
    const response = await handleMyWorldFaqEditorLogoutPost({
      request: post(
        '/api/my-world/faq/editor/logout',
        {},
        {
          Cookie: `${MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT}=${'a'.repeat(43)}`,
        },
      ),
    })

    expect(response.status).toBe(204)
    expect(assertEnabledMock).not.toHaveBeenCalled()
    expect(revokeMock).toHaveBeenCalledTimes(1)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
