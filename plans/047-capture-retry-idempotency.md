# Plan 047: Make reflection submit idempotent and the retry/sync lifecycle trustworthy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/db/schema.ts src/db/queries.ts src/db/migrations/ src/server/mirror-function-schemas.ts src/server/persist-mirror.handler.server.ts src/server/submit-student-space-reflection.handler.server.ts src/components/student-space/sheets/DayDetailCard.tsx src/engine/student-space/Game/State/Captures.js test/server/ test/engine/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (adds a DB column + migration; touches the capture durability layer)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Everything between "the student finished speaking" and "the row is committed in
Postgres" is unrecoverable if it goes wrong, and today it has three ways to go
wrong:

1. **Retry duplicates the reflection and the spend.** `persistMirrorForStudent`
   rethrows a `DIAGNOSTIC_LANGUAGE` memory-write error *after* the
   `mirror_entries` row is inserted. The client records `syncStatus: 'failed'` and
   offers "Retry sync"; nothing keys on `local_capture_id` (it is only written into
   the audit `trace`), so the retry re-runs the paid Mirror agent and inserts a
   **second** row — the same reflection twice in the timeline, billed twice.
2. **The retry button is sometimes guaranteed to fail.** `RetrySyncNotice.retry()`
   sends `transcript` only if `cap.text` exists. A capture that failed *before*
   transcription has no text and no retained audio, so the request is rejected by a
   Zod `.refine()` and the raw validator message
   ("Either transcript or audioBase64 is required.") is shown to a student as
   product copy.
3. **A reload mid-submit loses the reflection silently.** `syncStatus: 'syncing'`
   is persisted before the network call and rehydrated on boot, but nothing
   reconciles it — the capture is stuck at "Syncing…" forever with Retry
   suppressed.

And `Captures.js`, where all of this lands, has **no direct test**: existing tests
either mock it away (`test/engine/Game.setRenderActive.test.ts:56`) or use it as a
Sprouts fixture.

## Current state

### Part (a) — no idempotency key

`src/server/submit-student-space-reflection.handler.server.ts:64-84` — the local
capture id reaches the DB **only** inside the audit `trace` (verbatim):

```ts
  const persisted = await (deps.persistMirror ?? persistMirrorForStudent)(
    studentId,
    {
      entry: { /* … */ },
      context_type: parsed.context_type,
      mood: parsed.mood,
      review_status: 'confirmed',
      raw_output: mirror.output,
      trace: {
        source: 'student-space',
        local_capture_id: parsed.localCaptureId,
        eval_review: mirror.eval_review,
      },
    },
    deps.persistDeps,
  )
```

`src/server/persist-mirror.handler.server.ts:110-118` — the rethrow after a
successful insert, with the comment that admits it (verbatim):

```ts
  } catch (err) {
    if (err instanceof MemoryWriteError && err.code === 'DIAGNOSTIC_LANGUAGE') {
      // Treat diagnostic-language rejection as a hard signal worth surfacing
      // — Mirror's payload passed the gate, so a memory-write reject means
      // a phrasing only the Personality-rewrite check catches snuck in.
      // Fail the request so the user re-edits; persistence already happened
      // but the next reflection won't compound the issue.
      throw err
    }
```

`src/db/schema.ts:65-98` — `mirror_entries` has **no** `local_capture_id` column.
Conventions to match in its extras array: `check(...)`,
`index('idx_mirror_entries_student').on(t.studentId, t.createdAt.desc())`,
`pgPolicy('mirror_entries_rls', …)`, `.enableRLS()`. `uniqueIndex` is already
imported (line 23) and used at line 113
(`uniqueIndex('tags_student_label_uq').on(t.studentId, t.label)`).

`src/db/queries.ts:411-461` — `insertMirrorEntry` opens its own `withStudent`
envelope when no `ctx` is supplied; `insertMirrorEntryInner` inserts, uses
`requireRow(inserted, 'insert')`, inserts tags, optionally inserts an
`agent_traces` row, then re-selects and maps via `drizzleMirrorRow` +
`rowToMirrorEntry`. `InsertMirrorEntryInput` is at lines 393–409.

