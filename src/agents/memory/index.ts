/**
 * Per-student memory store writes — Step 10 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * Each student owns one Anthropic memory store (`memstore_...`) mounted at
 * `/mnt/memory/` in the agent's container. Server-side helpers — Mirror's
 * post-run student-voice append, Connector's rejected-diff capture,
 * Cartographer's pedagogical-state + exploratory-threads writes — go through
 * `appendStudentMemory` here.
 *
 * Two non-obvious invariants:
 *
 *   1. `appendStudentMemory` opens its OWN Postgres transaction, separate
 *      from the caller's `withStudent` envelope. Holding the advisory lock
 *      for the 60–800s of a Cartographer run would block every other
 *      memory write to the same file, including Mirror's quick appends.
 *      The new transaction re-establishes RLS via `SET LOCAL app.student_id`
 *      so `student_memory_files` reads/writes stay tenant-scoped.
 *
 *   2. Anthropic memory store is the live read surface for the agent.
 *      `memory_snapshots` is a Postgres-side insurance copy written every
 *      `SNAPSHOT_EVERY` ops — it covers the 30-day Anthropic retention
 *      window and recovers content if a store is archived.
 *
 * The SDK boundary is `MemoryStoreTransport` so tests inject a fake;
 * production wraps the live `client.beta.memoryStores.*` surface.
 */

import Anthropic from '@anthropic-ai/sdk'
import { sql } from 'drizzle-orm'

import { getDbForMemoryModule } from '~/db/client'
import { checkMemoryWriteForDiagnosticLanguage } from '~/lib/safety'

/** Insert a `memory_snapshots` row every Nth op per (studentId, file). */
export const SNAPSHOT_EVERY = 20

/** Files the four agents are allowed to write into the per-student store. */
export const MEMORY_FILE_PATHS = {
  studentVoice: '/student-voice.md',
  rejectedDiffPatterns: '/rejected-diff-patterns.md',
  exploratoryThreads: '/exploratory-threads.md',
  counselorNotes: '/counselor-notes.md',
  pedagogicalState: '/pedagogical-state.md',
} as const

export type MemoryFilePath = (typeof MEMORY_FILE_PATHS)[keyof typeof MEMORY_FILE_PATHS]

/**
 * SDK-facing boundary. Real impl in `createAnthropicMemoryTransport`;
 * tests pass an in-memory fake. Methods accept the path/store id pair the
 * Anthropic API requires.
 */
export interface MemoryStoreTransport {
  /** Provision a store. Called once per student on first write. */
  createStore(params: { name: string; description?: string }): Promise<{ id: string }>
  /** Retrieve current content by memory id; returns null if not found. */
  retrieveMemory(
    memoryId: string,
    storeId: string,
  ): Promise<{ content: string; contentSha256: string } | null>
  /** Create a new memory at `path`. Used on first write to a file. */
  createMemory(
    storeId: string,
    params: { path: string; content: string },
  ): Promise<{ id: string; contentSha256: string }>
  /**
   * Overwrite content of an existing memory. Optimistic-concurrency
   * precondition via `expectedSha256` — the caller is expected to have just
   * read the current content; mismatch surfaces as
   * `MemoryConcurrencyError` so the caller can retry with a fresh read.
   */
  updateMemory(
    memoryId: string,
    params: { storeId: string; content: string; expectedSha256?: string },
  ): Promise<{ contentSha256: string }>
}

/**
 * `appendStudentMemory` error shape. `code` is the discrimination key —
 * call sites can branch on `DIAGNOSTIC_LANGUAGE` to avoid retrying.
 */
export class MemoryWriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DIAGNOSTIC_LANGUAGE'
      | 'STORE_NOT_FOUND'
      | 'CONCURRENCY'
      | 'TRANSPORT_ERROR'
      | 'INVALID_INPUT',
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MemoryWriteError'
  }
}

let cachedAnthropic: Anthropic | undefined

function getAnthropicClient(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new MemoryWriteError(
      'Memory store transport: ANTHROPIC_API_KEY is not set. Required for `client.beta.memoryStores.*`.',
      'TRANSPORT_ERROR',
    )
  }
  cachedAnthropic = new Anthropic({ apiKey })
  return cachedAnthropic
}

/** Drop the cached SDK client. Test-only. */
export function resetMemoryClientCacheForTests(): void {
  cachedAnthropic = undefined
}

