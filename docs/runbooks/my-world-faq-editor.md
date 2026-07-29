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

Follow the migration safeguards in
[`plans/071-production-migration-deploy-runbook.md`](../../plans/071-production-migration-deploy-runbook.md).
Use the direct unpooled credential, bounded lock and statement timeouts, and
verify the complete migration ledger, hashes and schema before and after.
Stop on any mismatch.

Then:

1. Run `pnpm db:migrate`.
2. Run `pnpm faq:bootstrap`.
3. Compare revision 1 and its digest with the compiled FAQ document. They must
   match exactly.
4. Deploy with `MY_WORLD_FAQ_CONTENT_SOURCE=database` and
   `MY_WORLD_FAQ_EDITOR_ENABLED=false`.
5. Confirm the public FAQ is database-backed and the editor, unlock, history,
   publish and restore surfaces all fail closed.
6. Load the public FAQ once to prime the validated public-only last-known-good
   cache. Verify a database outage serves that snapshot; an empty or corrupt
   cache must produce a generic 503.
7. Pin this database-authoritative, editor-disabled deployment as the rollback
   target.

After the first human-authored revision, do not roll back to compiled content
or a pre-editor deployment. Roll back only to the pinned database-aware
deployment with the editor disabled.

## Activate

1. Confirm the password hash, Firewall rules, Deployment Protection and
   database checks in Preview.
2. Set `MY_WORLD_FAQ_EDITOR_ENABLED=true` in Production and deploy.
3. Open `/my-world/faq/edit` over HTTPS. Confirm the cookie is named
   `__Host-my_world_faq_editor` and is `Secure`, `HttpOnly`, `SameSite=Lax`
   with `Path=/`.
4. Unlock, change a harmless test field, publish, reload the public FAQ, check
   revision history, then restore the prior version.
5. Test a stale two-browser save. One publish must win; the other draft must
   remain available for comparison.
6. Test keyboard-only use, reduced motion, browser Back/Forward and widths
   320, 360, 768, 1024 and 1280 px. Check 200% and 400% zoom.
7. Confirm repeated unlock and mutation requests reach a real Vercel 429
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

1. Set `MY_WORLD_FAQ_EDITOR_ENABLED=false` and deploy the pinned rollback
   target.
2. Preserve revisions and redacted security logs.
3. Review the current head and restore the last approved revision through a
   current database-aware build.
4. Rotate the password and revoke sessions.
5. Re-run the activation smoke tests before sharing access again.

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
