# Plan 041: Spike — run the Connector at capture time so a live reflection visibly updates the Profile (demo flag)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/lib/student-space/backend-bridge.ts src/lib/student-space/backend-snapshot.ts src/server/run-connector.handler.server.ts src/db/queries.ts src/components/student-space/EngineHost.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (latency/cost of a live model call on the capture path; mitigated by flag + fire-and-forget)
- **Depends on**: none
- **Category**: direction (SPIKE — deliverable is a working demo-flagged prototype **plus a findings write-up**, not production polish)
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

The demo's core claim — "talk, and your profile grows" — silently doesn't
happen live. A voice capture on `/` saves a mirror entry and grows an island
sprout, but the Values/Interests/Personality/Skills profile and timeline only
change when someone manually runs the Connector (a button elsewhere, or the
18:00 scheduled pass). On stage: the presenter records a reflection, a tree
appears, then they open `/profile` — and nothing has changed. This spike wires
a **demo-flagged, non-blocking** Connector run after each successful capture
persist, followed by a snapshot refresh, so the profile visibly updates within
seconds of speaking. The spike also answers the questions that decide whether
this becomes a product default: latency, cost per run, failure behavior, and
idempotency against the scheduled pass.

## Current state

Relevant files:

- `src/lib/student-space/backend-bridge.ts` — the React↔engine backend seam.
  Exposes `runConnector` (lines 261–267) and `refreshSnapshot` (176–195), but
  the capture-persist paths never call them.
  **Symbol disambiguation (two things named `runConnector` in this file):**
  the *module import* at line 19 (`from '~/server/run-connector.functions'`)
  is the server function — it accepts `{ data: { limit } }` and rejects on
  failure; the *bridge method* at 261–267 wraps that import, hardcodes
  `{ data: {} }` (no limit), and throws on hard-fail. The Step 1 helper must
  call the **module import** (so it can pass `limit: 3` and own its own
  catch); wiring the bridge method instead would silently drop the limit.
- `src/server/run-connector.handler.server.ts` — the Connector run itself:
  batch limit, scoping, per-entry model call.
- `src/db/queries.ts` — `listUnconnectedMirrorEntries` (474–493): defines
  which entries a run processes.
- `src/lib/student-space/backend-snapshot.ts` — `applyStudentSpaceBackendSnapshot`
  (around 185–195) pushes a fresh snapshot into the live engine state.
- `src/components/student-space/EngineHost.tsx` — boot-time snapshot hydration
  (255–261) and the `window.__studentSpaceGame` handle (243).
- `src/server/function-schemas.ts` — `runConnectorInputSchema` (66–69).

**The capture persist paths** (both in `backend-bridge.ts`) are the wiring
points. Voice captures commit via `logPreparedReflection` →
`persistPreparedReflection(input, 'confirmed')`:

```ts
// backend-bridge.ts:227-228
logPreparedReflection: (input) => persistPreparedReflection(input, 'confirmed'),
forgetPreparedReflection: (input) => persistPreparedReflection(input, 'forgotten'),
```

```ts
// backend-bridge.ts:296-330 (abridged)
async function persistPreparedReflection(
  input: StudentSpacePreparedReflection,
  reviewStatus: 'confirmed' | 'forgotten',
): Promise<StudentSpaceReflectionResult> {
  const result = (await persistMirror({ data: { /* entry, context_type, review_status, ... */ } })) as PersistMirrorResult
  return {
    localCaptureId: input.localCaptureId,
    mirrorEntry: mapMirrorEntryRowToSummary(result.mirror_entry),
  }
}
```

There is also a direct `submitReflection` path (229–244) used by non-prepared
flows; treat it the same way.

**The Connector run is already scoped and bounded.** From
`run-connector.handler.server.ts`:

```ts
// run-connector.handler.server.ts:11
const DEFAULT_CONNECTOR_BATCH_LIMIT = 5
// :66-70
const limit = input.limit ?? DEFAULT_CONNECTOR_BATCH_LIMIT
const listEntries = deps.listUnconnectedMirrorEntries ?? listUnconnectedMirrorEntries
const candidates = await listEntries(studentId, { limit: limit + 1 })
const confirmedCandidates = candidates.filter((entry) => entry.review_status === 'confirmed')
const entriesToProcess = confirmedCandidates.slice(0, limit)
```