/**
 * Default transport wrapping the live `Anthropic.beta.memoryStores.*` surface.
 * Lazy-constructs the SDK client so module load does not require
 * `ANTHROPIC_API_KEY` in environments that never call memory writes (e.g.
 * unit tests).
 */
export function createAnthropicMemoryTransport(client?: Anthropic): MemoryStoreTransport {
  const resolveClient = () => client ?? getAnthropicClient()
  return {
    async createStore({ name, description }) {
      const store = await resolveClient().beta.memoryStores.create({
        name,
        ...(description !== undefined ? { description } : {}),
      })
      return { id: store.id }
    },
    async retrieveMemory(memoryId, storeId) {
      try {
        const memory = await resolveClient().beta.memoryStores.memories.retrieve(memoryId, {
          memory_store_id: storeId,
          view: 'full',
        })
        return {
          content: memory.content ?? '',
          contentSha256: memory.content_sha256,
        }
      } catch (err) {
        // SDK throws `NotFoundError` (HTTP 404) when the memory id no longer
        // resolves — e.g. the underlying store was archived or the memory
        // was deleted out-of-band. Treat as "absent" so the caller can
        // create from scratch. Anything else bubbles up.
        if (isNotFoundError(err)) return null
        throw new MemoryWriteError(
          `memory retrieve failed (memoryId=${memoryId}, storeId=${storeId})`,
          'TRANSPORT_ERROR',
          err,
        )
      }
    },
    async createMemory(storeId, params) {
      try {
        const memory = await resolveClient().beta.memoryStores.memories.create(storeId, {
          path: params.path,
          content: params.content,
        })
        return { id: memory.id, contentSha256: memory.content_sha256 }
      } catch (err) {
        throw new MemoryWriteError(
          `memory create failed (storeId=${storeId}, path=${params.path})`,
          'TRANSPORT_ERROR',
          err,
        )
      }
    },
    async updateMemory(memoryId, params) {
      try {
        const memory = await resolveClient().beta.memoryStores.memories.update(memoryId, {
          memory_store_id: params.storeId,
          content: params.content,
          ...(params.expectedSha256
            ? { precondition: { type: 'content_sha256', content_sha256: params.expectedSha256 } }
            : {}),
        })
        return { contentSha256: memory.content_sha256 }
      } catch (err) {
        if (isPreconditionFailedError(err)) {
          throw new MemoryWriteError(
            `memory update precondition failed (memoryId=${memoryId})`,
            'CONCURRENCY',
            err,
          )
        }
        throw new MemoryWriteError(
          `memory update failed (memoryId=${memoryId})`,
          'TRANSPORT_ERROR',
          err,
        )
      }
    },
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number }).status
  return status === 404
}

function isPreconditionFailedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number }).status
  return status === 409
}

/**
 * Resolve (or create on first use) the Anthropic memory store id for a
 * student. Runs OUTSIDE any `withStudent` transaction — the mapping table
 * has no RLS because the handler resolves it before any tenant-scoped
 * transaction opens (same posture as `counselor_students`).
 *
 * Idempotent. Concurrent callers for the same student may both call
 * `transport.createStore` but the unique PK on `student_memory_stores`
 * lets us safely INSERT … ON CONFLICT DO NOTHING and re-read.
 */
export async function getOrCreateMemoryStoreId(
  studentId: string,
  transport: MemoryStoreTransport = createAnthropicMemoryTransport(),
): Promise<string> {
  if (!studentId || studentId.trim().length === 0) {
    throw new MemoryWriteError('getOrCreateMemoryStoreId: studentId is required', 'INVALID_INPUT')
  }
  const db = getDbForMemoryModule()
  const existing = await db.execute<{ memory_store_id: string }>(
    sql`select memory_store_id from student_memory_stores where student_id = ${studentId} limit 1`,
  )
  const found = existing.rows[0]?.memory_store_id
  if (found) return found

  const { id: newStoreId } = await transport.createStore({
    name: `student-${studentId}`,
    description: `Sensemaking memory store for student ${studentId}. Holds VIPS-aligned voice + pedagogical state across sessions.`,
  })
  // Idempotent insert: a concurrent caller may have raced us to create their
  // own store. We accept the duplicate-store cost (orphan store on Anthropic
  // side) in exchange for never returning a stale id.
  await db.execute(
    sql`insert into student_memory_stores (student_id, memory_store_id)
        values (${studentId}, ${newStoreId})
        on conflict (student_id) do nothing`,
  )
  const reread = await db.execute<{ memory_store_id: string }>(
    sql`select memory_store_id from student_memory_stores where student_id = ${studentId} limit 1`,
  )
  const winner = reread.rows[0]?.memory_store_id
  if (!winner) {
    throw new MemoryWriteError(
      `failed to resolve memory store id for student ${studentId} after create`,
      'STORE_NOT_FOUND',
    )
  }
  return winner
}