`src/db/migrations/README.md` is the workflow contract: edit `schema.ts` →
`pnpm db:generate` → review SQL → commit the `.sql` **and** the `meta/` snapshot
together. `drizzle-kit push` and hand-written SQL are banned. Latest migration on
disk: `0003_concerned_robin_chapel.sql` (a one-line `ALTER TABLE`).

### Part (b) — the dead-end retry button

`src/components/student-space/sheets/DayDetailCard.tsx:307-354` (verbatim, elided):

```tsx
  async function retry() {
    const patch = engineState?.captures?.patch
    const submitReflection = engineState?.backend?.submitReflection
    if (!patch || !submitReflection) return
    setBusy(true)
    patch(cap.id, { syncStatus: 'syncing', syncError: '' })
    try {
      const result = await submitReflection({
        localCaptureId: cap.id,
        ...(cap.text ? { transcript: cap.text } : {}),
        ...(cap.contextType ? { contextType: cap.contextType } : {}),
      })
      /* … */
  if (busy || cap.syncStatus === 'syncing') {
    return <p className="mt-1.5 text-xs text-(--color-sheet-ink-soft)">Syncing…</p>
  }
  if (cap.syncStatus !== 'failed') return null
  /* …then a <p role="alert"> with cap.syncError and a "Retry sync" <button>… */
```

The rejection it walks into — `src/server/mirror-function-schemas.ts:31-34`
(verbatim):

```ts
  .refine((value) => Boolean(value.transcript || value.audioBase64), {
    message: 'Either transcript or audioBase64 is required.',
    path: ['transcript'],
  })
```

The audio blob is never retained: `DayDetailCapture` (`DayDetailCard.tsx:28-50`)
has no audio field and neither does the engine's capture allow-list — the `Blob`
lives only in `AskSheet`'s local `options.audioBlob` for one submit
(`AskSheet.tsx:738-745`). So "no `cap.text`" ⇒ "retry cannot succeed".

### Part (c) — `'syncing'` is never reconciled

`src/components/student-space/capture/AskSheet.tsx:718` and `:784` persist the
pre-flight status: `syncStatus: backend?.submitReflection ? 'syncing' : 'local'`.
`src/engine/student-space/Game/State/schema.js:245` accepts it
(`const SYNC_STATES = new Set(['local', 'syncing', 'synced', 'failed'])`) and
`mergeCapture` (`schema.js:352`) lets it through. Hydration happens exactly once,
at boot — `src/engine/student-space/Game/State/State.js:106`:
`this.captures.hydrate(snapshot.captures)`. Nothing maps a stale `'syncing'` back
to `'failed'`, and `DayDetailCard.tsx:337-340` renders "Syncing…" and suppresses
Retry for as long as it stays.

**GOTCHA — inline this, it has bitten before**: `KNOWN_CAPTURE_KEYS` in
`src/engine/student-space/Game/State/schema.js:216-241` is an **allow-list**. Any
**new** capture field must be added there or it is silently dropped at the
React↔engine seam. For this plan `syncStatus`/`syncError` are already listed
(line 227) and `'failed'` is already in `SYNC_STATES`, so **no allow-list edit is
needed** — but if you find yourself wanting a new field, you must add it there.

### Part (d) — the untested durability layer

`src/engine/student-space/Game/State/Captures.js` (207 lines). Facts you need:

- `add(payload)` stamps `id`/`createdAt`/`entryDate`, pushes, fans out to
  subscribers, **then** persists (photos persist after an async downscale).
- **`patch` is defined twice** — lines 117–125 and again at 153–161. The second
  declaration wins (it routes through `findById`). Both fan out before
  `_persist()`. Do not "fix" the duplicate here.
- `hydrate(snapshot)` (165–171) returns early on a non-array/empty snapshot, else
  `mergeArray(snapshot, mergeCapture, 'capture')`. It deliberately does **not**
  persist ("bulk load is not a save event").
- `upsertBackend(snapshot)` (178–195) — the operator's note called this
  `mergeBackend`; the real name is `upsertBackend`. It merges backend rows by
  `backendKey(entry)` (`mirror:<id>` / `cartographer:<id>`), sorts by `createdAt`,
  and also does not persist.
