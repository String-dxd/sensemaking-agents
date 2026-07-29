import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MY_WORLD_FAQ_DOCUMENT, digestMyWorldFaqDocument } from '~/data/my-world-faq'
import * as schema from '~/db/schema'
import {
  createMyWorldFaqRepository,
  MY_WORLD_FAQ_PAGE_KEY,
} from '~/server/my-world-faq-repository.server'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = describe.skipIf(!databaseUrl).sequential

function cloneDefault() {
  return structuredClone(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
}

describeWithDatabase('My World FAQ global revisions', () => {
  let pool: Pool
  let database: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl, max: 8 })
    database = drizzle(pool, { schema, casing: 'snake_case' })
  })

  beforeEach(async () => {
    await database.execute(sql`
      truncate table
        my_world_faq_editor_sessions,
        my_world_faq_heads,
        my_world_faq_revisions
      cascade
    `)
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('bootstraps once and verifies the same immutable version on retry', async () => {
    const repository = createMyWorldFaqRepository(database)

    const first = await repository.bootstrapDefaultDocument()
    const second = await repository.bootstrapDefaultDocument()
    const current = await repository.loadPublicSnapshot()

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(first.revision.version).toBe(1)
    expect(second.revision.revisionId).toBe(first.revision.revisionId)
    expect(current.head).toEqual({
      revisionId: first.revision.revisionId,
      version: 1,
      digest: first.revision.digest,
    })
    expect(Object.keys(current).sort()).toEqual([
      'document',
      'head',
      'schemaVersion',
      'structureVersion',
    ])
  })

  it('serializes simultaneous bootstrap and creates one version-one row', async () => {
    const firstRepository = createMyWorldFaqRepository(database)
    const secondRepository = createMyWorldFaqRepository(database)

    const results = await Promise.all([
      firstRepository.bootstrapDefaultDocument(),
      secondRepository.bootstrapDefaultDocument(),
    ])

    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(new Set(results.map((result) => result.revision.revisionId)).size).toBe(1)
    expect(results.map((result) => result.revision.version)).toEqual([1, 1])
  })

  it('serializes distinct attempts and makes a matching retry idempotent', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const expectedBase = {
      revisionId: bootstrap.revision.revisionId,
      version: bootstrap.revision.version,
      digest: bootstrap.revision.digest,
    }
    const firstDocument = cloneDefault()
    firstDocument.page.footer.brand = 'My World FAQ — team reviewed'
    const secondDocument = cloneDefault()
    secondDocument.page.footer.brand = 'My World FAQ — another review'
    const firstAttemptId = randomUUID()
    const secondAttemptId = randomUUID()

    const results = await Promise.allSettled([
      repository.publishRevision({
        document: firstDocument,
        expectedBase,
        attemptId: firstAttemptId,
        savedByName: 'Alex Tan',
      }),
      repository.publishRevision({
        document: secondDocument,
        expectedBase,
        attemptId: secondAttemptId,
        savedByName: 'Jamie Lim',
      }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: { code: 'STALE_HEAD' } })

    const winner = fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value : undefined
    expect(winner?.committed.version).toBe(2)

    if (winner?.committed.savedByName === 'Alex Tan') {
      const retry = await repository.publishRevision({
        document: firstDocument,
        expectedBase,
        attemptId: firstAttemptId,
        savedByName: 'Alex Tan',
      })
      expect(retry.outcome).toBe('committed')
      expect(retry.committed.revisionId).toBe(winner.committed.revisionId)
    }
  })

  it('returns committed-but-superseded without moving the head backward', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const base = {
      revisionId: bootstrap.revision.revisionId,
      version: 1,
      digest: bootstrap.revision.digest,
    }
    const firstDocument = cloneDefault()
    firstDocument.page.footer.brand = 'First published wording'
    const firstAttemptId = randomUUID()
    const first = await repository.publishRevision({
      document: firstDocument,
      expectedBase: base,
      attemptId: firstAttemptId,
      savedByName: 'Alex Tan',
    })
    const secondDocument = structuredClone(firstDocument)
    secondDocument.page.footer.brand = 'Second published wording'
    const second = await repository.publishRevision({
      document: secondDocument,
      expectedBase: first.liveHead,
      attemptId: randomUUID(),
      savedByName: 'Jamie Lim',
    })

    const retry = await repository.publishRevision({
      document: firstDocument,
      expectedBase: base,
      attemptId: firstAttemptId,
      savedByName: 'Alex Tan',
    })
    const current = await repository.loadPublicSnapshot()

    expect(retry.outcome).toBe('committed-but-superseded')
    expect(retry.committed.revisionId).toBe(first.committed.revisionId)
    expect(retry.liveHead.revisionId).toBe(second.committed.revisionId)
    expect(current.head.revisionId).toBe(second.committed.revisionId)
  })

  it('deduplicates two simultaneous first uses of one attempt ID', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const expectedBase = {
      revisionId: bootstrap.revision.revisionId,
      version: 1,
      digest: bootstrap.revision.digest,
    }
    const candidate = cloneDefault()
    candidate.page.footer.brand = 'One attempt, one revision'
    const attemptId = randomUUID()
    const input = {
      document: candidate,
      expectedBase,
      attemptId,
      savedByName: 'Alex Tan',
    }

    const [first, second] = await Promise.all([
      repository.publishRevision(input),
      repository.publishRevision(input),
    ])
    const history = await repository.listRevisionMetadata()

    expect(first.committed.revisionId).toBe(second.committed.revisionId)
    expect(history.items).toHaveLength(2)
  })

  it('rolls back a revision when advancing the head fails', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const failingRepository = createMyWorldFaqRepository(database, {
      afterRevisionInsert: () => {
        throw new Error('injected failure')
      },
    })
    const candidate = cloneDefault()
    candidate.page.footer.brand = 'This must never become public'

    await expect(
      failingRepository.publishRevision({
        document: candidate,
        expectedBase: {
          revisionId: bootstrap.revision.revisionId,
          version: 1,
          digest: bootstrap.revision.digest,
        },
        attemptId: randomUUID(),
        savedByName: 'Rollback Tester',
      }),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' })

    const current = await repository.loadPublicSnapshot()
    const history = await repository.listRevisionMetadata()
    expect(current.head.version).toBe(1)
    expect(history.items).toHaveLength(1)
  })

  it('keeps history append-only and restores an old snapshot as a new revision', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const changed = cloneDefault()
    changed.page.footer.brand = 'Changed before restore'
    const published = await repository.publishRevision({
      document: changed,
      expectedBase: {
        revisionId: bootstrap.revision.revisionId,
        version: 1,
        digest: bootstrap.revision.digest,
      },
      attemptId: randomUUID(),
      savedByName: 'Alex Tan',
    })
    const restored = await repository.publishRevision({
      document: bootstrap.revision.document,
      expectedBase: published.liveHead,
      attemptId: randomUUID(),
      savedByName: 'Jamie Lim',
      restoredFromRevisionId: bootstrap.revision.revisionId,
    })
    const history = await repository.listRevisionMetadata({ limit: 10 })

    expect(restored.committed.version).toBe(3)
    expect(restored.committed.restoredFromRevisionId).toBe(bootstrap.revision.revisionId)
    expect(history.items).toHaveLength(3)
    expect(history.items[0]).not.toHaveProperty('document')

    await expect(
      database.execute(sql`
        update my_world_faq_revisions
        set saved_by_name = 'tampered'
        where id = ${bootstrap.revision.revisionId}
      `),
    ).rejects.toMatchObject({ code: '55000' })
    await expect(
      database.execute(sql`
        delete from my_world_faq_revisions
        where id = ${bootstrap.revision.revisionId}
      `),
    ).rejects.toMatchObject({ code: '55000' })
  })

  it('stops when revisions exist without the singleton head', async () => {
    const repository = createMyWorldFaqRepository(database)
    const digest = await digestMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    await database.execute(sql`
      insert into my_world_faq_revisions (
        page_key,
        version,
        document,
        schema_version,
        structure_version,
        canonical_digest,
        attribution_kind,
        saved_by_name,
        attempt_id,
        request_fingerprint
      ) values (
        ${MY_WORLD_FAQ_PAGE_KEY},
        1,
        ${JSON.stringify(DEFAULT_MY_WORLD_FAQ_DOCUMENT)}::jsonb,
        1,
        1,
        ${digest},
        'system-import',
        null,
        ${randomUUID()},
        ${'1'.repeat(64)}
      )
    `)

    await expect(repository.bootstrapDefaultDocument()).rejects.toMatchObject({
      code: 'CORRUPT_STATE',
    })
  })

  it('creates revocable sessions and enforces the atomic mutation window', async () => {
    const repository = createMyWorldFaqRepository(database)
    const tokenDigest = 'a'.repeat(64)
    const credentialFingerprint = 'b'.repeat(64)
    const created = await repository.createEditorSession({
      tokenDigest,
      auditId: randomUUID(),
      displayName: 'FAQ Teammate',
      credentialFingerprint,
      absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1_000),
    })

    expect(created.displayName).toBe('FAQ Teammate')
    expect(
      await repository.resolveAndTouchEditorSession(tokenDigest, credentialFingerprint),
    ).not.toBeNull()
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await expect(repository.consumeEditorMutationPermit(tokenDigest)).resolves.toMatchObject({
        allowed: true,
        count: attempt,
      })
    }
    await expect(repository.consumeEditorMutationPermit(tokenDigest)).resolves.toEqual({
      allowed: false,
    })

    await expect(repository.revokeEditorSession(tokenDigest)).resolves.toBe(true)
    await expect(
      repository.resolveAndTouchEditorSession(tokenDigest, credentialFingerprint),
    ).resolves.toBeNull()
  })
})
