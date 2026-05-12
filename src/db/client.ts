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
  }
  const pool = new Pool(config)
  // No-op outside Vercel's Fluid Compute runtime, but cheap and idempotent.
  try {
    attachDatabasePool(pool)
  } catch {
    // attachDatabasePool throws when not running on Vercel; safe to ignore.
  }
  return pool
}

function getDb(): AppDatabase {
  if (cachedDb) return cachedDb
  if (!cachedPool) cachedPool = buildPool()
  cachedDb = drizzle(cachedPool, { schema, casing: 'snake_case' })
  return cachedDb
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
 * Insert the four demo students for a newly-signed-in counselor. Idempotent.
 * Called from src/auth/middleware.ts on first sign-in.
 */
export async function attachCounselorToDemoStudents(counselorId: string): Promise<void> {
  const db = getDb()
  const demoIds = ['demo-a', 'demo-b', 'demo-c', 'demo-d']
  for (const studentId of demoIds) {
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
 * branch, etc.) and need queries to route through it.
 */
export function setDbForTests(pool: Pool | null, db: AppDatabase | null): void {
  cachedPool = pool
  cachedDb = db
}

/** Close the cached pool. Test-only. */
export async function resetDbForTests(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end()
  }
  cachedPool = null
  cachedDb = null
}
