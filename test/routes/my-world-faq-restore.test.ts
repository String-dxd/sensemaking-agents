// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

const restoreHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/my-world-faq-history.handler.server', () => ({
  handleMyWorldFaqEditorRestore: restoreHandlerMock,
}))

import { handleMyWorldFaqEditorRestorePost } from '~/routes/api/my-world/faq/editor/restore'

function restoreRequest(headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({ 'Content-Type': 'application/json' })
  new Headers(headers).forEach((value, key) => {
    requestHeaders.set(key, value)
  })
  return new Request('https://faq.example.gov.sg/api/my-world/faq/editor/restore', {
    method: 'POST',
    headers: requestHeaders,
    body: '{}',
  })
}

describe('POST /api/my-world/faq/editor/restore', () => {
  afterEach(() => {
    restoreHandlerMock.mockReset()
  })

  it('rejects requests without positive same-origin proof before the handler runs', async () => {
    const response = await handleMyWorldFaqEditorRestorePost({
      request: restoreRequest(),
    })

    expect(response.status).toBe(403)
    expect(restoreHandlerMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'cross_origin',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vary')).toContain('Cookie')
  })

  it('rejects a mismatched origin before the handler runs', async () => {
    const response = await handleMyWorldFaqEditorRestorePost({
      request: restoreRequest({ Origin: 'https://evil.example' }),
    })

    expect(response.status).toBe(403)
    expect(restoreHandlerMock).not.toHaveBeenCalled()
  })

  it('delegates a positively same-origin request', async () => {
    const delegated = Response.json({ ok: true })
    restoreHandlerMock.mockResolvedValue(delegated)
    const request = restoreRequest({ Origin: 'https://faq.example.gov.sg' })

    await expect(handleMyWorldFaqEditorRestorePost({ request })).resolves.toBe(delegated)
    expect(restoreHandlerMock).toHaveBeenCalledWith(request)
  })
})