- `_persist()` (199) = `Persistence.getInstance()?.save('captures', this.serialize())`.
- `Persistence.save` (`Persistence.js:273-296`) is debounced 250 ms per slice and
  early-returns with a **one-time** warning per slice
  (`storage unavailable; slice "…"`) when `_available` is false. `_flushSlice`
  (`:298-333`) keeps the value pending on failure and sets `_available = false` on
  `QuotaExceededError` / `e.code === 22`. `flush()` (`:336-343`) writes pending
  slices synchronously. `memoryAdapter()` is exported from the same module
  (`:82-90`). The constructor's `_probe()` also calls `setItem`.

Exemplars: `test/engine/Sprouts.integration.test.ts:20-58` for engine-singleton
setup (`resetSingletons()` nulling each class's static `instance`, then
`new Persistence({ storage: memoryAdapter() })`, `new Captures()`, with
`@ts-expect-error` on JS imports); `test/server/persist-mirror.test.ts` and
`test/server/submit-student-space-reflection.test.ts` for DI handler tests that
pass `requireContext` / `insertMirrorEntry` / `runMirror` / `persistMirror` as
`vi.fn()` and never touch Postgres.

### Repo conventions

pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest tests in `test/`
mirroring `src/`; React tests use Testing Library + happy-dom; conventional
commits (e.g. `fix(history): bucket entry dates in Asia/Singapore, not UTC`).
Engine files are vanilla JS, brace-on-next-line. Every DB read/write goes through
the `withStudent` tenancy envelope; bypassing it is a tenancy bug. Baseline:
`pnpm check` exits 0 with 18 pre-existing lint warnings; `pnpm test` = 911
passed / 128 skipped / 0 failed. The 128 skips are
`describe.skipIf(!process.env.DATABASE_URL)` DB tests — **all new tests here must
run without `DATABASE_URL`.**

## Commands you will need

| Purpose            | Command                                                                                                  | Expected on success                  |
|--------------------|----------------------------------------------------------------------------------------------------------|--------------------------------------|
| Install            | `pnpm install`                                                                                           | exit 0                               |
| Check              | `pnpm check`                                                                                             | exit 0 (18 pre-existing warnings OK) |
| All tests          | `pnpm test`                                                                                              | ≥911 passed, 0 failed                |
| Generate migration | `pnpm db:generate`                                                                                       | new `src/db/migrations/0004_*.sql` + `meta/` snapshot |
| Server tests       | `pnpm vitest run test/server/persist-mirror.test.ts test/server/submit-student-space-reflection.test.ts`  | all pass                             |
| Engine tests       | `pnpm vitest run test/engine/Captures.test.ts`                                                            | all pass                             |
| History tests      | `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`                              | all pass                             |

Do **not** run `pnpm db:migrate` unless you have a disposable dev database —
generating and committing the migration is the deliverable.

## Scope

**In scope** (the only files you should modify/create):

- `src/db/schema.ts` — `local_capture_id` column + unique index
- `src/db/migrations/0004_*.sql` + `src/db/migrations/meta/*` (generated)
- `src/db/queries.ts` — `InsertMirrorEntryInput`, `insertMirrorEntryInner`, new
  `findMirrorEntryByLocalCaptureId`
- `src/server/mirror-function-schemas.ts` — `local_capture_id` on the persist input
- `src/server/persist-mirror.handler.server.ts`
- `src/server/submit-student-space-reflection.handler.server.ts`
- `src/components/student-space/sheets/DayDetailCard.tsx` — `RetrySyncNotice` only
- `src/engine/student-space/Game/State/Captures.js` — `hydrate` reconciliation
- `test/server/persist-mirror.test.ts`,
  `test/server/submit-student-space-reflection.test.ts`,
  `test/components/student-space/sheets/history-sheet.test.tsx` — extend
