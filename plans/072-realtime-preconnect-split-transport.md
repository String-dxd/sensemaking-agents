# Plan 072: Split the realtime Mirror preconnect — warm the transport without the mic, attach the mic instantly on tap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d1ba3cc9..HEAD -- src/lib/student-space/realtime-mirror-client.ts src/components/student-space/capture/CaptureFab.tsx src/components/student-space/capture/AskSheet.tsx test/lib/student-space/realtime-mirror-client.test.ts test/components/student-space/capture/capture-stack.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the live voice-capture transport)
- **Depends on**: none
- **Category**: perf / UX

- **Planned at**: commit `d1ba3cc9`, 2026-07-27

## Why this matters

When a student taps the mic to start a voice reflection, listening does not
start immediately — the WebRTC connect (getUserMedia + SDP exchange through
the server broker + data-channel open, typically 1–3 s) often still runs
after the tap, while the UI already optimistically says "Listening…". Words
spoken during that window are silently lost, because WebRTC only transmits
after the connection is established. The repo already has a prewarm
mechanism, but it front-loads `getUserMedia`, which causes three concrete
problems:

1. **First-time users get zero prewarm.** The FAB's hover/focus warm is
   gated on mic permission already being granted (so a stray hover never
   pops the browser permission prompt). Users who haven't granted yet pay
   the full connect cost — plus the permission prompt — at the worst moment:
   after tapping the mic.
2. **The FAB press prompts for the mic prematurely.** `onPointerDown` warms
   unconditionally, so a first-time user pressing "Capture" gets the mic
   permission prompt before they've even chosen voice vs. text.
3. **The warm hold lights the mic indicator.** A warm connection keeps a
   muted-but-live mic stream open for up to 60 s, so the browser/OS
   recording indicator shows while nothing is being recorded — a trust
   problem in a student-facing app.

The fix: split the connection into a **mic-less transport warmup** (peer +
SDP + data channel + session handshake, using `addTransceiver('audio')`
instead of `addTrack`) and a **mic attach** at capture time (`getUserMedia`
→ `sender.replaceTrack(track)`, which needs no renegotiation). After this
plan, every prewarm trigger can fire unconditionally (no prompt, no
indicator), and the mic tap costs only `getUserMedia` (~50–150 ms when
permission is granted) instead of a full connect.

## Current state

Files and their roles:

- `src/lib/student-space/realtime-mirror-client.ts` — the whole client
  transport. Key symbols:
  - `openRealtimeMirrorConnection` (lines 115–161) — does `getUserMedia`
    FIRST, then peer, `addTrack`, data channel, SDP POST to
    `/api/openai/realtime-mirror`, then arms `sessionReady` (the
    `session.update` handshake sent when the channel opens).
  - `prewarmRealtimeMirrorCapture` (lines 183–208) — module-scoped single
    warm slot `prewarmedConnection` with a 60 s TTL (`PREWARM_TTL_MS`).
  - `disposePrewarmedRealtimeMirrorCapture` (lines 211–216),
    `takePrewarmedRealtimeMirrorConnection` (218–223).
  - `isRealtimeMirrorConnectionUsable` (225–230) — checks dataChannel state
    AND that the stream's audio tracks aren't ended.
  - `obtainRealtimeMirrorConnection` (232–247) — consumes the warm slot or
    falls back to a fresh connect.
  - `createRealtimeMirrorCapture` (259–340) — awaits
    `obtainRealtimeMirrorConnection`, then `setMicEnabled(stream, true)`,
    wires the accumulator to the data channel. Its `stop()` calls
    `stopStreamTracks(stream)` then sends the final-JSON response;
    `abort()` disposes.
  - `teardownRealtimeCapture` (914–932) — stops tracks, closes remote
    audio/channel/peer.

Excerpt — the current connect order (`realtime-mirror-client.ts:127–136`):

```ts
const stream = await mediaDevices.getUserMedia({ audio: REALTIME_AUDIO_CONSTRAINTS })
setMicEnabled(stream, false)
const peer = new PeerConnection() as MinimalPeerConnection
const remoteAudio = createRemoteAudioOutput(deps.createAudioElement)
peer.ontrack = (event) => remoteAudio.attach(event)
for (const track of stream.getAudioTracks()) {
  peer.addTrack(track, stream)
}
const dataChannel = peer.createDataChannel('oai-events') as MinimalDataChannel
```

