# Plan 071: Production runbook — verify, migrate `0004`, then push `main`

> **OPERATOR RUNBOOK.**
> Run the gates in order from the root checkout. Do not dispatch the production
> steps to a worktree or background executor. Stop whenever a stated invariant
> does not hold; a green command is not sufficient evidence if it targeted the
> wrong Vercel project, deployment, or database.

## Status

- **Priority**: P0 — `main` must not deploy before migration `0004`
- **Risk**: MEDIUM — additive production DDL followed by an automatic production deploy
- **Planned against**: local `main` at `db10be62`, with 17 commits ahead of `origin/main`
- **Expected mutation order**: local verification → production migration → push → production verification
- **Out of scope**: production reseed; plans 051–068; changing Vercel environment variables

The ahead count is descriptive, not a gate: committing this runbook changes it.
The release gate is a clean `main` whose `origin/main` is an ancestor of `HEAD`.

## Why migration must precede the push

Migration `src/db/migrations/0004_moaning_abomination.sql` adds:

```sql
ALTER TABLE "mirror_entries" ADD COLUMN "local_capture_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "mirror_entries_student_local_capture_uq" ON "mirror_entries" USING btree ("student_id","local_capture_id");
```

The new capture-submit path reads and writes `local_capture_id`. Deploying that
code against the old schema produces `42703 undefined_column` before the
idempotency path can run.

The reverse window is compatible:

- `local_capture_id` is nullable with no default.
- Existing code omits it, so existing and newly written rows receive `NULL`.
- PostgreSQL's default unique-index semantics treat `NULL` values as distinct.
- The old production code neither selects nor inserts the new column.

Therefore old code can run on the migrated schema, and a code rollback leaves
`0004` in place.

## Operational facts verified from the checkout

- Vercel build command: `pnpm build`; it does not run migrations.
- Linked Vercel project:
  - project ID: `prj_JEmOIhaW6bLuuJwkeqj4BBzyjNQq`
  - org ID: `team_KrzGicaOyE7qyaXUqVokfMyM`
  - project name: `sensemaking-agents`
- `src/db/drizzle.config.ts` prefers `DATABASE_URL_UNPOOLED` over
  `DATABASE_URL`; the migration command must set the former explicitly.
- Drizzle ORM 0.36.4 executes all pending statements and its migration-ledger
  insert in one PostgreSQL transaction. A statement error rolls the transaction
  back; it cannot commit only the column or only the index.
- Migration `0004` journal timestamp: `1785028711746`
- Migration `0004` SHA-256:
  `dbe424cd3cc691e9e7e3297af50be21ef77ecc824b870e6624d094a67042b7c8`
- Vercel CLI 56.2.0 requires `vercel rollback <deployment-id-or-url>`.

Do not replace exact ledger/schema checks with an `applied: 5` count. Drizzle
uses the latest `created_at` to decide what is pending and does not compare
stored hashes during migration.

## Step 0: Pin the release state

```bash
git fetch origin
test "$(git branch --show-current)" = main
git merge-base --is-ancestor origin/main HEAD
git diff --quiet
git diff --cached --quiet
test -z "$(git ls-files --others --exclude-standard)"
RELEASE_HEAD="$(git rev-parse HEAD)"
ORIGIN_HEAD="$(git rev-parse origin/main)"
```

Stop if any command fails. Record `RELEASE_HEAD` and `ORIGIN_HEAD` in the
release notes. Re-run this step immediately before pushing.

## Step 1: Run every local release gate before touching production

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

All four commands must exit 0. This catches the `@base-ui/react` package/lockfile
rename and all other build failures before production has been migrated.

## Step 2: Create a private, disposable release directory

```bash
RUN_DIR="$(mktemp -d /private/tmp/sensemaking-release.XXXXXX)"
chmod 700 "$RUN_DIR"
cleanup_release_files() {
  rm -f \
    "$RUN_DIR/production-env-metadata.json" \
    "$RUN_DIR/deployments.json" \
    "$RUN_DIR/known-good.json"
  rmdir "$RUN_DIR" 2>/dev/null || true
}
trap cleanup_release_files EXIT
```

Every generated file below must live in `RUN_DIR`, never in the repository.
Run `chmod 600` after creating each file. Do not print database URLs, pass them
as command-line arguments, or include them in logs.

## Step 3: Pin the Vercel project and known-good production deployment

First verify the local Vercel link without printing credentials:

```bash
node -e '
const fs=require("node:fs");
const p=JSON.parse(fs.readFileSync(".vercel/project.json","utf8"));
const expected={
  projectId:"prj_JEmOIhaW6bLuuJwkeqj4BBzyjNQq",
  orgId:"team_KrzGicaOyE7qyaXUqVokfMyM",
  projectName:"sensemaking-agents",
};
for (const [key,value] of Object.entries(expected)) {
  if (p[key] !== value) throw new Error(`Vercel ${key} mismatch`);
}
console.log("linked Vercel project verified:", p.projectName, p.projectId);
'
vercel project inspect --yes
```

Then capture recent ready production deployments:

```bash
vercel ls sensemaking-agents \
  --environment=production \
  --status=READY \
  --limit=20 \
  --format=json > "$RUN_DIR/deployments.json"
chmod 600 "$RUN_DIR/deployments.json"
```

Select the newest READY production deployment whose
`meta.githubCommitSha` equals `ORIGIN_HEAD`. Record both its URL and deployment
ID:

```bash
KNOWN_GOOD_URL="$(node -e '
const fs=require("node:fs");
const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const hit=data.deployments.find(
  d => d.target==="production" &&
       d.state==="READY" &&
       d.meta?.githubCommitSha===process.argv[2]
);
if (!hit) throw new Error("no READY production deployment matches origin/main");
process.stdout.write(hit.url);
' "$RUN_DIR/deployments.json" "$ORIGIN_HEAD")"

vercel inspect "$KNOWN_GOOD_URL" --format=json \
  > "$RUN_DIR/known-good.json"
chmod 600 "$RUN_DIR/known-good.json"

KNOWN_GOOD_DEPLOYMENT_ID="$(node -e '
const fs=require("node:fs");
const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if (
  d.target!=="production" ||
  d.readyState!=="READY" ||
  !Array.isArray(d.aliases) ||
  !d.aliases.includes("sensemaking-agents.vercel.app")
) {
  throw new Error("rollback target is not the aliased READY production deployment");
}
process.stdout.write(d.id);
' "$RUN_DIR/known-good.json")"
```

Stop unless the deployment is READY, production-targeted, and built from
`ORIGIN_HEAD`. These variables are the exact rollback target; do not substitute
an unverified deployment later.

## Step 4: Bind the protected database credential to live production

Vercel stores `DATABASE_URL_UNPOOLED` as a sensitive variable. CLI 56.2.0
therefore writes an empty value for `vercel env pull --environment=production`,
the REST API returns `decrypted: false`, and `env pull --id <deployment>` rejects
a READY deployment with `expected INITIALIZING`. Do not mistake an empty export
for a usable production credential.

Use the operator's existing ignored credential file; do not copy it into
`RUN_DIR` or create another plaintext secret:

```bash
DB_ENV_FILE=".env"
test -f "$DB_ENV_FILE"
git check-ignore -q "$DB_ENV_FILE"
test "$(rg -c '^\s*(export\s+)?DATABASE_URL_UNPOOLED\s*=' "$DB_ENV_FILE")" = 1

vercel env ls production \
  --format=json > "$RUN_DIR/production-env-metadata.json"
chmod 600 "$RUN_DIR/production-env-metadata.json"
```

First validate that Vercel still has exactly one unscoped sensitive production
record and that it was not changed after the aliased known-good deployment:

```bash
node - \
  "$DB_ENV_FILE" \
  "$RUN_DIR/production-env-metadata.json" \
  "$RUN_DIR/known-good.json" <<'NODE'
const fs = require('node:fs')
const dotenv = require('dotenv')

const raw = fs.readFileSync(process.argv[2], 'utf8')
const value = dotenv.parse(raw).DATABASE_URL_UNPOOLED
if (!value) throw new Error('DATABASE_URL_UNPOOLED is empty')
const url = new URL(value)
if (!url.hostname.endsWith('.neon.tech')) {
  throw new Error('expected a Neon hostname')
}

const metadata = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const records = (metadata.envs ?? []).filter(
  (record) =>
    record.key === 'DATABASE_URL_UNPOOLED' &&
    record.type === 'sensitive' &&
    Array.isArray(record.target) &&
    record.target.length === 1 &&
    record.target[0] === 'production' &&
    !record.gitBranch,
)
if (records.length !== 1) {
  throw new Error('expected one unscoped sensitive production DB record')
}

const deployment = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))
const record = records[0]
if (
  !Number.isFinite(record.createdAt) ||
  !Number.isFinite(record.updatedAt) ||
  !Number.isFinite(deployment.createdAt) ||
  record.updatedAt > deployment.createdAt
) {
  throw new Error('production DB variable changed after known-good deploy')
}
console.log({
  protectedCredentialShapeVerified: true,
  variableUpdatedAt: record.updatedAt,
  knownGoodDeploymentCreatedAt: deployment.createdAt,
})
NODE
```

