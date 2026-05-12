// drizzle-kit configuration. Reads from .env via the consumer (Vite/tsx loads
// dotenv at runtime); here we just point at the schema + migrations folder.
//
// Use `DATABASE_URL_UNPOOLED` (Neon direct, non-pooled) for migrations because
// PgBouncer transaction mode does not support session-scoped statements like
// `CREATE INDEX CONCURRENTLY` or schema DDL across many statements.

import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!migrationUrl) {
  throw new Error(
    'drizzle.config.ts: DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set for drizzle-kit',
  )
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: migrationUrl },
  strict: true,
  verbose: true,
})
