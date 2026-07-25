# Plan 051: Bound and rate-limit the paid-inference entry points

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/server/openai-realtime-mirror-session.handler.server.ts src/server/transcribe-mirror.handler.server.ts src/server/run-connector.handler.server.ts src/server/run-cartographer.handler.server.ts src/db/schema.ts src/db/queries.ts test/server/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a limit set too low degrades the live demo or the voice
  experience — the limits below are DoS backstops sized well above any
  legitimate flow, and Step 6 proves that with a test)
- **Depends on**: none. Plan 049 touches the same realtime route *file* but a
  different function; if both are queued, run 049 first and this composes on
  top.
- **Category**: security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Four handlers spend real money per call — OpenAI Realtime voice sessions,
OpenAI transcription, and two Anthropic Managed Agents runs — and none of them
has any per-caller ceiling. Authentication is correct on all four, so this is
not an access-control hole; it is a **billing-and-availability** hole: one
authenticated session can drive unbounded third-party spend and unbounded
serverless function-seconds, bounded only by a 120 s soft timeout per agent
run. That risk compounds while the demo-cookie gap (plan 044) stands, because
the set of "authenticated" callers is wider than the set of real students.

The realtime handler additionally reads its request body with an unbounded
`request.text()`, so an oversized body is fully materialised into a string and
forwarded upstream. SDP offers are a few kilobytes.

**Framing that must survive into the code comments**: these are **DoS
backstops, not product quotas**. Every limit below is set far above what any
legitimate student or demo flow can reach. If a student ever sees a 429, the
limit was wrong — not the student.

## Current state

### Site 1 — realtime voice session (unbounded body read, no limit)

`src/server/openai-realtime-mirror-session.handler.server.ts`. The auth and
secret handling here are **correct** and must not change: `requireCounselorContext`
runs before anything else, `OPENAI_API_KEY` never leaves the server, a
per-student `safetyIdentifier` is attached, and only the SDP is proxied.

```ts
// :51-65 (abridged — read the whole function before editing)
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/sdp')) {
    throw new OpenAIRealtimeMirrorSessionError('Expected application/sdp offer.', 415)
  }

  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  const env = deps.env ?? process.env
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) { … }

  const offer = await request.text()          // ← :62, unbounded
  if (!offer.trim()) {
    throw new OpenAIRealtimeMirrorSessionError('SDP offer is empty.', 400)
  }
```

`OPENAI_API_KEY` is an environment-variable API credential. This plan does not
expose it and no rotation is required.

**Honest note on the body guard**: `api/index.ts:39-52` fully buffers the
request body *before* constructing the `Request` the handler sees. So a
handler-level cap cannot prevent that buffering — what it does buy is (a) no
oversized string forwarded to OpenAI, (b) a clear `413` instead of an opaque
upstream error, and (c) a bounded `TextDecoder` allocation. Say exactly that in
the code comment; do not over-claim.

### Site 2 — transcription (bounded audio, no limit)

`src/server/transcribe-mirror.handler.server.ts:14` already bounds the payload
well — `const MAX_AUDIO_BYTES = 25 * 1024 * 1024`, enforced at `:68-73`. That
part is fine. What is missing is a call ceiling. Note the dep seam at `:32-37`:
`authenticate?: () => Promise<unknown>` — typed `unknown`, so `studentId` is
not reachable through it today. Step 4 tightens that type.

### Site 3 — manual Connector run

`src/server/run-connector.handler.server.ts:52-59`:

```ts
export async function runConnectorHandler(
  data: RunConnectorInput,
  deps: RunConnectorDeps = {},
): Promise<RunConnectorResult> {
  const parsed = runConnectorInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  return runConnectorForStudent(studentId, parsed, deps)
}
```

Batch size defaults to `DEFAULT_CONNECTOR_BATCH_LIMIT = 5` (`:11`), each entry
a separate managed-agent run at up to 120 s (`src/agents/runner.ts:23` —
`DEFAULT_TIMEOUT_MS = 120_000`).

**The cron path is separate and must stay exempt**: `runConnectorCronHandler`
(`:127-170`) authorises via `CRON_SECRET` and calls `runConnectorForStudent`
**directly**, not `runConnectorHandler`. Putting the limiter in
`runConnectorHandler` therefore exempts the cron automatically. Do not add a
limiter to `runConnectorForStudent`.

