# Plan 049: Collapse the four stale same-origin copies onto the hardened helper, and make the cron secret comparison constant-time

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/auth/same-origin.ts src/routes/api/share/ src/routes/api/island/snapshot.tsx src/routes/api/openai/realtime-mirror.tsx src/server/run-connector.handler.server.ts test/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW–MED (stricter checks reject header-less POSTs; tests must adapt, not the check)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

The repo has a hardened same-origin gate at `src/auth/same-origin.ts` whose
own header comment records *why* the old permissive logic was a bug (requests
that omit both `Origin` and `Sec-Fetch-Site` — curl, server-side fetchers —
sailed through). That fix never propagated: **four** state-changing API
routes (share-link create/revoke/redactions — which mint and control public
links to minors' profiles — and island-snapshot persistence) each carry a
private copy of the *old* permissive logic, and the realtime voice-session
POST has no same-origin check at all. Separately, the highest-privilege
route in the app (the cron that fans Connector runs across every student)
compares its bearer secret with a short-circuiting `===`. This plan is
DRY-as-security: one hardened primitive, imported everywhere, with a guard
test so a fifth copy can never appear. No user-facing behavior changes —
real browsers always send at least one of the two headers on credentialed
POSTs.

## Current state

The hardened canonical helper — `src/auth/same-origin.ts:1-21` (read the
whole file; the comment is the contract):

```ts
// Same-origin gate shared by `/api/auth/sign-in` (demo POST) and
// `/api/auth/sign-out`. Refuses requests that cannot positively prove they
// originated on this site.
//
// The earlier implementation passed any request that lacked both the `Origin`
// header and a `Sec-Fetch-*` hint, on the assumption that a missing header
// meant a same-origin top-level navigation. That assumption is false for
// tools like curl, server-side fetchers, or browsers stripped of fetch
// metadata — they can drive state-changing endpoints by simply omitting the
// signals we used to require. Modern browsers always send at least one of
// `Origin` or `Sec-Fetch-Site` on a credentialed POST, so demanding positive
// proof here is safe for real users and closes the curl-style bypass.

export function isSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (origin) return origin === requestUrl.origin
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite) return fetchSite === 'same-origin'
  return false
}
```

The four stale private copies — byte-identical permissive logic (this is the
*old* pre-fix version; note it returns `true` when both headers are absent):

- `src/routes/api/share/create.tsx:52-58`
- `src/routes/api/share/revoke.tsx:50-56`
- `src/routes/api/share/redactions.tsx:50-56`
- `src/routes/api/island/snapshot.tsx:52-58`

```ts
function isSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (origin && origin !== requestUrl.origin) return false
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  return fetchSite !== 'cross-site'
}
```

The realtime voice-session route — `src/routes/api/openai/realtime-mirror.tsx`
(whole file) — a state-changing, cookie-credentialed POST that brokers a paid
OpenAI session, currently with **no** same-origin check (auth happens inside
the handler; the CSRF-shaped gate is missing):

```ts
import { createFileRoute } from '@tanstack/react-router'
import { openAIRealtimeMirrorSessionHandler } from '~/server/openai-realtime-mirror-session.handler.server'

export const Route = createFileRoute('/api/openai/realtime-mirror')({
  server: {
    handlers: {
      POST: ({ request }) => openAIRealtimeMirrorSessionHandler(request),
    },
  },
})
```

The cron secret comparison — `src/server/run-connector.handler.server.ts:185-189`
(the fail-closed empty-secret branch is correct; the `===` is the issue):

```ts
function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('Authorization') === `Bearer ${secret}`
}
```

(`CRON_SECRET` is an environment-variable bearer credential; never write its
value anywhere. No rotation is needed for this change — the secret is not
exposed, only compared suboptimally.)

How the four routes *use* the check (pattern from `share/create.tsx`, the
others match): near the top of the POST handler there is
`if (!isSameOriginRequest(request)) { return jsonError(403, ...) }` or
equivalent. Read each file to confirm the call site before editing.

Existing exemplar for route-handler tests with mocked deps:
`test/auth/routes.test.ts` (node environment, `vi.hoisted` mocks, calls the
exported handler functions directly with a constructed `Request`).

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`;
Vitest tests in `test/` mirroring `src/`; conventional commits. Baseline:
`pnpm test` = 911 passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose   | Command                                             | Expected on success                  |
|-----------|-----------------------------------------------------|--------------------------------------|
| Check     | `pnpm check`                                        | exit 0 (18 pre-existing warnings OK) |
| All tests | `pnpm test`                                         | ≥911 passed, 0 failed                |
| One file  | `pnpm test -- test/auth/same-origin-routes.test.ts` | new tests pass                       |
| Grep gate | `grep -rn 'function isSameOriginRequest' src/`      | exactly 1 hit (`src/auth/same-origin.ts`) |

## Scope

**In scope** (the only files you should modify/create):

- `src/routes/api/share/create.tsx`
- `src/routes/api/share/revoke.tsx`
- `src/routes/api/share/redactions.tsx`
- `src/routes/api/island/snapshot.tsx`
- `src/routes/api/openai/realtime-mirror.tsx`
- `src/server/run-connector.handler.server.ts` (the `isAuthorizedCronRequest` function only)
- `test/auth/same-origin-routes.test.ts` (create)
- Existing tests for the touched routes IF they construct header-less POST
  requests that now correctly fail (fix the *test requests* by adding an
  `Origin` header — never weaken the check)

**Out of scope** (do NOT touch, even though they look related):

- `src/auth/same-origin.ts` itself — it is already correct; nothing to change.
- `src/routes/api/auth/sign-in.tsx` / `sign-out.tsx` — already import the
  hardened helper.
- Rate limiting / request-size bounds on the realtime route — that is
  plan 051's scope.
- The GET/read paths of the share routes and `share.$token.tsx` — reads are
  not CSRF targets.

## Git workflow

- Branch: `advisor/049-consolidate-security-primitives`
- Conventional commits, e.g.
  `fix(api): use hardened same-origin gate on share/island/realtime routes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap the four private copies for the canonical import

In each of the four route files, delete the local
`function isSameOriginRequest(...)` and add
`import { isSameOriginRequest } from '~/auth/same-origin'` (match the file's
existing `~/` import style). Do not change the call sites — the function
name and signature are identical.

**Verify**: `grep -rn 'function isSameOriginRequest' src/` → exactly one
match, in `src/auth/same-origin.ts`. Then `pnpm check` → exit 0.

### Step 2: Add the same-origin gate to the realtime-mirror route

In `src/routes/api/openai/realtime-mirror.tsx`, gate the POST before
invoking the handler:

```ts
import { createFileRoute } from '@tanstack/react-router'
import { isSameOriginRequest } from '~/auth/same-origin'
import { openAIRealtimeMirrorSessionHandler } from '~/server/openai-realtime-mirror-session.handler.server'

export const Route = createFileRoute('/api/openai/realtime-mirror')({
  server: {
    handlers: {
      POST: ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return new Response('Realtime session must start from this site.', { status: 403 })
        }
        return openAIRealtimeMirrorSessionHandler(request)
      },
    },
  },
})
```

Check the in-app caller still works by reading
`src/lib/student-space/realtime-mirror-client.ts:82` — it POSTs to the
same-origin `/api/openai/realtime-mirror` via browser `fetch`, which always
sends `Sec-Fetch-Site: same-origin` (and `Origin` on POST), so it passes the
positive-proof check. Also check
`test/server/openai-realtime-mirror-session.test.ts` — it tests the
*handler* directly (not the route), so it should be unaffected; confirm.

**Verify**: `pnpm test -- test/server/openai-realtime-mirror-session.test.ts`
→ all pass, unchanged.

### Step 3: Constant-time cron secret comparison

In `src/server/run-connector.handler.server.ts`, replace the body of
`isAuthorizedCronRequest` (keep the exported/local shape and the fail-closed
empty-secret branch):

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const presented = request.headers.get('Authorization')
  if (!presented) return false
  // Hash both sides to equal length so timingSafeEqual never throws on
  // length mismatch and length itself leaks nothing.
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(a, b)
}
```

Put the `node:crypto` import at the top of the file with the other imports.

**Verify**: `pnpm check` → exit 0.

### Step 4: Write the table-driven route tests + the DRY guard test

Create `test/auth/same-origin-routes.test.ts` (node environment; model the
mocking style on `test/auth/routes.test.ts`). Contents:

1. **Unit table over the canonical helper** (no mocks needed — pure):
   for each of: matching `Origin` → true; mismatched `Origin` → false;
   no `Origin` + `Sec-Fetch-Site: same-origin` → true; no `Origin` +
   `Sec-Fetch-Site: cross-site` → false; **neither header → false** (the
   regression this plan exists for). Build `Request` objects with
   `new Request('https://app.example/api/x', { method: 'POST', headers })`.
2. **DRY guard**: recursively read `src/` (use `node:fs` + a small walk, or
   `child_process`-free `fs.readdirSync` recursion), assert the string
   `function isSameOriginRequest` appears in exactly one file:
   `src/auth/same-origin.ts`. Comment the test: "a second definition means
   someone re-forked the security primitive — import ~/auth/same-origin
   instead."
3. **Route-level spot check**: import the realtime route file's handler is
   not directly exported — so instead assert at the source level that each
   of the five route files imports from `~/auth/same-origin`
   (read file, expect `from '~/auth/same-origin'`). This keeps the test
   free of TanStack route mocking.

**Verify**: `pnpm test -- test/auth/same-origin-routes.test.ts` → all pass.

### Step 5: Run the touched routes' existing tests and the full gate

Some existing tests may construct POSTs without `Origin`/`Sec-Fetch-Site`
and previously passed under the permissive copies. Run the full suite; for
any newly failing test that asserts a *success* path, add
`Origin: <request URL origin>` to the test request. Never modify the check
to accommodate a test.

**Verify**: `pnpm check && pnpm test` → check exit 0; ≥911 passed, 0 failed.

## Test plan

- New `test/auth/same-origin-routes.test.ts` (Step 4): helper truth table
  (5 cases incl. the neither-header rejection), single-definition DRY guard,
  import-presence check on the five route files.
- Cron reject path: add to the same file — build a `Request` with a wrong
  `Authorization` header, call the route's authorization logic if exported;
  if `isAuthorizedCronRequest` is not exported, test via the cron route
  test seam that already exists (search `test/` for `run-connector` route
  tests first; if none and the function is private, export it — it is pure
  and safe to export for testing).
- Pattern exemplar: `test/auth/routes.test.ts`.
- Verification: `pnpm test` → 0 failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn 'function isSameOriginRequest' src/` → exactly 1 match (src/auth/same-origin.ts)
- [ ] `grep -rln "from '~/auth/same-origin'" src/routes/api/` → includes share/create, share/revoke, share/redactions, island/snapshot, openai/realtime-mirror
- [ ] `grep -n 'timingSafeEqual' src/server/run-connector.handler.server.ts` → ≥1 match; `grep -n "=== \`Bearer" src/server/run-connector.handler.server.ts` → no match
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed + new tests
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the four route files' local copy does NOT match the excerpt above
  (drift — someone may have partially fixed or further diverged them).
