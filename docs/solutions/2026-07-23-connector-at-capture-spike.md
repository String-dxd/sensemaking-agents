---
date: 2026-07-23
topic: connector-at-capture-spike
tags: [spike, connector, capture, demo, latency, vips]
status: spike-complete
---

# Spike: run the Connector at capture time (plan 041)

## What this is

Plan `plans/041-connector-at-capture-spike.md` asked for a demo-flagged,
non-blocking Connector run immediately after a confirmed capture persists, so
a presenter can speak a reflection and see `/profile` visibly update within
seconds — instead of waiting for the 18:00 scheduled pass or a manual
Connector button elsewhere. This is the findings write-up; the flag and code
live in `src/lib/student-space/backend-bridge.ts` (see "What was built"
below).

## What was built

- **Flag**: `VITE_DEMO_CONNECTOR_AT_CAPTURE` (Vite client env var, checked via
  `import.meta.env.VITE_DEMO_CONNECTOR_AT_CAPTURE === '1'`). Defaults off in
  every environment that doesn't set it — no DB row, no settings UI, no
  server plumbing.
- **Helper**: `maybeRunDemoConnectorAfterCapture()` in `backend-bridge.ts`.
  When the flag is on, it fires (and never awaits) an async chain: run the
  Connector capped at `limit: 3` → reload a fresh backend snapshot
  (`loadBackendSnapshot()`, extracted from the bridge's existing
  `refreshSnapshot` so both share one assembly path) → push it into the live
  engine via `applyStudentSpaceBackendSnapshot(window.__studentSpaceGame,
  snapshot)` if an engine instance is mounted. It logs
  `[demo-connector] status=… processed=… in …ms` on success and swallows
  (`console.warn`) any failure — never surfaces an error to the capture UX.
- **Call sites** (both existing capture-persist paths in
  `backend-bridge.ts`):
  - `persistPreparedReflection(input, reviewStatus)` — the helper is called
    only when `reviewStatus === 'confirmed'`; a forgotten reflection never
    triggers a run.
  - `submitReflection` (the non-prepared voice path) — called
    unconditionally after `submitStudentSpaceReflection` resolves, since that
    path always persists as confirmed.
  - The AskSheet `ss:ask-capture-committed` event was deliberately **not**
    used as a trigger — it fires before `logPreparedReflection` resolves
    (`AskSheet.tsx:789`), so the new mirror entry wouldn't exist yet and the
    Connector run would find nothing to process.
- **Tests**: `test/lib/student-space/backend-bridge.test.ts` gained a
  `describe('demo-flagged capture-time Connector run (plan 041)')` block with
  4 cases (flag off → no call; flag on → `runConnector({ data: { limit: 3 }
  })` then a snapshot reload, persist resolves without waiting; flag on +
  Connector rejects → persist still resolves, no unhandled rejection; flag on
  + `forgotten` → no call). All 11 tests in the file pass
  (`pnpm vitest run test/lib/student-space/backend-bridge.test.ts`).

No files were touched outside `backend-bridge.ts`, its test file, and this
write-up. Step 6 (toast acknowledgment) was **not** attempted — see
"What was skipped" below.

## Cost per capture and the `limit: 3` rationale

Each processed mirror entry costs exactly one Connector model call
(`claude-sonnet-4-6`, per the managed Connector agent binding in
`src/agents/config.ts`) — the handler loop in
`run-connector.handler.server.ts:90-97` calls `runOne` (which resolves to
`runAutoConnectorAfterMirror`) once per entry in `entriesToProcess`, with no
batching of multiple entries into a single model call.

`limit: 3` bounds a capture-time run to at most 3 model calls (worst case: 3
confirmed-but-unconnected entries queued up, e.g. after a burst of captures
or if a prior demo run failed silently). In the common single-reflection
demo path, exactly one confirmed entry is eligible (the one just persisted),
so the steady-state cost is **1 model call per capture**. This is
deliberately smaller than the cron's `DEFAULT_CONNECTOR_BATCH_LIMIT = 5`,
trading a slightly higher chance of `remaining > 0` (leaving a queue for the
next capture or the cron) for a tighter, more predictable latency envelope on
the interactive path.

## Failure behavior (verified by test, not by live run — see BLOCKED below)

Confirmed via `runConnectorMock.mockRejectedValueOnce` in the new tests: when
the Connector run rejects, `maybeRunDemoConnectorAfterCapture`'s `catch`
swallows it (`console.warn('[demo-connector] capture-time connector run
failed', err)`), and the calling capture-persist promise (`logPreparedReflection`
/ `forgetPreparedReflection` / `submitReflection`) resolves normally and
unaffected — vitest's default failure on unhandled rejections did not
trigger, and the persisted mirror entry's `reviewStatus` was asserted intact.
This matches the plan's binding requirement: a Connector failure mid-demo
degrades to "nothing happened," never an error surface on the capture path.

The bridge-level `runConnector` method (used elsewhere, e.g. a manual
"run Connector" button) still **throws** on hard-failed statuses
(`isHardFailedConnectorResult`) — that behavior is unchanged; the spike
helper intentionally does not go through that method (it calls the
`runConnector` **module import** directly, per the plan's symbol
disambiguation note) specifically so it can own a total catch-all instead of
inheriting the throw-on-hard-fail contract.

## Idempotency vs. the evening cron