### Site 4 — manual Cartographer run

`src/server/run-cartographer.handler.server.ts:129-134`:

```ts
export async function runCartographerHandler(
  data: RunCartographerInput,
  deps: RunCartographerDeps = {},
): Promise<RunCartographerResult> {
  runCartographerInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
```

### How errors reach the client

`src/lib/student-space/backend-bridge.ts:244-250` wraps `runConnector` and
throws only when `isHardFailedConnectorResult(result)` — a membership test
against a runtime `Set` of six status strings (`:413-428`). `:269-275` wraps
`runCartographer` and throws whenever `ok === false` (`:430-439`). The demo
capture-time path (`maybeRunDemoConnectorAfterCapture`, `:317-336`) catches and
logs, never surfacing to the capture UX — so a 429 there degrades silently,
which is the desired behaviour. **No bridge change is needed**; Step 4 explains
why for each site.

### The prewarm amplification — read this before choosing limits

`src/lib/student-space/realtime-mirror-client.ts:183-208`
(`prewarmRealtimeMirrorCapture`) opens a **real** realtime session — i.e. a POST
to `/api/openai/realtime-mirror` — speculatively. It is called from:

- `src/components/student-space/capture/CaptureFab.tsx:103` — on hover/focus
  (when mic permission is already granted) and unconditionally on press.
- `src/components/student-space/capture/AskSheet.tsx:307-308` — on every sheet
  open, disposed on close.

So realtime-session POSTs are triggered by *hovering* and by opening/closing
the capture sheet, not only by recording. An operator demoing for an hour can
easily mint dozens. **This is why the realtime limit in this plan is 120/hour,
not the 20/hour a naive reading would suggest.** A limit that a hovering
operator can hit would be a demo-breaking regression.

### DB conventions to match

Tenancy: every read/write goes through `withStudent`
(`src/db/client.ts:150-165`) which sets the `app.student_id` GUC as the first
statement of a transaction; every `student_id` table declares an RLS policy
against it.

Closest structural exemplar for a per-student counter table —
`src/db/schema.ts:356-374` (`vipsForgetCount`): a `pgTable` with a
`studentId` text column, a `primaryKey`/`index` tuple, a `check(...)` for the
closed enum, and a `pgPolicy('<table>_rls', { as: 'permissive', for: 'all', to:
'public', using: RLS_STUDENT_PREDICATE, withCheck: RLS_STUDENT_PREDICATE })`,
followed by `.enableRLS()`. **Read those 19 lines and copy the shape exactly.**
`RLS_STUDENT_PREDICATE` is defined at `:39`; `bigserial`, `index`, `check`,
`pgPolicy`, `text` and `timestamp` are already imported at `:8-24`.

Query exemplar with the `opts: { ctx?: TenantContext }` convention —
`src/db/queries.ts:1669-1689` (`getVipsForgetCount`): public function takes
`opts.ctx` and reuses it, else opens its own `withStudent`.

Migrations: `src/db/migrations/README.md` is explicit — edit `schema.ts`
first, then `pnpm db:generate`, review the SQL, `pnpm db:migrate`, and commit
the `.sql` **and** the `meta/` snapshot together. `drizzle-kit push` is banned.

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest in
`test/` mirroring `src/`; conventional commits. Baseline: `pnpm check` exits 0
with 18 pre-existing warnings; `pnpm test` = 911 passed / 128 skipped / 0
failed. Many `test/server/*` suites are `describe.skipIf(!process.env.DATABASE_URL)`
gated — which is why the limiter's decision logic must be a **pure function**
so its tests always run.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing warnings OK) |
| Generate migration | `pnpm db:generate` | one new `src/db/migrations/NNNN_*.sql` + `meta/` snapshot |
| Apply migration | `pnpm db:migrate` | exit 0 (needs `DATABASE_URL_UNPOOLED` or `DATABASE_URL`) |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| One file | `pnpm vitest run test/server/rate-limit.test.ts` | new tests pass |

## Scope

**In scope** (the only files you should modify/create):

