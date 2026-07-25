# Plan 065: Make the agent-runner timeout actually terminal, stop coercing unknown stop reasons to success, and stop hanging hydration when `refreshSnapshot` is absent

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/agents/runner.ts src/components/student-space/EngineHost.tsx src/lib/student-space/backend-bridge.ts src/server/auto-connector.handler.server.ts test/agents/managed-mirror.test.ts test/components/student-space/EngineHost.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED (fix (b) turns a silent-success path into a thrown error)
- **Depends on**: none. Plan 063 edits the same file (`src/agents/runner.ts`) in
  non-overlapping hunks — if both are queued, run **063 first**.
- **Category**: bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Three small correctness bugs, each in a place where the failure is silent.

**(a) The runner's documented `TIMEOUT` guarantee does not hold when the
upstream stream genuinely hangs.** `raceWithTimeout` rejects on the deadline
while the underlying `iterator.next()` is still pending; the `finally` then
`await`s `iterator.return?.()`, which for an async generator queues *behind*
that pending `next()`. So the exact scenario the timeout exists for — a hung
Managed Agents stream — is the one where the timeout never propagates. The
runner also never creates its own `AbortController`, so nothing cancels the HTTP
request when its own deadline fires.

**(b) Any unrecognised `stop_reason` is coerced to `'end_turn'` and reported as
success.** The drain loop then `break`s as if the agent finished cleanly, and
whatever text arrived flows into `JSON.parse` → schema validation. Best case a
misleading `schema_reject`; worst case a **truncated-but-schema-valid Connector
diff admitted as a real one** and handed to the verifier as if the agent had
finished.

**(c) Hydration never completes when the backend bridge has no
`refreshSnapshot`.** Optional-call short-circuiting means the whole
`?.().then().catch()` chain evaluates to `undefined`, so `setHydrated(true)`
never runs — leaving hydration-gated surfaces paused and the History calendar
skeleton on forever. `refreshSnapshot` is **optional** in the bridge contract,
and the repo's own test already constructs a bridge without it.

## Current state

### (a) The timeout that cannot outlive a hung stream

`src/agents/runner.ts:392-445` — the drain loop and its cleanup:

```ts
  const iterator = streamIterable[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs

  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} did not complete within ${timeoutMs}ms.`,
          'TIMEOUT',
        )
      }
      const event = await raceWithTimeout(iterator.next(), remaining, sessionId)
      ...
    }
  } finally {
    await iterator.return?.()
  }
```

`src/agents/runner.ts:481-501` — `raceWithTimeout` is a plain race: it
`setTimeout`s a `ManagedAgentError('TIMEOUT')` rejection, then attaches
`p.then(resolve, reject)`. On timeout it rejects the wrapper **while `p`
(the `iterator.next()`) stays pending**. Read it; nothing is wrong with it in
isolation.

`src/agents/runner.ts:284-290` — the stream is an **async generator**
(`async function* mapSdkEventStream`), so its `.return()` is queued on the
generator's internal request queue behind any pending `.next()`.

`src/agents/runner.ts:250-273` — the transport's iterator wrapper `await`s that
generator's `return()`:

```ts
            async return() {
              await iterator?.return?.()
              return { value: undefined, done: true as const }
            },
```

**The failure chain**: `raceWithTimeout` rejects → `finally` runs →
`await iterator.return?.()` → the wrapper `await`s the generator's `return()` →
the generator is mid-`yield`/mid-`await` on a `next()` that never settles →
`return()` never settles → the `finally` never completes → `runManagedAgent`
never rejects. The `ManagedAgentError('TIMEOUT')` was constructed but is stuck
behind the cleanup.

`src/agents/runner.ts:378-381` — the only signal handling is *forwarding* the
caller's:

```ts
  const streamIterable = transport.streamEvents(
    sessionId,
    opts.signal ? { signal: opts.signal } : undefined,
  )
```

So when the runner's *own* `timeoutMs` fires, nothing aborts the HTTP request.

### (b) Unknown stop reasons become success

`src/agents/runner.ts:304-313`, inside `translateSdkEvent` (a module-private
function starting at line 292):

```ts
  if (t === 'session.status_idle') {
    const stop = raw.stop_reason as { type: string } | undefined
    const stopReason =
      stop?.type === 'end_turn' ||
      stop?.type === 'requires_action' ||
      stop?.type === 'retries_exhausted'
        ? stop.type
        : 'end_turn'
    return { type: 'session.status_idle', stopReason }
  }
