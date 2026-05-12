# Drizzle migrations

This folder holds Drizzle-Kit-generated migration SQL plus its tracking metadata.

## Workflow

1. **Edit `src/db/schema.ts`** — TypeScript schema is the source of truth.
2. **Generate a migration:** `pnpm db:generate`
   - Emits one `NNNN_<auto-name>.sql` file plus a snapshot under `meta/`.
   - Review the generated SQL — Drizzle should emit `CREATE TABLE`, `CREATE INDEX`, `CREATE POLICY`, and `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for every table that uses `pgPolicy` + `.enableRLS()` in schema.ts.
3. **Apply against a Neon dev branch:** `pnpm db:migrate`
   - Uses `DATABASE_URL_UNPOOLED` (or falls back to `DATABASE_URL`) — set it in `.env.local`.
   - Tracks applied migrations in the `__drizzle_migrations` table.
4. **Commit** the generated `.sql` file *and* the `meta/` snapshot together with the schema change.

## Banned

- `drizzle-kit push` — bypasses migration history. Banned in CI; never use against staging or prod.
- Hand-written `.sql` files outside this folder. The repo's CI lint rejects them.

## RLS policy regeneration

The `pgPolicy` declarations in `schema.ts` are emitted on first generation but **not auto-tracked for drift** against the live database. If you `CREATE POLICY` manually on a Neon branch, `drizzle-kit generate` will not detect it. Always edit schema.ts first, then generate.

## Initial migration

To produce the initial migration:
```bash
# Point at any reachable Postgres (Neon dev branch is the canonical choice).
export DATABASE_URL_UNPOOLED="postgres://…?sslmode=require"
pnpm db:generate
pnpm db:migrate
```

The first generation should emit ~13 tables, ~10 indexes, 2 tsvector generated columns, 2 GIN indexes, 1 partial unique index, and RLS policies on every student-scoped table.