- `src/db/schema.ts` — add the `rate_limit_events` table
- `src/db/migrations/` — the generated migration + `meta/` snapshot
- `src/db/queries.ts` — `countRecentRateLimitEvents` + `insertRateLimitEvent`
- `src/server/rate-limit.server.ts` (create) — policy + the pure decision
  function + `consumeRateLimit`
- `src/server/openai-realtime-mirror-session.handler.server.ts` — body cap +
  limiter
- `src/server/transcribe-mirror.handler.server.ts` — limiter (+ dep type)
- `src/server/run-connector.handler.server.ts` — limiter in
  `runConnectorHandler` **only**
- `src/server/run-cartographer.handler.server.ts` — limiter
- `test/server/rate-limit.test.ts` (create)
- `test/server/openai-realtime-mirror-session.test.ts` — inject the limiter stub
- `test/server/transcribe-mirror.test.ts` — add `studentId` to two auth stubs

**Out of scope** (do NOT touch, even though they look related):

- The same-origin / CSRF gate on the realtime route — that is **plan 049's**
  scope. Do not add or duplicate it here.
- Any external rate-limit store (Redis, Vercel KV, Upstash). Postgres is
  already in the request path; a second datastore is new infra, a new failure
  mode, and a new latency source. Do not add a dependency.
- `runConnectorForStudent` and `runConnectorCronHandler` — the `CRON_SECRET`
  path stays exempt by construction.
- `MAX_AUDIO_BYTES` in the transcribe handler — already correct at 25 MB.
- The prewarm behaviour in `realtime-mirror-client.ts` / `CaptureFab.tsx` /
  `AskSheet.tsx`. Changing when prewarm fires is a UX/perf change; this plan
  only sizes limits around it.
