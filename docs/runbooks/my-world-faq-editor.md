# My World FAQ editor runbook

The editor is a direct publishing tool at `/my-world/faq/edit`. Anyone with
the shared password can publish to the live FAQ. A display name is
self-declared, not verified.

Keep the editor disabled until every activation check below passes.

## Owners

Name these people before activation:

- product owner for wording and urgent restores;
- engineering owner for database, deployment and password rotation;
- Vercel project operator for Firewall, Deployment Protection and logs;
- incident contact for suspected password or session exposure.

Do not put the password, password hash, session cookie, FAQ body or teammate
names in tickets or application logs.

## Required production settings

Set these in the Vercel Production environment only:

| Variable | Required value |
| --- | --- |
| `DATABASE_URL` | Pooled application connection |
| `DATABASE_URL_UNPOOLED` | Direct migration connection |
| `MY_WORLD_FAQ_CONTENT_SOURCE` | `database` |
| `MY_WORLD_FAQ_EDITOR_ENABLED` | `false` during preparation; `true` only at activation |
| `MY_WORLD_FAQ_EDITOR_PASSWORD_HASH` | Argon2id PHC string from the helper |

Use separate data, secrets and hashes for Preview. Never copy a production
database credential into Preview.

Generate the hash from a password-manager-generated secret:

```sh
pnpm faq:hash-password
```

The helper reads the password through a hidden prompt and prints only the hash.
Store the original password in the approved team password manager. Share it
out of band.

## Vercel controls

Before enabling the editor:

1. Turn on Standard Deployment Protection for Preview and historical generated
   deployment URLs.
2. Add a Firewall rate limit for the exact path
   `/api/my-world/faq/editor/session`: 10 requests per IP per 10 minutes,
   returning 429.
3. Add one combined Firewall rate limit for
   `/api/my-world/faq/editor/publish` and
   `/api/my-world/faq/editor/restore`: 30 requests per IP per 10 minutes,
   returning 429.
4. Confirm the canonical production domain is the only shared URL.
5. Verify protected pages and APIs return `private, no-store`,
   `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`,
   `Vary: Cookie`, `noindex` and `no-referrer`.

The application also permits at most 10 publish or restore attempts per
session in 10 minutes. There is no bypass switch.

## Prepare and pin the rollback deployment

Export the Production `DATABASE_URL_UNPOOLED` direct connection in the
operator shell or load it from the release checkout's protected `.env`. Do not
put the URL in a command argument, terminal transcript or ticket. The verifier
never reads or falls back to `DATABASE_URL`.

Run the read-only preflight from the exact release checkout:

```sh
pnpm faq:verify-migration
```

The only accepted states are:

- `pending`: the complete Drizzle ledger is exactly migrations 0000–0004,
  with every timestamp and SHA-256 hash matching the local migration files,
  and there are zero My World FAQ tables, constraints, indexes, functions,
  triggers or policies; or
- `applied`: the complete ledger is exactly migrations 0000–0005 and all FAQ
  tables, columns, named constraints and foreign keys, indexes, the append-only
  function and trigger match migration 0005 exactly, with no extras. The FAQ
  tables, indexes and function must be owned by the connected migration user,
  retain their migration-created null ACLs, and have no relevant altered
  default privileges for that user.

Stop on any other result. Do not repair a mixed or extra state by rerunning the
migration.

The verifier emits a credential-safe `databaseIdentity` containing the
database name, connected user and `hostPortSha256`. Before authorizing any
migration, compare all three values exactly with a Production identity recorded
earlier through an independent trusted process, such as the approved secret
inventory or a known-good deployment record. Do not create the reference from
the URL being verified. The host/port hash is:

```text
SHA-256("postgres-host-port-v1\0" + lowercase_hostname + ":" + effective_port)
```

The effective port is the URL port or `5432` when omitted. Record only these
three identity fields, never the URL. Stop if any field differs.

Migration 0005 leaves the trigger function's ACL null, which preserves
PostgreSQL's default `PUBLIC EXECUTE` privilege. The function returns `trigger`,
is not `SECURITY DEFINER`, and cannot be used as a normal callable function.
Changing that ACL requires a reviewed migration and a corresponding verifier
update; do not alter it during release operations.

If the state is `pending`, run this bounded migration command. It injects a
5-second lock timeout and a 120-second statement timeout into the direct
connection without putting the credential in the process arguments. It also
clears `DATABASE_URL`, so Drizzle cannot fall back to the pooled application
connection:

```sh
node --input-type=module <<'NODE'
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const stop = (message) => {
  console.error(message)
  process.exit(1)
}

const raw = process.env.DATABASE_URL_UNPOOLED
if (!raw) stop('DATABASE_URL_UNPOOLED is required')

let url
try {
  url = new URL(raw)
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    stop('DATABASE_URL_UNPOOLED must be a PostgreSQL URL')
  }
} catch {
  stop('DATABASE_URL_UNPOOLED must be a valid PostgreSQL URL')
}

if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === 'options')) {
  stop('DATABASE_URL_UNPOOLED must not contain an options query parameter')
}

url.searchParams.set(
  'options',
  '-c lock_timeout=5000 -c statement_timeout=120000',
)
url.searchParams.set('connect_timeout', '10')
url.searchParams.set(
  'application_name',
  'sensemaking-my-world-faq-migration-0005',
)

const result = spawnSync('pnpm', ['db:migrate'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: '',
    DATABASE_URL_UNPOOLED: url.toString(),
  },
  stdio: 'inherit',
})

if (result.error) stop('Could not start the bounded migration process')
process.exit(result.status ?? 1)
NODE
```

