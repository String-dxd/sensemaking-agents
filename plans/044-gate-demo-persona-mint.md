# Plan 044: Gate the demo-persona cookie mint behind an explicit environment flag

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/auth/demo.ts src/auth/demo-session.server.ts src/routes/api/auth/sign-in.tsx test/auth/ test/server/demo-switch.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (behaviour is identical whenever the flag is set; the demo deployment sets it)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

On the deployed site an unauthenticated visitor can mint themselves a real
student session. `handleSignInPost` sets the `sensemaking-demo-student` cookie
for any same-origin `POST /api/auth/sign-in?demo=1&student=demo-b` — no
`NODE_ENV` check, no feature flag, and `hasWorkosEnv()` is never consulted on
that path. `requireCounselorContext()` then accepts that cookie as a
server-resolved identity, and the synthetic counselor is lazily granted
`counselor_students` rows for `demo-a…demo-d`, so Postgres RLS legitimately
admits the reads and writes. Net: any visitor can read four demo students'
seeded reflections, write new ones into their timelines, and drive the paid
Mirror/Connector/Cartographer endpoints on the maintainer's API keys. This plan
puts the mint behind one explicit flag: the deployed demo keeps working
byte-for-byte, a random visitor gets a 404.

## Current state

- `src/routes/api/auth/sign-in.tsx` — WorkOS initiator (`GET`) + the demo cookie
  mint (`POST`). `handleSignInPost` is the vulnerable path.
- `src/auth/demo.ts` — pure demo constants/helpers (`DEMO_STUDENT_IDS`,
  `DEFAULT_DEMO_STUDENT_ID`, `normalizeDemoStudentId`, `safeReturnPathname`, …).
  **The new flag helper goes here**, beside them.
- `src/auth/demo-session.server.ts` — server-only cookie read/serialize helpers.
- `src/auth/identity.ts` — `requireCounselorContext()`, the single identity seam.

The mint — `src/routes/api/auth/sign-in.tsx:46-72`, verbatim head and tail:

```tsx
export async function handleSignInPost({ request }: { request: Request }): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Demo sign-in must start from this site.', { status: 403 })
  }

  const urlParts = new URL(request.url)
  const returnPathname = safeReturnPathname(urlParts.searchParams.get('returnPathname'))
  if (urlParts.searchParams.get('demo') !== '1') return redirectTo(returnPathname)

  const { demoCookieHeader, getDemoBypassAuthFromCookie } = await import(
    '~/auth/demo-session.server'
  )
  // …resolution order: explicit ?student= > existing cookie > DEFAULT_DEMO_STUDENT_ID…
  return redirectTo(returnPathname, 303, {
    'Set-Cookie': demoCookieHeader(studentId),
  })
}
```

The cookie read that turns it into an identity —
`src/auth/demo-session.server.ts:11-20`, verbatim:

```ts
export function getDemoBypassAuthFromCookie() {
  let raw: string | undefined
  try {
    raw = getCookie(DEMO_AUTH_COOKIE)
  } catch {
    return null
  }
  const studentId = normalizeDemoStudentId(raw)
  return studentId ? makeBypassIdentity(studentId) : null
}
```

Why the cookie is *real* — `src/auth/identity.ts:80-87`, verbatim:

```ts
  const demoBypass = getDemoBypassAuthFromCookie()
  if (demoBypass) {
    await bootstrapDemoStudentsForCounselor(demoBypass.counselorId)
    return {
      counselorId: demoBypass.counselorId,
      studentId: demoBypass.activeStudentId,
    }
  }
```

`bootstrapDemoStudentsForCounselor` (`src/auth/middleware.ts:54-57`) delegates to
`attachCounselorToDemoStudents` (`src/db/client.ts:247-256`), which inserts a
`counselor_students` row per `DEMO_STUDENT_IDS` — so RLS is satisfied by design
once the cookie is accepted.

The flag idiom to copy — `src/server/load-pipeline-trace.handler.server.ts:39`,
verbatim:

```ts
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_PIPELINE !== '1') {
    throw new Error('loadPipelineTrace is dev-only')
  }
```

**Constraint found during recon**: `src/auth/demo.ts` is reachable from the
*client* bundle — `src/components/student-space/sheets/SettingsSheet.tsx:3`
imports `DEMO_STUDENT_IDS` from it. The new helper must therefore guard its
`process.env` reads; it is only ever *called* from server code but it *is*
bundled for the browser.

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest tests
in `test/` mirroring `src/`; React tests use Testing Library + happy-dom;
conventional commits (e.g.
`fix(history): bucket entry dates in Asia/Singapore, not UTC`). Baseline:
`pnpm check` exits 0 with 18 pre-existing lint warnings; `pnpm test` = 911
passed / 128 skipped / 0 failed.

