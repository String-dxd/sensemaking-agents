// Postgres client + tenancy envelope. Replaces the v0.1 better-sqlite3 path.
//
// `withStudent(studentId, fn)` is the *only* sanctioned entry point into the
// app's read/write paths. It opens a transaction, sets the per-statement
// `app.student_id` GUC via `set_config(_, _, true)` (SET LOCAL semantics), and
// hands a transaction-bound Drizzle client to `fn`. Every RLS policy in
// schema.ts compares student_id against this GUC, so a query inside `fn` that
// forgets to scope by student_id sees zero rows (sane failure mode).
//
// Two non-obvious invariants:
//
//   1. The `set_config` call is the FIRST statement issued on the transaction.
//      Any earlier query runs without the GUC and returns zero rows under RLS.
//      Drizzle's `tx` callback executes statements in await order, so we
//      simply `await` the GUC set before invoking `fn`.
//
//   2. The Neon pooled URL uses PgBouncer transaction mode. node-postgres
//      (`pg`) only issues named prepared statements when callers pass a
//      `name` field — Drizzle's `drizzle-orm/node-postgres` adapter does not,
//      so we are already PgBouncer-transaction-mode-safe without a flag.
//      `set_config(_, _, true)` (LOCAL=true) is transaction-scoped, which is
//      exactly what PgBouncer-transaction-mode preserves.

import { attachDatabasePool } from '@vercel/functions'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase, type NodePgTransaction } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'

import * as schema from './schema'

export type DbSchema = typeof schema

export type AppDatabase = NodePgDatabase<DbSchema>
export type AppTransaction = NodePgTransaction<DbSchema, ExtractTablesWithRelations<DbSchema>>

/**
 * The transaction-bound context every query function expects. The `db` field
 * is a Drizzle handle scoped to a transaction with `app.student_id` already
 * set; queries run inside it are RLS-isolated to `studentId`.
 */
export interface TenantContext {
  /** Transaction-bound Drizzle handle. */
  db: AppTransaction
  /** The student whose tenancy is bound on this transaction. */
  studentId: string
  /** WorkOS counselor id (when running under authkitMiddleware). */
  counselorId?: string
}

const DEMO_STUDENT_IDS = ['demo-a', 'demo-b', 'demo-c', 'demo-d'] as const

let cachedPool: Pool | null = null
let cachedDb: AppDatabase | null = null

function buildPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The app no longer falls back to a local sqlite file; ' +
        'point DATABASE_URL at a Neon dev branch (pooled URL) or set DEV_BYPASS_AUTH and ' +
        'a local Neon proxy.',
    )
  }
  const config: PoolConfig = {
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    // Refuse new requests after 5s of pool starvation rather than queueing forever.
    connectionTimeoutMillis: 5_000,
  }
  const pool = new Pool(config)
  // No-op outside Vercel's Fluid Compute runtime, but cheap and idempotent.
  try {
    attachDatabasePool(pool)
  } catch (err) {
    // `attachDatabasePool` only works inside Vercel's Fluid Compute runtime
    // and throws otherwise. Recognise the known "not running on Vercel" shape
    // by name/message; anything else (e.g. an SDK upgrade that changes the
    // contract) should bubble up so the regression is observable in logs.
    if (!isVercelEnvUnavailableError(err)) {
      // eslint-disable-next-line no-console -- ops triage signal
      console.warn(
        '[db/client] attachDatabasePool threw unexpectedly; pool not registered with Vercel runtime',
        { error: err instanceof Error ? { name: err.name, message: err.message } : err },
      )
    }
  }
  return pool
}

/**
 * Heuristic match for the "not running on Vercel" failure mode that
 * `@vercel/functions` raises when `attachDatabasePool` is called outside a
 * Fluid Compute runtime (local dev, vitest, CI runners). We match by name +
 * message substring rather than a class import because the SDK does not
 * export a specific error class for this case.
 *
 * If a future SDK upgrade changes the surface, the warn-log in the catch
 * site will fire and we re-tighten this check then.
 */
function isVercelEnvUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('not running on vercel') ||
    msg.includes('attachdatabasepool') ||
    msg.includes('fluid compute') ||
    msg.includes('vercel runtime')
  )
}

function getDb(): AppDatabase {
  if (cachedDb) return cachedDb
  if (!cachedPool) cachedPool = buildPool()
  cachedDb = drizzle(cachedPool, { schema, casing: 'snake_case' })
  return cachedDb
}

/**
 * Pool-level Drizzle handle for callers that intentionally manage their own
 * transaction lifecycle (advisory-locked writes in `appendStudentMemory`, the
 * out-of-RLS `counselor_students` and `student_memory_stores` lookups). All
 * tenant-scoped reads/writes should still go through `withStudent`.
 */
export function getDbForMemoryModule(): AppDatabase {
  return getDb()
}

/**
 * Run `fn` inside a Postgres transaction with `app.student_id` set as the
 * first statement. The transaction commits on resolve, rolls back on throw.
 *
 * Layered transactions (calling withStudent inside another withStudent for the
 * same student) are not supported in this version — callers that need nested
 * scopes should compose multiple operations within one outer `fn`.
 */