and `runConnectorInputSchema` accepts `{ limit?: number (1–10, optional) }`
(`function-schemas.ts:66-69`), so a capture-time run can be capped small
(e.g. `limit: 3`).

**Idempotency is already guaranteed by the data model.** From
`src/db/queries.ts:482-493`:

```ts
const proposedDiffs = await listVipsProposedDiffsInner(ctx, undefined)
const attemptedMirrorIds = new Set(proposedDiffs.map((diff) => diff.mirror_entry_id))
const unconnected = entries.filter(
  (entry) => entry.review_status === 'confirmed' && !attemptedMirrorIds.has(entry.id),
)
```

An entry with any row in `vips_proposed_diffs` is never re-processed, so the
18:00 scheduled pass (`runConnectorCronHandler`, same file, 127–170) will not
double-process entries the capture-time run already attempted. Confirm this
reading during the spike and record it in the write-up.

**Eligibility of a fresh capture**: the voice "log it" path persists with
`review_status: 'confirmed'` (see `persistPreparedReflection` above), which is
exactly the filter the Connector applies — a just-captured reflection IS
eligible for the very next run.

**Failure semantics**: the bridge's `runConnector` **throws** on hard-failed
results (`backend-bridge.ts:263-265`, `isHardFailedConnectorResult`). Statuses
`ok` / `nothing_to_run` / `partial` return normally. The spike helper must
catch everything — a Connector failure mid-demo must degrade to "nothing
happened," never an error surface.

**Snapshot refresh + apply**: `refreshSnapshot` (`backend-bridge.ts:176-195`)
loads VIPS pages + wiki + trajectory in parallel and returns a snapshot;
`applyStudentSpaceBackendSnapshot(game, snapshot)`
(`backend-snapshot.ts` ~190) pushes it into engine state, which version-bumps
the slices the Profile/Trajectory sheets subscribe to. EngineHost already
exposes the live game as `window.__studentSpaceGame` (`EngineHost.tsx:243`,
placed there for the sign-out helper) — the spike may use it, with a
maintenance note that productionizing should replace the global with a proper
seam.

**Authored copy (optional polish)** — from
`docs/brainstorms/2026-05-18-island-object-progression-requirements.md`
(F4 flow, ~line 66, and the implementation note, ~line 180):

> `Captured. Still listening for patterns.` (verifier dropped everything —
> neutral, non-failure)
>
> "Heard. Something is growing on the island." (reflection-voice success copy)

Tone constraint (binding if you add any acknowledgment UI): dropped evidence
must read as "still listening," **never** "rejected"; no XP/points/streak
framing — the brainstorm's "Outside this product's identity" stance.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Lint + typecheck | `pnpm check` | exit 0 (18 pre-existing lint warnings OK, 0 errors) |
| Full tests | `pnpm test` | 10 pre-existing failures in 5 files (see plans/034) — no NEW failures |
| Targeted tests | `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` | all pass |
| Dev server | `DATABASE_URL=... pnpm dev` | serves on port 3000 |
| Seed | `pnpm db:migrate && pnpm seed` | exit 0, students seeded/skipped |

Note: a local `DATABASE_URL` (embedded/local Postgres) plus valid Anthropic
managed-agent env (`MANAGED_AGENT_*` per README.md:105-134) are required for
the live-latency measurement step. If the managed-agent env is unavailable,
complete the code + tests and mark the measurement step BLOCKED in the report
rather than skipping silently.

## Scope

**In scope** (the only files you should modify):
- `src/lib/student-space/backend-bridge.ts` — the flag-gated helper + two call sites
- `test/lib/student-space/backend-bridge.test.ts` — new tests
- `docs/solutions/2026-07-23-connector-at-capture-spike.md` (create) — findings write-up
- (optional acknowledgment UI only) `src/components/StudentSpaceHost.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/server/run-connector.handler.server.ts` / `auto-connector.handler.server.ts` —
  the run itself is not being changed; batching/limits are passed from the client.
- `src/engine/student-space/**` — no engine changes; sprout growth already works.
- `src/agents/**` including `verifier.ts` — the deterministic verifier gate is
  a hard invariant; nothing here may bypass it.
- The scheduled cron pass and `CRON_SECRET` handling.
- Any change that makes capture UX **wait** on the Connector.

## Git workflow

- Branch: `advisor/041-connector-at-capture-spike`
- Conventional commits, e.g. `feat(demo): run connector after capture behind VITE_DEMO_CONNECTOR_AT_CAPTURE`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the flag-gated fire-and-forget helper