- `test/engine/Captures.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- The `DIAGNOSTIC_LANGUAGE` rethrow itself
  (`persist-mirror.handler.server.ts:111-118`). Whether a post-insert memory
  failure should fail the request is a product decision; idempotency makes the
  current behaviour *safe* either way.
- `src/engine/student-space/Game/State/schema.js` — no new capture field is needed
  (see the GOTCHA); editing the allow-list without one is churn.
- `AskSheet.tsx` — writing `'syncing'` pre-flight is correct; the fix is
  reconciliation on boot, not removing the optimistic write.
- Retaining audio blobs so a pre-transcription retry could resend them — that is
  an offline-queue feature. Part (b) only removes the guaranteed-failing button.
- `MirrorEntryRow` / `MirrorEntryDbRow` / `drizzleMirrorRow`
  (`src/db/queries.ts:56-75, 139, 1783-1810`) — do **not** surface
  `local_capture_id` in the API row shape; no consumer needs it and it would
  ripple into every fixture.
- Any `describe.skipIf(!process.env.DATABASE_URL)` test.

**File conflict**: plan 058 also edits `insertMirrorEntry` in
`src/db/queries.ts`. **047 lands first.**

## Git workflow

- Branch: `advisor/047-capture-retry-idempotency`
- One commit per step. Conventional commits, e.g.
  `feat(db): key mirror_entries by local_capture_id for idempotent submit`,
  `fix(history): hide retry when a capture has no resendable content`,
  `fix(engine): reconcile interrupted 'syncing' captures on boot`,
  `test(engine): characterize the Captures durability layer`
- Do NOT push or open a PR unless the operator instructed it.

## Non-regression argument (state this in the PR)

- **Retry UX does not get slower.** The retry path gains no round trips; the
  pre-flight lookup in Step 3 replaces a *Mirror agent call* (seconds, paid) with
  one indexed `SELECT` (sub-millisecond, inside the envelope the handler already
  opens) whenever the row exists. In the common case (no row) it is one extra
  indexed point lookup — invisible next to the agent call that follows.
- **Write cost of the unique index is negligible**: one b-tree entry per insert on
  a table taking a handful of rows per student per day. Postgres treats `NULL`s as
  distinct in a unique index, so historical rows and non-student-space insert paths
  are unaffected.
- **The engine hot path is untouched.** Reconciliation runs inside
  `Captures.hydrate()` — once at boot, over an array `mergeArray` already
  iterates. No new render, subscription, or rAF work.
- **Ease of use improves both ways**: a student who reloads mid-submit gets an
  actionable "Retry" instead of a permanent "Syncing…", and a student with nothing
  to resend gets guidance copy instead of a button that always fails with a
  validator message.

## Steps

### Step 1: Add the `local_capture_id` column and unique index

In `src/db/schema.ts`, in the `mirrorEntries` column block after `title`:

```ts
    /**
     * Idempotency key from the Student Space client (the engine's local capture
     * id). Present for student-space submits; NULL for seeds, imports, and other
     * insert paths. Unique per student so a retry of the same capture returns the
     * existing row instead of duplicating the reflection.
     */
    localCaptureId: text('local_capture_id'),
```

and in the extras array, after `index('idx_mirror_entries_student')`:

```ts
    uniqueIndex('mirror_entries_student_local_capture_uq').on(t.studentId, t.localCaptureId),
```

No `.where(...)` clause: Postgres treats `NULL` as distinct in unique indexes, so
rows without a local capture id never collide.

Then run `pnpm db:generate`. Review the emitted SQL: it must be exactly one
`ALTER TABLE "mirror_entries" ADD COLUMN "local_capture_id" text;` plus one
`CREATE UNIQUE INDEX` — nothing else. Commit the `.sql` **and** the `meta/`
snapshot together, per `src/db/migrations/README.md`.

**Verify**: `pnpm check` → exit 0.
**Verify**: `ls src/db/migrations/0004_*.sql` → exactly one file.
**Verify**: `grep -c 'ADD COLUMN' src/db/migrations/0004_*.sql` → 1;
`grep -c 'CREATE UNIQUE INDEX' src/db/migrations/0004_*.sql` → 1.
**Verify**: `git status --short src/db/migrations/` → the new `.sql` and changed
`meta/` files are both listed.

### Step 2: Make the insert idempotent inside the tenancy envelope

In `src/db/queries.ts`:

1. Add to `InsertMirrorEntryInput`:

```ts
  /**
   * Client-supplied idempotency key (the engine's local capture id). When set, a
   * second insert for the same (student, local_capture_id) returns the existing
   * row instead of creating a duplicate reflection.
   */
  local_capture_id?: string
