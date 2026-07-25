# Follow-ups

Non-blocking issues discovered during work that should be addressed later.
Newest at the top. Each entry should carry enough detail that a future session
(or reviewer) can pick it up without re-investigating.

> Pruned 2026-07-25 (plan 064): entries referencing engine-view files deleted in
> the React migration — `Game/View/StatusPreviewHud.js`,
> `Game/View/TrajectorySheet.js`, `Game/View/ProfileSheet.js`,
> `profile-tab-react-bridge.tsx`, and the `src/routes/library.*` routes — were
> removed per this file's own "move entries OUT when fixed" policy. Git history
> has them.

## 2026-05-19 — Path Finder CCE status code review residual items

Findings deferred from the `/ce-code-review` pass on commit `3d20654`
(plan: `docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md`).
The P1 leak cluster (TrajectorySheet.dispose, Game.dispose null, _ensureCapture
guard) and a handful of safe-auto P3s landed in the same review pass. These
items are deferred coverage debt.

### 1. identity-status TS shim has zero tests

**Where:** `src/lib/student-space/identity-status.ts`.
**Why:** The shim's documented null-engine fallback (`if (!profile) return null`)
is the only thing keeping a cold direct hit from crashing its callers. No test
covers it. After the LFG fix, the shim also honours the override slice — the
override-applied audit shape isn't asserted.
**Fix sketch:** vitest with happy-dom, set up engine singletons via the
existing `State` boot, assert `currentIdentityStatus()` returns null with
no Profile, returns inferred with no override, returns override-shaped
audit when override is set, and `setIdentityStatusOverride` round-trips.

### 2. Coverage debt — engine-side untested paths

- `statusHeuristics.actionsForCluster()` — per-cluster lookup + GENERIC_ACTIONS
  fallback have zero tests.
- `IdentityStatusOverride.dispose()` — singleton-clear path.

---

## 2026-05-19 — Relationships + Choices tabs code review residual items

Findings deferred from the `/ce-code-review` pass on commits `db2a8da` → `00c55c2`
(plan: `docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md`).
The highest-priority items (sign-out singleton wipe, dispose timer cancellation,
deep-link surface registration, type/helper dedup, IntentionForm stale default,
facet vars on react panels) landed in the same review pass. These three remain.

### 1. `State.js` composition has no test

**Where:** `src/engine/student-space/Game/State/State.js`.
**Why:** The slice-composition path `State.js` runs at boot has no unit
coverage, so a slice dropped from — or misordered in — the composition would
not be caught by the suite.
**Fix sketch:** Add a `test/engine/State.test.ts` for the composition path.

### 2. Slice mutations don't validate enum-typed fields

**Where:** `src/engine/student-space/Game/State/Relationships.js` `addPerson`/`addBelonging`/
`addPerspective`; `src/engine/student-space/Game/State/Choices.js` `addDecision`.
**Why:** The mergers in `schema.js` validate `category`, `source`, `forces`, etc.,
on hydrate, but the mutation methods accept any string at write time. Invalid values
render as `undefined` in the UI until the next reboot when the merger drops them.
**Fix sketch:** Move the enum sets to a shared constants file (`Choices.js`
already exports `DECISION_PATTERN_TAGS`; mirror this for the rest) and have both
the mutation methods and the schema mergers consume the same source.

### 3. Form drafts lost on tab switch

**Where:** `RelationshipPersonForm`, `BelongingForm`, `PerspectiveForm` in
`src/components/RelationshipsPageView.tsx`; `DecisionForm`, `IntentionForm` in
`src/components/ChoicesPageView.tsx` — all hold draft state in local `useState`.
React unmounts these forms when the profile tab swaps. The student loses any
in-flight text.
**Fix sketch:** Lift draft state to module-level scoped per-form, OR persist
drafts to a `ss:v1:drafts:*` namespace, OR hoist forms out of the tab-switch
unmount surface (a portal). Pick based on how often students switch mid-input.

---

## 2026-05-12 — Managed-agents cutover smoke findings

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

### 2. Managed Agents token accounting under-counts inputs

**Status:** fix in flight — see `plans/063-sdk-bumps.md` (part b).

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
