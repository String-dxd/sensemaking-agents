# Follow-ups

Non-blocking issues discovered during work that should be addressed later.
Newest at the top. Each entry should carry enough detail that a future session
(or reviewer) can pick it up without re-investigating.

## 2026-05-12 — Step 11 smoke-test warnings

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

## Camera flow needs holistic review across all consumers (2026-05-18)

The engine's `view.camera.zoomTo()` / `restoreZoom()` API is now used by:
- `View/ObjectPeek.js` — flower/mailbox/telescope peek-then-companion
- `View/KiraNarrator.js` — AC-style dialogue beats
- `View/Sprouts.js` — per-capture beat (added in feat/island-object-progression)

Each consumer manages its own zoom lifecycle, but the camera only saves
its pre-zoom state ONCE (`if(!this._savedPos)` in Camera.js:138). Chained
or interleaved zooms from different consumers may restore to the wrong
saved state. Surface for review: do we need a stack-based save, a single
owner pattern, or a coordinator?

User flagged 2026-05-18 in #feat/island-object-progression dogfood:
"camera move in general need to be fixed with other objects too."