```

2. Add an exported lookup beside the other mirror queries, using the same
   `opts.ctx ?? withStudent` shape as `insertMirrorEntry`, and **reusing** the
   file's existing `and`, `eq`, `loadTagsInner`, `drizzleMirrorRow`,
   `rowToMirrorEntry` (do not re-implement row mapping):

```ts
export async function findMirrorEntryByLocalCaptureId(
  studentId: string,
  localCaptureId: string,
  opts: { ctx?: TenantContext } = {},
): Promise<MirrorEntryRow | null>
```

   Its inner form selects from `mirrorEntries` where
   `studentId = ctx.studentId AND localCaptureId = <key>`, `.limit(1)`, and maps
   the row through `drizzleMirrorRow` + `rowToMirrorEntry(row, await loadTagsInner(ctx, row.id))`,
   returning `null` when absent.

3. In `insertMirrorEntryInner`, before the `ctx.db.insert(...)`:

```ts
  if (input.local_capture_id) {
    const existing = await findMirrorEntryByLocalCaptureIdInner(ctx, input.local_capture_id)
    // A retry of the same capture must not create a second reflection (or a
    // second agent_traces row). Return the row the first attempt committed.
    if (existing) return existing
  }
```

   Add `localCaptureId: input.local_capture_id ?? null` to `.values({...})`, chain
   `.onConflictDoNothing()` on the insert, and replace
   `requireRow(inserted, 'insert')` with a race-tolerant branch: if
   `inserted[0]?.id` is `undefined` and `input.local_capture_id` is set, re-run the
   lookup and return the concurrent winner; otherwise throw
   `new Error('insertMirrorEntry: insert returned no row')`.

   Keep the rest of the function (tags loop, `agent_traces` insert, final
   re-select) unchanged — it now runs only on a genuine first insert, so a retry no
   longer appends a duplicate trace either. Stay inside the `ctx` the envelope
   handed you; do **not** open a second `withStudent`.

**Verify**: `pnpm check` → exit 0.
**Verify**: `grep -n 'requireRow(inserted' src/db/queries.ts` → no match inside
`insertMirrorEntryInner`.

### Step 3: Thread the key through the handlers and skip the agent on a known capture

1. `src/server/mirror-function-schemas.ts` — add
   `local_capture_id: z.string().min(1).optional(),` to `persistMirrorInputSchema`.
2. `src/server/persist-mirror.handler.server.ts` — in `persistMirrorForStudent`,
   pass it into the insert call, leaving `trace` exactly as it is (it stays the
   audit record):
   `...(parsed.local_capture_id ? { local_capture_id: parsed.local_capture_id } : {}),`
3. `src/server/submit-student-space-reflection.handler.server.ts` — add
   `local_capture_id: parsed.localCaptureId` to the object passed to
   `persistMirrorForStudent` (alongside the existing `trace`), add
   `findExisting?: typeof findMirrorEntryByLocalCaptureId` to
   `SubmitStudentSpaceReflectionDeps`, and add a pre-flight short-circuit
   **before** the transcription/Mirror calls:

```ts
  // Idempotency: the client retries with the same localCaptureId. If the first
  // attempt already committed a row (e.g. it failed *after* insert, in the
  // memory-append step), return that row instead of re-running the paid Mirror
  // agent and inserting a duplicate reflection.
  const existing = await (deps.findExisting ?? findMirrorEntryByLocalCaptureId)(
    studentId,
    parsed.localCaptureId,
  )
  if (existing) {
    return {
      local_capture_id: parsed.localCaptureId,
      transcript: existing.transcript,
      mirror_entry: existing,
      output: {
        validation: existing.validation,
        inferred_meaning: existing.inferred_meaning,
        story_reframe: existing.story_reframe,
      },
      eval_review: null,
      transcription: null,
    }
  }
```

   Import `findMirrorEntryByLocalCaptureId` from `~/db/queries` (the file already
   type-imports `MirrorEntryRow` from there — add a value import).

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/server/persist-mirror.test.ts test/server/submit-student-space-reflection.test.ts`
→ all existing tests pass. If a submit test fails because the new pre-flight call
is unmocked, add `findExisting: vi.fn(async () => null)` to that test's deps — do
**not** remove the short-circuit.

