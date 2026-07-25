# Plan 038: In-app demo persona switcher — switch demo-a/b/c/d without editing `.env`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/auth src/routes/api/auth src/server/auth-menu.handler.server.ts src/server/auth-menu.functions.ts src/components/student-space/sheets/SettingsSheet.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Known benign case: plan 037 edits
> `SettingsSheet.tsx`'s restart-handler `catch` block (~line 51), shifting
> later line numbers by a couple of lines with identical content — if the
> cited code exists with the same content at a slightly shifted line, proceed;
> STOP only on *content* mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (demo/dev surface, gated the same way the existing demo cookie is)
- **Depends on**: none (coordinate with plan 037 — both touch `SettingsSheet.tsx`)
- **Category**: dx | demo UX
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

Four demo students are seeded (`demo-a` Alice through `demo-d`), each with a
distinct curated corpus, but the app can only ever show `demo-a`: the
"Use a demo account" flow always mints (or preserves) one cookie identity, and
switching students requires editing `DEV_BYPASS_AUTH` in `.env` and restarting
the dev server. A live "let me show you a different student" moment is
impossible. This plan adds a demo-session-only switcher in Settings that
rewrites the demo cookie and reloads.

## Current state

Relevant files:

- `src/auth/demo.ts` — demo identity constants and validators (client-safe).
- `src/auth/demo-session.server.ts` — mints/reads the demo cookie.
- `src/routes/api/auth/sign-in.tsx` — the "Use a demo account" POST flow.
- `src/auth/middleware.ts` — `DEV_BYPASS_AUTH` escape hatch (read-only context;
  do not modify).
- `src/server/auth-menu.handler.server.ts` + `src/server/auth-menu.functions.ts`
  — how identity kind reaches the client today.
- `src/components/student-space/sheets/SettingsSheet.tsx` — where the switcher UI goes.

Key excerpts (verified at `a9e1364e`):

`src/auth/demo.ts:1-6`:

```ts
export const DEMO_STUDENT_IDS = ['demo-a', 'demo-b', 'demo-c', 'demo-d'] as const
export type DemoStudentId = (typeof DEMO_STUDENT_IDS)[number]

export const DEFAULT_DEMO_STUDENT_ID: DemoStudentId = 'demo-a'
export const DEMO_AUTH_COOKIE = 'sensemaking-demo-student'
```

`src/auth/demo-session.server.ts:22-27` — the cookie minter **already accepts
any `DemoStudentId`**; nothing new is needed at this layer:

```ts
export function demoCookieHeader(
  studentId: DemoStudentId = DEFAULT_DEMO_STUDENT_ID,
  secure = process.env.NODE_ENV === 'production',
): string {
  return [
    `${DEMO_AUTH_COOKIE}=${encodeURIComponent(studentId)}`,
```

`src/routes/api/auth/sign-in.tsx:46-67` — the existing demo POST: same-origin
check, then preserves the existing cookie value or falls back to `demo-a`:

```ts
export async function handleSignInPost({ request }: { request: Request }): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return new Response('Demo sign-in must start from this site.', { status: 403 })
  }
  ...
  const existing = getDemoBypassAuthFromCookie()
  const studentId = normalizeDemoStudentId(existing?.activeStudentId) ?? DEFAULT_DEMO_STUDENT_ID
  return redirectTo(returnPathname, 303, {
    'Set-Cookie': demoCookieHeader(studentId),
  })
}
```