/**
 * Append-or-rewrite operation. Receives the current file content (empty
 * string on first write) and returns the new content. Return `null` to
 * skip the write — used by Mirror's `appendIfNovel`-style helper when the
 * new content would be a no-op duplicate.
 */
export type MemoryAppendOp = (current: string) => string | null

export interface AppendStudentMemoryResult {
  filePath: MemoryFilePath
  skipped: boolean
  opCount: number
  snapshotVersion: number | null
  memoryId: string | null
}

/**
 * Append to a student's memory file with single-writer serialization.
 *
 * Sequence:
 *   1. Resolve `memoryStoreId` for the student (out-of-tx, no RLS).
 *   2. BEGIN a fresh Postgres transaction (NOT the caller's `withStudent`).
 *   3. Acquire `pg_advisory_xact_lock(hashtextextended(studentId || file, 0))`
 *      — serializes concurrent appends to the same file.
 *   4. `SET LOCAL app.student_id = $1` — re-establish RLS inside the new tx.
 *   5. Read or create `student_memory_files` row; load cached `memory_id`.
 *   6. Pull current content from Anthropic (or treat 404 as empty).
 *   7. Call `op(current)`; if it returns null, skip the write (still bump
 *      `op_count` so cadence stays predictable).
 *   8. Run `checkMemoryWriteForDiagnosticLanguage` on the proposed content.
 *   9. Push the new content to Anthropic with the `content_sha256`
 *      precondition (or create if no prior memory).
 *  10. Bump `op_count`. If `op_count % SNAPSHOT_EVERY == 0`, INSERT a
 *      `memory_snapshots` row capturing the new content + version=opCount.
 *  11. COMMIT (releases advisory lock + the tx-scoped GUC).
 */
