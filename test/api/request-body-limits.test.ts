import { describe, expect, it, vi } from 'vitest'
import { MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES } from '~/server/my-world-faq-editor.functions'
import {
  BodyEnvelopeError,
  getEditorBodyEnvelopeErrorResponse,
  getEditorBodyPolicy,
  readBodyWithinLimit,
  validateBodyEnvelope,
} from '../../api/request-body-limits'

describe('FAQ editor request-body limits', () => {
  it('declares exact POST-only policies without changing unrelated APIs', () => {
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')).toMatchObject({
      maxBytes: 4_096,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/logout', 'POST')).toMatchObject({
      maxBytes: 1_024,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/restore', 'POST')).toMatchObject({
      maxBytes: 8_192,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/publish', 'POST')).toMatchObject({
      maxBytes: MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES,
    })
    expect(() => getEditorBodyPolicy('/api/my-world/faq/editor/session', 'PUT')).toThrowError(
      expect.objectContaining({ code: 'METHOD_NOT_ALLOWED', status: 405 }),
    )
    expect(getEditorBodyPolicy('/api/openai/realtime-mirror', 'POST')).toBeNull()
  })

  it('rejects non-canonical and unknown editor paths before buffering', () => {
    for (const pathname of [
      '/api/my-world/faq/editor/session/',
      '/api/my-world/faq/editor/SESSION',
      '/api/my-world/faq/editor/unknown',
    ]) {
      expect(() => getEditorBodyPolicy(pathname, 'POST')).toThrowError(
        expect.objectContaining({ code: 'NON_CANONICAL_PATH', status: 404 }),
      )
    }
  })

  it('requires JSON and rejects malformed or oversized declared lengths', () => {
    const policy = getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')
    if (!policy) throw new Error('Expected body policy')

    expect(() =>
      validateBodyEnvelope({ 'content-type': 'application/json; charset=utf-8' }, policy),
    ).not.toThrow()
    expect(() => validateBodyEnvelope({ 'content-type': 'text/plain' }, policy)).toThrowError(
      expect.objectContaining({ status: 415 }),
    )
    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': 'not-a-number' },
        policy,
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }))
    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': '4097' },
        policy,
      ),
    ).toThrowError(expect.objectContaining({ status: 413 }))
  })

  it('accepts the exact streamed limit and rejects one byte beyond it', async () => {
    async function* exact() {
      yield Buffer.alloc(2)
      yield Buffer.alloc(2)
    }
    async function* oversized() {
      yield Buffer.alloc(4)
      yield Buffer.alloc(1)
    }

    await expect(readBodyWithinLimit(exact(), 4)).resolves.toHaveLength(4)
    await expect(readBodyWithinLimit(oversized(), 4)).rejects.toBeInstanceOf(BodyEnvelopeError)
  })

  it('rejects declared oversize before consuming the stream', async () => {
    const iterator = vi.fn()
    const source = { [Symbol.asyncIterator]: iterator }
    const policy = getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')
    if (!policy) throw new Error('Expected body policy')

    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': '5000' },
        policy,
      ),
    ).toThrow()
    expect(iterator).not.toHaveBeenCalled()
    expect(source).toBeDefined()
  })

  it.each([
    {
      pathname: '/api/my-world/faq/editor/publish',
      error: new BodyEnvelopeError('PAYLOAD_TOO_LARGE'),
      status: 413,
      message: 'The FAQ draft is too large to publish.',
    },
    {
      pathname: '/api/my-world/faq/editor/publish',
      error: new BodyEnvelopeError('UNSUPPORTED_MEDIA'),
      status: 415,
      message: 'Use application/json.',
    },
    {
      pathname: '/api/my-world/faq/editor/restore',
      error: new BodyEnvelopeError('PAYLOAD_TOO_LARGE'),
      status: 413,
      message: 'The restore request is too large.',
    },
    {
      pathname: '/api/my-world/faq/editor/restore',
      error: new BodyEnvelopeError('UNSUPPORTED_MEDIA'),
      status: 415,
      message: 'Use application/json.',
    },
    {
      pathname: '/api/my-world/faq/editor/restore',
      error: new BodyEnvelopeError('BAD_CONTENT_LENGTH'),
      status: 400,
      message: 'The request body length is invalid.',
    },
  ])('formats $status adapter failures for $pathname with the mutation response contract', ({
    pathname,
    error,
    status,
    message,
  }) => {
    const response = getEditorBodyEnvelopeErrorResponse(pathname, error)

    expect(response).toMatchObject({
      status,
      body: {
        ok: false,
        error: 'invalid_body',
        message,
      },
    })
    expect(response.headers).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie',
    })
  })

  it.each([
    {
      pathname: '/api/my-world/faq/editor/publish',
      error: new BodyEnvelopeError('METHOD_NOT_ALLOWED'),
      status: 405,
      body: { error: 'Method not allowed.' },
    },
    {
      pathname: '/api/my-world/faq/editor/publish/',
      error: new BodyEnvelopeError('NON_CANONICAL_PATH'),
      status: 404,
      body: { error: 'Not found.' },
    },
  ])('keeps $status routing failures fail-closed for $pathname', ({
    pathname,
    error,
    status,
    body,
  }) => {
    const response = getEditorBodyEnvelopeErrorResponse(pathname, error)
    expect(response).toMatchObject({
      status,
      body,
    })
    if (error.code === 'METHOD_NOT_ALLOWED') {
      expect(response.headers.Allow).toBe('POST')
    }
  })

  it.each([
    new BodyEnvelopeError('PAYLOAD_TOO_LARGE'),
    new BodyEnvelopeError('UNSUPPORTED_MEDIA'),
    new BodyEnvelopeError('BAD_CONTENT_LENGTH'),
  ])('does not clear the editor cookie when logout is rejected before routing', (error) => {
    const production = getEditorBodyEnvelopeErrorResponse('/api/my-world/faq/editor/logout', error)
    const development = getEditorBodyEnvelopeErrorResponse('/api/my-world/faq/editor/logout', error)

    expect(production.headers['Set-Cookie']).toBeUndefined()
    expect(development.headers['Set-Cookie']).toBeUndefined()
  })
})
