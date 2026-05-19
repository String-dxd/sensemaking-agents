# Mirror → Connector v2 bridge for the home-route island

**Status:** Planning brief — scope to be decided before coding. Multi-week effort.

**Author:** session 2026-05-18 (planning hand-off from follow-up #3 in chat).

## Why this exists

Today the home-route island grows sprouts when the student submits a capture,
and a chip picker (`src/components/CaptureTagPicker.tsx`) asks the student
to tag V/I/P/S so the sprout's species can lock. The brainstorm's original
vision was different: the AI infers the dimension (and ideally the
finer-grained claim) from the capture content, so the student doesn't
have to self-classify.

Server-side that AI pipeline already exists:

- `src/server/run-mirror.handler.server.ts` — runs Mirror over a transcript
  and returns structured output.
- `src/server/persist-mirror.handler.server.ts` — writes mirror entries.
- `src/server/auto-connector.handler.server.ts` — `runAutoConnectorAfterMirror`
  threads each new mirror entry through Connector + Verifier and applies
  the verified diff to the VIPS timeline. This is wired into `persistMirror`
  (see U7 — Auto-Connector chain comment in the file header).

The home route never invokes Mirror, so the Connector pipeline is dark
for everything that happens on the island. Captures stay in the
client-side `Captures` slice and never reach the timeline.

The student-facing question is: should the *Connector's verified
classification* drive the sprout species, replacing or augmenting the
chip pick?

## Open scope decisions (must resolve before coding)

These are the questions the user flagged in the follow-up. Each
needs an explicit answer before the work is plannable, because the
answers fork the architecture.

### Q1. Does Mirror run on every home-route capture?

- **Option A — every capture.** Each home-route submit becomes a Mirror
  transcript and a `persistMirror` call, which fires the auto-connector
  chain.
  - Pros: complete pipeline coverage; the chip picker can disappear once
    confidence is high; finer-grained `subClaimId` is set automatically.
  - Cons: ~3–10s latency per capture (Mirror + Connector + Verifier);
    cost per capture; Mirror was designed for richer transcripts, not
    one-line "ask" captures.
  - Open: where does Mirror's "did I get this right?" review UI go on
    the home route? Today that lives on `/reflect.review`.

- **Option B — capture kind gated.** Only specific kinds (e.g., photo
  with caption, trajectory) trigger Mirror. Short text "ask" captures
  stay client-side with the chip picker only.
  - Pros: lower cost, keeps fast feedback; preserves chip flow for
    quick captures.
  - Cons: classification coverage is partial; students need to learn
    which captures get classified.

- **Option C — deferred batch.** Captures pile up client-side; once a
  threshold or quiet period is reached, a single Mirror+Connector pass
  processes the batch.
  - Pros: amortizes cost; aligns with how the existing Mirror surface
    accumulates context.
  - Cons: introduces a notion of "pending classification"; UX must explain
    why species locks lag.

**Recommendation surface:** start with **Option B** as the simplest
forward step. Photo captures already carry enough text-equivalent
signal (caption + image) to be worth a real classification. Pure ASK
captures keep the chip picker for now.

### Q2. Sync vs. async — when does the sprout species lock?

- **Sync (block submission).** The home route awaits the
  Connector verdict before returning control to the student. Sprout
  spawns with locked species; no chip picker.
  - Pros: clean state — at every point the sprout's species reflects
    truth.
  - Cons: 3–10s blocking spinner per capture; punishes intermittent
    networks; cascading failures if Connector is slow.

- **Async (post-session payload).** The home route returns immediately,
  the sprout spawns as `pending`, and a background job patches the
  sprout once the Connector finishes. The engine replays a small
  "verdict arrived" event.
  - Pros: instant feedback; gracefully degrades on slow networks.
  - Cons: students may close the app before the verdict lands;
    need a reconciliation mechanism on next open; visible "species
    just changed under me" if the chip pick disagrees.

**Recommendation surface:** **async** wins for v1. The brainstorm's
goal of "AI infers" is achieved without the latency penalty. Reuse
the existing pattern in `src/engine/student-space/Game/State/Sprouts.js`'s
`setDimensionForFirstCapture` — Connector results call into the same
method server→client. The plant icon can show a small "thinking" badge
while pending.

The rejected alternatives section in
`docs/plans/2026-05-18-002-feat-island-object-progression-plan.md`
already covered the sync/async trade for the chip-picker version of
this; reread before deciding.

### Q3. Conflict resolution — student picks vs. Connector classifies

When both happen (chip picker + Connector), who wins?

- **Option A — student always wins.** Connector classification is
  shown as a suggestion ("Kira thinks this is a `values.contribution`")
  but the student's chip pick is canonical. The Connector result is
  stored as `connectorSubClaimId` alongside `subClaimId`.
  - Pros: respects student agency; chip flow stays intact; analytical
    value (compare pick vs. classification).

- **Option B — Connector wins on first pick.** If the student hasn't
  yet picked when the Connector verdict arrives, the Connector locks
  the species. The chip picker is suppressed.
  - Pros: removes a tap from the happy path.
  - Cons: students may feel the system decides for them.

- **Option C — high-confidence Connector wins; low-confidence asks
  the student.** Use Verifier's confidence score (already a thing in
  `src/agents/verifier.ts`) — auto-lock above threshold T; otherwise
  show the chip picker.
  - Pros: best of both; respects student when the AI is genuinely
    unsure.
  - Cons: needs a calibrated T; UX inconsistency until T stabilizes.