```

Note the `else` branch is `'end_turn'` — **the success value**. `undefined`, a
typo, a new SDK stop reason (`max_tokens`, `pause_turn`, `refusal`, …) all
become "the agent finished cleanly."

The normalized union it feeds — `src/agents/runner.ts:32-46`:

```ts
export type ManagedAgentRunnerEvent =
  | { type: 'agent.message'; text: string }
  | {
      type: 'session.status_idle'
      stopReason: 'end_turn' | 'requires_action' | 'retries_exhausted'
    }
  ...
```

And what the drain loop does with it — `src/agents/runner.ts:415-426`:

```ts
      } else if (value.type === 'session.status_idle') {
        if (value.stopReason === 'end_turn') break
        if (value.stopReason === 'requires_action') {
          throw new ManagedAgentError(..., 'REQUIRES_ACTION')
        }
        throw new ManagedAgentError(..., 'RETRIES_EXHAUSTED')
      }
```

`break` → falls through to `collectedText` → `parseManagedAgentJson` → schema
validation.

The error codes available — `src/agents/runner.ts:77-94`, the `code` union on
`ManagedAgentError`: `'NO_API_KEY' | 'NO_OUTPUT' | 'PARSE_ERROR' | 'TERMINATED'
| 'STREAM_ERROR' | 'TIMEOUT' | 'REQUIRES_ACTION' | 'RETRIES_EXHAUSTED'`.

**Downstream bucket for a new code** —
`mapConnectorErrorToStatus` at `src/server/auto-connector.handler.server.ts:391-426`
logs `console.warn(\`[auto-connector] managed-agent ${err.code}\`, …)` and then
`switch (err.code)`, mapping `PARSE_ERROR → schema_reject`,
`NO_API_KEY → auth_error`, `STREAM_ERROR|TERMINATED|RETRIES_EXHAUSTED|NO_OUTPUT|REQUIRES_ACTION → transport_error`,
`TIMEOUT → timeout`, and — critically — **`default: return { status: 'unknown', staged_diff: null }`**.
`AutoConnectorStatus` (`:103-111`) includes `'unknown'`.

So **a new `ManagedAgentError` code lands in `status: 'unknown'` via the
existing `default:` arm, with the raw code in the log line.** That is the right
bucket for "the agent stopped for a reason we do not recognise", it needs **no
change to the switch**, and adding a code cannot break exhaustiveness because of
the `default`.

Also note the comment on the `TIMEOUT` arm: auto-connector runs its own
`AbortController` timeout *outside* the runner and calls the runner's timeout
"the runner's hard backstop". Fix (a) is what makes that backstop real.

### (c) Hydration hangs on a bridge without `refreshSnapshot`

`src/components/student-space/EngineHost.tsx:255-265`:

```ts
        void backend
          .refreshSnapshot?.()
          .then((snapshot) => {
            if (cancelled) return
            applyStudentSpaceBackendSnapshot(live, snapshot)
            setHydrated(true)
          })
          .catch((snapshotErr) => {
            console.warn('[EngineHost] backend snapshot hydration failed', snapshotErr)
            if (!cancelled) setHydrated(true)
          })
```

When `refreshSnapshot` is `undefined`, JavaScript's optional-call
short-circuiting makes the **entire chain** evaluate to `undefined` — `.then`
and `.catch` are never invoked, so **neither** `setHydrated(true)` call runs.
(It does not throw; `void undefined` is fine. It silently does nothing.)

`hydrated` is initialised `false` (`EngineHost.tsx:70` —
`const [hydrated, setHydrated] = useState(false)`) and gates two things:

1. **Route-sync pausing** — `EngineHost.tsx:31`
   (`const SURFACES_REQUIRING_HYDRATION = new Set(['trajectory'])`) and `:95-99`:
   `const paused = Boolean(currentRouteSurface && SURFACES_REQUIRING_HYDRATION.has(currentRouteSurface.surface) && !hydrated)`.
2. **The History calendar skeleton** —
   `src/components/student-space/sheets/HistorySheet.tsx:212-214`
   (`const isColdLoad = !hydrated && captureCount === 0`), consumed at `:311`
   as `loading={isColdLoad}`.

So on a bridge without `refreshSnapshot`, `/trajectory` stays paused forever and
`/history` shows the loading skeleton forever for a student with no local
captures.

`refreshSnapshot` is **optional in the contract** —
`src/lib/student-space/backend-bridge.ts:131-133`:
`export interface StudentSpaceBackendBridge { version: 1; refreshSnapshot?: () => Promise<StudentSpaceBackendSnapshot>; … }`
— and the repo's own test already builds a bridge without it
(`test/components/student-space/EngineHost.test.tsx:42` —
`const backendBridge = vi.hoisted(() => ({ version: 1 }))`).

**Honest severity note**: the only production bridge factory,
`createStudentSpaceBackendBridge` (`backend-bridge.ts:174-177`), *always* sets
`refreshSnapshot` (line 177), so this is a **latent** bug today, not a live
user-facing one. It bites the moment anyone adds a second bridge variant — a
read-only share-token bridge, a demo/offline bridge, a storybook harness — which
the optional field explicitly invites. It is also already false in tests, which
is how latent bugs become real.

### Repo conventions

pnpm only, one root lockfile; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed**. `pnpm vitest run <path>` for one file.
Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: never add `three` to `overrides` — the 0.149-app /
0.171-editor runtime split is deliberate. (This plan adds no dependencies.)

Test-only exports are an established pattern in this file — see
`src/agents/runner.ts:199-202`:

```ts
/** Drop the cached SDK client. Tests reset env between cases; production never calls this. */
export function resetManagedAgentClientCacheForTests(): void {
  cachedAnthropic = undefined
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Check | `pnpm check` | exit 0 (18 warnings OK, 0 errors) |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| Runner tests | `pnpm vitest run test/agents/managed-mirror.test.ts` | all pass |
| Host tests | `pnpm vitest run test/components/student-space/EngineHost.test.tsx` | all pass |
| Auto-connector tests | `pnpm vitest run test/server/auto-connector.test.ts` | passes (currently all skipped — see note) |
| Grep (b) baseline | `grep -rn "end_turn" test/` | 10 hits, all in managed-mirror.test.ts |

**Note on `test/server/auto-connector.test.ts`**: all 10 of its tests are
currently skipped behind `describe.skipIf(!process.env.DATABASE_URL)` and are
broken as written (plan 059's subject). Do **not** try to fix them here, and do
not count them as verification.

## Scope

**In scope** (the only files you should modify):

- `src/agents/runner.ts` — fixes (a) and (b)
- `src/components/student-space/EngineHost.tsx` — fix (c)
- `src/lib/student-space/backend-bridge.ts` — **only** if step 4 recommends
  making `refreshSnapshot` required
- `test/agents/managed-mirror.test.ts` — new timeout-hang and
  unknown-stop-reason tests
- `test/components/student-space/EngineHost.test.tsx` — new no-`refreshSnapshot`
  hydration test

**Out of scope** (do NOT touch, even though they look related):

- `src/server/auto-connector.handler.server.ts` — its `default:` arm already
  buckets a new error code as `status: 'unknown'`. **Read it, do not edit it.**
- `src/server/run-cartographer.handler.server.ts` and the other agent handlers —
  same reasoning.
- `src/agents/runner.ts`'s usage/token read (`translateSdkEvent`'s
  `span.model_request_end` branch, lines 324-340) — that is **plan 063**'s hunk.
  Leave it alone even though it is in the same function.
- `src/agents/runner.ts`'s JSON-fence recovery
  (`candidateJsonStrings` / `parseManagedAgentJson`, lines 155-182) — unrelated.
- `src/components/student-space/sheets/HistorySheet.tsx` — it *consumes*
  `hydrated` correctly; the bug is upstream. Plan 057 owns that file.
- `SURFACES_REQUIRING_HYDRATION` (`EngineHost.tsx:31`) — the set's membership is
  a product decision, not a bug.
- Any `test/server/*` or `test/agents/managed-{connector,cartographer}` file —
  they are `@ts-nocheck`'d and skipped; plan 059 owns them.

## Git workflow

- Branch: `advisor/065-runner-and-hydration-small-fixes`
- One commit per fix, e.g.
  `fix(agents): abort the stream and bound cleanup so TIMEOUT is terminal`,
  `fix(agents): classify unrecognised stop reasons instead of reporting success`,
  `fix(host): flip hydrated when the bridge has no refreshSnapshot`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the non-regression baseline for fix (b)

Before changing the coercion, prove no test depends on it.

```bash
grep -rn "end_turn" test/
grep -rn "stop_reason" test/
grep -rn "translateSdkEvent" test/
```

**Verify**: `end_turn` appears **only** in `test/agents/managed-mirror.test.ts`
(10 hits), always as an explicit `{ type: 'session.status_idle', stopReason: 'end_turn' }`
on a **normalized** event handed to a fake transport — i.e. those tests bypass
`translateSdkEvent` entirely, so changing it cannot break them.
**Verify**: `stop_reason` and `translateSdkEvent` → **no matches in `test/`**.
Nothing asserts the current coerce-to-`end_turn` behavior.

If any test *does* assert it, STOP — the behavior may be load-bearing somewhere
the audit missed.

Also read (do not edit) `mapConnectorErrorToStatus` in
`src/server/auto-connector.handler.server.ts:391-426` and confirm the `default:`
arm returns `{ status: 'unknown', staged_diff: null }`, and that
`AutoConnectorStatus` (lines 103-111) includes `'unknown'`.

**Verify**: `grep -n "default:" -A 1 src/server/auto-connector.handler.server.ts | grep -c "status: 'unknown'"`
→ ≥1.

### Step 2: Fix (a) — own an AbortController and bound the cleanup

Three edits inside `src/agents/runner.ts`'s `runManagedAgent`.

**2.1 — create an internal controller chained to the caller's signal.** Replace
the `streamEvents` call at lines 378-381:

```ts
  // The runner owns its own abort signal so its `timeoutMs` can actually
  // cancel the in-flight HTTP request. Chained to the caller's signal so an
  // external abort still propagates.
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(opts.signal?.reason)
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason)
    else opts.signal.addEventListener('abort', forwardAbort, { once: true })
  }

  const streamIterable = transport.streamEvents(sessionId, { signal: controller.signal })
```

**2.2 — abort before the `finally` in the timeout branch.** The loop currently
throws `TIMEOUT` at lines 398-403 when `remaining <= 0`, and `raceWithTimeout`
throws it at line 404. Wrap the loop body so **either** timeout path aborts the
controller before unwinding. The cleanest shape: catch, abort, rethrow.

```ts
  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new ManagedAgentError(
          `Managed Agents runner: session ${sessionId} did not complete within ${timeoutMs}ms.`,
          'TIMEOUT',
        )
      }
      const event = await raceWithTimeout(iterator.next(), remaining, sessionId)
      ... // unchanged
    }
  } catch (err) {
    // Cancel the in-flight request so the pending `iterator.next()` settles
    // and the cleanup below cannot block on it.
    controller.abort(err)
    throw err
  } finally {
    if (opts.signal) opts.signal.removeEventListener('abort', forwardAbort)
    // Bounded cleanup: `mapSdkEventStream` is an async generator, so its
    // `.return()` queues behind any still-pending `.next()`. On a genuinely
    // hung upstream stream an unbounded `await` here swallows the TIMEOUT we
    // are trying to surface. Race it and move on.
    await Promise.race([
      Promise.resolve(iterator.return?.()).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS)),
    ])
  }
```

…with, near `DEFAULT_TIMEOUT_MS` at line 23:

```ts
/** Upper bound on stream cleanup. See the `finally` in `runManagedAgent`. */
const CLEANUP_TIMEOUT_MS = 1_000
```

**2.3 — leave `raceWithTimeout` itself alone.** It is correct as a race; the bug
was never in it. Do not change its signature.

Two things to be careful about:

- The `catch { abort; throw }` fires on **every** error path (TERMINATED,
  STREAM_ERROR, PARSE_ERROR, …), not just timeouts. That is correct and
  desirable — an aborted stream on any failure is what we want — but confirm no
  existing test asserts that the stream keeps running after a thrown error.
- `transport.streamEvents(sessionId, { signal })` now always passes an options
  object where it previously passed `undefined` when the caller gave no signal.
  Fake transports in tests ignore the argument (`streamEvents()` takes no
  parameters in `makeFakeTransport`, `test/agents/managed-mirror.test.ts:39`),
  so this is safe — but verify.
- Do **not** clear the `setTimeout` in the cleanup race with a `clearTimeout`
  refinement unless `pnpm test` shows the suite hanging on it; a 1 s stray timer
  per failed run is acceptable, and Vitest does not wait on it.

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/agents` → all pass, unchanged.
**Verify**: `grep -n 'new AbortController' src/agents/runner.ts` → ≥1 match.
**Verify**: `grep -n 'CLEANUP_TIMEOUT_MS' src/agents/runner.ts` → 2 matches
(declaration + use).

### Step 3: Fix (b) — classify unrecognised stop reasons

**3.1 — keep the raw value on the normalized event.** Widen the union variant at
`src/agents/runner.ts:34-37`:

```ts
  | {
      type: 'session.status_idle'
      stopReason: 'end_turn' | 'requires_action' | 'retries_exhausted' | 'unrecognised'
      /** The stop reason exactly as the SDK reported it, for logging. */
      rawStopReason: string
    }
```

**3.2 — stop coercing.** Replace lines 304-313:

```ts
  if (t === 'session.status_idle') {
    const stop = raw.stop_reason as { type?: string } | undefined
    const raw_ = typeof stop?.type === 'string' ? stop.type : 'missing'
    const stopReason =
      raw_ === 'end_turn' || raw_ === 'requires_action' || raw_ === 'retries_exhausted'
        ? raw_
        : 'unrecognised'
    return { type: 'session.status_idle', stopReason, rawStopReason: raw_ }
  }
```

**3.3 — add the error code.** Extend the `ManagedAgentError` code union at
`src/agents/runner.ts:80-88` with `| 'UNKNOWN_STOP_REASON'`, and update the
failure-mode docblock at `:350-359` with a line for it:

```
 *   - UNKNOWN_STOP_REASON: session went idle with a stop reason we do not
 *                        recognise. Treated as a failure, never as success —
 *                        a future or partial stop reason must not be reported
 *                        as a completed turn.
```

**3.4 — throw in the drain loop.** In the `session.status_idle` branch
(`:415-426`), add an explicit arm before the fall-through
`RETRIES_EXHAUSTED` throw:

```ts
      } else if (value.type === 'session.status_idle') {
        if (value.stopReason === 'end_turn') break
        if (value.stopReason === 'requires_action') {
          throw new ManagedAgentError(..., 'REQUIRES_ACTION')   // unchanged
        }
        if (value.stopReason === 'unrecognised') {
          // eslint-disable-next-line no-console -- ops triage signal: we need the raw value to widen the union later
          console.warn('[managed-agent] unrecognised stop_reason', {
            sessionId,
            rawStopReason: value.rawStopReason,
          })
          throw new ManagedAgentError(
            `Managed Agents runner: session ${sessionId} went idle with an unrecognised stop reason "${value.rawStopReason}". Refusing to treat it as a completed turn.`,
            'UNKNOWN_STOP_REASON',
          )
        }
        throw new ManagedAgentError(..., 'RETRIES_EXHAUSTED')   // unchanged
      }
```

Match the repo's existing `// eslint-disable-next-line no-console -- ops triage signal`
comment style — see `src/server/auto-connector.handler.server.ts:393, 405`.

**3.5 — do NOT edit the downstream switch.** `mapConnectorErrorToStatus`'s
`default:` arm already returns `{ status: 'unknown', staged_diff: null }` and its
`console.warn` above the switch already logs `err.code`, so
`UNKNOWN_STOP_REASON` lands in the `unknown` ops bucket with the code visible.
Confirm this by reading, not editing.

**Verify**: `pnpm check` → exit 0. (If `tsc` errors in
`src/server/auto-connector.handler.server.ts`, the switch is *not* using
`default:` after all — that is a STOP condition.)
**Verify**: `pnpm vitest run test/agents` → all pass, unchanged (step 1 proved
no test asserts the old coercion).
**Verify**: `grep -n "'end_turn'$" src/agents/runner.ts` → the coercion fallback
`: 'end_turn'` is gone from `translateSdkEvent`.

### Step 4: Fix (c) — make hydration complete without `refreshSnapshot`

Evaluate both options and pick one; record the reasoning in the commit message.

**Option 1 — explicit branch (recommended).** Keeps `refreshSnapshot` optional,
which the bridge contract deliberately allows. In
`src/components/student-space/EngineHost.tsx`, replace lines 255-265:

```ts
        // A bridge may legitimately omit `refreshSnapshot` (the field is
        // optional in StudentSpaceBackendBridge). Optional-call
        // short-circuiting makes `backend.refreshSnapshot?.().then(...)`
        // evaluate to `undefined` in that case, so neither `.then` nor
        // `.catch` runs and `hydrated` stays false forever — pausing
        // hydration-gated surfaces and pinning the History calendar skeleton.
        // Branch explicitly instead.
        const refresh = backend.refreshSnapshot
        if (refresh) {
          void refresh()
            .then((snapshot) => {
              if (cancelled) return
              applyStudentSpaceBackendSnapshot(live, snapshot)
              setHydrated(true)
            })
            .catch((snapshotErr) => {
              console.warn('[EngineHost] backend snapshot hydration failed', snapshotErr)
              if (!cancelled) setHydrated(true)
            })
        } else if (!cancelled) {
          // No snapshot source: hydration is trivially settled.
          setHydrated(true)
        }
```

**Option 2 — make the field required** in
`src/lib/student-space/backend-bridge.ts:133`
(`refreshSnapshot: () => Promise<StudentSpaceBackendSnapshot>`), so the compiler
enforces it. This is the stronger guarantee but it is a **contract change**: it
breaks `test/components/student-space/EngineHost.test.tsx:42`'s bare
`{ version: 1 }` bridge and forecloses the read-only/offline bridge variants the
optional field was there to permit.

**Recommendation: Option 1.** `hydrated` means "the first snapshot attempt has
settled (resolved OR failed)" — see the docblock at
`src/lib/student-space/use-engine.ts:24-34`. "There is no snapshot source" is a
settled state, so flipping `true` is semantically correct, and it keeps the
contract's optionality (and the existing test's bare bridge) intact. Take
Option 2 only if the reviewer explicitly prefers the stricter contract; if you
do, you must also update `EngineHost.test.tsx:42`'s bridge and re-check every
`StudentSpaceBackendBridge` construction site
(`grep -rn 'StudentSpaceBackendBridge' src/ test/`).

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/components/student-space/EngineHost.test.tsx`
→ all pass.
**Verify**: `grep -n 'refreshSnapshot?\.()' src/components/student-space/EngineHost.tsx`
→ **no matches** (the short-circuiting call form is gone).

### Step 5: Write the three tests

**5.1 — timeout-hang test** in `test/agents/managed-mirror.test.ts`. Model it on
the existing harness: `makeFakeTransport` at `:26-55`, and the failure-mode cases
at `:154-290`. The existing fake's iterator has **no `return()` method**, so it
cannot reproduce the hang — you need a fake that mimics the async-generator
semantics:

```ts
function makeHangingTransport(): ManagedAgentTransport {
  let pendingResolve: (() => void) | undefined
  return {
    async createSession() { return 'sesn_hang' },
    async sendUserMessage() {},
    streamEvents() {
      return {
        [Symbol.asyncIterator]() {
          return {
            // Never settles — the hung-upstream-stream scenario.
            next() {
              return new Promise(() => {
                /* intentionally never resolves */
              })
            },
            // Mimics an async generator: `return()` queues behind the pending
            // `next()`, so it only settles once `next()` does.
            async return() {
              await new Promise<void>((resolve) => {
                pendingResolve = resolve
              })
              return { value: undefined, done: true as const }
            },
          }
        },
      }
    },
  }
}
```

Then assert the runner rejects with `code: 'TIMEOUT'` **within the deadline**,
not hanging:

```ts
it('rejects with TIMEOUT even when the upstream stream never settles', async () => {
  await expect(
    runManagedAgent({
      agentId: 'agt_mirror',
      environmentId: 'env_x',
      prompt: 'p',
      outputSchema: MirrorOutputSchema,
      transport: makeHangingTransport(),
      timeoutMs: 50,
    }),
  ).rejects.toMatchObject({ code: 'TIMEOUT' })
})
```

Give the `it` an explicit Vitest timeout comfortably above
`timeoutMs + CLEANUP_TIMEOUT_MS` but well below the default 5 s — e.g. `3_000` —
so a regression **fails** rather than hanging the suite. **Confirm the test
fails before your fix**: `git stash` the `runner.ts` change, run the test, see it
time out, `git stash pop`. Record that you did this.

**5.2 — unknown-stop-reason test.** `translateSdkEvent` is module-private. Two
options, in order of preference:

1. **Export it for testing** — consistent with the file's existing
   `resetManagedAgentClientCacheForTests` precedent
   (`src/agents/runner.ts:199-202`). Add a one-line docblock saying it is
   exported for tests. Then table-test it directly: `end_turn` →
   `{ stopReason: 'end_turn', rawStopReason: 'end_turn' }`; `requires_action`;
   `retries_exhausted`; `'max_tokens'` → `{ stopReason: 'unrecognised', rawStopReason: 'max_tokens' }`;
   missing `stop_reason` → `{ stopReason: 'unrecognised', rawStopReason: 'missing' }`.
2. **Drive it through a fake transport** that yields the *normalized*
   `{ type: 'session.status_idle', stopReason: 'unrecognised', rawStopReason: 'max_tokens' }`
   and assert `runManagedAgent` rejects with `code: 'UNKNOWN_STOP_REASON'`.

**Do both** — (1) covers the translator, (2) covers the drain loop. Together they
are the regression net for "an unknown stop reason must never be reported as
success."

**5.3 — hydration test** in `test/components/student-space/EngineHost.test.tsx`.
The file already builds a bare bridge at `:42`
(`const backendBridge = vi.hoisted(() => ({ version: 1 }))`), so the fixture
exists. Add a test that renders the host at `/history` with that bridge and
asserts `hydrated` flips true — the cleanest observable is that
`HistorySheet`'s cold-load skeleton is **not** rendered, or, if the existing test
file already exposes the hydration context, assert it directly. Read the file's
existing render helper (`renderHostAt`, `:53`) and match its style. If the
skeleton is hard to reach from this test's router setup, assert the simpler
invariant: that the host does not leave `paused` true — e.g. that
`useStudentSpaceRouteSync`'s `openSurface` mock **is** called for a
hydration-gated route (`/trajectory`), which it would not be while `paused`.

**Verify**: `pnpm vitest run test/agents/managed-mirror.test.ts` → all pass,
including the timeout-hang test and both stop-reason tests.
**Verify**: `pnpm vitest run test/components/student-space/EngineHost.test.tsx`
→ all pass, including the no-`refreshSnapshot` case.
**Verify**: each new test fails when its fix is reverted (do this for the
timeout test at minimum, and record it).

### Step 6: Confirm auto-connector's timeout classification is intact

Fix (a) changes *when* `TIMEOUT` surfaces, not *how* it maps. Confirm the
mapping is unchanged by reading, not editing:

**Verify**: `grep -n "case 'TIMEOUT':" -A 5 src/server/auto-connector.handler.server.ts`
→ still returns `{ status: 'timeout', staged_diff: null }`, with the "runner's
hard backstop" comment intact.
**Verify**: `grep -n "case 'UNKNOWN_STOP_REASON'" src/server/auto-connector.handler.server.ts`
→ **no match** (it is intentionally handled by `default:`).
**Verify**: `git diff --stat -- src/server/` → **empty** (no handler was edited).

### Step 7: Final gate

**Verify**: `pnpm check` → exit 0, 0 errors, ≤18 warnings.
**Verify**: `pnpm test` → ≥911 passed + 5-6 new tests, **0 failed**, skip count
still 128.
**Verify**: `pnpm test` completes in a comparable time to baseline (~10 s) — a
much longer run means a new test is hanging rather than failing.
**Verify**: `git status` → only in-scope files modified.

## Test plan

New tests, all in existing files:

| File | Test | Covers |
|---|---|---|
| `test/agents/managed-mirror.test.ts` | rejects `TIMEOUT` against a never-settling `next()` whose `return()` queues behind it | fix (a) — the exact hang |
| `test/agents/managed-mirror.test.ts` | `translateSdkEvent` table: 3 known reasons pass through; `'max_tokens'` → `unrecognised`; missing → `unrecognised` + `rawStopReason: 'missing'` | fix (b) — translator |
| `test/agents/managed-mirror.test.ts` | `runManagedAgent` rejects `UNKNOWN_STOP_REASON` on an `unrecognised` idle event | fix (b) — drain loop |
| `test/components/student-space/EngineHost.test.tsx` | bridge lacking `refreshSnapshot` → `hydrated` flips true | fix (c) |

- Structural patterns: `makeFakeTransport` (`test/agents/managed-mirror.test.ts:26-55`)
  and the failure-mode describes (`:154-290`, which already drive
  REQUIRES_ACTION / RETRIES_EXHAUSTED / TERMINATED / STREAM_ERROR / retrying);
  `renderHostAt` (`test/components/student-space/EngineHost.test.tsx:53`).
- **Non-regression checks, both mandatory:**
  1. Step 1's grep proving no existing test asserts the coerce-to-`end_turn`
     behavior (`stop_reason` and `translateSdkEvent` absent from `test/`).
  2. Step 6's grep proving auto-connector still maps `TIMEOUT` →
     `status: 'timeout'` and that no handler file was edited.
- Every new test must carry an explicit Vitest timeout so a regression **fails
  fast** instead of hanging the suite.
- Verification: `pnpm check && pnpm test` → check exit 0; 0 failed; suite
  duration comparable to baseline.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0 with 0 errors
- [ ] `pnpm test` exits 0, 0 failed, skip count still 128, duration comparable to baseline
- [ ] `grep -n 'new AbortController' src/agents/runner.ts` → ≥1 match
- [ ] `grep -c 'CLEANUP_TIMEOUT_MS' src/agents/runner.ts` → `2`
- [ ] `grep -n "UNKNOWN_STOP_REASON" src/agents/runner.ts` → ≥3 matches (code union, docblock, throw)
- [ ] `grep -n "rawStopReason" src/agents/runner.ts` → ≥3 matches
- [ ] `grep -n "refreshSnapshot?\.()" src/components/student-space/EngineHost.tsx` → no matches
- [ ] `git diff --stat -- src/server/` → empty
- [ ] `grep -n "case 'TIMEOUT':" -A 5 src/server/auto-connector.handler.server.ts` → still `status: 'timeout'`
- [ ] `pnpm vitest run test/agents/managed-mirror.test.ts` passes, including the timeout-hang test
- [ ] `pnpm vitest run test/components/student-space/EngineHost.test.tsx` passes, including the no-`refreshSnapshot` case
- [ ] The report records that the timeout-hang test was confirmed to **fail**
      before the fix
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 1's grep finds a test asserting the coerce-to-`end_turn` behavior.**
  Then something may depend on unknown stop reasons succeeding; report the test
  and stop before changing the coercion.
- **`pnpm check` errors in `src/server/auto-connector.handler.server.ts` after
  step 3.** That means its stop-reason switch is *not* using a `default:` arm,
  the audit's premise about the `unknown` bucket is wrong, and adding a code is
  a wider change than this plan scoped.
- **The full suite starts hanging** (duration jumps from ~10 s to minutes). A new
  test lacks an explicit timeout, or the cleanup race in step 2.2 is not bounding
  correctly. Revert to the last green step and report.
- **The timeout-hang test passes *before* the fix is applied.** Then the fake
  transport is not reproducing the async-generator queue semantics and the test
  proves nothing. Fix the fake (its `return()` must genuinely await the pending
  `next()`) before proceeding.
- **Making `refreshSnapshot` required (Option 2) touches more than
  `backend-bridge.ts` + `EngineHost.tsx` + `EngineHost.test.tsx`.** Revert to
  Option 1 and report the additional construction sites you found.
- **Any live smoke run behaves differently after step 2** (`pnpm smoke:managed-connector`,
  `pnpm smoke:managed-cartographer`) — e.g. a run that previously succeeded now
  aborts. The new AbortController is chained, so it should not; if it does,
  report the failure before proceeding.
- The excerpts in "Current state" do not match the live code (drift since
  planning — most likely if plan 063 landed first and moved line numbers in
  `runner.ts`; verify by symbol name, not line number, in that case).

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**, in priority order:
  1. That the `catch { controller.abort(err); throw err }` in step 2.2 fires on
     **every** error path, not only timeouts, and that this is intended (it is —
     an aborted upstream stream on any failure is correct).
  2. That the cleanup race's fallback timer cannot mask a *real* cleanup error.
     `Promise.resolve(iterator.return?.()).catch(() => undefined)` swallows
     rejections by design — a rejecting `return()` must not replace the original
     error. Confirm the original error still propagates.
  3. That `UNKNOWN_STOP_REASON` really lands in auto-connector's `unknown`
     status bucket, with the raw stop reason in the log line. That log is the
     only signal that will tell us to widen the union when Anthropic adds a stop
     reason.
  4. That no handler file appears in the diff.
- **The pattern this establishes**: an unrecognised value from an external API is
  a **failure**, never a default-to-success. `translateSdkEvent`'s other branches
  already follow it — `session.error`'s `retryStatus` defaults to `'terminal'`
  (`runner.ts:320-321`), the pessimistic choice — and the whole-event fallback is
  `{ type: 'other' }` (`:341`), which the drain loop ignores. Only the
  stop-reason branch defaulted optimistically. If a new field is added to the
  union, default it pessimistically.
- **`{ type: 'other' }` is still a silent-ignore path** and that is deliberate:
  the docblock at `:280-282` says "Unknown event types surface as
  `{ type: 'other' }` so future SDK additions don't crash." That is correct for
  *events*; it was only wrong for *stop reasons*, which are terminal signals.
  Do not "fix" the `other` fallback.
- **Plan interaction with 063**: both plans edit `src/agents/runner.ts`. 063
  changes the usage read (`translateSdkEvent`'s `span.model_request_end` branch)
  and may add a `getSessionUsage?` method to `ManagedAgentTransport`; 065 changes
  the stop-reason branch, the error-code union, and the drain loop's
  timeout/abort handling. The hunks do not overlap, but land them sequentially
  — **063 first**, so 065's AbortController work sits on the current SDK.
- **Deliberately deferred**: `test/server/auto-connector.test.ts` would be the
  natural home for an end-to-end "UNKNOWN_STOP_REASON → status: unknown"
  assertion, but all 10 of its tests are currently skipped and broken (plan 059).
  Add that assertion when 059 revives the file; note it in your report so 059's
  executor knows to include it.