export async function withStudent<T>(
  studentId: string,
  fn: (ctx: TenantContext) => Promise<T>,
  opts: { counselorId?: string } = {},
): Promise<T> {
  if (!studentId || studentId.trim().length === 0) {
    throw new Error('withStudent: studentId is required')
  }
  const db = getDb()
  return db.transaction(async (tx) => {
    // FIRST statement: bind the tenancy GUC for the duration of this tx.
    // `set_config(_, _, true)` is parameterised SET LOCAL — safe against
    // injection because the value is bound, not interpolated.
    await tx.execute(sql`select set_config('app.student_id', ${studentId}, true)`)
    return fn({ db: tx, studentId, counselorId: opts.counselorId })
  })
}

/**
 * Counselor-authorization gate. Run BEFORE `withStudent` to verify the
 * counselor has access to the studentId. Throws if no row in
 * `counselor_students`. Bypasses RLS by querying outside `withStudent`
 * (counselor_students has no RLS — see schema.ts).
 */
export async function assertCounselorHasStudent(
  counselorId: string,
  studentId: string,
): Promise<void> {
  const db = getDb()
  const rows = await db.execute(
    sql`select 1 from counselor_students where counselor_id = ${counselorId} and student_id = ${studentId} limit 1`,
  )
  if (rows.rows.length === 0) {
    throw new CounselorAccessDeniedError(counselorId, studentId)
  }
}

/**
 * Legacy helper for the future multi-student picker: look up the lowest-id
 * studentId attached to the given counselor.
 * Returns `null` if the counselor has no rows in `counselor_students`.
 *
 * WorkOS request handling does not use this to select the active student:
 * real signed-in users always resolve to `personalStudentIdForCounselor`.
 * Runs outside `withStudent` because `counselor_students` has no RLS.
 */
export async function findFirstAttachedStudent(counselorId: string): Promise<string | null> {
  const db = getDb()
  const rows = await db.execute<{ student_id: string }>(
    sql`select student_id from counselor_students
        where counselor_id = ${counselorId}
        order by student_id asc
        limit 1`,
  )
  return rows.rows[0]?.student_id ?? null
}

export function personalStudentIdForCounselor(counselorId: string): string {
  if (!counselorId || counselorId.trim().length === 0) {
    throw new Error('personalStudentIdForCounselor: counselorId is required')
  }
  return `workos:${counselorId.trim()}`
}

/**
 * Real WorkOS users get a private, initially empty student namespace.
 * Demo seed rows remain reachable only through the explicit demo/dev paths.
 * If an older build attached demo rows to this WorkOS counselor, prune those
 * stale rows so future picker work cannot accidentally surface demo data.
 */
export async function attachCounselorToPersonalStudent(counselorId: string): Promise<string> {
  const studentId = personalStudentIdForCounselor(counselorId)
  const db = getDb()
  await db.execute(
    sql`insert into counselor_students (counselor_id, student_id)
        values (${counselorId}, ${studentId})
        on conflict (counselor_id, student_id) do nothing`,
  )
  await detachDemoStudentsFromRealCounselor(db, counselorId)
  return studentId
}

async function detachDemoStudentsFromRealCounselor(
  db: AppDatabase,
  counselorId: string,
): Promise<void> {
  if (counselorId.startsWith('auth-bypass:')) return
  for (const demoStudentId of DEMO_STUDENT_IDS) {
    await db.execute(
      sql`delete from counselor_students
          where counselor_id = ${counselorId}
            and student_id = ${demoStudentId}`,
    )
  }
}

/** Insert the four seeded demo students for a demo/dev counselor. Idempotent. */
export async function attachCounselorToDemoStudents(counselorId: string): Promise<void> {
  const db = getDb()
  for (const studentId of DEMO_STUDENT_IDS) {
    await db.execute(
      sql`insert into counselor_students (counselor_id, student_id)
          values (${counselorId}, ${studentId})
          on conflict (counselor_id, student_id) do nothing`,
    )
  }
}

export class CounselorAccessDeniedError extends Error {
  readonly counselorId: string
  readonly studentId: string
  constructor(counselorId: string, studentId: string) {
    super(`counselor ${counselorId} has no access to student ${studentId}`)
    this.name = 'CounselorAccessDeniedError'
    this.counselorId = counselorId
    this.studentId = studentId
  }
}

// ---------------------------------------------------------------------------
// Test-only overrides
// ---------------------------------------------------------------------------

/**
 * Replace the cached pool + Drizzle client with a test-controlled pair. Used
 * by integration tests that spin up a transient Postgres (pg-mem, a Neon dev
 * branch, etc.) and need queries to route through it. Pass `null` to clear.
 *
 * Single object parameter so the (pool, db) pair stays atomic — earlier
 * (Pool|null, AppDatabase|null) overload let callers pass a mismatched pair
 * (one null, one set) which silently broke `getDb()`'s cache invariant.
 */
export function setDbForTests(handle: { pool: Pool; db: AppDatabase } | null): void {
  cachedPool = handle?.pool ?? null
  cachedDb = handle?.db ?? null
}

/** Close the cached pool. Test-only. */
export async function resetDbForTests(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end()
  }
  cachedPool = null
  cachedDb = null
}
