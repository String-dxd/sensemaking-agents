# Follow-ups

Non-blocking issues discovered during work that should be addressed later.
Newest at the top. Each entry should carry enough detail that a future session
(or reviewer) can pick it up without re-investigating.

## 2026-05-19 — Path Finder CCE status code review residual items

Findings deferred from the `/ce-code-review` pass on commit `3d20654`
(plan: `docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md`).
The P1 leak cluster (TrajectorySheet.dispose, Game.dispose null, _ensureCapture
guard) and a handful of safe-auto P3s landed in the same review pass. These
items are deferred coverage debt + a couple of UX trade-offs.

### 1. StatusPreviewHud has zero tests

**Where:** `src/engine/student-space/Game/View/StatusPreviewHud.js` (no test
file).
**Why:** Most-iterated new surface in the PR. Document `click` + `keydown`
listeners, outside-click logic, dispose teardown, override-subscribe
re-render are all unverified. The slice it drives (`IdentityStatusOverride`)
has unit coverage; the HUD's wiring to it doesn't.
**Fix sketch:** vitest with happy-dom — construct the HUD against a stubbed
`State.identityStatusOverride`, simulate toggle click, menu item click,
outside-click close, Escape close, and verify `dispose()` removes the
document listeners + calls the unwire fn.

### 2. identity-status TS shim has zero tests

**Where:** `src/lib/student-space/identity-status.ts`,
`src/routes/library.trajectory.tsx` `useEngineIdentityStatus`.
**Why:** The shim's documented null-engine fallback (`if (!profile) return null`)
is the only thing keeping the /library/trajectory route from crashing on a
cold direct hit. No test covers it. After the LFG fix, the shim also honours
the override slice — the override-applied audit shape isn't asserted.
**Fix sketch:** vitest with happy-dom, set up engine singletons via the
existing `State` boot, assert `currentIdentityStatus()` returns null with
no Profile, returns inferred with no override, returns override-shaped
audit when override is set, and `setIdentityStatusOverride` round-trips.

### 3. `_runBackendTrajectory` async hazards (timeout / cancel / de-dup)

**Where:** `src/engine/student-space/Game/View/TrajectorySheet.js:242-272`.
**Why:** The `setTimeout(..., 1600)` to reset button text isn't cancelled
on close/dispose, there's no AbortSignal threaded into `backend.runTrajectory`,
the success-path "Updated" label is immediately clobbered by `_renderForStatus`,
and overlapping clicks don't serialize.
**Fix sketch:** store the timeout id, clear in dispose; gate the success
text update on `this.headActionsEl?.isConnected`; track an `_inFlightRun`
boolean to drop concurrent clicks; wrap the call in `Promise.race` against
a 30s timeout for a user-visible failure mode.

### 4. Override flip silently revokes engaged escape-hatch

**Where:** `TrajectorySheet.js _refreshFromOverride`.
**Why:** A student who tapped "Show me all paths" then has a teacher flip
the override jumps back to the new quadrant's body with no signal that
their escape-hatch view was discarded.
**Fix sketch:** either keep escape-hatch sticky across override changes
(student wins), or preserve it but render a small notice "Status changed —
view all paths" so the student isn't disoriented. UX call.

### 5. Backend trajectory has no client-side timeout

**Where:** `TrajectorySheet.js _runBackendTrajectory`.
**Why:** Hung backend leaves the button perpetually "Running…" with no
recovery path. Bundles with item 3.
**Fix sketch:** `Promise.race([backend.runTrajectory(), timeout(30_000)])`.

### 6. Coverage debt — engine-side untested paths

- `statusHeuristics.actionsForCluster()` — per-cluster lookup + GENERIC_ACTIONS
  fallback have zero tests.
- `TrajectorySheet._readCommittedDirection()` — only the `intentions.change`
  branch is exercised; `decisions[].chose` / `decisions[].decision` / null
  return are all unverified.
- `TrajectorySheet._refreshFromOverride()` escape-hatch reset path —
  documented contract, no assertion.
- `TrajectorySheet._renderEmptyBearings()` — 4 DOM messages × backendActive
  × runTrajectory states, all unreachable in current tests.
- `TrajectorySheet._runBackendTrajectory()` error / success / no-backend
  branches.
- `IdentityStatusOverride.dispose()` — singleton-clear path.

### 7. Reason tooltip auto-closes on every override-driven re-render

**Where:** `TrajectorySheet.js:285-286` — `statusReasonEl.hidden = true` is
set unconditionally in `_renderForStatus`, hiding the tooltip mid-read on
each override flip.
**Fix sketch:** preserve `statusReasonEl.hidden` across the same-pill
re-renders, or only reset it when the status id changes.