In `src/lib/student-space/backend-bridge.ts`, add a module-level helper:

```ts
const DEMO_CONNECTOR_AT_CAPTURE =
  import.meta.env.VITE_DEMO_CONNECTOR_AT_CAPTURE === '1'

function maybeRunDemoConnectorAfterCapture(): void {
  if (!DEMO_CONNECTOR_AT_CAPTURE) return
  void (async () => {
    const startedAt = performance.now()
    try {
      const run = await runConnector({ data: { limit: 3 } })
      const snapshot = await createStudentSpaceBackendBridge().refreshSnapshot?.() // see note below
      const game = (window as { __studentSpaceGame?: unknown }).__studentSpaceGame
      if (snapshot && game) applyStudentSpaceBackendSnapshot(game as never, snapshot)
      console.info(
        `[demo-connector] status=${run.status} processed=${run.processed} in ${Math.round(performance.now() - startedAt)}ms`,
      )
    } catch (err) {
      // Demo must not break: degrade silently.
      console.warn('[demo-connector] capture-time connector run failed', err)
    }
  })()
}
```

Implementation notes (adapt, don't paste blindly):
- Do NOT construct a second bridge inside the helper. Preferred refactor
  (pick this unless it fights the file): extract the body of `refreshSnapshot`
  into a module-level function `loadBackendSnapshot()` in `backend-bridge.ts`
  and have both the bridge method and this helper call it. (Passing the bridge
  instance into the helper is the fallback if extraction turns out messy.)
- `import.meta.env.VITE_*` is the flag mechanism because the bridge is client
  code, it needs no DB/settings plumbing, and it defaults off in every
  environment that doesn't set it. Document the flag name in the write-up.
- Import `applyStudentSpaceBackendSnapshot` from
  `~/lib/student-space/backend-snapshot` (already exported; the bridge already
  imports sibling types from that module — see line 7).
- The helper must be `void`-returning and never awaited by callers.

**Verify**: `pnpm check` → exit 0.

### Step 2: Call it from both persist paths, post-success only

- In `persistPreparedReflection` (`backend-bridge.ts:296-330`): after
  `persistMirror` resolves, call `maybeRunDemoConnectorAfterCapture()` **only
  when `reviewStatus === 'confirmed'`** (a forgotten reflection must not
  trigger a run).
- In `submitReflection` (`backend-bridge.ts:229-244`): call it after
  `submitStudentSpaceReflection` resolves.

Do not call it from AskSheet or from the `ss:ask-capture-committed` event —
that event fires **before** the backend persist completes
(`src/components/student-space/capture/AskSheet.tsx:789` dispatches, then
awaits `logPreparedReflection`), so the new entry wouldn't exist yet.

**Verify**: `pnpm check` → exit 0. `grep -n "maybeRunDemoConnectorAfterCapture" src/lib/student-space/backend-bridge.ts` → exactly 3 matches (1 definition + 2 call sites).

### Step 3: Tests

In `test/lib/student-space/backend-bridge.test.ts` (follow the file's existing
mocking style — read it first), add:

1. Flag off (default): persisting a confirmed reflection does NOT invoke
   `runConnector`.
2. Flag on (stub `import.meta.env` per the repo's existing pattern, or expose
   the flag via an injectable seam if stubbing is impractical — prefer a small
   `setDemoConnectorFlagForTests` export over env mutation if needed):
   persisting a confirmed reflection invokes `runConnector` with
   `{ data: { limit: 3 } }` and then `refreshSnapshot`; the persist promise
   resolves without waiting for them.
3. Flag on + `runConnector` rejects: the persist result still resolves; no
   unhandled rejection (assert via `process.on('unhandledRejection')` guard or
   vitest's default failure on unhandled rejections passing).
4. Flag on + `reviewStatus: 'forgotten'`: no `runConnector` call.

**Verify**: `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` → all pass, including 4 new tests.

### Step 4: Live measurement (requires DB + managed-agent env)

1. `pnpm db:migrate && pnpm seed`, start `pnpm dev` with
   `VITE_DEMO_CONNECTOR_AT_CAPTURE=1`.
2. Sign in via the demo account (demo-a / Alice), record or type one
   reflection on `/`, commit it.
3. From the browser console, capture the `[demo-connector]` log line: status,
   processed count, wall-clock ms. Repeat 3×; note median.
4. Open `/profile` after the log line appears and confirm a new/updated
   evidence quote or timeline entry is visible without a manual Connector run.
5. Record cost: number of model calls per run (= `processed`, one
   `claude-sonnet-4-6` call each via the managed Connector agent).

**Verify**: three `[demo-connector]` measurements recorded; `/profile` reflects the new capture. If the managed-agent env is unavailable → mark this step BLOCKED in the report (do not fake numbers).

### Step 5: Findings write-up

Create `docs/solutions/2026-07-23-connector-at-capture-spike.md` (the
`docs/solutions/` directory is this repo's convention for "what we learned"
notes) answering, with evidence:

- Median capture→profile latency with the flag on (from Step 4).
- Cost per capture (model calls × model) and the `limit: 3` rationale.
- Failure behavior observed when the run fails (must be: silent, capture
  unaffected).
- Idempotency vs the evening cron: confirm `vips_proposed_diffs` attempted-set
  scoping (queries.ts:482-493) means no double-processing; note that entries
  whose attempt failed WITHOUT staging a diff will be retried by the cron
  (verify which failure statuses stage a diff by reading
  `auto-connector.handler.server.ts`).
- Recommendation: ship as demo-only flag / promote to default / drop.

**Verify**: file exists; `pnpm check` still exit 0.

### Step 6 (optional — skip if time-boxed): transient acknowledgment

If and only if steps 1–5 are green: mount a flag-gated one-shot toast in
`src/components/StudentSpaceHost.tsx` using the already-installed `sonner`
dependency, triggered by the `[demo-connector]` completion (emit a
`window` CustomEvent `ss:demo-connector-finished` from the helper carrying
`{ succeeded: number }`). Copy: `Heard. Something is growing on the island.`
when `succeeded > 0`, `Captured. Still listening for patterns.` otherwise.
Never an error message. If this step grows beyond ~50 lines, drop it and note
that in the write-up.

**Verify**: `pnpm check` → exit 0; toast appears once per capture with the flag on and never with it off.

## Test plan

- New tests: the 4 cases in Step 3, in
  `test/lib/student-space/backend-bridge.test.ts`, modeled on that file's
  existing mock structure.
- Verification: `pnpm vitest run test/lib/student-space/backend-bridge.test.ts`
  → all pass. `pnpm test` → no NEW failures beyond the 10 pre-existing ones
  documented in plans/034 (if plans/034 already landed, `pnpm test` must be
  fully green).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` exits 0 with 4 new tests
- [ ] `grep -rn "VITE_DEMO_CONNECTOR_AT_CAPTURE" src/` matches only in `backend-bridge.ts` (and `StudentSpaceHost.tsx` if Step 6 was done)
- [ ] With the flag unset, `grep`-level proof of no behavior change: all new code paths early-return on the flag
- [ ] `docs/solutions/2026-07-23-connector-at-capture-spike.md` exists and answers all five questions (or marks Step 4 BLOCKED with reason)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `listUnconnectedMirrorEntries` turns out NOT to bound the run (i.e. a
  capture-time run reprocesses already-connected entries or cannot be limited)
  — report options instead of shipping an expensive loop.
- Wiring requires touching `src/agents/verifier.ts`, the auto-connector, or
  the engine.
- The capture promise cannot resolve independently of the connector run
  (i.e. fire-and-forget is impossible at this seam without blocking capture UX).
- Step 3's flag stubbing forces changes to vitest config or global setup files.

## Maintenance notes

- **This is a spike.** Productionizing requires: replacing the
  `window.__studentSpaceGame` global with a proper snapshot-apply seam (e.g.
  the bridge receiving an `applySnapshot` callback at construction in
  EngineHost), debouncing runs when captures arrive in bursts, deciding
  whether the flag becomes a settings toggle, and a UX pass on the
  acknowledgment beat (Step 6 copy is pre-authored; tone constraints above are
  binding).
- Future work already anticipated by the docs: species-by-dimension island
  growth (v2 in `docs/brainstorms/2026-05-18-island-object-progression-requirements.md`,
  implementation note) consumes exactly the live claims this spike produces —
  keep the `[demo-connector]` completion event shape stable if that work starts.
- Reviewer should scrutinize: that no `await` was added to any capture path,
  and that the forgotten-reflection path cannot trigger a run.