- `src/lib/student-space/backend-bridge.ts` — no change needed (see "How
  errors reach the client").
- Platform-level protection (Vercel WAF / firewall rules).

## Git workflow

- Branch: `advisor/051-rate-limit-paid-endpoints`
- Conventional commits, e.g.
  `feat(server): bound the SDP read and add per-student DoS backstops on paid endpoints`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `rate_limit_events` table

In `src/db/schema.ts`, after the `vips_forget_count` block (`:352-374`), add:

```ts
// ---------------------------------------------------------------------------
// rate_limit_events — one row per paid-inference call, per student.
// DoS backstop only, NOT a product quota: the limits in
// src/server/rate-limit.server.ts sit far above any legitimate student or
// demo flow. Sliding window = "count rows newer than now() - window".
// ---------------------------------------------------------------------------

const RATE_LIMIT_BUCKET_CHECK = sql.raw(
  "bucket IN ('realtime_session','transcribe','connector_run','cartographer_run')",
)

export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    studentId: text('student_id').notNull(),
    bucket: text('bucket').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_rate_limit_events_student_bucket').on(t.studentId, t.bucket, t.occurredAt.desc()),
    check('rate_limit_events_bucket_check', RATE_LIMIT_BUCKET_CHECK),
    pgPolicy('rate_limit_events_rls', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: RLS_STUDENT_PREDICATE,
      withCheck: RLS_STUDENT_PREDICATE,
    }),
  ],
).enableRLS()
```

An event log (rather than a counter row) gives a **true** sliding window with
one index scan, and row volume is bounded by the limits themselves (≤ ~250
rows per student per hour at the ceilings below). Step 3 prunes old rows.

**Verify**: `pnpm check` → exit 0. Then `pnpm db:generate` → exactly one new
`src/db/migrations/NNNN_*.sql`; open it and confirm it contains
`CREATE TABLE "rate_limit_events"`, `CREATE INDEX`, `CREATE POLICY`, and
`ALTER TABLE "rate_limit_events" ENABLE ROW LEVEL SECURITY`. Commit the `.sql`
and the `meta/` snapshot together.

### Step 2: Add the two queries

In `src/db/queries.ts`, in a new section header comment matching the file's
style (`// --- rate_limit_events ---`), add two functions following the
`getVipsForgetCount` shape at `:1669-1689` (public function takes
`opts: { ctx?: TenantContext }`, delegates to an `…Inner` that uses `ctx.db`):

- `countRecentRateLimitEvents(studentId, bucket, windowMs, opts)` →
  `Promise<{ count: number; oldestOccurredAt: string | null }>`. Select
  `count(*)` and `min(occurred_at)` from `rateLimitEvents` where
  `studentId` matches, `bucket` matches, and `occurredAt > now() - window`.
- `insertRateLimitEvent(studentId, bucket, opts)` → `Promise<void>`. Plain
  insert; `occurredAt` uses the column default.

Both must accept and reuse `opts.ctx` when given, so a caller already inside a
`withStudent` transaction does not open a second pool checkout (the pool
starvation hazard documented in `src/agents/context/index.ts:15-20`).

**Verify**: `pnpm check` → exit 0.

### Step 3: Create the limiter module

Create `src/server/rate-limit.server.ts`. Three exports, and the decision
logic must be **pure** so its tests run without `DATABASE_URL`:

```ts
export type RateLimitBucket =
  | 'realtime_session'
  | 'transcribe'
  | 'connector_run'
  | 'cartographer_run'

/**
 * DoS backstops, NOT product quotas. Every ceiling is set far above any
 * legitimate student or demo flow — if a real student ever sees a 429, the
 * limit is wrong, not the student.
 *
 * `realtime_session` is deliberately the highest: a realtime session POST is
 * minted speculatively by `prewarmRealtimeMirrorCapture` on capture-FAB
 * hover/press and on every Ask-sheet open (see
 * src/lib/student-space/realtime-mirror-client.ts:183 and
 * src/components/student-space/capture/{CaptureFab,AskSheet}.tsx), so an
 * operator demoing for an hour mints far more sessions than they record.
 */
export const RATE_LIMIT_POLICY: Record<RateLimitBucket, { limit: number; windowMs: number }> = {
  realtime_session: { limit: 120, windowMs: 60 * 60 * 1000 },
  transcribe: { limit: 60, windowMs: 60 * 60 * 1000 },
  connector_run: { limit: 30, windowMs: 60 * 60 * 1000 },
  cartographer_run: { limit: 30, windowMs: 60 * 60 * 1000 },
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

/** Pure — no DB, no clock. Tested without DATABASE_URL. */
export function decideRateLimit(input: {
  limit: number
  windowMs: number
  countInWindow: number
  oldestOccurredAtMs: number | null
  nowMs: number
}): RateLimitDecision
```

`decideRateLimit` returns `{ allowed: true, retryAfterSeconds: 0 }` while
`countInWindow < limit`. Otherwise `allowed: false` and `retryAfterSeconds` =
`ceil((oldestOccurredAtMs + windowMs - nowMs) / 1000)`, clamped to at least 1
and to at most `ceil(windowMs / 1000)`; when `oldestOccurredAtMs` is `null`
(defensive) fall back to `ceil(windowMs / 1000)`.

Then the impure wrapper:

```ts
export interface ConsumeRateLimitDeps {
  countRecentRateLimitEvents?: typeof countRecentRateLimitEvents
  insertRateLimitEvent?: typeof insertRateLimitEvent
  now?: () => number
}

export async function consumeRateLimit(
  studentId: string,
  bucket: RateLimitBucket,
  deps: ConsumeRateLimitDeps = {},
): Promise<RateLimitDecision>
```

It counts, calls `decideRateLimit`, and on `allowed` inserts the event. Two
deliberate simplifications to document in the comment: (1) count-then-insert
races can let a couple of extra calls through — irrelevant for a backstop at
these ceilings; (2) failure to read or write the counter must **not** block the
request — wrap the DB work in `try/catch` and `return { allowed: true,
retryAfterSeconds: 0 }` on error, logging structurally (IDs and bucket only,
no student text — see plan 048's rule). A dead limiter must never take the
product down.

Also export a small helper the two `Request`-shaped handlers can share:

```ts
export function rateLimitedResponse(decision: RateLimitDecision): Response {
  return Response.json(
    { error: 'Too many requests. Try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
  )
}
```

Pruning: inside `consumeRateLimit`, after a successful insert, opportunistically
delete this student's rows older than 24 h for the same bucket (add a
`pruneRateLimitEvents` query in Step 2 if you prefer it in `queries.ts` — keep
all SQL there either way). Failure to prune is swallowed.

**Verify**: `pnpm check` → exit 0.

### Step 4: Wire the four call sites

Each handler already has a `deps` object; add an optional
`consumeRateLimit?: typeof consumeRateLimit` to it, defaulting to the real
function, so tests can inject a stub. Place the limiter **immediately after**
the auth call, so an unauthenticated caller is still rejected first and never
writes a counter row.

1. **`src/server/openai-realtime-mirror-session.handler.server.ts`** — two
   changes in `createRealtimeMirrorSession`:

   ```ts
   const MAX_SDP_OFFER_BYTES = 256 * 1024
   ```

   After the `requireContext` call, bucket `realtime_session`; on deny, throw
   `new OpenAIRealtimeMirrorSessionError('Too many voice sessions. Try again shortly.', 429)`
   — but note that error class carries no headers, so instead prefer returning
   `rateLimitedResponse(decision)` directly from `createRealtimeMirrorSession`
   (its return type is already `Promise<Response>`), which preserves
   `Retry-After`.

   Then replace `:62`'s `const offer = await request.text()` with a bounded
   read:

   ```ts
   // SDP offers are a few KB. api/index.ts already buffers the whole body
   // before this handler sees the Request, so this cap does not prevent that
   // buffering — it prevents an oversized offer being forwarded to OpenAI,
   // bounds the decoded string, and returns a clear 413.
   const declaredLength = Number(request.headers.get('content-length') ?? Number.NaN)
   if (Number.isFinite(declaredLength) && declaredLength > MAX_SDP_OFFER_BYTES) {
     throw new OpenAIRealtimeMirrorSessionError('SDP offer is too large.', 413)
   }
   const raw = await request.arrayBuffer()
   if (raw.byteLength > MAX_SDP_OFFER_BYTES) {
     throw new OpenAIRealtimeMirrorSessionError('SDP offer is too large.', 413)
   }
   const offer = new TextDecoder().decode(raw)
   ```

2. **`src/server/transcribe-mirror.handler.server.ts`** — tighten the dep type
   from `authenticate?: () => Promise<unknown>` to
   `authenticate?: typeof requireCounselorContext`, then:

   ```ts
   const { studentId } = await (deps.authenticate ?? requireCounselorContext)()
   const decision = await (deps.consumeRateLimit ?? consumeRateLimit)(studentId, 'transcribe')
   if (!decision.allowed) {
     throw new WhisperTranscriptionError('Too many transcription requests. Try again shortly.', 'RATE_LIMITED')
   }
   ```

   Add `'RATE_LIMITED'` to the `WhisperTranscriptionError` code union at `:24`.

3. **`src/server/run-connector.handler.server.ts`** — inside
   `runConnectorHandler` **only** (`:52-59`), after the `requireContext` call.
   On deny, return the existing `RunConnectorResult` shape rather than
   throwing: add `'rate_limited'` to the `RunConnectorStatus` union at
   `:13-22` and return `{ status: 'rate_limited', processed: 0, succeeded: 0,
   failed: 0, remaining: 0, entries: [] }`.
   **Leave `src/lib/student-space/backend-bridge.ts` alone.** Its
   `isHardFailedConnectorResult` (`:413-428`) tests membership in a runtime
   `Set<string>` of six hard statuses, not an exhaustive TypeScript union — so
   adding `'rate_limited'` does not break `tsc`, and omitting it from that set
   means a rate-limited run degrades silently instead of throwing at the user.
   That is the behaviour we want for a backstop.

4. **`src/server/run-cartographer.handler.server.ts`** — after
   `requireCounselorContext()` at `:134`, bucket `cartographer_run`. Return the
   handler's existing failure shape (`{ ok: false, status: …, error: …, events }`
   — copy the shape used in the `agent_error` branch around `:155-170`) with a
   new `'rate_limited'` status added to its status union. Note the asymmetry
   and leave it as-is: `isFailedCartographerResult`
   (`backend-bridge.ts:430-439`) matches on `ok === false`, so this **does**
   throw through to the caller. That is correct here — "Run sense-making" is a
   deliberate button press, so the student should be told to try again rather
   than watch nothing happen.

