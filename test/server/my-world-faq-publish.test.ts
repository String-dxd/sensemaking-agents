import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, setMyWorldFaqManifestPath } from '~/data/my-world-faq'
import type {
  MyWorldFaqHeadRef,
  MyWorldFaqRevisionSnapshot,
} from '~/server/my-world-faq-repository.server'

const mocks = vi.hoisted(() => ({
  assertEnabled: vi.fn(),
  assertTransport: vi.fn(),
  requireSession: vi.fn(),
  consumePermit: vi.fn(),
  loadEditorRevision: vi.fn(),
  loadRevision: vi.fn(),
  publishRevision: vi.fn(),
  writePublicCache: vi.fn(),
}))

vi.mock('~/auth/my-world-faq-editor-session.server', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('~/auth/my-world-faq-editor-session.server')>()
  return {
    ...original,
    assertMyWorldFaqEditorEnabled: mocks.assertEnabled,
    assertMyWorldFaqEditorRequestTransport: mocks.assertTransport,
    requireMyWorldFaqEditorSession: mocks.requireSession,
  }
})

vi.mock('~/server/my-world-faq-repository.server', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/my-world-faq-repository.server')>()
  return {
    ...original,
    consumeMyWorldFaqEditorMutationPermit: mocks.consumePermit,
    loadMyWorldFaqEditorRevision: mocks.loadEditorRevision,
    loadMyWorldFaqRevision: mocks.loadRevision,
    publishMyWorldFaqRevision: mocks.publishRevision,
  }
})

vi.mock('~/server/my-world-faq-public-cache.server', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('~/server/my-world-faq-public-cache.server')>()
  return {
    ...original,
    writeCurrentMyWorldFaqPublicCache: mocks.writePublicCache,
  }
})

import { MyWorldFaqEditorAuthError } from '~/auth/my-world-faq-editor-session.server'
import { MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES } from '~/server/my-world-faq-editor.functions'
import { handleMyWorldFaqEditorPublish } from '~/server/my-world-faq-editor.handler.server'
import { MyWorldFaqRepositoryError } from '~/server/my-world-faq-repository.server'
import { buildValidPublishRequestAtByteLength } from '../data/my-world-faq-publish-envelope.fixture'

const BASE_HEAD = {
  revisionId: '11111111-1111-4111-8111-111111111111',
  version: 4,
  digest: 'a'.repeat(64),
} satisfies MyWorldFaqHeadRef

const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222'

function revision(
  head: MyWorldFaqHeadRef,
  document = DEFAULT_MY_WORLD_FAQ_CONTENT,
): MyWorldFaqRevisionSnapshot {
  return {
    ...head,
    schemaVersion: document.schemaVersion,
    structureVersion: document.structureVersion,
    attributionKind: head.version === 1 ? 'system-import' : 'self-declared',
    savedByName: head.version === 1 ? null : 'Ari',
    createdAt: `2026-07-${String(20 + head.version).padStart(2, '0')}T00:00:00.000Z`,
    restoredFromRevisionId: null,
    document,
  }
}

function validDocument() {
  return setMyWorldFaqManifestPath(
    DEFAULT_MY_WORLD_FAQ_CONTENT,
    'route.title',
    'My World FAQ, reviewed',
  )
}

