import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  BodyEnvelopeError,
  getEditorBodyEnvelopeErrorResponse,
  getEditorBodyPolicy,
  readBodyWithinLimit,
  validateBodyEnvelope,
} from './request-body-limits'

export async function handleNodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  fetchHandler: (request: Request) => Promise<Response>,
): Promise<void> {
  const host = pickHeader(req.headers['x-forwarded-host']) ?? pickHeader(req.headers.host) ?? 'localhost'
  const proto = pickHeader(req.headers['x-forwarded-proto']) ?? 'https'
  const url = `${proto}://${host}${req.url ?? '/'}`
  const method = req.method ?? 'GET'
  const pathname = new URL(url).pathname

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }

  let bodyPolicy
  try {
    bodyPolicy = getEditorBodyPolicy(pathname, method)
  } catch (error) {
    if (error instanceof BodyEnvelopeError) {
      sendEnvelopeError(res, pathname, error)
      return
    }
    throw error
  }

  let body: ArrayBuffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    let buf: Buffer
    try {
      if (bodyPolicy) {
        validateBodyEnvelope(req.headers, bodyPolicy)
        buf = await readBodyWithinLimit(req, bodyPolicy.maxBytes)
      } else {
        const chunks: Array<Buffer> = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        buf = Buffer.concat(chunks)
      }
    } catch (error) {
      if (error instanceof BodyEnvelopeError) {
        sendEnvelopeError(res, pathname, error)
        return
      }
      throw error
    }
    // Buffer.concat may return a view into a larger pooled ArrayBuffer. Copy
    // only the received byte range so downstream request bodies stay exact.
    body = new ArrayBuffer(buf.byteLength)
    new Uint8Array(body).set(buf)
  }

  const request = new Request(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  })
  const response = await fetchHandler(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (response.body !== null) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  }
  res.end()
}

function sendEnvelopeError(
  res: ServerResponse,
  pathname: string,
  error: BodyEnvelopeError,
): void {
  const failure = getEditorBodyEnvelopeErrorResponse(pathname, error)
  res.statusCode = failure.status
  for (const [name, value] of Object.entries(failure.headers)) {
    res.setHeader(name, value)
  }
  res.end(JSON.stringify(failure.body))
}

function pickHeader(value: string | Array<string> | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}