**Verify**: `pnpm check` → exit 0, and
`grep -n 'consumeRateLimit' src/server/*.ts` → hits in exactly the four
handlers plus `rate-limit.server.ts`.

### Step 5: Adapt the two existing test files

- `test/server/openai-realtime-mirror-session.test.ts` (115 lines, 3 tests) —
  each builds `new Request('https://app.test/api/openai/realtime-mirror', { method:'POST', headers:{…'application/sdp'}, body:'offer-sdp' })`
  and passes `deps`. Add
  `consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 })`
  to each `deps` object so the tests never touch Postgres.
- `test/server/transcribe-mirror.test.ts` — two auth stubs pass only a
  `counselorId` (`{ authenticate: vi.fn(async () => ({ counselorId: 'auth-bypass:demo-a' })) }`
  at roughly `:41` and `:55`). After the Step-4 type tightening these fail
  `tsc`. Add `studentId: 'demo-a'` to those stubs (the stubs at `:9-12` and
  `:61` already include it), and add a passing `consumeRateLimit` stub wherever
  the handler reaches the limiter.

Never weaken a limit or a type to make a test pass.

**Verify**: `pnpm vitest run test/server/openai-realtime-mirror-session.test.ts test/server/transcribe-mirror.test.ts`
→ all pass.

