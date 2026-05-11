import { chmodSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database, { type Database as DatabaseInstance } from 'better-sqlite3'

const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), './schema.sql')

/** Bumped when the schema changes incompatibly. See schema.sql `_meta`. */
const SCHEMA_VERSION = '3'

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
 *
 * Schema version: on first open, if the on-disk db does not match
 * `SCHEMA_VERSION`, the file is removed and recreated (drop-and-reseed for
 * v0.1; production migration is out of scope).
 */
export function openDb(opts: OpenDbOptions = {}): DatabaseInstance {
  if (cached) return cached
  const dbPath = opts.inMemory ? ':memory:' : (opts.path ?? process.env.DATABASE_PATH ?? './app.db')

  if (!opts.inMemory && existsSync(dbPath) && !schemaVersionMatches(dbPath)) {
    console.warn(
      `[db] schema_version mismatch on ${dbPath}; dropping and recreating (v0.1 demo only).`,
    )
    removeDbFile(dbPath)
  }

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

function schemaVersionMatches(dbPath: string): boolean {
  const probe = new Database(dbPath, { readonly: false })
  try {
    const hasMeta = probe
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'")
      .get() as { name: string } | undefined
    if (!hasMeta) return false
    const row = probe.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined
    return row?.value === SCHEMA_VERSION
  } catch {
    return false
  } finally {
    probe.close()
  }
}

function removeDbFile(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        // best-effort
      }
    }
  }
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