Metadata cannot reveal or compare the sensitive value, so complete the binding
with an application-level fingerprint. The following verifier:

- requires all four `auth-bypass:demo-a` counselor mappings to exist before the
  request, making the handler's idempotent bootstrap a persistent no-op;
- compares only page timestamps, timeline IDs/dimensions, and recent mirror IDs;
- hashes that shape on both sides without printing student content or the token;
- calls the exact server function already shipped at `ORIGIN_HEAD`.

The two source files must be unchanged from `ORIGIN_HEAD`, which pins the
function ID and response shape used by the live deployment:

```bash
git diff --quiet "$ORIGIN_HEAD" -- \
  src/server/load-vips-pages.functions.ts \
  src/server/load-vips-pages.handler.server.ts

node - "$DB_ENV_FILE" <<'NODE'
const crypto = require('node:crypto')
const fs = require('node:fs')
const { Client } = require('pg')
const dotenv = require('dotenv')

const productionOrigin = 'https://sensemaking-agents.vercel.app'
const functionId =
  '589d2ca997a7195653978a5f44e02f1d8f62691e371aa33c5b31415ec785db38'
const raw = fs.readFileSync(process.argv[2], 'utf8')
const value = dotenv.parse(raw).DATABASE_URL_UNPOOLED
if (!value) throw new Error('DATABASE_URL_UNPOOLED is empty')
const url = new URL(value)
url.searchParams.set('sslmode', 'verify-full')
url.searchParams.set('connect_timeout', '10')

function digest(input) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 16)
}

async function expectedFingerprint() {
  const client = new Client({
    connectionString: url.toString(),
    application_name: 'sensemaking-plan-071-production-fingerprint',
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
  })
  await client.connect()
  try {
    const mappings = await client.query(`
      select student_id
      from counselor_students
      where counselor_id = 'auth-bypass:demo-a'
      order by student_id
    `)
    const mapped = mappings.rows.map((row) => row.student_id)
    if (
      JSON.stringify(mapped) !==
      JSON.stringify(['demo-a', 'demo-b', 'demo-c', 'demo-d'])
    ) {
      throw new Error('STOP: demo mappings incomplete; request could write')
    }

    const pages = await client.query(`
      select dimension, updated_at::text
      from vips_pages
      where student_id = 'demo-a'
      order by dimension
    `)
    const timeline = await client.query(`
      select id, dimension
      from vips_timeline_entries
      where student_id = 'demo-a' and forgotten_at is null
      order by id
    `)
    const recent = await client.query(`
      select recent_rows.id
      from (
        select id, created_at
        from mirror_entries
        where student_id = 'demo-a'
        order by created_at desc
        limit 12
      ) recent_rows
      where not exists (
        select 1
        from mirror_entry_tags met
        join tags t on t.id = met.tag_id
        where met.entry_id = recent_rows.id
          and t.student_id = 'demo-a'
          and t.label = 'system:mirror-forgotten'
      )
      order by recent_rows.created_at desc
    `)
    return {
      pages: pages.rows.map((row) => [row.dimension, row.updated_at]),
      timeline: timeline.rows.map((row) => [Number(row.id), row.dimension]),
      recent: recent.rows.map((row) => Number(row.id)),
    }
  } finally {
    await client.end()
  }
}

async function liveFingerprint() {
  const signIn = await fetch(
    `${productionOrigin}/api/auth/sign-in?` +
      'demo=1&student=demo-a&returnPathname=%2F',
    {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: productionOrigin,
        'Sec-Fetch-Site': 'same-origin',
      },
    },
  )
  if (signIn.status !== 303) {
    throw new Error(`production demo sign-in failed: ${signIn.status}`)
  }
  const cookie = signIn.headers.get('set-cookie')?.split(';', 1)[0]
  if (!cookie) throw new Error('production demo sign-in set no cookie')

  const rpcModule =
    './node_modules/.pnpm/@tanstack+start-client-core@1.168.2/' +
    'node_modules/@tanstack/start-client-core/dist/esm/client-rpc/' +
    'serverFnFetcher.js'
  const { serverFnFetcher } = await import(rpcModule)
  const payload = await serverFnFetcher(
    `${productionOrigin}/_serverFn/${functionId}`,
    [{ method: 'GET', data: {}, headers: { Cookie: cookie } }],
    fetch,
  )
  const live = payload?.result ?? payload
  if (!live || !Array.isArray(live.pages) || !live.timeline_by_dimension) {
    throw new Error('live loadVipsPages returned an unexpected shape')
  }
  return {
    pages: live.pages
      .filter((row) => row.updated_at !== null)
      .map((row) => [row.dimension, row.updated_at])
      .sort(([a], [b]) => a.localeCompare(b)),
    timeline: Object.values(live.timeline_by_dimension)
      .flat()
      .map((row) => [Number(row.id), row.dimension])
      .sort(([a], [b]) => a - b),
    recent: live.recent_entries.map((row) => Number(row.id)),
  }
}

async function main() {
  // Complete the counselor-mapping guard before issuing the live request.
  const expected = await expectedFingerprint()
  const live = await liveFingerprint()
  const protectedFingerprint = digest(expected)
  const productionFingerprint = digest(live)
  if (protectedFingerprint !== productionFingerprint) {
    throw new Error('STOP: credential does not match live production data')
  }
  console.log({
    productionDatabaseIdentityVerified: true,
    fingerprint: protectedFingerprint,
    pages: expected.pages.length,
    timelineEntries: expected.timeline.length,
    recentMirrorEntries: expected.recent.length,
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
NODE
```

