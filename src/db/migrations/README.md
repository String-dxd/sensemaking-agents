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

## Local dev requirement (Step 2 → Step 3)

The Postgres port removes the v0.1 fallback to a local SQLite file. **Any code path that touches the DB now requires `DATABASE_URL`** — including unit tests that previously used `openInMemoryDb`. Set it in `.env.local` (Neon dev branch, pooled URL) before running `pnpm dev`, `pnpm test`, or seed scripts. Step 3 reseeds against Postgres and rewrites DB-touching tests; until then, the affected tests are gated behind `describe.skipIf(!process.env.DATABASE_URL)` and silently skip.

## FORCE ROW LEVEL SECURITY (deferred)

`ALTER TABLE … FORCE ROW LEVEL SECURITY` is **not** emitted today. Without `FORCE`, the table owner bypasses RLS, which is fine for our runtime role (a Neon database user without ownership) but means migration scripts running as the owner could read cross-tenant rows by accident. Promoting to `FORCE` requires splitting roles: a migration role (owner, RLS-bypassing) for `pnpm db:migrate`, and a runtime app role (non-owner, RLS-enforced) for the app's `DATABASE_URL`. Surface for an explicit decision before shipping `ALTER TABLE … FORCE ROW LEVEL SECURITY` in a follow-up migration; do not add the SQL ad-hoc.