- A **non-test** caller in `src/` or `scripts/` POSTs to any touched route
  without setting `Origin`/`Sec-Fetch-Site` (e.g. a server-side fetch to
  our own API) — the stricter check would break it; report the caller
  instead of adding a bypass.
- `test/server/openai-realtime-mirror-session.test.ts` fails after Step 2 —
  that test targets the handler, not the route; a failure means the plan's
  assumption about the seam is wrong.
- The cron route has an integration test that asserts timing or exact
  comparison semantics (unlikely) — report rather than re-pin.

## Maintenance notes

- The DRY guard test makes the single-definition rule mechanical. If a new
  state-changing route is added, the reviewer checklist is: does it import
  `~/auth/same-origin`, and is it added to the import-presence list in
  `test/auth/same-origin-routes.test.ts`?
- Plan 051 (rate limiting) touches the same realtime route file — if both
  land, 049 first; 051's diff should compose cleanly on top of the gated
  POST shape from Step 2.
- `timingSafeEqual`-via-sha256 is the standard length-safe idiom; if the
  repo later adds a shared `constantTimeEquals` util, fold this into it.
- Deferred deliberately: CSRF tokens. The Origin/Sec-Fetch-Site positive
  proof is the repo's chosen CSRF posture (documented in
  `src/auth/same-origin.ts`); introducing synchronizer tokens is a bigger
  design change than these findings warrant.
