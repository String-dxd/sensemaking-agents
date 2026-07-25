# Plan 066: Productionize the capture-time Connector — measured latency, a real snapshot seam, burst debounce, and the acknowledgment beat

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/lib/student-space/backend-bridge.ts src/components/student-space/EngineHost.tsx test/lib/student-space/backend-bridge.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none hard. Softly: `plans/054-connector-claim-and-tx-split.md`
  makes overlapping runs server-side-safe (see Maintenance notes); this plan
  does not require it but should note in its PR whether 054 has landed.
- **Category**: direction
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

The product's core loop is "speak a reflection → watch your island/profile
grow." Today that moment does not exist outside a dev flag: the Connector
runs only from the dev-only `/dev/pipeline` page or the 18:00 SGT cron, so a
student (or a demo audience) reflects and *nothing visibly changes*. A spike
(plan 041, findings at `docs/solutions/2026-07-23-connector-at-capture-spike.md`)
already built the flagged, fail-safe, test-covered capture-time run — this
plan does the four things the spike's own recommendation section says stand
between it and production quality: measure the latency for real, replace the
`window.__studentSpaceGame` global hack with a proper snapshot-apply seam,
debounce capture bursts, and ship the visible acknowledgment beat whose event
contract is already fully specified. The operator's rider applies throughout:
**nothing here may slow or complicate the capture UX** — the run stays
fire-and-forget, and every addition must degrade to "nothing happened" on
failure.

## Current state

- `src/lib/student-space/backend-bridge.ts` — the client↔server bridge. The
  spike helper lives here (~line 317):

  ```ts
  function maybeRunDemoConnectorAfterCapture(): void {
    if (import.meta.env.VITE_DEMO_CONNECTOR_AT_CAPTURE !== '1') return
    void (async () => {
      const startedAt = performance.now()
      try {
        const run = await runConnector({ data: { limit: 3 } })
        const snapshot = await loadBackendSnapshot()
        const game = typeof window !== 'undefined' ? window.__studentSpaceGame : null
        if (game) applyStudentSpaceBackendSnapshot(game as never, snapshot)
        console.info(
          `[demo-connector] status=${run.status} processed=${run.processed} in ${Math.round(performance.now() - startedAt)}ms`,
        )
      } catch (err) {
        console.warn('[demo-connector] capture-time connector run failed', err)
      }
    })()
  }
  ```

  It is called from `persistPreparedReflection` (only when
  `reviewStatus === 'confirmed'`) and from `submitReflection`. It reads the
  engine via the `window.__studentSpaceGame` global — the spike doc calls this
  "a load-bearing hack, not an intended seam."
- `src/components/student-space/EngineHost.tsx` — mounts the engine once at
  the root layout and constructs/attaches the backend bridge. This is where a
  proper `applySnapshot` callback must be threaded from (the host owns the
  live `Game` instance).
- `test/lib/student-space/backend-bridge.test.ts` — has a
  `describe('demo-flagged capture-time Connector run (plan 041)')` block with
  4 cases (flag off → no call; flag on → run + snapshot reload, persist
  resolves without waiting; run rejects → persist unaffected; forgotten → no
  call). Model all new tests on this block.
- `docs/solutions/2026-07-23-connector-at-capture-spike.md` — READ THIS FIRST.
  It records: cost is 1 model call per capture steady-state (`limit: 3`
  bounds bursts); idempotency vs the cron is proven (`src/db/queries.ts`
  `listUnconnectedMirrorEntriesInner` — an entry with a staged diff drops out
  of both runs' candidate lists); Step 4 (live latency measurement) was
  BLOCKED on env; Step 6 (toast) was skipped, with the contract specified:
  event `ss:demo-connector-finished` detail `{ succeeded: number }`, copy in
  `plans/041-connector-at-capture-spike.md` Step 6.
- `plans/041-connector-at-capture-spike.md` — the original spike plan; Step 6
  holds the exact toast copy and tone constraints. Reuse them verbatim.
- Toast infrastructure: the app ships `sonner` (`package.json` dependencies).
  Check how/where a `<Toaster>` is mounted (grep `sonner` and `Toaster` in
  `src/`); if none is mounted yet, mounting one in `EngineHost` (or the root
  layout) is in scope — style-minimal, bottom center, matching sheet tokens.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing lint warnings OK, 0 errors) |