## Commands you will need

| Purpose        | Command                                              | Expected on success                  |
|----------------|------------------------------------------------------|--------------------------------------|
| Install        | `pnpm install`                                       | exit 0                               |
| Check          | `pnpm check`                                         | exit 0 (18 pre-existing warnings OK) |
| All tests      | `pnpm test`                                          | ≥911 passed, 0 failed                |
| Targeted       | `pnpm vitest run test/auth/demo.test.ts test/auth/routes.test.ts` | all pass          |
| Targeted       | `pnpm vitest run test/server/demo-switch.test.ts`    | all pass (unchanged)                 |

## Scope

**In scope** (the only files you should modify):

- `src/auth/demo.ts` — add `isDemoModeEnabled()`
- `src/routes/api/auth/sign-in.tsx` — 404 when disabled
- `src/auth/demo-session.server.ts` — cookie read returns `null` when disabled
- `test/auth/demo.test.ts`, `test/auth/routes.test.ts`
- `README.md` — one short paragraph documenting `ENABLE_DEMO_PERSONAS`

**Out of scope** (do NOT touch, even though they look related):

- `src/auth/middleware.ts` / `DEV_BYPASS_AUTH` — a separate documented dev
  hatch. Referencing `DEV_BYPASS_AUTH` outside that file **fails CI**
  (`.github/workflows/lint-no-dev-bypass-leak.yml`).
- `src/auth/identity.ts` — once the cookie read returns `null`, the existing
  fall-through already throws `UnauthenticatedError`.
- `src/db/client.ts` / `attachCounselorToDemoStudents` — the RLS grant is correct
  *given* an accepted identity; the fix belongs at the mint.
- `src/routes/api/auth/sign-out.tsx`, `clearDemoCookieHeader`,
  `demoCookieHeader` — sign-out must keep clearing the cookie even with demo
  mode off, or an issued cookie cannot be cleared from the UI.
- `handleSignInGet` — already 405s on `?demo=1`.
- Rate limiting, and any change to `isSameOriginRequest` — other plans.

## Git workflow

- Branch: `advisor/044-gate-demo-persona-mint`
- Conventional commits, e.g.
  `fix(auth): gate demo-persona cookie mint behind ENABLE_DEMO_PERSONAS`
- Do NOT push or open a PR unless the operator instructed it.

## Non-regression argument (state this in the PR)

The operator runs live demos **on the deployed site**, so this must not cost
ease-of-use or speed:

1. The demo deployment sets `ENABLE_DEMO_PERSONAS=1`. With the flag set,
   `isDemoModeEnabled()` returns `true` and **every path here behaves exactly as
   today** — same 303, same `Set-Cookie` bytes, same student-resolution order.
   No extra network call, no extra query: two `process.env` reads on a path that
   already does a dynamic `import()`.
2. Local dev needs **zero config** — `NODE_ENV !== 'production'` under
   `pnpm dev`/`pnpm test`, so "Use a demo account" and the Settings persona
   switcher keep working out of the box.
3. The only behaviour that changes is a production build *without* the flag —
   exactly the case the operator does not use and an attacker does.

## Steps

### Step 1: Add `isDemoModeEnabled()` to `src/auth/demo.ts`

Append (keep existing exports untouched). The `typeof process` guard is
load-bearing — this module is bundled for the browser:

```ts
/**
 * True when the browser-controlled demo-persona flow may mint a session.
 *
 * The demo cookie is a real, server-resolved identity: requireCounselorContext
 * accepts it and attachCounselorToDemoStudents grants it RLS access to the four
 * seeded demo students. Minting it must be an explicit operator posture, never
 * the default on a public deployment. Same idiom as ENABLE_DEV_PIPELINE in
 * src/server/load-pipeline-trace.handler.server.ts.
 *
 * This module is also bundled for the browser (SettingsSheet imports
 * DEMO_STUDENT_IDS), hence the guard; the helper is only called server-side.
 */
export function isDemoModeEnabled(): boolean {
  if (typeof process === 'undefined' || !process.env) return false
  if (process.env.ENABLE_DEMO_PERSONAS === '1') return true
  return process.env.NODE_ENV !== 'production'
}
```

**Verify**: `pnpm check` → exit 0.