Stop on any mismatch. The Vercel metadata proves the production variable was
stable across the known-good deployment; the matching live/data fingerprints
prove the protected credential resolves to that deployment's database.

## Step 5: Run the exact read-only migration preflight

The preflight must establish one of two coherent states:

1. **pending** — the ledger exactly matches migrations 0000–0003 and both the
   column and named index are absent; or
2. **applied** — the ledger exactly matches 0000–0004 and the column/index have
   the exact required shape.

It must stop on extra ledger rows, hash/timestamp drift, or a mixed schema.

Run this read-only verifier. It parses the environment file internally, hashes
every local migration, compares the complete ledger prefix, checks the column
and index shape, and reports table/transaction bounds without printing
credentials:

```bash
node - "$DB_ENV_FILE" <<'NODE'
const fs = require('node:fs')
const crypto = require('node:crypto')
const { Client } = require('pg')
const dotenv = require('dotenv')

const envPath = process.argv[2]
const raw = fs.readFileSync(envPath, 'utf8')
const declarations =
  raw.match(/^\s*(?:export\s+)?DATABASE_URL_UNPOOLED\s*=/gm) ?? []
if (declarations.length !== 1) {
  throw new Error('expected exactly one DATABASE_URL_UNPOOLED')
}
const connectionString = dotenv.parse(raw).DATABASE_URL_UNPOOLED
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is empty')

const url = new URL(connectionString)
url.searchParams.set('sslmode', 'verify-full')
url.searchParams.set('connect_timeout', '10')

const journal = JSON.parse(
  fs.readFileSync('src/db/migrations/meta/_journal.json', 'utf8'),
)
const expected = journal.entries.map((entry) => {
  const sql = fs.readFileSync(
    `src/db/migrations/${entry.tag}.sql`,
    'utf8',
  )
  return {
    tag: entry.tag,
    createdAt: String(entry.when),
    hash: crypto.createHash('sha256').update(sql).digest('hex'),
  }
})

function sameLedger(actual, wanted) {
  return (
    actual.length === wanted.length &&
    actual.every(
      (row, index) =>
        row.created_at === wanted[index].createdAt &&
        row.hash === wanted[index].hash,
    )
  )
}

async function main() {
  const client = new Client({
    connectionString: url.toString(),
    application_name: 'sensemaking-plan-071-preflight',
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
  })
  await client.connect()
  try {
    const ledger = await client.query(`
      select hash, created_at::text
      from drizzle.__drizzle_migrations
      order by created_at
    `)
    const column = await client.query(`
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'mirror_entries'
        and column_name = 'local_capture_id'
    `)
    const index = await client.query(`
      select
        i.indisunique,
        i.indisvalid,
        i.indisready,
        array_agg(a.attname::text order by key.ordinality) as columns
      from pg_class idx
      join pg_index i on i.indexrelid = idx.oid
      join pg_class tbl on tbl.oid = i.indrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      cross join lateral
        unnest(i.indkey::int2[]) with ordinality as key(attnum, ordinality)
      join pg_attribute a
        on a.attrelid = tbl.oid
       and a.attnum = key.attnum
      where ns.nspname = 'public'
        and tbl.relname = 'mirror_entries'
        and idx.relname = 'mirror_entries_student_local_capture_uq'
      group by i.indisunique, i.indisvalid, i.indisready
    `)
    const stats = await client.query(`
      select
        count(*)::text as rows,
        pg_total_relation_size('public.mirror_entries')::text as bytes
      from public.mirror_entries
    `)
    const oldTransactions = await client.query(`
      select count(*)::text as count
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and datname = current_database()
        and xact_start < now() - interval '5 seconds'
    `)

    const columnIsExact =
      column.rows.length === 1 &&
      column.rows[0].data_type === 'text' &&
      column.rows[0].is_nullable === 'YES' &&
      column.rows[0].column_default === null
    const indexIsExact =
      index.rows.length === 1 &&
      index.rows[0].indisunique === true &&
      index.rows[0].indisvalid === true &&
      index.rows[0].indisready === true &&
      JSON.stringify(index.rows[0].columns) ===
        JSON.stringify(['student_id', 'local_capture_id'])

    const pending =
      sameLedger(ledger.rows, expected.slice(0, -1)) &&
      column.rows.length === 0 &&
      index.rows.length === 0
    const applied =
      sameLedger(ledger.rows, expected) &&
      columnIsExact &&
      indexIsExact

    if (!pending && !applied) {
      throw new Error(
        'STOP: migration ledger and schema are neither exact-pending nor exact-applied',
      )
    }

    const rows = Number(stats.rows[0].rows)
    const bytes = Number(stats.rows[0].bytes)
    const longTransactions = Number(oldTransactions.rows[0].count)
    console.log({
      state: applied ? 'applied' : 'pending',
      ledger: ledger.rows.map((row, index) => ({
        tag: expected[index]?.tag ?? 'unknown',
        createdAt: row.created_at,
        hashMatches: row.hash === expected[index]?.hash,
      })),
      mirrorEntries: { rows, bytes },
      transactionsOlderThanFiveSeconds: longTransactions,
      columnExact: columnIsExact,
      indexExact: indexIsExact,
    })

    if (
      pending &&
      (rows >= 100_000 || bytes >= 128 * 1024 * 1024 || longTransactions > 0)
    ) {
      throw new Error('STOP: non-concurrent migration safety bounds not met')
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
NODE
```

