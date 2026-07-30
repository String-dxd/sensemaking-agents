// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addTeamFaqQuestion,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  setMyWorldFaqManifestPath,
} from '~/data/my-world-faq'
import type {
  MyWorldFaqHeadRef,
  MyWorldFaqRevisionMetadata,
  MyWorldFaqRevisionSnapshot,
} from '~/server/my-world-faq-repository.server'

const mocks = vi.hoisted(() => ({
  assertEnabled: vi.fn(),
  assertTransport: vi.fn(),
  requireSession: vi.fn(),
  consumePermit: vi.fn(),
  listMetadata: vi.fn(),
  loadEditorRevision: vi.fn(),
  loadRevision: vi.fn(),
  publishRevision: vi.fn(),
  setResponseHeader: vi.fn(),
  writePublicCache: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-start/server')>()
  return {
    ...original,
    setResponseHeader: mocks.setResponseHeader,
  }
})

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
    listMyWorldFaqRevisionMetadata: mocks.listMetadata,
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
import {
  handleMyWorldFaqEditorRestore,
  loadMyWorldFaqRevisionHistoryHandler,
  loadMyWorldFaqRevisionPreviewHandler,
} from '~/server/my-world-faq-history.handler.server'
import { MyWorldFaqRepositoryError } from '~/server/my-world-faq-repository.server'

const CURRENT_HEAD = {
  revisionId: '11111111-1111-4111-8111-111111111111',
  version: 4,
  digest: 'a'.repeat(64),
} satisfies MyWorldFaqHeadRef

const TARGET_HEAD = {
  revisionId: '22222222-2222-4222-8222-222222222222',
  version: 2,
  digest: 'b'.repeat(64),
} satisfies MyWorldFaqHeadRef

const COMMITTED_HEAD = {
  revisionId: '33333333-3333-4333-8333-333333333333',
  version: 5,
  digest: 'c'.repeat(64),
} satisfies MyWorldFaqHeadRef

const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444'

function document(label: string) {
  return setMyWorldFaqManifestPath(DEFAULT_MY_WORLD_FAQ_CONTENT, 'route.title', label)
}

function v2Document(label: string) {
  return addTeamFaqQuestion(document(label), {
    id: 'team-11111111-1111-4111-8111-111111111111',
    clusterId: 'evidence-next-decision',
    displayedQuestion: 'How is this v2 revision reviewed?',
    shortAnswer:
      'The team keeps this answer provisional, preserves its review metadata, and restores the selected historical document without silently rewriting its structure.',
    detailedAnswer: 'This v2 working answer remains open to human review, evidence and correction.',
    limitations: 'The next publication decision remains with the product team.',
    reviewDate: '2026-07-30',
  })
}

function revision(
  head: MyWorldFaqHeadRef,
  revisionDocument = document(`FAQ v${head.version}`),
): MyWorldFaqRevisionSnapshot {
  return {
    ...head,
    schemaVersion: revisionDocument.schemaVersion,
    structureVersion: revisionDocument.structureVersion,
    attributionKind: head.version === 1 ? 'system-import' : 'self-declared',
    savedByName: head.version === 1 ? null : 'Protected collaborator',
    createdAt: `2026-07-${String(20 + head.version).padStart(2, '0')}T00:00:00.000Z`,
    restoredFromRevisionId: null,
    document: revisionDocument,
  }
}

function metadata(head: MyWorldFaqHeadRef): MyWorldFaqRevisionMetadata {
  const { document: _, ...item } = revision(head)
  return item
}

function restoreRequest(
  body: unknown = {
    schemaVersion: 1,
    targetRevisionId: TARGET_HEAD.revisionId,
    expectedBase: CURRENT_HEAD,
    attemptId: ATTEMPT_ID,
  },
): Request {
  return new Request('https://faq.example.gov.sg/api/my-world/faq/editor/restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: '__Host-my_world_faq_editor=opaque',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('My World FAQ protected history and restore handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSession.mockResolvedValue({
      auditId: '55555555-5555-4555-8555-555555555555',
      displayName: 'Session collaborator',
      idleExpiresAt: '2026-07-29T16:30:00.000Z',
      absoluteExpiresAt: '2026-07-30T00:00:00.000Z',
      tokenDigest: 'd'.repeat(64),
    })
    mocks.consumePermit.mockResolvedValue({
      allowed: true,
      count: 1,
      windowStartedAt: '2026-07-29T00:00:00.000Z',
    })
    mocks.loadEditorRevision.mockResolvedValue(revision(CURRENT_HEAD))
    mocks.loadRevision.mockResolvedValue(revision(TARGET_HEAD))
    const committed = revision(COMMITTED_HEAD, revision(TARGET_HEAD).document)
    mocks.publishRevision.mockResolvedValue({
      outcome: 'committed',
      committed,
      live: committed,
    })
    mocks.writePublicCache.mockResolvedValue('written')
  })

  it('returns paginated metadata only after authentication, including unsupported rows', async () => {
    const future = {
      ...metadata(TARGET_HEAD),
      schemaVersion: 99,
      document: { secret: 'must not cross the history boundary' },
    }
    mocks.listMetadata.mockResolvedValue({
      items: [future],
      nextBeforeVersion: 2,
    })
    const request = new Request('https://faq.example.gov.sg/my-world/faq/edit')

    const result = await loadMyWorldFaqRevisionHistoryHandler(request, {
      beforeVersion: 5,
      limit: 1,
    })

    expect(mocks.requireSession).toHaveBeenCalledBefore(mocks.listMetadata)
    expect(mocks.listMetadata).toHaveBeenCalledWith({ beforeVersion: 5, limit: 1 })
    expect(result).toMatchObject({
      status: 'ready',
      items: [
        {
          revisionId: TARGET_HEAD.revisionId,
          version: TARGET_HEAD.version,
          schemaVersion: 99,
        },
      ],
      nextBeforeVersion: 2,
    })
    if (result.status !== 'ready') throw new Error('Expected history')
    expect(result.items[0]).not.toHaveProperty('document')
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store')
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('Vercel-CDN-Cache-Control', 'no-store')
    expect(mocks.setResponseHeader).toHaveBeenCalledWith('Vary', 'Cookie')
  })

  it('loads exactly one selected full revision after authentication', async () => {
    const request = new Request('https://faq.example.gov.sg/my-world/faq/edit')

    const result = await loadMyWorldFaqRevisionPreviewHandler(request, {
      revisionId: TARGET_HEAD.revisionId,
    })

    expect(mocks.requireSession).toHaveBeenCalledBefore(mocks.loadRevision)
    expect(mocks.loadRevision).toHaveBeenCalledTimes(1)
    expect(mocks.loadRevision).toHaveBeenCalledWith(TARGET_HEAD.revisionId)
    expect(mocks.listMetadata).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'ready',
      revision: {
        head: TARGET_HEAD,
        document: revision(TARGET_HEAD).document,
      },
    })
  })

  it('previews and restores either supported document structure exactly', async () => {
    const targetV2 = revision(TARGET_HEAD, v2Document('FAQ v2 target'))
    mocks.loadRevision.mockResolvedValue(targetV2)
    const committedV2 = revision(COMMITTED_HEAD, targetV2.document)
    mocks.publishRevision.mockResolvedValue({
      outcome: 'committed',
      committed: committedV2,
      live: committedV2,
    })
    const request = new Request('https://faq.example.gov.sg/my-world/faq/edit')

    await expect(
      loadMyWorldFaqRevisionPreviewHandler(request, {
        revisionId: TARGET_HEAD.revisionId,
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      revision: {
        structureVersion: 2,
        document: targetV2.document,
      },
    })

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())
    expect(response.status).toBe(200)
    expect(mocks.publishRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        document: targetV2.document,
        restoredFromRevisionId: TARGET_HEAD.revisionId,
      }),
    )

    const currentV2 = revision(CURRENT_HEAD, v2Document('FAQ v2 current'))
    const targetV1 = revision(TARGET_HEAD, document('FAQ v1 target'))
    mocks.loadEditorRevision.mockResolvedValue(currentV2)
    mocks.loadRevision.mockResolvedValue(targetV1)
    const committedV1 = revision(COMMITTED_HEAD, targetV1.document)
    mocks.publishRevision.mockResolvedValue({
      outcome: 'committed',
      committed: committedV1,
      live: committedV1,
    })

    const v1Response = await handleMyWorldFaqEditorRestore(restoreRequest())
    expect(v1Response.status).toBe(200)
    expect(mocks.publishRevision).toHaveBeenLastCalledWith(
      expect.objectContaining({
        document: targetV1.document,
        restoredFromRevisionId: TARGET_HEAD.revisionId,
      }),
    )
  })

  it('keeps unsupported and corrupt previews generic and protected', async () => {
    mocks.loadRevision.mockResolvedValue({
      ...revision(TARGET_HEAD, v2Document('FAQ v2 with mismatched row metadata')),
      structureVersion: 1,
    })
    const request = new Request('https://faq.example.gov.sg/my-world/faq/edit')
    await expect(
      loadMyWorldFaqRevisionPreviewHandler(request, {
        revisionId: TARGET_HEAD.revisionId,
      }),
    ).resolves.toEqual({ status: 'unsupported' })

    mocks.loadRevision.mockResolvedValue({
      ...revision(TARGET_HEAD),
      structureVersion: 3,
    })
    await expect(
      loadMyWorldFaqRevisionPreviewHandler(request, {
        revisionId: TARGET_HEAD.revisionId,
      }),
    ).resolves.toEqual({ status: 'unsupported' })

    mocks.loadRevision.mockRejectedValue(new MyWorldFaqRepositoryError('CORRUPT_STATE'))

    await expect(
      loadMyWorldFaqRevisionPreviewHandler(request, {
        revisionId: TARGET_HEAD.revisionId,
      }),
    ).resolves.toEqual({ status: 'unsupported' })

    mocks.requireSession.mockRejectedValue(new MyWorldFaqEditorAuthError('UNAUTHORIZED'))
    await expect(
      loadMyWorldFaqRevisionPreviewHandler(request, {
        revisionId: TARGET_HEAD.revisionId,
      }),
    ).resolves.toEqual({ status: 'locked' })
  })

  it('restores the target through the standard publisher using session attribution', async () => {
    const response = await handleMyWorldFaqEditorRestore(restoreRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      outcome: 'committed',
      resilience: 'healthy',
      committed: { head: COMMITTED_HEAD },
      live: { head: COMMITTED_HEAD },
    })
    expect(mocks.publishRevision).toHaveBeenCalledWith({
      document: revision(TARGET_HEAD).document,
      expectedBase: CURRENT_HEAD,
      attemptId: ATTEMPT_ID,
      savedByName: 'Session collaborator',
      restoredFromRevisionId: TARGET_HEAD.revisionId,
    })
    expect(mocks.writePublicCache).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vary')).toContain('Cookie')
  })

  it('blocks current and digest-identical restores as no-ops', async () => {
    mocks.loadRevision.mockResolvedValue(
      revision({
        ...TARGET_HEAD,
        digest: CURRENT_HEAD.digest,
      }),
    )

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'no_changes',
    })
    expect(mocks.publishRevision).not.toHaveBeenCalled()
    expect(mocks.writePublicCache).not.toHaveBeenCalled()
  })

  it('returns a protected stale conflict without creating a revision', async () => {
    const newer = revision({
      revisionId: '66666666-6666-4666-8666-666666666666',
      version: 5,
      digest: 'e'.repeat(64),
    })
    mocks.loadEditorRevision.mockResolvedValue(newer)
    mocks.publishRevision.mockRejectedValue(new MyWorldFaqRepositoryError('STALE_HEAD'))

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'stale_head',
      latest: { head: { version: 5 } },
    })
    expect(mocks.loadRevision).toHaveBeenCalledWith(TARGET_HEAD.revisionId)
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1)
    expect(mocks.writePublicCache).not.toHaveBeenCalled()
  })

  it('lets the repository resolve an idempotent retry after the head advanced', async () => {
    const later = revision({
      revisionId: '77777777-7777-4777-8777-777777777777',
      version: 6,
      digest: 'f'.repeat(64),
    })
    const committed = revision(COMMITTED_HEAD, revision(TARGET_HEAD).document)
    mocks.loadEditorRevision.mockResolvedValue(later)
    mocks.publishRevision.mockResolvedValue({
      outcome: 'committed-but-superseded',
      committed,
      live: later,
    })

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'committed-but-superseded',
      committed: { head: COMMITTED_HEAD },
      live: { head: { version: 6 } },
    })
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1)
    expect(mocks.writePublicCache).toHaveBeenCalledWith(
      expect.objectContaining({
        head: expect.objectContaining({ version: 6 }),
      }),
    )
  })

  it('reports degraded cache without rolling back the committed restore', async () => {
    mocks.writePublicCache.mockRejectedValue(new Error('cache unavailable'))

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      resilience: 'degraded',
    })
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1)
    expect(mocks.writePublicCache).toHaveBeenCalledTimes(1)
  })

  it('reports a busy cache fence as degraded without delaying the committed restore', async () => {
    mocks.writePublicCache.mockResolvedValue('busy')

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'committed',
      resilience: 'degraded',
    })
  })

  it('reloads the authoritative head when a restored version is superseded during caching', async () => {
    const later = revision({
      revisionId: '77777777-7777-4777-8777-777777777777',
      version: 6,
      digest: 'f'.repeat(64),
    })
    mocks.writePublicCache.mockResolvedValue('superseded')
    mocks.loadEditorRevision.mockResolvedValue(later)

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'committed-but-superseded',
      committed: { head: COMMITTED_HEAD },
      live: { head: { version: 6 } },
    })
  })

  it('keeps a restore retryable when a superseded commit cannot confirm the live head', async () => {
    mocks.writePublicCache.mockResolvedValue('superseded')
    mocks.loadEditorRevision
      .mockResolvedValueOnce(revision(CURRENT_HEAD))
      .mockRejectedValueOnce(new Error('database unavailable'))

    const response = await handleMyWorldFaqEditorRestore(restoreRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'persistence_unavailable',
      message: expect.stringContaining('was saved'),
    })
  })

  it('checks authentication and the database permit before parsing the body', async () => {
    const unauthorized = restoreRequest('{not json')
    const unauthorizedJson = vi.spyOn(unauthorized, 'json')
    mocks.requireSession.mockRejectedValueOnce(new MyWorldFaqEditorAuthError('UNAUTHORIZED'))

    const expiredResponse = await handleMyWorldFaqEditorRestore(unauthorized)

    expect(expiredResponse.status).toBe(401)
    expect(unauthorizedJson).not.toHaveBeenCalled()
    expect(mocks.consumePermit).not.toHaveBeenCalled()

    const limited = restoreRequest('{not json')
    const limitedJson = vi.spyOn(limited, 'json')
    mocks.consumePermit.mockResolvedValueOnce({ allowed: false })

    const limitedResponse = await handleMyWorldFaqEditorRestore(limited)

    expect(limitedResponse.status).toBe(429)
    expect(limitedJson).not.toHaveBeenCalled()
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })

  it('rejects extra authority fields instead of accepting a body attribution', async () => {
    const response = await handleMyWorldFaqEditorRestore(
      restoreRequest({
        schemaVersion: 1,
        targetRevisionId: TARGET_HEAD.revisionId,
        expectedBase: CURRENT_HEAD,
        attemptId: ATTEMPT_ID,
        savedByName: 'Body-controlled name',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.publishRevision).not.toHaveBeenCalled()
  })
})
