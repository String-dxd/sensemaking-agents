// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

const publishHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/my-world-faq-editor.handler.server', () => ({
  handleMyWorldFaqEditorPublish: publishHandlerMock,
}))

import { handleMyWorldFaqEditorPublishPost } from '~/routes/api/my-world/faq/editor/publish'

function publishRequest(headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({ 'Content-Type': 'application/json' })
  new Headers(headers).forEach((value, key) => {
    requestHeaders.set(key, value)
  })
  return new Request('https://faq.example.gov.sg/api/my-world/faq/editor/publish', {
    method: 'POST',
    headers: requestHeaders,
    body: '{}',
  })
}

describe('POST /api/my-world/faq/editor/publish', () => {
  afterEach(() => {
    publishHandlerMock.mockReset()
  })

  it('rejects requests without positive same-origin proof before the handler runs', async () => {
    const response = await handleMyWorldFaqEditorPublishPost({
      request: publishRequest(),
    })

    expect(response.status).toBe(403)
    expect(publishHandlerMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'cross_origin',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vary')).toContain('Cookie')
  })

  it('delegates a positively same-origin request', async () => {
    const delegated = Response.json({ ok: true })
    publishHandlerMock.mockResolvedValue(delegated)
    const request = publishRequest({ Origin: 'https://faq.example.gov.sg' })

    await expect(handleMyWorldFaqEditorPublishPost({ request })).resolves.toBe(delegated)
    expect(publishHandlerMock).toHaveBeenCalledWith(request)
  })
})
