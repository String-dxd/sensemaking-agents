import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import {
  canonicalizeMyWorldFaqDocument,
  DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  digestMyWorldFaqDocument,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  type MyWorldFaqEditorialDocument,
  prepareMyWorldFaqEditorialIntent,
  stampMyWorldFaqEditorialIntent,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'
import { type AppDatabase, type AppTransaction, getMyWorldFaqSystemDatabase } from '~/db/client'

export const MY_WORLD_FAQ_PAGE_KEY = 'my-world-faq' as const

export type MyWorldFaqRepositoryErrorCode =
  | 'UNINITIALIZED'
  | 'CORRUPT_STATE'
  | 'INVALID_DOCUMENT'
  | 'REVISION_NOT_FOUND'
  | 'STALE_HEAD'
  | 'ATTEMPT_REUSED'
  | 'RESTORE_MISMATCH'
  | 'DATABASE_UNAVAILABLE'
  | 'PERSISTENCE_FAILED'

export class MyWorldFaqRepositoryError extends Error {
  readonly code: MyWorldFaqRepositoryErrorCode

  constructor(code: MyWorldFaqRepositoryErrorCode, options?: { cause?: unknown }) {
    super(publicMessageForCode(code), options)
    this.name = 'MyWorldFaqRepositoryError'
    this.code = code
  }
}

export interface MyWorldFaqHeadRef {
  revisionId: string
  version: number
  digest: string
}

export interface MyWorldFaqRevisionMetadata extends MyWorldFaqHeadRef {
  schemaVersion: number
  structureVersion: number
  attributionKind: 'self-declared' | 'system-import'
  savedByName: string | null
  createdAt: string
  restoredFromRevisionId: string | null
}

export interface MyWorldFaqRevisionSnapshot extends MyWorldFaqRevisionMetadata {
  document: MyWorldFaqEditorialDocument
}

export interface MyWorldFaqPublicSnapshot {
  head: MyWorldFaqHeadRef
  schemaVersion: number
  structureVersion: number
  document: MyWorldFaqEditorialDocument
}

export interface PublishMyWorldFaqRevisionInput {
  document: unknown
  expectedBase: MyWorldFaqHeadRef
  attemptId: string
  savedByName: string
  restoredFromRevisionId?: string
}

export interface PublishMyWorldFaqRevisionResult {
  outcome: 'committed' | 'committed-but-superseded'
  committed: MyWorldFaqRevisionSnapshot
  live: MyWorldFaqRevisionSnapshot
}

export interface MyWorldFaqHistoryPage {
  items: MyWorldFaqRevisionMetadata[]
  nextBeforeVersion: number | null
}

export interface MyWorldFaqEditorSessionRow extends Record<string, unknown> {
  tokenDigest: string
  auditId: string
  displayName: string
  credentialFingerprint: string
  createdAt: string
  lastSeenAt: string
  absoluteExpiresAt: string
  revokedAt: string | null
  mutationWindowStartedAt: string
  mutationCount: number
}

export interface CreateMyWorldFaqEditorSessionInput {
  tokenDigest: string
  auditId: string
  displayName: string
  credentialFingerprint: string
  absoluteExpiresAt: Date
}

type FaqDatabaseExecutor = Pick<AppDatabase, 'execute'> | Pick<AppTransaction, 'execute'>

interface HeadRow extends Record<string, unknown> {
  revisionId: string
  version: number
  digest: string
}

interface RevisionRow extends Record<string, unknown> {
  revisionId: string
  version: number
  document: unknown
  schemaVersion: number
  structureVersion: number
  digest: string
  attributionKind: string
  savedByName: string | null
  createdAt: unknown
  restoredFromRevisionId: string | null
  attemptId: string
  requestFingerprint: string
}

interface RevisionMetadataRow extends Record<string, unknown> {
  revisionId: string
  version: number
  schemaVersion: number
  structureVersion: number
  digest: string
  attributionKind: string
  savedByName: string | null
  createdAt: unknown
  restoredFromRevisionId: string | null
}

interface BootstrapStateRow extends Record<string, unknown> {
  revisionCount: string | number
  minimumVersion: number | null
  maximumVersion: number | null
}

interface RepositoryHooks {
  afterRevisionInsert?: () => void | Promise<void>
}

type PreparedPublication =
  | {
      operation: 'publish'
      requestFingerprint: string
      intentDocument: MyWorldFaqEditorialDocument
      dirtyPaths: string[]
      rejection?: 'INVALID_DOCUMENT'
    }
  | {
      operation: 'restore'
      requestFingerprint: string
      document: MyWorldFaqEditorialDocument
    }

export function createMyWorldFaqRepository(database: AppDatabase, hooks: RepositoryHooks = {}) {
  async function loadPublicSnapshot(): Promise<MyWorldFaqPublicSnapshot> {
    try {
      const row = await loadCurrentJoinedRow(database)
      if (!row) throw new MyWorldFaqRepositoryError('UNINITIALIZED')
      const revision = await hydrateRevisionRow(row)
      return {
        head: headFromRevision(revision),
        schemaVersion: revision.schemaVersion,
        structureVersion: revision.structureVersion,
        document: revision.document,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function loadEditorSnapshot(): Promise<MyWorldFaqRevisionSnapshot> {
    try {
      const row = await loadCurrentJoinedRow(database)
      if (!row) throw new MyWorldFaqRepositoryError('UNINITIALIZED')
      return await hydrateRevisionRow(row)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function runWhileCurrentHeadLocked(
    expectedHead: MyWorldFaqHeadRef,
    operation: () => Promise<void>,
  ): Promise<boolean> {
    try {
      return await database.transaction(async (tx) => {
        const lockedHead = await lockCurrentHead(tx)
        if (!lockedHead) throw new MyWorldFaqRepositoryError('UNINITIALIZED')
        if (!sameHead(lockedHead, expectedHead)) return false

        // Keep the singleton head locked through the derived-cache write.
        // A publication cannot advance the head and populate a newer cache
        // entry while an older request is still able to write afterward.
        await operation()
        return true
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function publishRevision(
    input: PublishMyWorldFaqRevisionInput,
  ): Promise<PublishMyWorldFaqRevisionResult> {
    validatePublishInput(input)
    const submitted = normalizeCandidate(input.document)

    try {
      const prepared = await preparePublication(database, input, submitted)

      return await database.transaction(async (tx) => {
        const beforeLock = await loadRevisionByAttempt(tx, input.attemptId)
        if (beforeLock) {
          return resolveCommittedAttempt(tx, beforeLock, prepared.requestFingerprint)
        }

        const lockedHead = await lockCurrentHead(tx)
        if (!lockedHead) throw new MyWorldFaqRepositoryError('UNINITIALIZED')

        const afterLock = await loadRevisionByAttempt(tx, input.attemptId)
        if (afterLock) {
          return resolveCommittedAttempt(tx, afterLock, prepared.requestFingerprint)
        }

        if (!sameHead(lockedHead, input.expectedBase)) {
          throw new MyWorldFaqRepositoryError('STALE_HEAD')
        }
        if (prepared.operation === 'publish' && prepared.rejection) {
          throw new MyWorldFaqRepositoryError(prepared.rejection)
        }

        let candidate: MyWorldFaqEditorialDocument
        if (prepared.operation === 'restore') {
          // Restores are exact snapshots. In particular, their accountable
          // review dates belong to the selected revision and must not be
          // replaced by the date of the restore operation.
          candidate = prepared.document
        } else {
          // PostgreSQL supplies the accountable date only after the singleton
          // head is locked. The unstamped intent was fingerprinted above, so a
          // retry remains the same request even when current_date has rolled.
          const reviewDateResult = await tx.execute<
            Record<string, unknown> & { reviewDate: string }
          >(sql`select current_date::text as "reviewDate"`)
          const reviewDate = reviewDateResult.rows[0]?.reviewDate
          if (!reviewDate) throw new MyWorldFaqRepositoryError('PERSISTENCE_FAILED')
          const stamped = stampMyWorldFaqEditorialIntent({
            intentDocument: prepared.intentDocument,
            dirtyPaths: prepared.dirtyPaths,
            reviewDate,
          })
          if (!stamped.success) throw new MyWorldFaqRepositoryError('INVALID_DOCUMENT')
          candidate = normalizeCandidate(stamped.document)
        }

        const canonical = canonicalizeMyWorldFaqDocument(candidate)
        const candidateDigest = await digestMyWorldFaqDocument(candidate)
        const nextVersion = lockedHead.version + 1
        const inserted = await tx.execute<RevisionRow>(sql`
          insert into my_world_faq_revisions (
            page_key,
            version,
            document,
            schema_version,
            structure_version,
            canonical_digest,
            attribution_kind,
            saved_by_name,
            restored_from_revision_id,
            attempt_id,
            request_fingerprint
          ) values (
            ${MY_WORLD_FAQ_PAGE_KEY},
            ${nextVersion},
            ${canonical}::jsonb,
            ${candidate.schemaVersion},
            ${candidate.structureVersion},
            ${candidateDigest},
            'self-declared',
            ${input.savedByName},
            ${input.restoredFromRevisionId ?? null},
            ${input.attemptId},
            ${prepared.requestFingerprint}
          )
          returning
            id as "revisionId",
            version,
            document,
            schema_version as "schemaVersion",
            structure_version as "structureVersion",
            canonical_digest as digest,
            attribution_kind as "attributionKind",
            saved_by_name as "savedByName",
            created_at as "createdAt",
            restored_from_revision_id as "restoredFromRevisionId",
            attempt_id as "attemptId",
            request_fingerprint as "requestFingerprint"
        `)
        const insertedRow = inserted.rows[0]
        if (!insertedRow) throw new MyWorldFaqRepositoryError('PERSISTENCE_FAILED')

        await hooks.afterRevisionInsert?.()

        const advanced = await tx.execute(sql`
          update my_world_faq_heads
          set
            current_revision_id = ${insertedRow.revisionId},
            current_version = ${nextVersion},
            current_digest = ${candidateDigest},
            updated_at = now()
          where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
            and current_revision_id = ${lockedHead.revisionId}
            and current_version = ${lockedHead.version}
            and current_digest = ${lockedHead.digest}
        `)
        if (advanced.rowCount !== 1) {
          throw new MyWorldFaqRepositoryError('STALE_HEAD')
        }

        const committed = await hydrateRevisionRow(insertedRow)
        return {
          outcome: 'committed' as const,
          committed,
          live: committed,
        }
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function listRevisionMetadata(
    options: { beforeVersion?: number; limit?: number } = {},
  ): Promise<MyWorldFaqHistoryPage> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
    const beforeVersion = options.beforeVersion ?? 2_147_483_647
    try {
      const result = await database.execute<RevisionMetadataRow>(
        sql`
          select
            id as "revisionId",
            version,
            schema_version as "schemaVersion",
            structure_version as "structureVersion",
            canonical_digest as digest,
            attribution_kind as "attributionKind",
            saved_by_name as "savedByName",
            created_at as "createdAt",
            restored_from_revision_id as "restoredFromRevisionId"
          from my_world_faq_revisions
          where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
            and version < ${beforeVersion}
          order by version desc
          limit ${limit + 1}
        `,
      )
      const hasMore = result.rows.length > limit
      const rows = result.rows.slice(0, limit)
      const items = rows.map(metadataFromRow)
      return {
        items,
        nextBeforeVersion: hasMore ? (items.at(-1)?.version ?? null) : null,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function loadRevision(revisionId: string): Promise<MyWorldFaqRevisionSnapshot> {
    assertUuid(revisionId, 'REVISION_NOT_FOUND')
    try {
      const row = await loadRevisionRow(database, revisionId)
      if (!row) throw new MyWorldFaqRepositoryError('REVISION_NOT_FOUND')
      return await hydrateRevisionRow(row)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function bootstrapDefaultDocument(): Promise<{
    created: boolean
    revision: MyWorldFaqRevisionSnapshot
  }> {
    const candidate = normalizeCandidate(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
    const canonical = canonicalizeMyWorldFaqDocument(candidate)
    const digest = await digestMyWorldFaqDocument(candidate)

    try {
      return await database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`my-world-faq-bootstrap:${MY_WORLD_FAQ_PAGE_KEY}`}, 0))`,
        )

        // Existing publishers lock the same singleton row. Take that lock
        // before reading aggregate state so a healthy concurrent publication
        // cannot look like a version/count mismatch.
        const head = await lockCurrentHead(tx)
        const aggregateResult = await tx.execute<BootstrapStateRow>(sql`
          select
            count(*) as "revisionCount",
            min(version)::int as "minimumVersion",
            max(version)::int as "maximumVersion"
          from my_world_faq_revisions
          where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
        `)
        const aggregate = aggregateResult.rows[0]
        if (!aggregate) throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
        const revisionCount = Number(aggregate.revisionCount)

        if (revisionCount === 0 && !head) {
          const attemptId = randomUUID()
          const fingerprint = sha256(
            JSON.stringify([1, 'bootstrap', MY_WORLD_FAQ_PAGE_KEY, digest]),
          )
          const inserted = await tx.execute<RevisionRow>(sql`
            insert into my_world_faq_revisions (
              page_key,
              version,
              document,
              schema_version,
              structure_version,
              canonical_digest,
              attribution_kind,
              saved_by_name,
              restored_from_revision_id,
              attempt_id,
              request_fingerprint
            ) values (
              ${MY_WORLD_FAQ_PAGE_KEY},
              1,
              ${canonical}::jsonb,
              ${candidate.schemaVersion},
              ${candidate.structureVersion},
              ${digest},
              'system-import',
              null,
              null,
              ${attemptId},
              ${fingerprint}
            )
            returning
              id as "revisionId",
              version,
              document,
              schema_version as "schemaVersion",
              structure_version as "structureVersion",
              canonical_digest as digest,
              attribution_kind as "attributionKind",
              saved_by_name as "savedByName",
              created_at as "createdAt",
              restored_from_revision_id as "restoredFromRevisionId",
              attempt_id as "attemptId",
              request_fingerprint as "requestFingerprint"
          `)
          const insertedRow = inserted.rows[0]
          if (!insertedRow) throw new MyWorldFaqRepositoryError('PERSISTENCE_FAILED')
          await tx.execute(sql`
            insert into my_world_faq_heads (
              page_key,
              current_revision_id,
              current_version,
              current_digest
            ) values (
              ${MY_WORLD_FAQ_PAGE_KEY},
              ${insertedRow.revisionId},
              1,
              ${digest}
            )
          `)
          return { created: true, revision: await hydrateRevisionRow(insertedRow) }
        }

        if (
          revisionCount === 0 ||
          !head ||
          aggregate.minimumVersion !== 1 ||
          aggregate.maximumVersion !== revisionCount ||
          head.version !== aggregate.maximumVersion
        ) {
          throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
        }

        const current = await loadCurrentJoinedRow(tx)
        if (!current) throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
        const revision = await hydrateRevisionRow(current)
        if (!sameHead(head, headFromRevision(revision))) {
          throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
        }
        return { created: false, revision }
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function createEditorSession(
    input: CreateMyWorldFaqEditorSessionInput,
  ): Promise<MyWorldFaqEditorSessionRow> {
    try {
      const result = await database.execute<MyWorldFaqEditorSessionRow>(sql`
        insert into my_world_faq_editor_sessions (
          token_digest,
          audit_id,
          display_name,
          credential_fingerprint,
          absolute_expires_at
        ) values (
          ${input.tokenDigest},
          ${input.auditId},
          ${input.displayName},
          ${input.credentialFingerprint},
          ${input.absoluteExpiresAt.toISOString()}
        )
        returning ${sessionReturningColumns()}
      `)
      const row = result.rows[0]
      if (!row) throw new MyWorldFaqRepositoryError('PERSISTENCE_FAILED')
      return normalizeSessionRow(row)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function resolveAndTouchEditorSession(
    tokenDigest: string,
    credentialFingerprint: string,
  ): Promise<MyWorldFaqEditorSessionRow | null> {
    try {
      return await database.transaction(async (tx) => {
        const selected = await tx.execute<MyWorldFaqEditorSessionRow & { touchDue: boolean }>(sql`
          select
            ${sessionReturningColumns()},
            last_seen_at <= now() - interval '5 minutes' as "touchDue"
          from my_world_faq_editor_sessions
          where token_digest = ${tokenDigest}
            and credential_fingerprint = ${credentialFingerprint}
            and revoked_at is null
            and absolute_expires_at > now()
            and last_seen_at > now() - interval '30 minutes'
          for update
        `)
        const row = selected.rows[0]
        if (!row) return null
        const normalized = normalizeSessionRow(row)
        if (!row.touchDue) return normalized

        const touched = await tx.execute<MyWorldFaqEditorSessionRow>(sql`
          update my_world_faq_editor_sessions
          set last_seen_at = now()
          where token_digest = ${tokenDigest}
            and credential_fingerprint = ${credentialFingerprint}
            and revoked_at is null
            and absolute_expires_at > now()
            and last_seen_at > now() - interval '30 minutes'
          returning ${sessionReturningColumns()}
        `)
        const touchedRow = touched.rows[0]
        return touchedRow ? normalizeSessionRow(touchedRow) : null
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function revokeEditorSession(tokenDigest: string): Promise<boolean> {
    try {
      const result = await database.execute(sql`
        update my_world_faq_editor_sessions
        set revoked_at = coalesce(revoked_at, now())
        where token_digest = ${tokenDigest}
          and revoked_at is null
      `)
      return result.rowCount === 1
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function pruneEditorSessions(): Promise<number> {
    try {
      const result = await database.execute(sql`
        with doomed as (
          select token_digest
          from my_world_faq_editor_sessions
          where
            absolute_expires_at < now() - interval '30 days'
            or revoked_at < now() - interval '30 days'
          order by coalesce(revoked_at, absolute_expires_at)
          limit 100
        )
        delete from my_world_faq_editor_sessions as sessions
        using doomed
        where sessions.token_digest = doomed.token_digest
      `)
      return result.rowCount ?? 0
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async function consumeEditorMutationPermit(
    tokenDigest: string,
  ): Promise<{ allowed: true; count: number; windowStartedAt: string } | { allowed: false }> {
    try {
      const result = await database.execute<{
        count: number
        windowStartedAt: unknown
      }>(sql`
        update my_world_faq_editor_sessions
        set
          mutation_window_started_at = case
            when mutation_window_started_at <= now() - interval '10 minutes' then now()
            else mutation_window_started_at
          end,
          mutation_count = case
            when mutation_window_started_at <= now() - interval '10 minutes' then 1
            else mutation_count + 1
          end
        where token_digest = ${tokenDigest}
          and revoked_at is null
          and absolute_expires_at > now()
          and last_seen_at > now() - interval '30 minutes'
          and (
            mutation_window_started_at <= now() - interval '10 minutes'
            or mutation_count < 10
          )
        returning
          mutation_count as count,
          mutation_window_started_at as "windowStartedAt"
      `)
      const row = result.rows[0]
      if (!row) return { allowed: false }
      return {
        allowed: true,
        count: row.count,
        windowStartedAt: toIsoString(row.windowStartedAt),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  return {
    bootstrapDefaultDocument,
    consumeEditorMutationPermit,
    createEditorSession,
    listRevisionMetadata,
    loadEditorSnapshot,
    loadPublicSnapshot,
    loadRevision,
    pruneEditorSessions,
    publishRevision,
    resolveAndTouchEditorSession,
    revokeEditorSession,
    runWhileCurrentHeadLocked,
  }
}

let defaultRepository: ReturnType<typeof createMyWorldFaqRepository> | null = null

function getDefaultRepository() {
  defaultRepository ??= createMyWorldFaqRepository(getMyWorldFaqSystemDatabase())
  return defaultRepository
}

export const bootstrapMyWorldFaq = () => getDefaultRepository().bootstrapDefaultDocument()
export const loadCurrentMyWorldFaqRevision = () => getDefaultRepository().loadPublicSnapshot()
export const loadMyWorldFaqEditorRevision = () => getDefaultRepository().loadEditorSnapshot()
export const publishMyWorldFaqRevision = (input: PublishMyWorldFaqRevisionInput) =>
  getDefaultRepository().publishRevision(input)
export const listMyWorldFaqRevisionMetadata = (options?: {
  beforeVersion?: number
  limit?: number
}) => getDefaultRepository().listRevisionMetadata(options)
export const loadMyWorldFaqRevision = (revisionId: string) =>
  getDefaultRepository().loadRevision(revisionId)
export const createMyWorldFaqEditorSession = (input: CreateMyWorldFaqEditorSessionInput) =>
  getDefaultRepository().createEditorSession(input)
export const resolveAndTouchMyWorldFaqEditorSession = (
  tokenDigest: string,
  credentialFingerprint: string,
) => getDefaultRepository().resolveAndTouchEditorSession(tokenDigest, credentialFingerprint)
export const revokeMyWorldFaqEditorSession = (tokenDigest: string) =>
  getDefaultRepository().revokeEditorSession(tokenDigest)
export const pruneMyWorldFaqEditorSessions = () => getDefaultRepository().pruneEditorSessions()
export const consumeMyWorldFaqEditorMutationPermit = (tokenDigest: string) =>
  getDefaultRepository().consumeEditorMutationPermit(tokenDigest)
export const runWhileCurrentMyWorldFaqHeadLocked = (
  expectedHead: MyWorldFaqHeadRef,
  operation: () => Promise<void>,
) => getDefaultRepository().runWhileCurrentHeadLocked(expectedHead, operation)

async function resolveCommittedAttempt(
  tx: AppTransaction,
  row: RevisionRow,
  requestFingerprint: string,
): Promise<PublishMyWorldFaqRevisionResult> {
  if (row.requestFingerprint !== requestFingerprint) {
    throw new MyWorldFaqRepositoryError('ATTEMPT_REUSED')
  }
  const committed = await hydrateRevisionRow(row)
  const liveRow = await loadCurrentJoinedRow(tx)
  if (!liveRow) throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
  const live = await hydrateRevisionRow(liveRow)
  return {
    outcome: live.revisionId === committed.revisionId ? 'committed' : 'committed-but-superseded',
    committed,
    live,
  }
}

async function preparePublication(
  database: AppDatabase,
  input: PublishMyWorldFaqRevisionInput,
  submitted: MyWorldFaqEditorialDocument,
): Promise<PreparedPublication> {
  if (input.restoredFromRevisionId) {
    const restoreSourceRow = await loadRevisionRow(database, input.restoredFromRevisionId)
    if (!restoreSourceRow) throw new MyWorldFaqRepositoryError('REVISION_NOT_FOUND')
    const restoreSource = await hydrateRevisionRow(restoreSourceRow)
    if (restoreSource.digest !== (await digestMyWorldFaqDocument(submitted))) {
      throw new MyWorldFaqRepositoryError('RESTORE_MISMATCH')
    }

    const canonicalTarget = canonicalizeMyWorldFaqDocument(restoreSource.document)
    return {
      operation: 'restore',
      document: restoreSource.document,
      requestFingerprint: publicationRequestFingerprint({
        operation: 'restore',
        expectedBase: input.expectedBase,
        canonicalIntent: canonicalTarget,
        restoredFromRevisionId: restoreSource.revisionId,
        savedByName: input.savedByName,
      }),
    }
  }

  const expectedBaseRow = await loadRevisionRow(database, input.expectedBase.revisionId)
  if (!expectedBaseRow) throw new MyWorldFaqRepositoryError('STALE_HEAD')
  const expectedBase = await hydrateRevisionRow(expectedBaseRow)
  const intent = prepareMyWorldFaqEditorialIntent({
    base: expectedBase.document,
    submitted,
  })
  if (!intent.success) {
    if (intent.reason !== 'no_op') throw new MyWorldFaqRepositoryError('INVALID_DOCUMENT')
    const intentDocument = expectedBase.document
    return {
      operation: 'publish',
      intentDocument,
      dirtyPaths: [],
      rejection: 'INVALID_DOCUMENT',
      requestFingerprint: publicationRequestFingerprint({
        operation: 'publish',
        expectedBase: input.expectedBase,
        canonicalIntent: canonicalizeMyWorldFaqDocument(intentDocument),
        restoredFromRevisionId: null,
        savedByName: input.savedByName,
      }),
    }
  }

  return {
    operation: 'publish',
    intentDocument: intent.intentDocument,
    dirtyPaths: intent.dirtyPaths,
    requestFingerprint: publicationRequestFingerprint({
      operation: 'publish',
      expectedBase: input.expectedBase,
      canonicalIntent: canonicalizeMyWorldFaqDocument(intent.intentDocument),
      restoredFromRevisionId: null,
      savedByName: input.savedByName,
    }),
  }
}

function publicationRequestFingerprint(input: {
  operation: 'publish' | 'restore'
  expectedBase: MyWorldFaqHeadRef
  canonicalIntent: string
  restoredFromRevisionId: string | null
  savedByName: string
}): string {
  return sha256(
    JSON.stringify([
      2,
      input.operation,
      MY_WORLD_FAQ_PAGE_KEY,
      [input.expectedBase.revisionId, input.expectedBase.version, input.expectedBase.digest],
      input.canonicalIntent,
      input.restoredFromRevisionId,
      ['self-declared', input.savedByName],
    ]),
  )
}

async function loadCurrentJoinedRow(db: FaqDatabaseExecutor): Promise<RevisionRow | null> {
  const result = await db.execute<RevisionRow>(sql`
    select
      revisions.id as "revisionId",
      revisions.version,
      revisions.document,
      revisions.schema_version as "schemaVersion",
      revisions.structure_version as "structureVersion",
      revisions.canonical_digest as digest,
      revisions.attribution_kind as "attributionKind",
      revisions.saved_by_name as "savedByName",
      revisions.created_at as "createdAt",
      revisions.restored_from_revision_id as "restoredFromRevisionId",
      revisions.attempt_id as "attemptId",
      revisions.request_fingerprint as "requestFingerprint"
    from my_world_faq_heads as heads
    inner join my_world_faq_revisions as revisions
      on revisions.page_key = heads.page_key
      and revisions.id = heads.current_revision_id
      and revisions.version = heads.current_version
      and revisions.canonical_digest = heads.current_digest
    where heads.page_key = ${MY_WORLD_FAQ_PAGE_KEY}
    limit 1
  `)
  return result.rows[0] ?? null
}

async function lockCurrentHead(tx: AppTransaction): Promise<MyWorldFaqHeadRef | null> {
  const result = await tx.execute<HeadRow>(sql`
    select
      current_revision_id as "revisionId",
      current_version as version,
      current_digest as digest
    from my_world_faq_heads
    where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
    for update
  `)
  return result.rows[0] ?? null
}

async function loadRevisionByAttempt(
  db: FaqDatabaseExecutor,
  attemptId: string,
): Promise<RevisionRow | null> {
  const result = await db.execute<RevisionRow>(sql`
    select ${revisionReturningColumns()}
    from my_world_faq_revisions
    where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
      and attempt_id = ${attemptId}
    limit 1
  `)
  return result.rows[0] ?? null
}

async function loadRevisionRow(
  db: FaqDatabaseExecutor,
  revisionId: string,
): Promise<RevisionRow | null> {
  const result = await db.execute<RevisionRow>(sql`
    select ${revisionReturningColumns()}
    from my_world_faq_revisions
    where page_key = ${MY_WORLD_FAQ_PAGE_KEY}
      and id = ${revisionId}
    limit 1
  `)
  return result.rows[0] ?? null
}

function revisionReturningColumns() {
  return sql`
    id as "revisionId",
    version,
    document,
    schema_version as "schemaVersion",
    structure_version as "structureVersion",
    canonical_digest as digest,
    attribution_kind as "attributionKind",
    saved_by_name as "savedByName",
    created_at as "createdAt",
    restored_from_revision_id as "restoredFromRevisionId",
    attempt_id as "attemptId",
    request_fingerprint as "requestFingerprint"
  `
}

function sessionReturningColumns() {
  return sql`
    token_digest as "tokenDigest",
    audit_id as "auditId",
    display_name as "displayName",
    credential_fingerprint as "credentialFingerprint",
    created_at as "createdAt",
    last_seen_at as "lastSeenAt",
    absolute_expires_at as "absoluteExpiresAt",
    revoked_at as "revokedAt",
    mutation_window_started_at as "mutationWindowStartedAt",
    mutation_count as "mutationCount"
  `
}

function normalizeCandidate(input: unknown): MyWorldFaqEditorialDocument {
  const validation = validateMyWorldFaqDocument(input)
  if (!validation.success) {
    throw new MyWorldFaqRepositoryError('INVALID_DOCUMENT')
  }
  return JSON.parse(
    canonicalizeMyWorldFaqDocument(validation.document),
  ) as MyWorldFaqEditorialDocument
}

async function hydrateRevisionRow(row: RevisionRow): Promise<MyWorldFaqRevisionSnapshot> {
  let document: MyWorldFaqEditorialDocument
  try {
    document = normalizeCandidate(row.document)
  } catch (error) {
    if (error instanceof MyWorldFaqRepositoryError && error.code === 'INVALID_DOCUMENT') {
      throw new MyWorldFaqRepositoryError('CORRUPT_STATE', { cause: error })
    }
    throw error
  }
  const recomputed = await digestMyWorldFaqDocument(document)
  if (
    row.digest !== recomputed ||
    row.schemaVersion !== document.schemaVersion ||
    row.structureVersion !== document.structureVersion ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    (row.attributionKind !== 'self-declared' && row.attributionKind !== 'system-import')
  ) {
    throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
  }
  return {
    revisionId: row.revisionId,
    version: row.version,
    digest: row.digest,
    schemaVersion: row.schemaVersion,
    structureVersion: row.structureVersion,
    attributionKind: row.attributionKind,
    savedByName: row.savedByName,
    createdAt: toIsoString(row.createdAt),
    restoredFromRevisionId: row.restoredFromRevisionId,
    document,
  }
}

function metadataFromRow(row: RevisionMetadataRow): MyWorldFaqRevisionMetadata {
  if (row.attributionKind !== 'self-declared' && row.attributionKind !== 'system-import') {
    throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
  }
  return {
    revisionId: row.revisionId,
    version: row.version,
    digest: row.digest,
    schemaVersion: row.schemaVersion,
    structureVersion: row.structureVersion,
    attributionKind: row.attributionKind,
    savedByName: row.savedByName,
    createdAt: toIsoString(row.createdAt),
    restoredFromRevisionId: row.restoredFromRevisionId,
  }
}

function normalizeSessionRow(row: MyWorldFaqEditorSessionRow): MyWorldFaqEditorSessionRow {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    lastSeenAt: toIsoString(row.lastSeenAt),
    absoluteExpiresAt: toIsoString(row.absoluteExpiresAt),
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
    mutationWindowStartedAt: toIsoString(row.mutationWindowStartedAt),
  }
}

function validatePublishInput(input: PublishMyWorldFaqRevisionInput) {
  assertUuid(input.attemptId, 'ATTEMPT_REUSED')
  assertUuid(input.expectedBase.revisionId, 'STALE_HEAD')
  if (input.restoredFromRevisionId) assertUuid(input.restoredFromRevisionId, 'REVISION_NOT_FOUND')
  if (
    !Number.isInteger(input.expectedBase.version) ||
    input.expectedBase.version < 1 ||
    !/^[0-9a-f]{64}$/.test(input.expectedBase.digest) ||
    input.savedByName !== input.savedByName.trim() ||
    input.savedByName.length < 1 ||
    [...input.savedByName].length > 80
  ) {
    throw new MyWorldFaqRepositoryError('INVALID_DOCUMENT')
  }
}

function assertUuid(value: string, code: MyWorldFaqRepositoryErrorCode) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MyWorldFaqRepositoryError(code)
  }
}

function sameHead(left: MyWorldFaqHeadRef, right: MyWorldFaqHeadRef): boolean {
  return (
    left.revisionId === right.revisionId &&
    left.version === right.version &&
    left.digest === right.digest
  )
}

function headFromRevision(revision: MyWorldFaqRevisionMetadata): MyWorldFaqHeadRef {
  return {
    revisionId: revision.revisionId,
    version: revision.version,
    digest: revision.digest,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function toIsoString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.valueOf())) throw new MyWorldFaqRepositoryError('CORRUPT_STATE')
  return date.toISOString()
}

function publicMessageForCode(code: MyWorldFaqRepositoryErrorCode): string {
  switch (code) {
    case 'UNINITIALIZED':
      return 'The FAQ content has not been initialized.'
    case 'INVALID_DOCUMENT':
      return 'The FAQ document is invalid.'
    case 'REVISION_NOT_FOUND':
      return 'The requested FAQ revision was not found.'
    case 'STALE_HEAD':
      return 'The FAQ changed since this copy was loaded.'
    case 'ATTEMPT_REUSED':
      return 'This publication attempt cannot be reused.'
    case 'RESTORE_MISMATCH':
      return 'The selected FAQ revision does not match the restore request.'
    case 'DATABASE_UNAVAILABLE':
      return 'The FAQ database is temporarily unavailable.'
    case 'CORRUPT_STATE':
    case 'PERSISTENCE_FAILED':
      return 'The FAQ repository could not complete the request.'
  }
}

function mapRepositoryError(error: unknown): MyWorldFaqRepositoryError {
  if (error instanceof MyWorldFaqRepositoryError) return error
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  if (
    code.startsWith('08') ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  ) {
    return new MyWorldFaqRepositoryError('DATABASE_UNAVAILABLE', { cause: error })
  }
  return new MyWorldFaqRepositoryError('PERSISTENCE_FAILED', { cause: error })
}

export const MY_WORLD_FAQ_REPOSITORY_VERSIONS = {
  schema: MY_WORLD_FAQ_SCHEMA_VERSION,
  structure: MY_WORLD_FAQ_STRUCTURE_VERSION,
} as const