Whether preflight reported `pending` or `applied`, require the exact applied
postflight:

```sh
pnpm faq:verify-migration --expect=applied
```

Then run the same bounded migration command a second time. It must be a no-op:
it must not add a ledger row or change any FAQ object. Do not rely on the
Drizzle status text alone. Prove the no-op by running the applied verifier
again:

```sh
pnpm faq:verify-migration --expect=applied
```

Stop if either applied verification fails.

Then:

1. Run `pnpm faq:bootstrap`.
2. Compare revision 1 and its digest with the compiled FAQ document. They must
   match exactly.
3. Deploy with `MY_WORLD_FAQ_CONTENT_SOURCE=database` and
   `MY_WORLD_FAQ_EDITOR_ENABLED=false`.
4. Confirm the public FAQ is database-backed and the editor, unlock, history,
   publish and restore surfaces all fail closed.
5. Load the public FAQ once to prime the validated public-only last-known-good
   cache. Verify a database outage serves that snapshot; an empty or corrupt
   cache must produce a generic 503.
6. Pin this database-authoritative, editor-disabled deployment as the rollback
   target.

After the first human-authored revision, do not roll back to compiled content
or a pre-editor deployment. Roll back only to the pinned database-aware
deployment with the editor disabled.

Before enabling question creation, verify that this pinned build reads both
document structure v1 and v2 while the editor remains disabled. Exercise the
v1 database head, last-known-good cache, history preview and restore paths.
Only after those checks pass may a later deployment enable the first
v1-to-v2 question publication. Once any v2 revision can be written, never use
a v1-only build as a rollback target.

## Activate

1. Confirm the password hash, Firewall rules, Deployment Protection and
   database checks in Preview.
2. Set `MY_WORLD_FAQ_EDITOR_ENABLED=true` in Production and deploy.
3. Open `/my-world/faq/edit` over HTTPS. Confirm the cookie is named
   `__Host-my_world_faq_editor` and is `Secure`, `HttpOnly`, `SameSite=Lax`
   with `Path=/`.
4. Unlock, change a harmless test field, publish, reload the public FAQ, open
   **Versions & undo**, then restore the prior version.
5. Test a stale two-browser save. One publish must win; the other draft must
   remain available for comparison.
6. Add and publish one harmless test question. Confirm the first addition
   upgrades the document to structure v2, history can preview and restore both
   v1 and v2 exactly, and the public cache serves the v2 revision.
7. Test keyboard-only use, reduced motion, browser Back/Forward and widths
   320, 360, 768, 1024 and 1280 px. Check 200% and 400% zoom.
8. Confirm repeated unlock and mutation requests reach a real Vercel 429
   before function work.

Only then share the editor URL and password with the named team.

## Password rotation

Rotate when access changes or exposure is suspected:

1. Confirm Deployment Protection covers old generated deployments.
2. Generate a new password and hash.
3. Replace `MY_WORLD_FAQ_EDITOR_PASSWORD_HASH` and redeploy.
4. Confirm the old password and an existing cookie both fail. The credential
   fingerprint makes old sessions invalid.
5. Revoke remaining session rows, then verify the new password.
6. Recheck the canonical domain, Preview and historical deployment URLs.
7. Record the rotation time and operator without recording either secret.

If old protected deployments cannot be made inaccessible, stop and escalate
instead of rotating into a split-password state.

## Incident and rollback

For suspected defacement or credential exposure:

1. Immediately add WAF denies for the session, publish and restore endpoints.
   Temporarily deny the public FAQ too if serving the current head would cause
   harm. Preserve revisions and redacted security logs.
2. Rotate the password and hash, deploy a current database-aware build with
   `MY_WORLD_FAQ_EDITOR_ENABLED=false`, and verify Deployment Protection still
   covers Preview and historical generated deployment URLs.
   The build must support every structure version already present in revision
   history; after v2 activation, a v1-only build is not an incident rollback.
3. Add a narrow, temporary WAF exception for the named operator's current IP,
   then deploy the same database-aware build with the editor enabled and the
   new secret. Keep every other client behind the mutation deny.
4. Unlock with a fresh session and restore the immutable known-good revision.
   Restoration must create a new revision; never update or delete an existing
   revision row.
5. Verify the public head points to the restored content and prime and verify
   the validated public-only cache.
6. Deploy again with the editor disabled, remove the operator-IP exception,
   restore the baseline WAF rules, and prove both the old password and all old
   cookies fail.
7. If any step fails, keep the mutation deny in place and escalate. Do not
   reopen mutation traffic to continue troubleshooting.

Never update or delete a revision row. Restore creates a new revision and keeps
the full record.

## Retention and monitoring

- Keep FAQ revisions indefinitely until a separately approved retention policy
  replaces this rule.
- Expired or revoked editor sessions older than 30 days may be pruned; active
  sessions and revisions are never part of that cleanup.
- Retain redacted application security events for at least 30 days with access
  limited to named project operators.
- Alert on Firewall limits, session mutation limits, restore events and
  publication failures.
- Track unlock success and failure volume for incident scoping. Do not treat a
  self-declared display name as proof of identity.

## Release checks

Run the normal suite and the required disposable-Postgres lane:

```sh
pnpm build
pnpm check
pnpm test
TEST_DATABASE_URL=postgresql://... pnpm test:faq-db
```

The database URL must point to a disposable database. The FAQ database command
fails rather than silently skipping when that URL is absent.
