import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { handleNodeRequest } from '../../api/request-adapter'

function incomingRequest({
  pathname = '/api/my-world/faq/editor/session',
  method = 'POST',
  headers = {},
  chunks = [],
}: {
  pathname?: string
  method?: string
  headers?: IncomingHttpHeaders
  chunks?: Buffer[]
}): IncomingMessage {
  return {
    method,
    url: pathname,
    headers: {
      host: '127.0.0.1:3001',
      'x-forwarded-proto': 'http',
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

function responseSink() {
  const headers = new Map<string, string | number | readonly string[]>()
  const chunks: Buffer[] = []
  let ended = false
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name, value)
      return response
    },
    write(chunk: Uint8Array | string) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    end(chunk?: Uint8Array | string) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      ended = true
      return response
    },
  } as unknown as ServerResponse

  return {
    response,
    headers,
    body: () => Buffer.concat(chunks).toString('utf8'),
    ended: () => ended,
  }
}

describe('Vercel Node request adapter', () => {
  it('passes the exact editor limit downstream with the exact byte range', async () => {
    const body = Buffer.alloc(4_096, 0x78)
    const request = incomingRequest({
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.byteLength),
      },
      chunks: [body.subarray(0, 17), body.subarray(17)],
    })
    const sink = responseSink()
    const fetchHandler = vi.fn(async (downstream: Request) => {
      expect((await downstream.arrayBuffer()).byteLength).toBe(4_096)
      return new Response('accepted', { status: 201 })
    })

    await handleNodeRequest(request, sink.response, fetchHandler)

    expect(fetchHandler).toHaveBeenCalledTimes(1)
    expect(sink.response.statusCode).toBe(201)
    expect(sink.body()).toBe('accepted')
    expect(sink.ended()).toBe(true)
  })

  it('rejects a streamed byte over the limit before invoking the built app', async () => {
    const request = incomingRequest({
      headers: { 'content-type': 'application/json' },
      chunks: [Buffer.alloc(4_096), Buffer.alloc(1)],
    })
    const sink = responseSink()
    const fetchHandler = vi.fn()

    await handleNodeRequest(request, sink.response, fetchHandler)

    expect(fetchHandler).not.toHaveBeenCalled()
    expect(sink.response.statusCode).toBe(413)
    expect(JSON.parse(sink.body())).toEqual({ error: 'Request body is too large.' })
  })

  it.each([
    {
      headers: { 'content-type': 'application/json', 'content-length': 'invalid' },
      status: 400,
    },
    {
      headers: { 'content-type': 'text/plain', 'content-length': '2' },
      status: 415,
    },
  ])('rejects an invalid envelope with $status before invoking the app', async ({
    headers,
    status,
  }) => {
    const sink = responseSink()
    const fetchHandler = vi.fn()

    await handleNodeRequest(
      incomingRequest({ headers, chunks: [Buffer.from('{}')] }),
      sink.response,
      fetchHandler,
    )

    expect(fetchHandler).not.toHaveBeenCalled()
    expect(sink.response.statusCode).toBe(status)
  })

  it('does not clear a rejected logout session and declares POST for method failures', async () => {
    const rejectedLogout = responseSink()
    await handleNodeRequest(
      incomingRequest({
        pathname: '/api/my-world/faq/editor/logout',
        headers: { 'content-type': 'text/plain' },
      }),
      rejectedLogout.response,
      vi.fn(),
    )

    expect(rejectedLogout.headers.get('Set-Cookie')).toBeUndefined()

    const rejectedMethod = responseSink()
    await handleNodeRequest(incomingRequest({ method: 'PUT' }), rejectedMethod.response, vi.fn())
    expect(rejectedMethod.response.statusCode).toBe(405)
    expect(rejectedMethod.headers.get('Allow')).toBe('POST')
  })
})