| Tests | `pnpm test` | 0 failures (baseline 911 passed / 128 skipped) |
| Targeted | `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` | all pass |
| DB setup | `pnpm demo:reset` | exit 0 (needs `DATABASE_URL`) |
| Dev server | `VITE_DEMO_CONNECTOR_AT_CAPTURE=1 pnpm dev` | serves on :3000 (use an explicit `--port` if 3000 is squatted) |

## Scope

**In scope** (the only files you should modify):
- `src/lib/student-space/backend-bridge.ts`
- `src/components/student-space/EngineHost.tsx`
- `test/lib/student-space/backend-bridge.test.ts`
- `test/components/student-space/EngineHost.test.tsx` (extend if the seam
  changes the host contract)
- One new toast host location if none exists (root layout or EngineHost)
- `docs/solutions/2026-07-23-connector-at-capture-spike.md` (append the
  measured numbers — Step 1 below)

**Out of scope** (do NOT touch, even though they look related):
- `src/server/run-connector.handler.server.ts`, `src/server/auto-connector.handler.server.ts`,
  `src/db/queries.ts` — server-side coordination belongs to plan 054.
- The flag-vs-per-student-setting decision — this plan keeps
  `VITE_DEMO_CONNECTOR_AT_CAPTURE` as the gate. Promoting to a default or a
  settings toggle is a product decision recorded for the maintainer (see
  Maintenance notes), not executor work.
- `src/routes/_dev.dev.pipeline.tsx` — the dev pipeline page keeps its own
  manual trigger unchanged.

## Git workflow