**Recommendation surface:** **Option A** for v1 (student always wins),
with the Connector classification stored as a *display* hint. Revisit
Option C once we have confidence-distribution data from real captures.
This is also the safest privacy posture: students see what the AI
thinks, but the system doesn't act on it without consent.

## Architectural anchors

- **Engine side.** `Sprouts.setDimensionForFirstCapture(captureId, dimension)`
  is the single mutation point that locks species. Whatever flow we choose,
  the *terminal* call is still this one. Connector-driven path means a
  server response triggering this method via a slice update.

- **Server side.** `runAutoConnectorAfterMirror` already returns an
  `AutoConnectorResult` with status + verified diff. The bridge has to
  (a) call Mirror+persist for home-route captures, (b) wait for the
  Connector to land, (c) project the verified diff into a "sprout
  species verdict" payload, (d) ship that payload back to the client.

- **Client bridge.** Today `persistMirror` is called from
  `src/components/MirrorSession.tsx` (the reflect.review flow). A new
  thin client function — `classifyHomeCapture(captureId, text)` — would
  POST to a new server route that runs Mirror+persist+Connector and
  returns the species verdict. The engine subscribes to the response
  and calls `setDimensionForFirstCapture`.

- **Persistence.** The capture entry needs a new optional field for the
  Connector's result (separate from the student's `subClaimId`). Schema
  precedent: see how `dimension` was added in
  `src/engine/student-space/Game/State/schema.js` (KNOWN_CAPTURE_KEYS
  +  CAPTURE_DIMENSIONS).

## Out of scope for this brief

- Cost guardrails (rate limiting, cache hits). Worth a follow-up brief.
- Mirror UI placement on the home route — depends on Q1 answer.
- The "did the AI get it wrong?" review surface on the home route.

## Suggested next steps

1. Decide Q1/Q2/Q3 in a brief alignment session. The recommendations
   above are a starting point, not a verdict.
2. Once decided, run `/ce-plan` against this brief to break the work
   into U1/U2/U3 with acceptance criteria.
3. The first implementable unit is most likely a server endpoint that
   takes `{captureId, text}` and returns the species verdict, with the
   home route wiring deferred. That endpoint can be smoke-tested
   independently (mirroring `scripts/managed-agents/smoke-connector.ts`).

## Why this is *not* a one-session task

- The Mirror prompt and transcript shape were designed for the reflect
  flow, not a single-line capture. The prompt will need adaptation or
  the input will need to be wrapped.
- The auto-connector chain currently expects a mirror entry as input.
  Mapping a *home capture* into that shape is non-trivial.
- The async-result delivery channel (Q2's recommendation) doesn't exist
  yet — we'd need a polling endpoint or a server-sent-events channel.
  Picking the channel is itself a design call.
- The chip-picker's current behaviour is load-bearing in dogfooding;
  removing or changing it without the Connector backstop would degrade
  the experience.

Multi-week is the right framing.