function request(
  body: unknown = {
    schemaVersion: 1,
    document: validDocument(),
    expectedBase: BASE_HEAD,
    attemptId: ATTEMPT_ID,
  },
  headers: HeadersInit = {},
): Request {
  return new Request('https://faq.example.gov.sg/api/my-world/faq/editor/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: '__Host-my_world_faq_editor=opaque',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('My World FAQ publish handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSession.mockResolvedValue({
      auditId: '33333333-3333-4333-8333-333333333333',
      displayName: 'Ari',
      idleExpiresAt: '2026-07-29T16:30:00.000Z',
      absoluteExpiresAt: '2026-07-30T00:00:00.000Z',
      tokenDigest: 'd'.repeat(64),
    })
    mocks.consumePermit.mockResolvedValue({
      allowed: true,
      count: 1,
      windowStartedAt: '2026-07-29T00:00:00.000Z',
    })
    mocks.loadRevision.mockResolvedValue(revision(BASE_HEAD))
    mocks.loadEditorRevision.mockResolvedValue(revision(BASE_HEAD))
    const committedHead = {
      revisionId: '44444444-4444-4444-8444-444444444444',
      version: 5,
      digest: 'b'.repeat(64),
    }
    const committed = revision(committedHead, validDocument())
    mocks.publishRevision.mockResolvedValue({
      outcome: 'committed',
      committed,
      live: committed,
    })
    mocks.writePublicCache.mockResolvedValue('written')
  })

  it('checks the protected session before reading malformed JSON', async () => {
    mocks.requireSession.mockRejectedValue(new MyWorldFaqEditorAuthError('UNAUTHORIZED'))

    const response = await handleMyWorldFaqEditorPublish(request('{not json'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'session_expired',
    })
    expect(mocks.consumePermit).not.toHaveBeenCalled()
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })

  it('accepts the exact UTF-8 envelope limit and rejects the next byte', async () => {
    const exactBody = JSON.stringify(
      buildValidPublishRequestAtByteLength(MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES),
    )
    const exactRequest = request(exactBody)
    exactRequest.headers.set('Content-Length', String(Buffer.byteLength(exactBody, 'utf8')))
    const exactResponse = await handleMyWorldFaqEditorPublish(exactRequest)

    expect(exactResponse.status).toBe(200)
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1)

    const oversizedBody = JSON.stringify(
      buildValidPublishRequestAtByteLength(MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES + 1),
    )
    const oversizedRequest = request(oversizedBody)
    oversizedRequest.headers.set('Content-Length', String(Buffer.byteLength(oversizedBody, 'utf8')))
    const oversizedResponse = await handleMyWorldFaqEditorPublish(oversizedRequest)

    expect(oversizedResponse.status).toBe(413)
    await expect(oversizedResponse.json()).resolves.toMatchObject({
      ok: false,
      error: 'invalid_body',
      message: 'The FAQ draft is too large to publish.',
    })
    expect(mocks.consumePermit).toHaveBeenCalledTimes(1)
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1)
  })

  it('rejects extra authority fields and never accepts attribution from the body', async () => {
    const response = await handleMyWorldFaqEditorPublish(
      request({
        schemaVersion: 1,
        document: validDocument(),
        expectedBase: BASE_HEAD,
        attemptId: ATTEMPT_ID,
        savedByName: 'Someone else',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })

  it('returns field-addressable validation without writing', async () => {
    const changedStructure = structuredClone(validDocument())
    const first = changedStructure.questions[0]
    if (!first) throw new Error('Expected a question')
    first.slug = 'changed-by-browser'

    const response = await handleMyWorldFaqEditorPublish(
      request({
        schemaVersion: 1,
        document: changedStructure,
        expectedBase: BASE_HEAD,
        attemptId: ATTEMPT_ID,
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      ok: false,
      error: 'validation_failed',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'non_editable_change',
        }),
      ]),
    })
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })

  it('publishes with the session name and reports cache degradation without retrying the write', async () => {
    mocks.writePublicCache.mockRejectedValue(new Error('cache unavailable'))

    const response = await handleMyWorldFaqEditorPublish(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      outcome: 'committed',
      resilience: 'degraded',
      committed: {
        head: { version: 5 },
      },
      live: {
        head: { version: 5 },
      },
    })
    expect(mocks.publishRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        expectedBase: BASE_HEAD,
        savedByName: 'Ari',
      }),
    )
    expect(mocks.writePublicCache).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
  })

  it('reports a busy cache fence as degraded without delaying the committed save', async () => {
    mocks.writePublicCache.mockResolvedValue('busy')

    const response = await handleMyWorldFaqEditorPublish(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'committed',
      resilience: 'degraded',
    })
  })

  it('reloads the authoritative head when the cache fence detects a newer publication', async () => {
    const latestHead = {
      revisionId: '55555555-5555-4555-8555-555555555555',
      version: 6,
      digest: 'c'.repeat(64),
    }
    mocks.writePublicCache.mockResolvedValue('superseded')
    mocks.loadEditorRevision.mockResolvedValue(revision(latestHead))

    const response = await handleMyWorldFaqEditorPublish(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'committed-but-superseded',
      committed: { head: { version: 5 } },
      live: { head: latestHead },
    })
  })

  it('keeps the draft retryable when a superseded save cannot confirm the live head', async () => {
    mocks.writePublicCache.mockResolvedValue('superseded')
    mocks.loadEditorRevision.mockRejectedValue(new Error('database unavailable'))

    const response = await handleMyWorldFaqEditorPublish(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'persistence_unavailable',
      message: expect.stringContaining('was saved'),
    })
  })

  it('returns the protected latest snapshot on a stale conflict', async () => {
    const latestHead = {
      revisionId: '55555555-5555-4555-8555-555555555555',
      version: 5,
      digest: 'c'.repeat(64),
    }
    mocks.publishRevision.mockRejectedValue(new MyWorldFaqRepositoryError('STALE_HEAD'))
    mocks.loadEditorRevision.mockResolvedValue(revision(latestHead))

    const response = await handleMyWorldFaqEditorPublish(request())
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      ok: false,
      error: 'stale_head',
      latest: {
        head: latestHead,
      },
    })
    expect(mocks.writePublicCache).not.toHaveBeenCalled()
  })

  it('rate-limits mutations without parsing or publishing the candidate', async () => {
    mocks.consumePermit.mockResolvedValue({ allowed: false })

    const response = await handleMyWorldFaqEditorPublish(request('{not json'))

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('600')
    expect(mocks.loadRevision).not.toHaveBeenCalled()
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })
})