### 8. Foreclosed bearings pick top-ranked, not adjacent to the committed direction

**Where:** `TrajectorySheet.js _renderForeclosed`, `bearings.slice(0, 2)`.
**Why:** Plan explicitly deferred smarter contrarian selection; v1 takes
the top 2 by ranking. In the degenerate case where the committed direction
matches the top bearing, the Foreclosed frame surfaces that same direction
as the "widen the lens" suggestion — confusing.
**Fix sketch:** rank by adjacency-to-committed instead of by absolute
ranking; out-of-scope for v1 but worth a separate plan.

---

## 2026-05-19 — Relationships + Choices tabs code review residual items

Findings deferred from the `/ce-code-review` pass on commits `db2a8da` → `00c55c2`
(plan: `docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md`).
The highest-priority items (sign-out singleton wipe, dispose timer cancellation,
deep-link surface registration, type/helper dedup, IntentionForm stale default,
facet vars on react panels) landed in the same review pass. These six remain.

### 1. Bridge module-level singletons survive engine disposal

**Where:** `src/engine/student-space/profile-tab-react-bridge.tsx:34-40` (`active`,
`sharedQueryClient`), `src/lib/student-space/profile-tab-state.ts:18` (`booted`).
**Why:** Under StrictMode / HMR / future engine teardown, the bridge's `active`
mount tracker and the boot helper's `booted` flag can desync from the slice
singletons that `Game.dispose()` already nulls. `signOutEngine()` now calls
`resetProfileTabBoot()` defensively, but the bridge's `active` and the shared
QueryClient are not part of that cleanup path.
**Fix sketch:** Either bind these to the engine `Game` instance (so `Game.dispose()`
nulls them in lockstep with the slice singletons) or move them into a React
context provided by `StudentSpaceHost` so they unmount with the host.

### 2. Engine bundle pulls in React + Query + page views via static bridge import

**Where:** `src/engine/student-space/Game/View/ProfileSheet.js:33-36` imports
`profile-tab-react-bridge.tsx`, which statically imports `react`,
`react-dom/client`, `@tanstack/react-query`, both ~830-line page views, and
`loadVipsPages`. The earlier dynamic-import attempt was abandoned because the
mock-timing made the engine tab test flaky.
**Why:** Every engine boot now includes the React subtree code even for users who
never open Relationships/Choices.
**Fix sketch:** Restore the dynamic import behind a deferred-promise gate the
test mock can satisfy synchronously, OR move the bridge mount logic out of
`ProfileSheet.js` entirely and let `StudentSpaceHost` portal the React panel
into the engine sheet via DOM ID.

### 3. Missing tests across routes, bridge, omitChrome, and State boot

**Where:** `src/routes/library.relationships.tsx`, `src/routes/library.choices.tsx`,
`src/engine/student-space/profile-tab-react-bridge.tsx`, `src/engine/student-space/Game/State/State.js`,
plus the `omitChrome` branch on both page views and the slice `update*` mutations.
**Why:** ProfileSheet test mocks the bridge entirely, so the bridge's own re-mount-vs-remount,
QueryClient init, and unmount-error branches have no unit coverage. Route loaders
have no tests. State.js composition has no test. `omitChrome={true}` is never asserted
even though the bridge sets it.
**Fix sketch:** Add a dedicated `test/engine/profile-tab-react-bridge.test.tsx`,
route loader smoke tests, a `test/engine/State.test.ts` for the composition path,
and `omitChrome` branch assertions in both page-view test files.

### 4. Slice mutations don't validate enum-typed fields

**Where:** `src/engine/student-space/Game/State/Relationships.js` `addPerson`/`addBelonging`/
`addPerspective`; `src/engine/student-space/Game/State/Choices.js` `addDecision`.
**Why:** The mergers in `schema.js` validate `category`, `source`, `forces`, etc.,
on hydrate, but the mutation methods accept any string at write time. Invalid values
render as `undefined` in the UI until the next reboot when the merger drops them.
**Fix sketch:** Move the enum sets to a shared constants file (`Choices.js`
already exports `DECISION_PATTERN_TAGS`; mirror this for the rest) and have both
the mutation methods and the schema mergers consume the same source.

### 5. Form drafts lost on tab switch