Before authorising the migration, require:

- state is `pending`;
- `mirror_entries` is below 100,000 rows and 128 MiB; and
- there are no transactions older than five seconds.

If state is already `applied`, skip Step 6 and proceed to Step 7. If the table
exceeds either bound, redesign the release as a separately verified
non-transactional `CREATE UNIQUE INDEX CONCURRENTLY` operation; that statement
cannot be inserted into Drizzle's transaction.

## Step 6: Migrate with bounded lock and statement time

Run the migration through a small Node wrapper so the URL is parsed inside the
process rather than exposed in shell arguments. Add PostgreSQL startup
parameters to bound both lock acquisition and the total statement:

```bash
node - "$DB_ENV_FILE" <<'NODE'
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const dotenv = require('dotenv')

const raw = fs.readFileSync(process.argv[2], 'utf8')
const value = dotenv.parse(raw).DATABASE_URL_UNPOOLED
if (!value) throw new Error('DATABASE_URL_UNPOOLED is missing')

const url = new URL(value)
url.searchParams.set('sslmode', 'verify-full')
url.searchParams.set(
  'options',
  '-c lock_timeout=5000 -c statement_timeout=120000',
)
url.searchParams.set('connect_timeout', '10')

const result = spawnSync('pnpm', ['db:migrate'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL_UNPOOLED: url.toString(),
  },
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
NODE
```

The migration transaction retains the `ACCESS EXCLUSIVE` lock acquired by
`ALTER TABLE` until commit, so reads and writes can both block throughout the
index build. `lock_timeout=5s` bounds waiting to acquire the lock;
`statement_timeout=120s` bounds the transaction's DDL work. Run during a quiet
window even when the table is small.