### Step 6: Write the tests, including the mandatory no-regression proof

Create `test/server/rate-limit.test.ts` (plain Vitest; **no** `DATABASE_URL`
gate — everything here is pure or stubbed):

1. **`decideRateLimit` truth table**: below limit → allowed; exactly at limit
   → denied; `retryAfterSeconds` computed from the oldest in-window event;
   `retryAfterSeconds` ≥ 1 and ≤ `windowMs/1000`; `oldestOccurredAtMs: null`
   → falls back to the full window.
2. **The no-regression proof (required)**: for each bucket, simulate a
   realistic session and assert **zero** denials. Concretely, drive
   `consumeRateLimit` with in-memory stubs for
   `countRecentRateLimitEvents` / `insertRateLimitEvent` (an array of
   timestamps) and a controllable `now`:
   - `realtime_session`: 40 prewarms + 15 recorded captures in one hour → all
     allowed. Comment: *"prewarm fires on capture-FAB hover and Ask-sheet
     open, so sessions ≫ captures. A limit a hovering operator can hit is a
     demo-breaking regression."*
   - `transcribe`: 20 sequential captures in one hour → all allowed.
   - `connector_run`: 15 capture-time runs + 5 manual presses → all allowed.
   - `cartographer_run`: 10 manual "Run sense-making" presses → all allowed.
3. **The limiter fails open**: stub `countRecentRateLimitEvents` to reject;
   assert `consumeRateLimit` resolves `{ allowed: true }`. Comment: *"a dead
   counter must never take the product down."*
4. **SDP size guard**: call `openAIRealtimeMirrorSessionHandler` with a body of
   `MAX_SDP_OFFER_BYTES + 1` bytes (`'x'.repeat(…)`) and stubbed
   `requireContext` / `consumeRateLimit` / `fetch`; assert status `413` and
   that the stubbed `fetch` was **not** called. Then assert a normal
   `'offer-sdp'` body still reaches the stubbed fetch (proving the guard did
   not break the happy path).
5. **429 shape**: `rateLimitedResponse({ allowed:false, retryAfterSeconds: 42 })`
   → status 429 and `Retry-After: 42`.
6. **Cron exemption guard** (source-level, cheap and durable): read
   `src/server/run-connector.handler.server.ts` with `node:fs` and assert the
   text `consumeRateLimit` does **not** appear between the
   `export async function runConnectorCronHandler` line and the end of that
   function. Comment: *"the CRON_SECRET-authed nightly fan-out must stay
   exempt; it calls runConnectorForStudent directly."* If a span-based
   assertion proves brittle, substitute: assert `runConnectorForStudent`'s
   body contains no `consumeRateLimit` call.

**Verify**: `pnpm vitest run test/server/rate-limit.test.ts` → all pass,
including the four zero-denial simulations.

### Step 7: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0; tests ≥911 passed plus
the new ones, 0 failed (128 pre-existing skips expected). If `DATABASE_URL` is
set, also run `pnpm db:migrate` → exit 0.

## Test plan

- New `test/server/rate-limit.test.ts` — the six groups in Step 6. The
  zero-denial simulations are the plan's non-regression gate and must not be
  weakened.
- Adapted: `test/server/openai-realtime-mirror-session.test.ts`,
  `test/server/transcribe-mirror.test.ts` (stubs only — never limits).