**Where:** `RelationshipPersonForm`, `BelongingForm`, `PerspectiveForm`,
`DecisionForm`, `IntentionForm` — all hold draft state in local `useState`.
React unmounts these forms when the engine tab swaps. The student loses any
in-flight text.
**Fix sketch:** Lift draft state to module-level scoped per-form, OR persist
drafts to a `ss:v1:drafts:*` namespace, OR hoist forms out of the tab-switch
unmount surface (a portal). Pick based on how often students switch mid-input.

### 6. `ProfileSheet.close()` doesn't unmount the React tree

**Where:** `src/engine/student-space/Game/View/ProfileSheet.js:239-246`.
**Why:** `close()` only toggles aria-hidden — the React mount stays alive in the
detached overlay. The QueryClient subscribers, useEffect intervals, and any
in-flight network requests keep running. Today this is benign because the
overlay is the only place the React tree lives, and the next `open()` re-renders.
But it compounds with item #1 above for sign-out → sign-in within the same
window.
**Fix sketch:** Add `_unmountReactPanel()` to `close()`. Risk: the next `open()`
takes a slightly longer first paint while React re-mounts. Profile under
real device load before deciding.

Discovered while smoke-testing the managed agents path during Step 11 of the
managed-agents migration plan. None of these block the cutover.

### 1. `pg@9` deprecation: client busy when `client.query()` called

Warning text:
```
DeprecationWarning: Calling client.query() when the client is already executing
a query is deprecated and will be removed in pg@9.0. Use async/await or an
external async flow control mechanism instead.
```

**Where:** Surfaced from `pnpm smoke:managed-connector`. Almost certainly in
the smoke script's pre-fetch path (`buildConnectorContext` + the FTS query in
`src/agents/tools/search-corpus.server.ts`), where multiple awaited queries
share a single pool client without explicit checkout/release.

**Impact today:** None — node-postgres still tolerates this on `pg@8.x`.

**Risk:** Hard break when `pg@9` lands (no fixed date as of 2026-05-12).
Anything in the Connector / Cartographer pre-fetch that batches queries
against `ctx.db` is at risk.

**Fix sketch:** Grep for `Promise.all(...db.execute(...)...)` patterns inside
`withStudent` envelopes. Each parallel query needs its own pool checkout, or
they need to be serialized. Likely fixable by replacing `Promise.all` with
sequential `await`s — the queries are fast enough that parallelism wasn't
buying real wall-clock.

### 3. Managed Agents token accounting under-counts inputs

**Symptom:** `pnpm smoke:managed-connector` reported `tokens: input=9
output=3487 cache_read=0` for a prompt that was 13,060 characters wide
(realistically ~3,000 input tokens).

**Where:** `src/agents/runner.ts` `translateSdkEvent` reads `model_usage`
fields from `span.model_request_end` events.

**Hypothesis:** The Anthropic beta SDK appears to emit
`span.model_request_end` per model call within the session, and only the
final summarization call reports `input_tokens` against a fully cached prefix
— so the prior tokens-on-the-wire are not being summed in our usage counter.
Alternatively, the SDK field name we read (`input_tokens`) may now live on a
nested object the translator doesn't unwrap.

**Impact today:** None for correctness. Token usage is observability data
only; the ablation reports use it for cost sanity checks but Verifier
verdicts are unaffected.

**Risk:** Cost-ceiling alerts and per-run cost estimates will systematically
under-report. Could mislead a future "is Managed Agents cheap enough?"
decision.

**Fix sketch:**
- Dump a raw event log from a smoke run (add a `--trace-events` flag to the
  runner that prints every SDK event JSON to stderr).
- Compare summed `input_tokens` across all events to the session's final
  total via `client.beta.sessions.retrieve(sessionId)` — that endpoint
  returns the aggregate usage object.
- Either patch `translateSdkEvent` to sum the right field, or replace the
  per-event accumulator with one trailing `sessions.retrieve` call at the
  end of `runManagedAgent`.

---

## Triage policy

When adding entries here:
- Lead with one short sentence describing the symptom.
- State **Impact today** (almost always "none" — that's why it's a follow-up).
- State the **Risk** (what changes when this becomes load-bearing).
- Sketch a **Fix** that's concrete enough to pick up cold.

Move entries OUT of this file when fixed — link the commit/PR in the section
header for archaeology, or delete outright. This file should stay short.

## ~~Camera flow needs holistic review across all consumers~~ (resolved 2026-05-18)

Fixed via owner-keyed save stack in `Camera.zoomTo/restoreZoom`. Each
consumer now passes `{ owner: '...' }`; the camera holds a `Map<owner,
{pos, target}>` so interleaved zooms restore in LIFO order. Tests in
`test/engine/Camera.test.ts` cover the failing pre-fix scenarios.