If migration errors, do not infer partial application. Re-run Step 5:

- exact 0000–0003 ledger plus absent DDL means the transaction rolled back and
  is retryable only after diagnosing the error;
- exact 0000–0004 ledger plus valid DDL means commit succeeded and the client
  lost certainty afterward;
- any mixed state is a STOP condition requiring manual investigation.

## Step 7: Postflight before pushing

Re-run the exact Step 5 preflight. Require state `applied`, including:

- all five expected timestamp/hash pairs;
- `local_capture_id` is nullable `text` with no default;
- the named index is unique, ready, valid, and has the two expected columns.

Then re-run Step 0. `RELEASE_HEAD` must be unchanged and the checkout must still
be clean.

## Step 8: Push `main`

```bash
git push origin main
```

Do not force-push. A non-fast-forward rejection is a STOP condition: fetch,
reconcile, re-audit, and repeat the release gates rather than bypassing it.

## Step 9: Verify the deployment and capture path

Find the production deployment whose `meta.githubCommitSha` equals
`RELEASE_HEAD`, then:

```bash
vercel inspect "$NEW_DEPLOYMENT_URL" --wait --timeout 5m
```

Require READY before functional testing. Verify:

- the production page loads without new console errors;
- security headers remain present;
- a capture submission completes and appears in History; and
- production logs contain no `42703`, migration, or new capture-submit errors.

Page-load alone is insufficient because it does not exercise the new insert.

## Rollback

If the new deployment becomes READY but functional verification fails:

```bash
vercel rollback "$KNOWN_GOOD_URL" --yes
vercel rollback status sensemaking-agents
```

Leave migration `0004` applied. The old code is compatible with the additive
schema. Record that an instant rollback disables automatic production-domain
assignment; after fixing forward, restore normal assignment with:

```bash
vercel promote "$FIXED_DEPLOYMENT_URL"
```

If the new build fails before promotion, production should still point to the
known-good deployment; verify the alias before deciding whether rollback is
needed.

## Step 10: Remove production credentials

Remove only the files created by this runbook, then remove the empty directory:

```bash
rm -f \
  "$RUN_DIR/production-env-metadata.json" \
  "$RUN_DIR/deployments.json" \
  "$RUN_DIR/known-good.json"
rmdir "$RUN_DIR"
trap - EXIT
unset RUN_DIR DB_ENV_FILE KNOWN_GOOD_URL KNOWN_GOOD_DEPLOYMENT_ID
```

Confirm no `.env*` file was added inside the repository and `git status` is
clean.

## Done criteria

- [ ] Frozen install, check, test, and build all passed before production mutation
- [ ] Linked Vercel project ID/org/name matched the pinned project
- [ ] Known-good rollback URL and deployment ID were recorded before migration
- [ ] Current production database matched the known-good deployment snapshot
- [ ] Exact migration ledger and schema shape reported `applied`
- [ ] Release was a normal fast-forward push of the audited `RELEASE_HEAD`
- [ ] Vercel production deployment became READY
- [ ] Capture submission round-tripped and appeared in History
- [ ] Production logs showed no new migration or capture-submit errors
- [ ] Temporary production credentials were removed

## STOP conditions

- The linked Vercel project differs from the pinned project ID/org/name.
- No READY production deployment exactly matches `origin/main`.
- Current production DB identity differs from the known-good deployment.
- Migration ledger timestamps/hashes or schema objects form a mixed state.
- Table size exceeds the explicit non-concurrent migration bounds.
- A transaction older than five seconds is present before migration.
- Any local release gate fails.
- The checkout changes after local verification.
- Push is not a normal fast-forward.
- Production deploy or capture verification fails; use the recorded rollback target.

## Codex consultation incorporated

The independent Codex review returned **NO-GO** on the earlier draft. This
revision resolves its four blockers:

1. database identity is bound to the linked Vercel project and known-good live
   deployment rather than inferred from `inet_server_addr()`;
2. exact ledger hashes/timestamps and DDL shape replace migration-count checks;
3. table size, long transactions, `lock_timeout`, and `statement_timeout`
   replace the claim that the migration is only a millisecond write block; and
4. the exact known-good deployment URL/ID is captured before mutation and passed
   to `vercel rollback`.

It also resolves the should-fix findings: secrets are parsed from private files
instead of process arguments, build gates run before migration, transaction
semantics are stated correctly, the ahead-count drift trap is removed, and
credential cleanup is explicit.