### Step 4: Test the idempotency (no DB required)

`test/server/persist-mirror.test.ts` — add:

- `persistMirrorHandler({ ...input(), local_capture_id: 'local-7' }, …)` calls the
  injected `insertMirrorEntry` with
  `expect.objectContaining({ local_capture_id: 'local-7' })`.
- Omitting it → `expect(insertMirrorEntry.mock.calls[0][1]).not.toHaveProperty('local_capture_id')`.

`test/server/submit-student-space-reflection.test.ts` — add:

- **The regression test**: with `findExisting: vi.fn(async () => mirrorEntry())`,
  the handler does **not** call `runMirror`, `persistMirror`, or `transcribeAudio`,
  and returns `mirror_entry: { id: 42 }` with `eval_review: null` and
  `transcription: null`.
- **First-attempt path unchanged**: with `findExisting: vi.fn(async () => null)`,
  `runMirror` and `persistMirror` are each called once and `persistMirror`
  receives `expect.objectContaining({ local_capture_id: 'local-1' })` **and**
  `trace: expect.objectContaining({ local_capture_id: 'local-1' })` — both,
  because the trace stays the audit record.

**Verify**: `pnpm vitest run test/server/persist-mirror.test.ts test/server/submit-student-space-reflection.test.ts`
→ all pass, 4 new cases.

### Step 5: Never render a retry button that cannot succeed

In `RetrySyncNotice` (`src/components/student-space/sheets/DayDetailCard.tsx`),
add a resendability check and branch the failed state. Keep the existing
`busy || 'syncing'` and `!== 'failed'` branches and all class strings
byte-identical:

```tsx
  // The audio blob is never retained on the capture (see DayDetailCapture and the
  // engine's KNOWN_CAPTURE_KEYS): only `text` can be resent. A capture that failed
  // before transcription has nothing to send, so the server's `.refine()` would
  // reject it and surface a raw validator message as product copy. Show guidance
  // instead of a button that is guaranteed to fail.
  const canResend = Boolean(cap.text?.trim())
```

```tsx
  if (cap.syncStatus !== 'failed') return null

  if (!canResend) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <p role="alert" className="text-xs text-(--color-sheet-ink-soft)">
          Couldn&apos;t save this reflection, and the recording is no longer available to send
          again. Recording it again will save it.
        </p>
      </div>
    )
  }
```

Copy stays plain and student-facing — no error codes, no Zod text.

Then add one case to
`test/components/student-space/sheets/history-sheet.test.tsx`, modelled on
`'can retry failed local reflection syncs from day detail'` (line 366): a failed
capture with `text: ''` renders no `Retry sync` button
(`expect(screen.queryByRole('button', { name: 'Retry sync' })).toBeNull()`) and
does render the guidance copy.

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/components/student-space/sheets/history-sheet.test.tsx`
→ all pass, one new test. The two existing retry tests (lines 366 and 415) set
`text`, so they keep the button.

### Step 6: Reconcile interrupted `'syncing'` captures at boot

In `src/engine/student-space/Game/State/Captures.js`, extend `hydrate` (lines
165–171). Keep the existing early return and `mergeArray` call, then:

```js
        // A persisted 'syncing' status can only mean the page went away mid
        // submit (AskSheet writes it before the network call). Nothing else
        // reconciles it, so the capture would render "Syncing…" forever with
        // Retry suppressed and the reflection silently lost. hydrate() runs once
        // at boot (State.js), before any submit in this session can be in flight,
        // so re-marking here cannot race a live request.
        for(const entry of this.entries)
        {
            if(entry.syncStatus === 'syncing' && !entry.backendMirrorEntryId)
            {
                entry.syncStatus = 'failed'
                entry.syncError  = 'Interrupted before saving'
            }
        }
```

The `!entry.backendMirrorEntryId` guard matters: a capture that reached the
backend but was interrupted before the `'synced'` patch landed is already durable
and must not be presented as failed. Do **not** persist from `hydrate` (its
existing comment explains why); the corrected value is written by the next real
`add`/`patch`.

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm vitest run test/engine/Sprouts.integration.test.ts test/engine/Sprouts.test.ts`
→ all pass.

