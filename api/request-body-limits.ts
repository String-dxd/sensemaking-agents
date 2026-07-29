import type { IncomingHttpHeaders } from 'node:http'

export interface EditorBodyPolicy {
  maxBytes: number
  requireJson: true
}

export type BodyEnvelopeErrorCode =
  | 'BAD_CONTENT_LENGTH'
  | 'METHOD_NOT_ALLOWED'
  | 'NON_CANONICAL_PATH'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'

export class BodyEnvelopeError extends Error {
  readonly code: BodyEnvelopeErrorCode
  readonly status: 400 | 404 | 405 | 413 | 415

  constructor(code: BodyEnvelopeErrorCode) {
    super(code)
    this.name = 'BodyEnvelopeError'
    this.code = code
    this.status =
      code === 'NON_CANONICAL_PATH'
        ? 404
        : code === 'METHOD_NOT_ALLOWED'
          ? 405
          : code === 'PAYLOAD_TOO_LARGE'
            ? 413
            : code === 'UNSUPPORTED_MEDIA'
              ? 415
              : 400
  }
}

const EDITOR_API_NAMESPACE = '/api/my-world/faq/editor'
const EDITOR_POST_POLICIES = new Map<string, EditorBodyPolicy>([
  ['/api/my-world/faq/editor/session', { maxBytes: 4 * 1_024, requireJson: true }],
  ['/api/my-world/faq/editor/logout', { maxBytes: 1_024, requireJson: true }],
  ['/api/my-world/faq/editor/restore', { maxBytes: 8 * 1_024, requireJson: true }],
  ['/api/my-world/faq/editor/publish', { maxBytes: 1_024 * 1_024, requireJson: true }],
])

export function getEditorBodyPolicy(pathname: string, method: string): EditorBodyPolicy | null {
  const lowerPathname = pathname.toLowerCase()
  const isEditorApi =
    lowerPathname === EDITOR_API_NAMESPACE ||
    lowerPathname.startsWith(`${EDITOR_API_NAMESPACE}/`)
  if (!isEditorApi) return null
  if (method.toUpperCase() !== 'POST') {
    throw new BodyEnvelopeError('METHOD_NOT_ALLOWED')
  }

  const policy = EDITOR_POST_POLICIES.get(pathname)
  if (!policy) {
    // Reject case variants, trailing slashes and unknown paths before reading
    // their bodies. Otherwise a downstream router or proxy could normalize
    // them after they bypassed the exact-path limits and firewall rules.
    throw new BodyEnvelopeError('NON_CANONICAL_PATH')
  }
  return policy
}

export function validateBodyEnvelope(
  headers: IncomingHttpHeaders,
  policy: EditorBodyPolicy,
): void {
  const mediaType = firstHeader(headers['content-type'])?.split(';', 1)[0]?.trim().toLowerCase()
  if (policy.requireJson && mediaType !== 'application/json') {
    throw new BodyEnvelopeError('UNSUPPORTED_MEDIA')
  }

  const rawLength = firstHeader(headers['content-length'])
  if (rawLength === undefined) return
  if (!/^\d+$/.test(rawLength)) throw new BodyEnvelopeError('BAD_CONTENT_LENGTH')
  const declaredLength = Number(rawLength)
  if (!Number.isSafeInteger(declaredLength)) {
    throw new BodyEnvelopeError('BAD_CONTENT_LENGTH')
  }
  if (declaredLength > policy.maxBytes) {
    throw new BodyEnvelopeError('PAYLOAD_TOO_LARGE')
  }
}

export async function readBodyWithinLimit(
  source: AsyncIterable<unknown>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let received = 0
  for await (const rawChunk of source) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array)
    received += chunk.byteLength
    if (received > maxBytes) throw new BodyEnvelopeError('PAYLOAD_TOO_LARGE')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, received)
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