### Step 2: 404 the mint when demo mode is off

In `src/routes/api/auth/sign-in.tsx`, add `isDemoModeEnabled` to the existing
`~/auth/demo` import (line 7), then insert the gate in `handleSignInPost`
**after** the `demo=1` check and **before** the dynamic import — so a non-demo
POST still redirects exactly as today:

```tsx
  if (urlParts.searchParams.get('demo') !== '1') return redirectTo(returnPathname)

  if (!isDemoModeEnabled()) {
    // Demo personas are a real identity (see src/auth/demo.ts). 404 rather than
    // 403 so a production deployment does not advertise that the flow exists.
    return new Response('Not found', { status: 404 })
  }
```

Use `404`, not `403`: `403` tells a prober the endpoint is real and merely off.

**Verify**: `pnpm check` → exit 0.
**Verify**: `grep -c 'isDemoModeEnabled' src/routes/api/auth/sign-in.tsx` → 2
(import + one call).

### Step 3: Make already-issued cookies stop resolving

In `src/auth/demo-session.server.ts`, add `isDemoModeEnabled` to the existing
`./demo` import block (lines 2–9) and gate the **read** only:

```ts
export function getDemoBypassAuthFromCookie() {
  // A demo cookie is only an identity while demo mode is enabled — otherwise a
  // previously issued (or cross-deployment) cookie would keep granting access
  // to the seeded demo students. See isDemoModeEnabled() in ./demo.
  if (!isDemoModeEnabled()) return null
  let raw: string | undefined
  // …unchanged…
}
```

Leave `demoCookieHeader` / `clearDemoCookieHeader` alone.

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/server/demo-switch.test.ts` → all pass. (That
file mocks `~/auth/demo-session.server` and `~/auth/same-origin` but **not**
`~/auth/demo`; under vitest `NODE_ENV === 'test'`, so the flag is on and today's
assertions hold.)

### Step 4: Add the tests

**4a — `test/auth/demo.test.ts`** (plain vitest; model on the existing
`describe('demo auth helpers', …)`). Add `describe('isDemoModeEnabled', …)` with
env save/restore in `afterEach` so nothing leaks into the rest of the suite:

- `NODE_ENV='development'`, flag unset → `true`
- `NODE_ENV='test'`, flag unset → `true`
- `NODE_ENV='production'`, flag unset → `false`
- `NODE_ENV='production'`, `ENABLE_DEMO_PERSONAS='1'` → `true`
- `NODE_ENV='production'`, `ENABLE_DEMO_PERSONAS='true'` → `false` (only the
  literal `'1'` enables it, matching the `ENABLE_DEV_PIPELINE` idiom)

**4b — `test/auth/routes.test.ts`** (already `// @vitest-environment node` with
`vi.hoisted` mocks for `getCookie`/`hasWorkosEnv`/`isAuthBypassed`, and a
`request()` helper at line 54). Add
`describe('/api/auth/sign-in — demo mode disabled', …)` that sets
`process.env.NODE_ENV = 'production'` and deletes `ENABLE_DEMO_PERSONAS` in
`beforeEach`, restoring both in `afterEach`:

1. **Mint 404s**: same-origin POST to `?demo=1&student=demo-b` (headers
   `{ Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' }`) → status
   `404`, `Set-Cookie` is `null`.
2. **Cookie read returns null**: with `mocks.getCookie.mockReturnValue('demo-c')`,
   import `getDemoBypassAuthFromCookie` from `~/auth/demo-session.server`;
   assert it returns `null` **and** `mocks.getCookie` was never called (the flag
   check short-circuits before the read).
3. **Non-demo POSTs unaffected**: same-origin POST without `demo=1` and with
   `returnPathname=/reflect` → 303 → `/reflect` (proves the gate sits after the
   `demo=1` branch).
4. **Flag set restores today's behaviour exactly**: with `NODE_ENV='production'`
   **and** `ENABLE_DEMO_PERSONAS='1'`, the case-1 POST returns 303 with
   `Set-Cookie: sensemaking-demo-student=demo-b; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax; Secure`.
   Note the `Secure` attribute: `demoCookieHeader`'s default is
   `process.env.NODE_ENV === 'production'`. The pre-existing assertions at
   `test/auth/routes.test.ts:79-81` run under `NODE_ENV='test'` and expect the
   header *without* `Secure` — do not "fix" those.

**Verify**: `pnpm vitest run test/auth/demo.test.ts test/auth/routes.test.ts`
→ all pass, including the new cases.