`src/server/auth-menu.handler.server.ts:7-14` — the identity shape the client
already receives (this is how the switcher knows it's a demo session):

```ts
export type AuthMenuState =
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      label: string
      detail: string | null
      kind: 'workos' | 'demo' | 'dev-bypass'
    }
```

`src/server/auth-menu.functions.ts:3-6` — exposed as the `loadAuthMenu`
server function (`createServerFn({ method: 'GET' })`); the `detail` field
carries the active demo student id (`auth-menu.handler.server.ts:37`).

`SettingsSheet.tsx` structure: sections are `SettingsGroup` components
(`SettingsSheet.tsx:126-142`) with `title` + `help` + children; buttons follow
the "Restart onboarding" style (`SettingsSheet.tsx:111-118`, `data-testid`
attribute, rounded border button classes). Match this exactly.

Repo conventions that bind this plan:

- **Tenancy**: every DB read/write goes through the `withStudent` envelope
  keyed off the session identity (CLAUDE.md). The switcher ONLY changes the
  cookie identity via the existing server-side minter — it must not add any
  code path that queries another student's data inside the current session.
- **UI**: Base UI (`@base-ui-components/react`) for headless behavior, local
  shadcn-style visual primitives in `src/components/ui/*`. This switcher only
  needs plain buttons in the existing SettingsGroup style — do NOT install any
  package.
- `DEV_BYPASS_AUTH` may be read in exactly one place
  (the actual `process.env.DEV_BYPASS_AUTH` read is `src/auth/middleware.ts:33`;
  lines 22-25 are its JSDoc — CI-guarded). Do not reference it anywhere new.

## Commands you will need

| Purpose   | Command                                                            | Expected on success |
|-----------|--------------------------------------------------------------------|---------------------|
| Gates     | `pnpm check`                                                       | exit 0, 0 errors    |
| Component test | `pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx` | all pass |
| Handler test   | `pnpm vitest run test/server/demo-switch.test.ts` (new)       | all pass            |
| Dev run   | `pnpm dev` (needs `DATABASE_URL`)                                  | serves on 3000/`PORT` |

Note: full `pnpm test` has 10 known pre-existing failures at planning time
(plan 034 fixes them); compare counts against a baseline, don't expect green.

## Scope

**In scope** (the only files you should modify/create):

- `src/routes/api/auth/sign-in.tsx` — extend the demo POST to accept an
  explicit student id (step 1)
- `src/components/student-space/sheets/SettingsSheet.tsx` — switcher UI (step 2)
- `test/server/demo-switch.test.ts` (create)
- `test/components/student-space/sheets/settings-sheet.test.tsx` (extend)

**Out of scope** (do NOT touch, even though they look related):

- `src/auth/middleware.ts` and anything reading `DEV_BYPASS_AUTH` — the env
  bypass is a separate, CI-guarded mechanism.
- The WorkOS flow in `sign-in.tsx` (`handleSignInGet`, `getSignInUrl`) — real
  auth is untouched.
- `src/auth/demo-session.server.ts` / `src/auth/demo.ts` — they already
  support arbitrary demo ids; no changes needed.
- Seed data / DB code — the personas already exist.

## Git workflow

- Branch: `advisor/038-demo-persona-switcher`
- Conventional commits (e.g. `feat(demo): settings switcher for demo-a..d personas`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Let the demo sign-in POST accept an explicit student id

In `src/routes/api/auth/sign-in.tsx` `handleSignInPost`, after the existing
`demo === '1'` check, read a `student` value from the POST (accept either a
`student` search param or a form field — pick the search param for symmetry
with `demo`/`returnPathname`). Resolution order:

1. `normalizeDemoStudentId(requestedStudent)` if present and valid → use it.
2. else the existing behavior verbatim (preserve current cookie, fall back to
   `demo-a`).

Invalid/unknown `student` values must fall through to (2) — never 500. The
same-origin check stays first. Keep `HttpOnly` cookie semantics (that's why
this goes through the endpoint rather than `document.cookie`).

Target shape (adjust to fit the file's style):

```ts
const requested = normalizeDemoStudentId(urlParts.searchParams.get('student'))
const existing = getDemoBypassAuthFromCookie()
const studentId =
  requested ?? normalizeDemoStudentId(existing?.activeStudentId) ?? DEFAULT_DEMO_STUDENT_ID
```

**Verify**: `pnpm check` → exit 0. New handler test from the Test plan passes:
`pnpm vitest run test/server/demo-switch.test.ts`.

### Step 2: Add the "Demo student" SettingsGroup

In `SettingsSheet.tsx`, add a `SettingsGroup` (title "Demo student", help
"Switch which seeded demo student this browser is signed in as. Demo sessions
only.") rendered **only when the session is a demo session**:

- Fetch identity with the existing `loadAuthMenu` server function
  (`src/server/auth-menu.functions.ts`) in a `useEffect` on mount (the sheet
  has no loader; follow the fetch-in-effect pattern used by
  `GrowthYearSummary` in `HistorySheet.tsx:552-572`). Render the group only
  when `state.kind === 'demo'` or `state.kind === 'dev-bypass'`; for
  `dev-bypass`, render the buttons disabled with the help text "Set by
  DEV_BYPASS_AUTH — switch students in .env" (the cookie cannot override the
  env bypass: `loadAuthMenuHandler` checks `getDevBypassAuth()` first,
  `auth-menu.handler.server.ts:17-25`).
- Render one button per `DEMO_STUDENT_IDS` entry (import from `~/auth/demo` —
  it is client-safe: constants and pure functions only). Mark the active one
  (compare against `detail` from `AuthMenuState`) with `aria-current="true"`
  and the visual style of the active state; give each
  `data-testid={`settings-demo-student-${id}`}`.
- On click (non-active only): submit a POST to
  `/api/auth/sign-in?demo=1&student=<id>&returnPathname=/` and then hard-reload
  via `window.location.assign('/')` so the engine and its backend snapshot
  fully re-boot for the new student. Simplest robust mechanism: create and
  submit a `<form method="post">` appended to `document.body` — this is the
  exact pattern the login screen already uses (see
  `test/components/student-space/onboarding/edupass-login.test.tsx`, "demo
  form submit disposes the engine and submits via a body-scoped form", and its
  implementation in `src/components/student-space/onboarding/EdupassLogin.tsx`
  — read it and match it). A same-origin form POST satisfies
  `isSameOriginRequest`, and the 303 redirect to `/` completes the reload —
  no separate `window.location.assign` needed if you let the form navigate.

**Verify**: `pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx`
→ all pass, including the new cases.

### Step 3: Manual demo-path check (if a local DB is available)

`pnpm dev`, sign in via "Use a demo account", open `/settings` → the Demo
student group shows demo-a active; click demo-b → page reloads, History shows
demo-b's corpus, `/settings` now shows demo-b active. If no local DB is
available, state that this step was skipped in your report.

**Verify**: manual, as described.

## Test plan

- **New** `test/server/demo-switch.test.ts` — model structurally on
  `test/server/auth-menu.test.ts` (`@vitest-environment node`, `vi.hoisted`
  mocks). Cases for `handleSignInPost` (import from
  `~/routes/api/auth/sign-in`; mock `~/auth/same-origin` to return true, and
  the demo-session imports as needed):
  1. `demo=1&student=demo-b` → 303, `Set-Cookie` contains
     `sensemaking-demo-student=demo-b`.
  2. `demo=1&student=not-a-student` with an existing `demo-c` cookie → falls
     back to `demo-c` (existing preserved).
  3. `demo=1` with no `student` and no cookie → `demo-a` (regression: existing
     default behavior unchanged).
  4. Non-same-origin request → 403 (regression).
- **Extend** `test/components/student-space/sheets/settings-sheet.test.tsx`
  (reuse its `renderSettings` helper; mock the `loadAuthMenu` server-function
  module with `vi.mock`):
  1. `kind: 'demo', detail: 'demo-a'` → four persona buttons render, demo-a
     is `aria-current`.
  2. `kind: 'workos'` → the Demo student group does not render.
  3. Clicking demo-b submits a form/POST targeting
     `/api/auth/sign-in?demo=1&student=demo-b...` (assert the same way the
     edupass-login test asserts its body-scoped form submit).
- Verification: both files green via the commands table.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/server/demo-switch.test.ts` → ≥4 tests, all pass
- [ ] `pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx` → all pass, ≥3 new cases
- [ ] `grep -rn "DEV_BYPASS_AUTH" src/ | grep -v "auth/middleware.ts"` → no new hits vs `a9e1364e` (only pre-existing comment references)
- [ ] `grep -n "document.cookie" src/components/student-space/sheets/SettingsSheet.tsx` → 0 (cookie set server-side only)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `handleSignInPost` in `sign-in.tsx` no longer matches the excerpt (drift).
- Rendering the switcher requires new auth surface area (a new endpoint or a
  change to `demo-session.server.ts`) — the existing minter + POST endpoint
  should be sufficient; if not, the plan's assumption is wrong.
- `loadAuthMenu` cannot be called from the Settings sheet without pulling in
  server-only imports at build time (check how other sheets call server
  functions first — e.g. the fetch pattern in `HistorySheet.tsx`).
- Plan 037 already landed a conflicting change to `SettingsSheet.tsx` that
  your edit cannot rebase cleanly onto.

## Maintenance notes

- If new demo students are added to `DEMO_STUDENT_IDS`, the switcher picks
  them up automatically (it maps over the constant).
- Reviewer should scrutinize: (a) the switcher never renders for `workos`
  sessions, (b) the POST path preserves the same-origin check ordering,
  (c) no client-side cookie writes.
- Deferred: labeling buttons with persona display names (Alice, …) — student
  display names live in seed data, not in a client-safe constant; wiring that
  through is cosmetic and left out.
- Related follow-up (separate plan 035): the personas' seed dates rot; the
  switcher makes this more visible since demo-b/c/d corpora are older.