### Step 7: Characterize `Captures.js`

Create `test/engine/Captures.test.ts`, modelling setup/teardown on
`test/engine/Sprouts.integration.test.ts:20-58`. Use
`Persistence.getInstance().flush()` (or fake timers) to cross the 250 ms debounce,
and wrap `memoryAdapter()` in a small spying adapter you keep a reference to
rather than reaching into privates. All six cases are required:

1. **add → persist → serialize round-trip**: `add({ kind: 'ask', text: 'hi' })`
   returns an entry with `id`/`createdAt`/`entryDate`; `serialize()` contains it;
   after `flush()`, `JSON.parse`ing the adapter's `ss:v1:captures` value yields the
   same entry.
2. **`patch` fan-out ordering — subscribers before persist**: a subscriber records
   the observed `entry.syncStatus`; after `patch(id, { syncStatus: 'failed' })` it
   saw `'failed'` (so it ran after the mutation) and the persisted payload also has
   `'failed'`. Comment that `patch` is declared twice (lines 117 and 153) and the
   second wins.
3. **failed → retry transition**: patch `{ syncStatus: 'syncing', syncError: '' }`
   then `{ backendMirrorEntryId: 91, syncStatus: 'synced' }`; the serialized entry
   ends `'synced'` with the id and an empty `syncError` — the exact sequence
   `RetrySyncNotice` performs.
4. **`upsertBackend` does not persist backend rows as locally-authored state**:
   after `flush()`ing a local capture, `upsertBackend([...])` with a
   `backendMirrorEntryId: 91` entry → `serialize()` has both, sorted by
   `createdAt`, and the **persisted** payload is unchanged (no new write
   scheduled). A second `upsertBackend` with the same id replaces, not duplicates.
5. **`'syncing'` reconciliation (Step 6)**: `hydrate([...])` with three entries —
   `'syncing'` without `backendMirrorEntryId`, `'syncing'` **with**
   `backendMirrorEntryId: 5`, and `'synced'` — asserts only the first becomes
   `{ syncStatus: 'failed', syncError: 'Interrupted before saving' }`.
6. **quota rejection does not lose the entry**: with an adapter whose `setItem`
   throws an error named `QuotaExceededError` (see `Persistence.js:330`), `add()`
   then `flush()` → nothing throws, `serialize()` still has the entry in memory,
   and a `console.warn` spy sees the `storage unavailable; slice "captures"`
   warning **at most once**. Note in a comment that the constructor's `_probe()`
   also calls `setItem`, so a throw-always adapter makes `_available` false from
   the start; to exercise "healthy then quota-full", make the adapter throw only
   after the first N writes.

**Verify**: `pnpm vitest run test/engine/Captures.test.ts` → all 6 pass.

### Step 8: Full gate

**Verify**: `pnpm check` → exit 0 (warning count still 18).
**Verify**: `pnpm test` → ≥911 passed, 0 failed, 128 skipped.

## Test plan

- `test/server/persist-mirror.test.ts` (+2): the key is forwarded to the insert;
  absent when not supplied.
- `test/server/submit-student-space-reflection.test.ts` (+2): an existing row
  short-circuits before `runMirror`/`persistMirror`/`transcribeAudio` and is
  returned as success (**the duplicate-row / double-spend regression test**); the
  first-attempt path still calls both and passes the key twice (input + trace).
- `test/components/student-space/sheets/history-sheet.test.tsx` (+1): a failed
  capture with no `text` renders guidance, not a Retry button.
- `test/engine/Captures.test.ts` (create, 6 cases): round-trip, patch fan-out
  ordering, failed→retry transition, `upsertBackend` non-persistence + de-dup,
  `'syncing'` reconciliation, quota rejection.
- Structural patterns: `test/server/persist-mirror.test.ts` (DI handlers);
  `test/engine/Sprouts.integration.test.ts` (engine singletons).
- DB-level uniqueness is **not** unit-tested — all DB tests are
  `DATABASE_URL`-gated and currently skipped (plans/059). Its guarantee is
  asserted structurally: the migration SQL contains one `CREATE UNIQUE INDEX`, and
  the handler tests prove the read-before-insert path. Say this in the PR.
