import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database, { type Database as DatabaseInstance } from 'better-sqlite3'

const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), './schema.sql')

let cached: DatabaseInstance | null = null

export interface OpenDbOptions {
  /** Override the on-disk path. Defaults to `process.env.DATABASE_PATH ?? './app.db'`. */
  path?: string
  /** When true, opens in `:memory:` and skips chmod. Used by tests. */
  inMemory?: boolean
}

/**
 * Open (or return the cached) better-sqlite3 handle. WAL mode and foreign
 * keys are enabled by `schema.sql`; the file is chmod-ed to 0600 so other
 * shell users can't read transcripts.
 */
export function openDb(opts: OpenDbOptions = {}): DatabaseInstance {
  if (cached) return cached
  const dbPath = opts.inMemory ? ':memory:' : (opts.path ?? process.env.DATABASE_PATH ?? './app.db')

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  const schema = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(schema)

  if (!opts.inMemory && existsSync(dbPath)) {
    try {
      chmodSync(dbPath, 0o600)
    } catch {
      // chmod is best-effort; on platforms that reject it (Windows, mounts), skip.
    }
  }

  cached = db
  return db
}

/** Close and clear the cached handle. Test-only. */
export function resetDbForTests(): void {
  if (cached) {
    cached.close()
    cached = null
  }
}

/** Inject a db handle as the cached one. Test-only — used by integration tests. */
export function setDbForTests(db: DatabaseInstance | null): void {
  cached = db
}

/** Open a fresh in-memory db. Test-only — does not touch the cache. */
export function openInMemoryDb(): DatabaseInstance {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const schema = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(schema)
  return db
}