- Branch: `advisor/066-connector-at-capture-productionize`
- Conventional commits, e.g. `feat(demo): thread applySnapshot seam from EngineHost; debounce capture-time connector runs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Unblock the spike's Step 4 — measure real latency

Requires `DATABASE_URL` + `MANAGED_AGENT_*` env (see `README.md` env table).
If this environment lacks them, mark this step BLOCKED in your report and
continue with Steps 2–5 (they are code work verifiable by tests) — but the
plan is not DONE until someone runs this step.

Run `pnpm demo:reset`, then `VITE_DEMO_CONNECTOR_AT_CAPTURE=1 pnpm dev`,
sign in as demo-a, record 3 reflections, and capture the
`[demo-connector] status=… processed=… in …ms` console line each time.
Record the median and append a "Measured latency (plan 066)" section to
`docs/solutions/2026-07-23-connector-at-capture-spike.md` with the three raw
numbers, the median, and the machine/network context.

**Verify**: the doc contains three concrete `…ms` values and a median → yes.

### Step 2: Replace the `window.__studentSpaceGame` read with an `applySnapshot` seam

In `EngineHost.tsx`, where the backend bridge is constructed/attached, pass a
callback that applies a snapshot to the live engine instance the host already
holds (the same `live` reference used in the hydration effect around line
255). Shape suggestion — add to the bridge factory an optional
`applySnapshot?: (snapshot: StudentSpaceBackendSnapshot) => void`; in
`maybeRunDemoConnectorAfterCapture`, call it instead of reading the global.
Preserve exact behavior when no engine is mounted (silently skip). Do not
remove the global itself — the sign-out helper still uses it (verify with
`grep -n '__studentSpaceGame' src -r` and leave every other reader untouched).

**Verify**: `grep -n '__studentSpaceGame' src/lib/student-space/backend-bridge.ts`
→ no matches. `pnpm vitest run test/lib/student-space/backend-bridge.test.ts`
→ all pass (update the 4 spike tests to inject a spy `applySnapshot` and
assert it is called with the fresh snapshot).

### Step 3: Debounce bursts

Coalesce capture-time runs: if a run is already in flight, do not fire a new
one — set a `pendingRerun` flag instead, and when the in-flight run settles,
fire exactly one follow-up run if the flag is set (then clear it). This keeps
the worst case at one in-flight run plus one queued rerun regardless of burst
size, and never drops the newest capture's processing (the rerun's candidate
scan picks it up). Keep the whole mechanism module-local state in
`backend-bridge.ts`; no timers needed (settle-triggered), so tests stay
deterministic.

**Verify**: new test — fire `submitReflection` twice while the mocked
`runConnector` is unresolved → `runConnector` called once; resolve it → called
a second time exactly once; a third capture during the second run queues
exactly one more. `pnpm vitest run test/lib/student-space/backend-bridge.test.ts` → pass.

### Step 4: Ship the acknowledgment beat (spike Step 6)

After a successful run with `processed > 0` (read the run result's fields as
the spike tests do), dispatch
`window.dispatchEvent(new CustomEvent('ss:demo-connector-finished', { detail: { succeeded: <n> } }))`.
Then wire a listener that shows a transient toast using the copy specified in
`plans/041-connector-at-capture-spike.md` Step 6 — read that section and use
its two copy strings and tone constraints verbatim. Use `sonner` (already a
dependency); mount a `<Toaster>` if none exists. The toast must be
non-blocking, auto-dismissing, and must NOT render when `succeeded === 0` or
on failure (silence is the failure UX, per the spike's binding requirement).

**Verify**: new test asserting the event dispatch fires with
`{ succeeded: n }` only on a successful processed>0 run; manual check under
the flag (if env available): a capture produces the toast after the console
line appears. `pnpm check && pnpm test` → green.

### Step 5: Full-suite gate

**Verify**: `pnpm check` → exit 0; `pnpm test` → 0 failures, new tests
included; `git status` → only in-scope files modified.

## Test plan

- Extend `test/lib/student-space/backend-bridge.test.ts` (model on the
  existing plan-041 describe block): applySnapshot spy called with fresh
  snapshot; debounce single-flight + queued-rerun semantics (3 cases);
  event dispatched only on processed>0 success; failure still silent.
- Extend `test/components/student-space/EngineHost.test.tsx` only if the
  host's bridge-construction contract changed shape.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0; the new debounce/seam/event tests exist and pass
- [ ] `grep -n '__studentSpaceGame' src/lib/student-space/backend-bridge.ts` → empty
- [ ] Latency numbers appended to the spike doc (or step explicitly reported BLOCKED)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `maybeRunDemoConnectorAfterCapture` excerpt above no longer matches the
  live code (drift — the spike may have been promoted or reworked).
- Threading `applySnapshot` from `EngineHost` requires changing the bridge's
  public type in a way that breaks more than 2 existing consumers.
- The plan-041 Step 6 copy/contract section is missing or contradicts the
  spike doc.
- A capture-path test starts failing in a way that suggests the
  fire-and-forget guarantee broke (persist awaiting the run) — this is the
  one invariant that must never regress.

## Maintenance notes

- **Product decision left open deliberately**: whether the flag becomes a
  per-student setting or an always-on default. Cost profile: +1 Connector
  model call per confirmed capture. The measured latency from Step 1 is the
  input to that decision.
- Plan 054 (connector claim/tx split) makes overlapping runs server-side
  atomic; until it lands, the client debounce here is the only burst
  coordination. If 054 lands first, keep the debounce anyway (it saves
  wasted `nothing_to_run` calls).
- Reviewers should scrutinize: the debounce state machine (single-flight +
  one queued rerun), and that the toast renders nothing on failure.