### Step 5: Document the env var in README

`README.md` has no env *table* — it documents flags in prose (see
`README.md:156` for `ENABLE_DEV_PIPELINE`). Match that and keep the edit
minimal: add one paragraph in the **Setup** section immediately after the
paragraph ending at `README.md:111` ("…no WorkOS variables needed."):

```markdown
On a deployed build the demo-persona flow is off unless the deployment sets
`ENABLE_DEMO_PERSONAS=1` — the demo cookie is a real identity with access to the
four seeded demo students, so a public production build must not mint it. Local
development needs no flag (`NODE_ENV` is not `production`).
```

Do not restructure README or touch any other section.

**Verify**: `grep -c 'ENABLE_DEMO_PERSONAS' README.md` → 1.

### Step 6: Full gate

**Verify**: `pnpm check` → exit 0 (warning count still 18).
**Verify**: `pnpm test` → ≥911 passed, 0 failed, 128 skipped.

## Test plan

- `test/auth/demo.test.ts`: 5-case truth table for `isDemoModeEnabled()` with env
  save/restore.
- `test/auth/routes.test.ts`: 4 route-level cases — mint 404s; cookie read
  returns `null` without reading the cookie; non-demo POST unaffected; flag set
  restores today's 303 + `Set-Cookie` exactly.
- Structural pattern: `test/auth/routes.test.ts` (node env, `vi.hoisted` mocks,
  handler called directly with a constructed `Request`).
- Must stay green unchanged: `test/server/demo-switch.test.ts` and the
  same-origin cases at `test/auth/routes.test.ts:84-105`.
- Verification: `pnpm test` → 0 failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed, 0 failed
- [ ] `grep -rn 'isDemoModeEnabled' src/` → hits in exactly 3 files
      (`src/auth/demo.ts` definition, `src/routes/api/auth/sign-in.tsx`,
      `src/auth/demo-session.server.ts`)
- [ ] `grep -rn 'ENABLE_DEMO_PERSONAS' src/ README.md` → the definition in
      `src/auth/demo.ts` plus one README mention; no other source hits
- [ ] `grep -rn 'DEV_BYPASS_AUTH' src/ | grep -v 'src/auth/middleware.ts'` → no
      output (CI lint guard stays satisfied)
- [ ] `git status` shows only the six in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `handleSignInPost` does not match the "Current state" excerpt (drift).
- Adding the `process.env` reads to `src/auth/demo.ts` produces a client
  build/type error or a new Biome error. Do **not** relocate the helper on your
  own judgement — report it; the fallback (moving `isDemoModeEnabled` into
  `src/auth/demo-session.server.ts`) changes which modules existing test mocks
  must stub, so the operator should choose.
- `test/server/demo-switch.test.ts` fails after Step 3 — it mocks
  `~/auth/demo-session.server` wholesale, so a failure means the mint path now
  depends on something the mock does not provide.
- `grep -rn 'getDemoBypassAuthFromCookie' src/` shows a consumer beyond
  `src/auth/identity.ts:80` and `src/routes/api/auth/sign-in.tsx:66` whose
  behaviour a `null` return would break unexpectedly.
- The change appears to require editing `src/auth/identity.ts` or
  `src/db/client.ts`.

## Maintenance notes

- **Deployment action required**: the demo deployment must set
  `ENABLE_DEMO_PERSONAS=1` in Vercel *before or with* this merge, or the live
  demo's "Use a demo account" button will 404. This is the one step the repo
  cannot verify.
- Reviewer should scrutinise: (1) the gate sits **after** the `demo=1` branch;
  (2) `clearDemoCookieHeader`/sign-out untouched, so an issued cookie can still
  be cleared; (3) the new tests restore `process.env` in `afterEach` — a leaked
  `NODE_ENV='production'` would silently change unrelated tests; (4) `404` not
  `403`.
- `demoCookieHeader`'s `Secure` attribute keys off `NODE_ENV === 'production'`
  independently of this flag. Demo mode on a plain-HTTP production host would
  set a `Secure` cookie the browser drops — correct, but a confusing failure
  mode worth a line in the demo runbook.
- Deliberately deferred: a real counsellor-role gate, rate limiting on
  `/api/auth/sign-in`, per-persona read-only mode. This plan only removes the
  "anyone can mint a session" property.
- If a third flag ever joins `ENABLE_DEV_PIPELINE` and `ENABLE_DEMO_PERSONAS`,
  consolidate into one `src/lib/feature-flags.ts`; two sites did not justify it.