Confirmed by reading `src/db/queries.ts:482-493`
(`listUnconnectedMirrorEntriesInner`): the "unconnected" set is every
confirmed mirror entry **not** already present in
`vips_proposed_diffs.mirror_entry_id`. Any entry with a staged diff — from
any run, capture-time or cron — permanently drops out of both runs' next
candidate list.

Whether a given outcome stages a diff depends on its status, read from
`src/server/auto-connector.handler.server.ts`:

- `status: 'ok'` → `staged_diff: auditRow` (line 307-311) — a diff **is**
  staged, so this entry is never reprocessed by either run.
- Every failure status (`timeout`, `schema_reject`, `transport_error`,
  `auth_error`, `unknown`, `missing_mirror`) → `staged_diff: null` (lines
  153, 200, 211, 397, 409, 411, 417, 422, 424, 441, 446, 457, 462) — no diff
  is staged, so the entry remains "unconnected" and **will be retried** by
  whichever run — capture-time or the 18:00 cron — next scans for candidates.

Net: a capture-time run that succeeds never causes the cron to double-process
that entry (no double-charging, no duplicate diffs). A capture-time run that
fails costs one wasted model call but leaves the entry exactly as eligible as
it was before, so the cron (or the next capture-time run) will pick it up —
this is the same retry behavior the cron already relies on for its own
transient failures, just exercised from a second call site. No new failure
mode was introduced.

## Live latency/cost measurement — BLOCKED

Step 4 of the plan (recording median capture→profile wall-clock latency and
confirming `/profile` updates live) requires a local `DATABASE_URL` (embedded
or local Postgres) plus valid Anthropic managed-agent environment
(`MANAGED_AGENT_*`, per `README.md:105-134`) to boot `pnpm dev` and actually
run the Connector against seeded data.

This worktree has neither:

```
$ printenv DATABASE_URL   → (empty, exit 1)
$ printenv | grep -c MANAGED_AGENT   → 0
$ ls .env*   → no matches
```

No `.env` file exists in the worktree, and the shell environment has no
`DATABASE_URL` or `MANAGED_AGENT_*` variables set. Per the plan's explicit
instruction, this step is marked BLOCKED rather than faked — no latency
numbers, cost-per-run wall-clock figures, or `/profile` screenshots are
reported here. The code, tests, and this analysis are otherwise complete and
were verified without the live path:

- `pnpm check` → exit 0 (18 pre-existing lint warnings, 0 errors).
- `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` → 11/11
  pass (7 pre-existing + 4 new).
- `pnpm test` → 5 files / 10 tests failing, all pre-existing and unrelated
  (`trajectory-sheet`, `dev.pipeline`, `edupass-login`, `history-sheet` ×5,
  `student-space-host`) — none touch `backend-bridge.ts` or the Connector
  wiring; no new failures introduced by this spike.

**To complete Step 4** in an environment with the required env: run
`pnpm db:migrate && pnpm seed`, start `VITE_DEMO_CONNECTOR_AT_CAPTURE=1 pnpm
dev`, sign in as demo-a, record 3 reflections, and capture the
`[demo-connector] status=… processed=… in …ms` console line each time (median
of 3), then open `/profile` and confirm a new evidence quote/timeline entry
without a manual Connector run.

## Recommendation

**Ship as demo-only flag; do not promote to a shipped default yet.**

Reasoning:
- The code path is small, additive, fully test-covered, and fails safe
  (verified above) — low risk to keep behind
  `VITE_DEMO_CONNECTOR_AT_CAPTURE` for presentations.
- Promoting it to "always on" is a **product decision**, not just a technical
  one: it changes the cost profile (every confirmed capture now costs at
  least one extra Connector model call, on top of whatever the cron already
  processes) and needs the maintenance work called out in the plan before
  it's production-grade:
  - Replace the `window.__studentSpaceGame` global read with a proper
    snapshot-apply seam (bridge constructed with an `applySnapshot` callback
    from `EngineHost`, per the plan's maintenance note) — the global exists
    today only for the sign-out helper and is a load-bearing hack, not an
    intended seam for new features.
  - Debounce bursts: back-to-back captures each schedule an independent
    fire-and-forget run today; nothing coalesces them, so a burst of N
    captures in quick succession fires N Connector runs (partially
    overlapping in flight, though not additionally expensive per-entry since
    idempotency prevents double-processing the same entry — the waste is
    extra `nothing_to_run` calls, not duplicate model spend).
  - Decide whether the flag becomes a per-student settings toggle rather
    than a build-time env var.
  - Do the UX pass on the acknowledgment beat (Step 6, skipped here — see
    below) so the "something is growing" moment has visible on-screen
    feedback instead of only a console log.
  - Get an actual latency number (Step 4, blocked here) before committing to
    "seconds" as a product claim — the architecture is fire-and-forget so it
    cannot block capture UX, but the wall-clock time to a visibly-updated
    `/profile` is still unmeasured in this environment.

## What was skipped

- **Step 4** (live measurement): BLOCKED, reason above.
- **Step 6** (optional transient acknowledgment toast): skipped by choice —
  the plan makes it conditional on "steps 1-5 are green," and Step 4 could
  not be run live in this environment. Building and testing a toast wired to
  a real Connector completion event without being able to see it fire
  end-to-end (dev server + DB + managed agents) risked shipping unverified
  UI. The copy and event-shape contract (`ss:demo-connector-finished` with
  `{ succeeded: number }`, and the two tone-constrained copy strings) are
  already fully specified in the plan and can be picked up directly by a
  follow-up pass once Step 4 is unblocked.
