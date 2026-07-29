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

function headFromRevision(revision: { revisionId: string; version: number; digest: string }) {
  return {
    revisionId: revision.revisionId,
    version: revision.version,
    digest: revision.digest,
  }
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

  it('keeps a derived-cache write ordered with publication and skips stale snapshots', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const base = {
      revisionId: bootstrap.revision.revisionId,
      version: bootstrap.revision.version,
      digest: bootstrap.revision.digest,
    }

    let markCacheWriteStarted!: () => void
    const cacheWriteStarted = new Promise<void>((resolve) => {
      markCacheWriteStarted = resolve
    })
    let releaseCacheWrite!: () => void
    const cacheWriteGate = new Promise<void>((resolve) => {
      releaseCacheWrite = resolve
    })
    const guardedWrite = repository.runWhileCurrentHeadLocked(base, async () => {
      markCacheWriteStarted()
      await cacheWriteGate
    })
    await cacheWriteStarted

    const candidate = cloneDefault()
    candidate.page.footer.brand = 'Published after the guarded cache write'
    const publication = repository.publishRevision({
      document: candidate,
      expectedBase: base,
      attemptId: randomUUID(),
      savedByName: 'Alex Tan',
    })
    const publicationState = await Promise.race([
      publication.then(() => 'published' as const),
      new Promise<'blocked'>((resolve) => {
        setTimeout(() => resolve('blocked'), 40)
      }),
    ])
    expect(publicationState).toBe('blocked')

    releaseCacheWrite()
    await expect(guardedWrite).resolves.toBe(true)
    const published = await publication
    expect(published.committed.version).toBe(2)

    let staleWriteRan = false
    await expect(
      repository.runWhileCurrentHeadLocked(base, async () => {
        staleWriteRan = true
      }),
    ).resolves.toBe(false)
    expect(staleWriteRan).toBe(false)
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
      expectedBase: headFromRevision(first.live),
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
    expect(retry.live).toEqual(second.committed)
    expect(Object.keys(retry.live).sort()).toEqual([
      'attributionKind',
      'createdAt',
      'digest',
      'document',
      'restoredFromRevisionId',
      'revisionId',
      'savedByName',
      'schemaVersion',
      'structureVersion',
      'version',
    ])
    expect(current.head.revisionId).toBe(second.committed.revisionId)
  })

  it('fingerprints the unstamped intent so a retry is stable across database dates', async () => {
    const datePool = new Pool({ connectionString: databaseUrl, max: 1 })
    const dateDatabase = drizzle(datePool, { schema, casing: 'snake_case' })

    try {
      await datePool.query(`set time zone 'Pacific/Kiritimati'`)
      const repository = createMyWorldFaqRepository(dateDatabase)
      const bootstrap = await repository.bootstrapDefaultDocument()
      const question = bootstrap.revision.document.questions[0]
      if (!question) throw new Error('Expected a seeded FAQ question')
      const submitted = structuredClone(bootstrap.revision.document)
      submitted.questions[0] = {
        ...question,
        displayedQuestion: `${question.displayedQuestion} Please tell us what you think.`,
      }
      const firstDateResult = await datePool.query<{ reviewDate: string }>(
        `select current_date::text as "reviewDate"`,
      )
      const firstDate = firstDateResult.rows[0]?.reviewDate
      if (!firstDate) throw new Error('Expected the first PostgreSQL date')
      const input = {
        document: submitted,
        expectedBase: headFromRevision(bootstrap.revision),
        attemptId: randomUUID(),
        savedByName: 'Alex Tan',
      }

      const first = await repository.publishRevision(input)
      expect(first.committed.document.questions[0]?.review.lastReviewed).toBe(firstDate)

      await datePool.query(`set time zone 'America/Adak'`)
      const retryDateResult = await datePool.query<{ reviewDate: string }>(
        `select current_date::text as "reviewDate"`,
      )
      expect(retryDateResult.rows[0]?.reviewDate).not.toBe(firstDate)

      const retry = await repository.publishRevision(input)
      expect(retry).toEqual(first)
      expect(retry.committed.document.questions[0]?.review.lastReviewed).toBe(firstDate)
    } finally {
      await datePool.end()
    }
  })

  it('rejects reuse of an attempt for a different intent, saver, or base', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()
    const base = headFromRevision(bootstrap.revision)
    const firstDocument = cloneDefault()
    firstDocument.page.footer.brand = 'Original attempt wording'
    const attemptId = randomUUID()
    const first = await repository.publishRevision({
      document: firstDocument,
      expectedBase: base,
      attemptId,
      savedByName: 'Alex Tan',
    })

    const differentIntent = cloneDefault()
    differentIntent.page.footer.brand = 'Different attempt wording'
    await expect(
      repository.publishRevision({
        document: differentIntent,
        expectedBase: base,
        attemptId,
        savedByName: 'Alex Tan',
      }),
    ).rejects.toMatchObject({ code: 'ATTEMPT_REUSED' })
    await expect(
      repository.publishRevision({
        document: firstDocument,
        expectedBase: base,
        attemptId,
        savedByName: 'Jamie Lim',
      }),
    ).rejects.toMatchObject({ code: 'ATTEMPT_REUSED' })
    await expect(
      repository.publishRevision({
        document: first.live.document,
        expectedBase: headFromRevision(first.live),
        attemptId,
        savedByName: 'Alex Tan',
      }),
    ).rejects.toMatchObject({ code: 'ATTEMPT_REUSED' })

    await expect(
      repository.publishRevision({
        document: bootstrap.revision.document,
        expectedBase: base,
        attemptId: randomUUID(),
        savedByName: 'Alex Tan',
      }),
    ).rejects.toMatchObject({ code: 'STALE_HEAD' })
  })

  it('rejects a current-head no-op without appending a revision', async () => {
    const repository = createMyWorldFaqRepository(database)
    const bootstrap = await repository.bootstrapDefaultDocument()

    await expect(
      repository.publishRevision({
        document: bootstrap.revision.document,
        expectedBase: headFromRevision(bootstrap.revision),
        attemptId: randomUUID(),
        savedByName: 'Alex Tan',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })

    const history = await repository.listRevisionMetadata()
    expect(history.items).toHaveLength(1)
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
      expectedBase: headFromRevision(published.live),
      attemptId: randomUUID(),
      savedByName: 'Jamie Lim',
      restoredFromRevisionId: bootstrap.revision.revisionId,
    })
    const history = await repository.listRevisionMetadata({ limit: 10 })

    expect(restored.committed.version).toBe(3)
    expect(restored.committed.restoredFromRevisionId).toBe(bootstrap.revision.revisionId)
    expect(restored.committed.document).toEqual(bootstrap.revision.document)
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
    const beforeResolve = await database.execute<
      Record<string, unknown> & { rowVersion: string }
    >(sql`
      select xmin::text as "rowVersion"
      from my_world_faq_editor_sessions
      where token_digest = ${tokenDigest}
    `)
    expect(
      await repository.resolveAndTouchEditorSession(tokenDigest, credentialFingerprint),
    ).not.toBeNull()
    const afterFreshResolve = await database.execute<
      Record<string, unknown> & { rowVersion: string }
    >(sql`
      select xmin::text as "rowVersion"
      from my_world_faq_editor_sessions
      where token_digest = ${tokenDigest}
    `)
    expect(afterFreshResolve.rows[0]?.rowVersion).toBe(beforeResolve.rows[0]?.rowVersion)

    await database.execute(sql`
      update my_world_faq_editor_sessions
      set
        created_at = now() - interval '10 minutes',
        mutation_window_started_at = now() - interval '10 minutes',
        last_seen_at = now() - interval '6 minutes'
      where token_digest = ${tokenDigest}
    `)
    const beforeDueTouch = await database.execute<
      Record<string, unknown> & { rowVersion: string }
    >(sql`
      select xmin::text as "rowVersion"
      from my_world_faq_editor_sessions
      where token_digest = ${tokenDigest}
    `)
    expect(
      await repository.resolveAndTouchEditorSession(tokenDigest, credentialFingerprint),
    ).not.toBeNull()
    const afterDueTouch = await database.execute<
      Record<string, unknown> & { rowVersion: string }
    >(sql`
      select xmin::text as "rowVersion"
      from my_world_faq_editor_sessions
      where token_digest = ${tokenDigest}
    `)
    expect(afterDueTouch.rows[0]?.rowVersion).not.toBe(beforeDueTouch.rows[0]?.rowVersion)

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