- Pattern exemplars: `test/server/transcribe-mirror.test.ts` for
  `vi.fn`-injected deps; `src/db/queries.ts:1669-1689` for the `opts.ctx`
  query shape.
- Existing `test/server/auto-connector.test.ts` / `confirm-diff.test.ts` are
  `DATABASE_URL`-gated and may skip in your environment — do not rely on them
  for coverage of this change.
- Verification: `pnpm test` → 0 failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, ≥911 passed plus the new tests
- [ ] `grep -c 'request.text()' src/server/openai-realtime-mirror-session.handler.server.ts` → 0
- [ ] `grep -n 'MAX_SDP_OFFER_BYTES' src/server/openai-realtime-mirror-session.handler.server.ts` → ≥2 hits (declaration + guard)
- [ ] `grep -rln 'consumeRateLimit' src/server/` → exactly 5 files (the four handlers + `rate-limit.server.ts`)
- [ ] `grep -n 'consumeRateLimit' src/server/run-connector.handler.server.ts` → the only hit is inside `runConnectorHandler` (not `runConnectorCronHandler`, not `runConnectorForStudent`)
- [ ] `grep -rn "redis\|@vercel/kv\|upstash" package.json` → no matches (no new dependency)
- [ ] One new migration file exists under `src/db/migrations/` with a `meta/` snapshot committed alongside it
- [ ] The Step-6 zero-denial tests exist and pass for all four buckets
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift).
- `pnpm db:generate` produces a migration that touches any table other than
  `rate_limit_events` — that means the schema had undeclared drift; report the
  diff rather than applying it.
- Any Step-6 zero-denial simulation denies. **Do not lower the simulated
  traffic to make the test pass** — raise the ceiling in `RATE_LIMIT_POLICY`
  and report the new value, or report and stop. A limit a real flow can hit is
  the failure this plan exists to avoid.
- You find a **third** caller of the realtime endpoint, the transcribe
  handler, or `runConnectorHandler` that this plan did not model (e.g. a
  script in `scripts/`, a seed path, or a smoke test that would now be
  limited). Report the caller.
- `runConnectorCronHandler` turns out to route through `runConnectorHandler`
  after all (contradicting `:127-170`) — the cron would then be rate-limited,
  which is wrong. Report.
- The realtime handler's rate-limit rejection cannot carry `Retry-After`
  without restructuring the error class — report the shape you would need
  rather than dropping the header silently.
- `pnpm db:migrate` fails and no `DATABASE_URL_UNPOOLED` / `DATABASE_URL` is
  available: commit the generated migration, note in the PR that it is
  unapplied, and report. Do not use `drizzle-kit push` — it is banned in
  `src/db/migrations/README.md`.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinise**: (1) the numbers in
  `RATE_LIMIT_POLICY` and the prewarm-amplification comment above
  `realtime_session` — anyone lowering that ceiling without re-reading the
  prewarm call sites will break the demo; (2) that the limiter still fails
  **open** on DB error; (3) that `runConnectorCronHandler` remains exempt;
  (4) that no student text reaches the limiter's log lines (plan 048's rule).
- **New paid endpoint checklist**: add a bucket to `RateLimitBucket`, a ceiling
  to `RATE_LIMIT_POLICY`, the bucket string to `RATE_LIMIT_BUCKET_CHECK` in
  `schema.ts` (a check-constraint change needs a migration), a
  `consumeRateLimit` call after the auth call, and a zero-denial simulation in
  `test/server/rate-limit.test.ts`.
- **Known cost issue, deliberately out of scope**: because
  `prewarmRealtimeMirrorCapture` mints a *real* OpenAI Realtime call on hover
  and sheet-open, the product pays for sessions nobody records. That is a
  product/cost question (touching the prewarm heuristic or the 60 s
  `PREWARM_TTL_MS`), not a security fix — surface it separately.
- **Deliberately deferred**: an external rate-limit store, IP-based limits
  (pre-auth), a global spend cap across all students, and platform WAF rules.
  The per-student Postgres backstop is the minimum that removes the unbounded
  case without new infra.
- **Row growth**: `rate_limit_events` is pruned opportunistically to 24 h per
  student per bucket. If a future bucket has a window longer than 24 h, the
  prune horizon must move with it.