export async function appendStudentMemory(
  studentId: string,
  filePath: MemoryFilePath,
  op: MemoryAppendOp,
  transport: MemoryStoreTransport = createAnthropicMemoryTransport(),
): Promise<AppendStudentMemoryResult> {
  if (!studentId || studentId.trim().length === 0) {
    throw new MemoryWriteError('appendStudentMemory: studentId is required', 'INVALID_INPUT')
  }
  const memoryStoreId = await getOrCreateMemoryStoreId(studentId, transport)
  const db = getDbForMemoryModule()

  return db.transaction(async (tx) => {
    // Step 3 — advisory lock keyed by (studentId, filePath). The lock is
    // released automatically on COMMIT/ROLLBACK because `_xact_` scopes it
    // to this transaction. Hashing both fields together collapses the
    // (student × file) namespace into a single 8-byte bigint, which is
    // what `pg_advisory_xact_lock(bigint)` expects.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${studentId} || ${filePath}, 0))`,
    )
    // Step 4 — re-establish RLS for the new transaction. Mirrors the
    // `withStudent` envelope's first statement (src/db/client.ts).
    await tx.execute(sql`select set_config('app.student_id', ${studentId}, true)`)

    // Step 5 — fetch existing op count + cached memory id, if any.
    const fileRow = await tx.execute<{ op_count: number; memory_id: string | null }>(
      sql`select op_count, memory_id from student_memory_files
          where student_id = ${studentId} and file_path = ${filePath}
          limit 1`,
    )
    const prevOpCount = fileRow.rows[0]?.op_count ?? 0
    let memoryId = fileRow.rows[0]?.memory_id ?? null

    // Step 6 — read current content from Anthropic (empty string on first
    // write, or if the cached memory id 404s).
    let currentContent = ''
    let currentSha256: string | undefined
    if (memoryId) {
      const fetched = await transport.retrieveMemory(memoryId, memoryStoreId)
      if (fetched) {
        currentContent = fetched.content
        currentSha256 = fetched.contentSha256
      } else {
        // Cached memory id is stale (store rotated, memory deleted). Drop the
        // cache and create a fresh memory in step 9.
        memoryId = null
      }
    }

    // Step 7 — apply the caller's op. `null` = skip; still bump op_count so
    // the SNAPSHOT_EVERY cadence stays deterministic regardless of skips.
    const nextContent = op(currentContent)
    const nextOpCount = prevOpCount + 1
    if (nextContent === null) {
      await upsertMemoryFileRow(tx, {
        studentId,
        filePath,
        opCount: nextOpCount,
        memoryId,
      })
      return {
        filePath,
        skipped: true,
        opCount: nextOpCount,
        snapshotVersion: null,
        memoryId,
      }
    }

    // Step 8 — safety gate. The diagnostic-language check runs against the
    // FULL proposed content (not just the delta) so retroactive edits that
    // smuggle in labels via concatenation still get caught.
    const safety = checkMemoryWriteForDiagnosticLanguage(nextContent)
    if (!safety.ok) {
      throw new MemoryWriteError(
        `memory write rejected — diagnostic language detected in ${filePath}: ${safety.matches
          .map((m) => m.text)
          .join('; ')}`,
        'DIAGNOSTIC_LANGUAGE',
      )
    }

    // Step 9 — push to Anthropic. Create on first write, update with
    // precondition thereafter. The precondition catches the rare case where
    // the agent itself wrote to the same path mid-flight; we surface that
    // as `CONCURRENCY` and let the caller decide whether to retry.
    let newMemoryId: string
    if (memoryId) {
      await transport.updateMemory(memoryId, {
        storeId: memoryStoreId,
        content: nextContent,
        ...(currentSha256 ? { expectedSha256: currentSha256 } : {}),
      })
      newMemoryId = memoryId
    } else {
      const created = await transport.createMemory(memoryStoreId, {
        path: filePath,
        content: nextContent,
      })
      newMemoryId = created.id
    }

    // Step 10 — bookkeeping + snapshot cadence.
    await upsertMemoryFileRow(tx, {
      studentId,
      filePath,
      opCount: nextOpCount,
      memoryId: newMemoryId,
    })
    let snapshotVersion: number | null = null
    if (nextOpCount % SNAPSHOT_EVERY === 0) {
      await tx.execute(
        sql`insert into memory_snapshots (student_id, file_path, version, content)
            values (${studentId}, ${filePath}, ${nextOpCount}, ${nextContent})`,
      )
      snapshotVersion = nextOpCount
    }

    return {
      filePath,
      skipped: false,
      opCount: nextOpCount,
      snapshotVersion,
      memoryId: newMemoryId,
    }
  })
}

async function upsertMemoryFileRow(
  tx: Parameters<Parameters<ReturnType<typeof getDbForMemoryModule>['transaction']>[0]>[0],
  row: { studentId: string; filePath: MemoryFilePath; opCount: number; memoryId: string | null },
): Promise<void> {
  await tx.execute(
    sql`insert into student_memory_files (student_id, file_path, op_count, memory_id, updated_at)
        values (${row.studentId}, ${row.filePath}, ${row.opCount}, ${row.memoryId}, now())
        on conflict (student_id, file_path)
        do update set
          op_count = excluded.op_count,
          memory_id = excluded.memory_id,
          updated_at = now()`,
  )
}

/**
 * Compose an op that appends `entry` to the file's current content, separated
 * by a blank line and a timestamped marker. Returns null when `entry` is
 * already present verbatim in the tail (cheap "novel" guard used by Mirror).
 *
 * Markers are deliberately plain Markdown so the agent reads them as headings
 * when it loads the file at `/mnt/memory/{file}`.
 */
export function appendIfNovel(entry: string, opts: { source: string; at?: Date } = { source: '' }) {
  const trimmed = entry.trim()
  const at = (opts.at ?? new Date()).toISOString()
  return (current: string): string | null => {
    if (trimmed.length === 0) return null
    if (current.includes(trimmed)) return null
    const header = `\n\n## ${at}${opts.source ? ` — ${opts.source}` : ''}\n\n`
    const prefix = current.length === 0 ? '' : current.replace(/\s+$/, '')
    return `${prefix}${header}${trimmed}\n`
  }
}