- Verification: `pnpm test` → 0 failures, ~11 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with 0 failures; skip count still 128
- [ ] `grep -l 'local_capture_id' src/db/schema.ts src/db/queries.ts src/server/mirror-function-schemas.ts src/server/persist-mirror.handler.server.ts src/server/submit-student-space-reflection.handler.server.ts` → all five files
- [ ] `grep -rn 'mirror_entries_student_local_capture_uq' src/db/` → hits in
      `schema.ts` and the new migration SQL
- [ ] `ls src/db/migrations/0004_*.sql` → exactly one file;
      `git status --short src/db/migrations/meta/` → snapshot changes present
- [ ] `grep -n 'findMirrorEntryByLocalCaptureId' src/db/queries.ts src/server/submit-student-space-reflection.handler.server.ts` → definition + call
- [ ] `grep -c 'canResend' src/components/student-space/sheets/DayDetailCard.tsx` → ≥2
- [ ] `grep -c 'Interrupted before saving' src/engine/student-space/Game/State/Captures.js` → 1
- [ ] `pnpm vitest run test/engine/Captures.test.ts` passes with 6 tests
- [ ] `git status` shows only in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code — in particular if
  `mirror_entries` already has a `local_capture_id` column or
  `insertMirrorEntryInner` already handles conflicts.
- `pnpm db:generate` emits **more** than the one `ALTER TABLE` + one
  `CREATE UNIQUE INDEX` (e.g. it wants to drop a policy or alter another table).
  That means the committed `meta/` snapshot has drifted from `schema.ts`; report
  the emitted SQL verbatim rather than fixing it here.
- `pnpm db:generate` fails because no database/config is reachable. Report it; do
  **not** hand-write the SQL (banned by `src/db/migrations/README.md`).
- The pre-flight `findExisting` call breaks a test you cannot fix by injecting
  `findExisting: vi.fn(async () => null)` — a deeper coupling means the handler
  seam differs from what this plan assumes.
- Adding the reconciliation loop makes any existing engine test fail — that would
  mean a test depends on `'syncing'` surviving hydration, contradicting part (c).
- `grep -rn '\.hydrate(' src/engine/` reveals a **second** capture hydration path
  needing the same reconciliation, or a path where a submit can be in flight
  *across* a `hydrate()` call — Step 6's safety argument depends on hydration
  being boot-only.
- You find yourself needing a new capture field (then `KNOWN_CAPTURE_KEYS` must
  change too — report first, it changes the persisted schema surface).

## Maintenance notes

- **A migration is pending.** `pnpm db:migrate` must run against every environment
  (dev branch, staging, production) before the new code path deploys, or the insert
  fails on an unknown column. This plan only generates and commits the migration.
- Reviewer should scrutinise, in order: (1) the generated SQL is only the column +
  unique index, with `meta/` committed alongside; (2) the read-before-insert and
  the race branch both live **inside** the `ctx` handed to
  `insertMirrorEntryInner` — no second `withStudent`, no cross-tenant query;
  (3) the `agent_traces` insert and tags loop now run only on a genuine first
  insert, so a retry appends no duplicate trace; (4) `local_capture_id` was **not**
  added to `MirrorEntryRow`; (5) the `!entry.backendMirrorEntryId` guard in the
  reconciliation loop; (6) the retry copy contains no validator or error-code text.
- `Captures.js` declares `patch` **twice** (lines 117 and 153); the second wins.
  Deleting the dead first declaration is a good follow-up, deliberately not in
  this diff — the new characterization test pins the observable behaviour first so
  that cleanup is provably safe.
- The `DIAGNOSTIC_LANGUAGE` rethrow after a successful insert is still there by
  design. Idempotency makes it survivable; if the team later decides a post-insert
  memory failure should not fail the request, that is a one-line change and this
  plan's tests will not object.
- Deliberately deferred: retaining audio blobs for a pre-transcription retry (a
  real offline-queue feature), and a DB-level integration test for the unique index
  (blocked on plans/059 reviving the `DATABASE_URL`-gated suite).
- **File conflict**: plan 058 also edits `insertMirrorEntry`. 047 lands first.