- `src/components/student-space/capture/CaptureFab.tsx` — the Capture FAB.
  `warmVoice` (lines 100–104) warms unconditionally; `warmVoiceIfGranted`
  (106–116) checks `navigator.permissions.query({ name: 'microphone' })`
  first. Wired as `onPointerEnter={warmVoiceIfGranted}`
  `onPointerDown={warmVoice}` `onFocus={warmVoiceIfGranted}` (126–128).
- `src/components/student-space/capture/AskSheet.tsx` — the capture sheet.
  Prewarms on open, disposes on close (lines 304–309):

```tsx
useEffect(() => {
  if (!open || readOnly) return
  if (!backend?.createRealtimeMirrorCapture || !canCreateRealtimeMirrorCapture()) return
  backend.prewarmRealtimeMirrorCapture?.()
  return () => backend.disposePrewarmedRealtimeMirrorCapture?.()
}, [open, readOnly, backend])
```

  Its `startRecording` (line 472) optimistically renders a "Listening…"
  bubble before awaiting `createRealtimeMirrorCapture` — keep that behavior.
- `src/lib/student-space/backend-bridge.ts:194` — exposes
  `prewarmRealtimeMirrorCapture: () => prewarmRealtimeMirrorCapture()` to
  the engine-facing bridge. No change needed here unless types shift.
- `src/server/openai-realtime-mirror-session.handler.server.ts` — the SDP
  broker (POST body = offer SDP → OpenAI `/v1/realtime/calls`). **Out of
  scope**; it relays SDP verbatim and is agnostic to how the m-line was
  produced.
- Tests:
  - `test/lib/student-space/realtime-mirror-client.test.ts` (631 lines) —
    has `FakePeerConnection` (line 583: `addTrack`, `createDataChannel`,
    `createOffer`, …) and prewarm tests at lines 216–292 ("consumes a
    prewarmed connection: mic stays muted while warm…", "disposes an
    unconsumed prewarmed connection"). The module keeps a global warm slot;
    tests already reset it in a top-level hook (line ~10 comment: "The
    prewarm pool is module-scoped; never leak a warm connection between
    tests.").
  - `test/components/student-space/capture/capture-stack.test.tsx` —
    component-level capture flow tests.

Repo conventions: TypeScript, Biome formatting, Vitest. This client file is
dependency-injected (`RealtimeMirrorClientDeps`) so tests pass fake
`mediaDevices` / `RTCPeerConnection` / `fetch` — preserve that seam. Match
the existing comment style (explanatory block comments over exported
functions).

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                                   | exit 0              |
| Typecheck + lint | `pnpm check`                                              | exit 0 (18 pre-existing warnings are normal) |
| All tests | `pnpm test`                                                      | all pass            |
| Focused   | `pnpm test -- realtime-mirror-client`                            | all pass            |
| Focused   | `pnpm test -- capture-stack`                                     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/lib/student-space/realtime-mirror-client.ts`
- `src/components/student-space/capture/CaptureFab.tsx`
- `src/components/student-space/capture/AskSheet.tsx` (comment updates only, if needed)
- `test/lib/student-space/realtime-mirror-client.test.ts`
- `test/components/student-space/capture/capture-stack.test.tsx` (only if its prewarm assertions break)

**Out of scope** (do NOT touch, even though they look related):
- `src/server/openai-realtime-mirror-session.handler.server.ts` and
  `src/routes/api/openai/realtime-mirror.tsx` — the broker is SDP-agnostic.
- `src/agents/openai-realtime/*` — prompts and payload builders.
- `src/lib/student-space/audio-capture.ts` — the non-realtime fallback
  recorder path.
- `src/lib/student-space/backend-bridge.ts` — unless a type signature you
  changed forces a one-line adjustment; keep its API identical.

## Git workflow

- Branch: `advisor/072-realtime-preconnect-split-transport`
- Conventional commits, e.g. `feat(mirror): warm realtime transport without holding the mic`
- Do NOT push or open a PR unless the operator instructed it.
- End commit messages with the Claude-Session trailer only if your harness
  instructs you to.

## Steps

### Step 1: Restructure the connection into transport-open + mic-attach

In `src/lib/student-space/realtime-mirror-client.ts`:

1. Change `RealtimeMirrorConnection` to carry the transceiver's sender and a
   late-bound stream instead of a constructor-time stream:

```ts
interface RealtimeMirrorConnection {
  peer: MinimalPeerConnection
  dataChannel: MinimalDataChannel
  remoteAudio: { attach: (event: RTCTrackEvent) => void; close: () => void }
  sessionReady: Promise<void>
  /** Populated by attachMic(); null while the transport is only warmed. */
  stream: MediaStream | null
  /** getUserMedia + sender.replaceTrack; idempotent once attached. */
  attachMic: () => Promise<MediaStream>
  dispose: () => void
}
```

2. Rename `openRealtimeMirrorConnection` →
   `openRealtimeMirrorTransport(deps)`. Remove the `getUserMedia` call and
   the `addTrack` loop; instead:

```ts
const peer = new PeerConnection() as MinimalPeerConnection
const remoteAudio = createRemoteAudioOutput(deps.createAudioElement)
peer.ontrack = (event) => remoteAudio.attach(event)
const audioTransceiver = peer.addTransceiver('audio', { direction: 'sendrecv' })
const dataChannel = peer.createDataChannel('oai-events') as MinimalDataChannel
```

   Keep the SDP offer/POST/answer sequence and `sessionReady` exactly as
   they are. Extend `MinimalPeerConnection` with `addTransceiver` (and drop
   `addTrack` from the Pick if nothing uses it anymore). `attachMic`
   implementation:

```ts
let stream: MediaStream | null = null
const attachMic = async () => {
  if (stream) return stream
  const next = await mediaDevices.getUserMedia({ audio: REALTIME_AUDIO_CONSTRAINTS })
  stream = next
  connection.stream = next
  await audioTransceiver.sender.replaceTrack(next.getAudioTracks()[0] ?? null)
  return next
}
```

   `dispose` / `teardownRealtimeCapture` must handle `stream === null`
   (stop tracks only when attached) and should also
   `audioTransceiver.sender.replaceTrack(null)` best-effort inside a
   try/catch before closing the peer.

3. `setMicEnabled` and the muted-warm-hold semantics disappear from the
   prewarm path (there is no stream to mute). Keep `setMicEnabled` only if
   still used; otherwise delete it.

**Verify**: `pnpm check` → exit 0 (test file will fail to compile until
Step 4 — that's expected; run `pnpm check` again after Step 4).

### Step 2: Point prewarm and capture at the new shape

1. `prewarmRealtimeMirrorCapture`: call `openRealtimeMirrorTransport`. The
   capability guard changes: prewarm no longer needs `mediaDevices` — gate
   on `RTCPeerConnection` availability only (keep honoring injected deps
   for tests). Keep the TTL, the idempotence, and the parked-rejection
   handling exactly as they are.
2. `isRealtimeMirrorConnectionUsable`: drop the track check; a warm
   transport is usable iff `dataChannel.readyState` is not
   `closed`/`closing`. If a stream IS attached (shouldn't happen for a warm
   one), keep the ended-track check for safety.
3. `createRealtimeMirrorCapture`: after
   `obtainRealtimeMirrorConnection(deps)`, replace
   `setMicEnabled(stream, true)` with `const stream = await
   connection.attachMic()`. Everything downstream (`accumulator`, `stop`,
   `abort`) keeps working — `stop()`'s `stopStreamTracks(stream)` now uses
   the attached stream. If `attachMic` rejects (permission denied), dispose
   the connection and rethrow so `AskSheet.startRecording`'s existing catch
   shows `friendlyMicError`.
4. `canCreateRealtimeMirrorCapture` stays as-is (capture still needs
   getUserMedia eventually).

**Verify**: `pnpm check` → source files compile (test failures pending
Step 4).

### Step 3: Let every FAB trigger warm unconditionally

In `CaptureFab.tsx`: prewarm no longer touches the mic, so
`warmVoiceIfGranted` (and its `navigator.permissions.query` probe) is
obsolete. Delete it; wire `onPointerEnter={warmVoice}`
`onPointerDown={warmVoice}` `onFocus={warmVoice}`. Rewrite the comment
block above `warmVoice` (currently lines 94–99) to state the new invariant:
warming opens the WebRTC transport only — no permission prompt, no mic
indicator; the mic is requested when a capture actually starts. Update the
matching comment in `AskSheet.tsx` (lines 299–303) the same way.

**Verify**: `grep -n "warmVoiceIfGranted" src/` → no matches.

### Step 4: Update the unit tests

In `test/lib/student-space/realtime-mirror-client.test.ts`:

1. Extend `FakePeerConnection` (line 583) with
   `addTransceiver(kind: string, init?: unknown)` returning a recorded fake
   `{ sender: { replaceTrack: vi.fn(async () => {}) } }`; keep `addTrack`
   only if a test still exercises it (it shouldn't after this plan).
2. Rewrite the two prewarm tests (lines 216–292) to assert the new
   invariants:
   - during prewarm, `getUserMedia` is **never** called (0 calls);
   - `createRealtimeMirrorCapture` consumes the warm transport: exactly one
     SDP `fetch` total, `getUserMedia` called exactly once (at capture),
     and `sender.replaceTrack` called with the fake mic track;
   - disposal of an unconsumed warm transport closes peer + channel and the
     next capture performs a fresh SDP fetch.
3. Add one new test: `attachMic` rejection (make `getUserMedia` reject with
   `NotAllowedError`) → `createRealtimeMirrorCapture` rejects and the
   transport is disposed (peer.close called), leaving no warm slot behind.
4. Keep/adjust the TTL test if one exists; the TTL semantics are unchanged.

Run the component tests; update `capture-stack.test.tsx` only where it
mocks or asserts prewarm calls that changed shape.

**Verify**: `pnpm test -- realtime-mirror-client` → all pass.
**Verify**: `pnpm test -- capture-stack` → all pass.

### Step 5: Full gates

**Verify**: `pnpm check` → exit 0. `pnpm test` → all pass.

## Test plan

- All updated/new cases live in
  `test/lib/student-space/realtime-mirror-client.test.ts`, modeled on its
  existing prewarm tests: (a) prewarm never calls getUserMedia; (b) warm
  transport consumed by capture — one fetch, one late getUserMedia, one
  replaceTrack; (c) fresh-connect fallback when no warm slot; (d) attachMic
  permission-denied rejection disposes cleanly; (e) unconsumed warm
  disposal.
- `pnpm test` green overall.
- **Operator smoke (not machine-checkable, note it in your report)**: with a
  real `OPENAI_API_KEY`, `pnpm dev`, open the world, press Capture, tap the
  mic, and speak immediately — first words should appear in the transcript;
  no mic indicator should show before the tap.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, including the rewritten prewarm tests and the new attachMic-rejection test
- [ ] `grep -rn "warmVoiceIfGranted" src/` → no matches
- [ ] `grep -n "getUserMedia" src/lib/student-space/realtime-mirror-client.ts` shows it called only inside the mic-attach path, not in the transport-open path
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- You find evidence (a test, a comment, a doc under `docs/`) that OpenAI's
  Realtime WebRTC endpoint rejects offers whose audio m-line comes from a
  track-less transceiver — do not try to work around it with a dummy track;
  report instead.
- `capture-stack.test.tsx` requires changes beyond prewarm-mock shape
  (i.e. the user-visible capture flow assertions start failing).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Anything adding a second voice entry point (e.g. a future onboarding
  voice beat that bypasses AskSheet) should call
  `prewarmRealtimeMirrorCapture` on intent — it is now free of permission
  and privacy side effects, so warming early is always safe.
- Reviewer should scrutinize: teardown paths with `stream === null`
  (warm-transport disposal), and that `stop()` still stops mic tracks
  before requesting the final JSON.
- Deferred (deliberately): buffering audio locally during the residual
  getUserMedia gap (~100 ms) and feeding it via
  `input_audio_buffer.append`; keeping a transport warm for the entire
  world-route dwell with renewal (adds an idle OpenAI session per student —
  cost/rate question for the operator, revisit only if the ~100 ms tap
  latency still feels slow).
