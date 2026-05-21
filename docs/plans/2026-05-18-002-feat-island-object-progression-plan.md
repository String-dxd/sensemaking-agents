---
title: 'feat: Island object progression — sprout → bloom'
type: feat
status: active
date: 2026-05-18
origin: docs/brainstorms/2026-05-18-island-object-progression-requirements.md
---

# feat: Island object progression — sprout → bloom

## Overview

Make every capture visibly contribute to the island. Each `Captures.add()` or `MoodPins.add()` flies a particle from the capture UI to the island, increments a count on an active **sprout**, and updates a `n/threshold` badge. When the sprout crosses its threshold it pulses with a "ready to plant" rim-light and surfaces in a small React tray. The student taps the sprout → camera focuses → the sprout dissolves into a full tree / flower / fruit at its placement seed with a celebratory animation. A neutral toast confirms every capture regardless of whether it spawned a new sprout or grew an existing one.

The plan targets the **live Student Space engine** at `src/engine/student-space/Game/`, not the dormant React/Three layer in `src/components/world/`. v1 keeps all progression state in the engine (localStorage), reusing the existing `MoodPins.js` subscribe pattern. A v2 bridge to server-side VIPS claims is explicitly deferred (see Scope Boundaries).

---

## Problem Frame

The home route mounts `StudentSpaceHost`, which runs the engine. The engine already records captures (`Captures.js`) and mood pins (`MoodPins.js`) with a clean subscribe pattern, and the island already renders trees, flowers, and fruits — but **the two halves are not wired together**. Captures accumulate in localStorage; the island stays static. The student gets no visible signal that what they just captured changed anything on the island, and cannot predict when the next visible change will arrive.

The origin requirements doc (`docs/brainstorms/2026-05-18-island-object-progression-requirements.md`) framed this as a VIPS-claim progression problem, assuming a live Connector → verifier event stream feeding the React/Three layer. That assumption is stale: (a) `src/components/world/*` is dormant and not mounted by any current route, (b) `persistMirror` no longer invokes the Connector synchronously — `runAutoConnectorAfterMirror` exists but is only called from the manual "Run Connector" endpoint and an evening cron, and (c) the engine surface does not currently bridge to Mirror/Postgres data at all. The product intent — make capture → island feedback visible, predictable, and celebratory — survives the substrate change; the implementation path does not.

---

## Requirements Trace

Origin requirements R1–R22 carry forward, retargeted to the engine substrate. The substantive translations:

- R1. **Bloom thresholds** carry forward verbatim. The trigger source becomes capture count rather than evidence count: a sprout becomes ready-to-bloom after `BLOOM_THRESHOLD` captures have been attached to it (default 3 for trees and flowers, 2 for fruits — same numbers, different semantics). (See origin R1.)
- R2. **Early-bloom shortcut**: not applicable in v1 — there is no `strength === 'high'` signal without the Connector. Re-introduced in v2.
- R3. **Count badge** (`n/threshold`) carries forward; rendered as a screen-space label above the sprout. (See origin R3.)
- R4. **Per-input particle** carries forward; emitted from the capture UI (FAB / mood sheet) to the sprout or active object on the island. (See origin R4.)
- R5. **Toast** copy adapts to v1's capture-centric framing. See *Toast copy* in Key Technical Decisions. (See origin R5.)
- R6. **Particle target** carries forward. New-sprout target is computed deterministically from a placement seed (engine equivalent of `positionOnIsland`). (See origin R6.)
- R7–R10. **Live scene updates** carry forward. Implemented via the engine's existing `Captures.subscribe` / `MoodPins.subscribe` pattern, mirrored by a new `Sprouts.subscribe` slice. No page reload required by construction since this is all client-side state. (See origin R7–R10.)
- R11. **Ready-to-bloom pulse** carries forward. (See origin R11.)
- R12. **"Ready to plant" tray** carries forward as a React overlay above the engine canvas. (See origin R12.)
- R13. **~1.5s bloom animation** carries forward. (See origin R13.)
- R14. **Audio cue** routes through the engine's `Sound.js` (which already owns the global mute setting). (See origin R14.)
- R15. **Narration panel on bloom** — in v1, this is a lightweight engine overlay that names the spawned object kind and the count of captures that fed it; in v2 (post-Connector bridge) it shows the claim summary. (See origin R15 — note divergence.)
- R16. **Capture with no link** — adapted: every capture in v1 contributes to a sprout, so the "captured but unlinked" copy fires only when a brand-new sprout is the result, where it becomes `New sprout · {label}`. The "Still listening for patterns" copy is reserved for v2 (when verifier drops apply).
- R17–R19. **Forgetting / demotion** — in v1, the engine does not yet expose "forget" for captures or mood pins on the home route, so these requirements are scoped down to: if a sprout's underlying captures are deleted from devtools/localStorage, the engine reconciles on next mount (full re-derive from captures). The pending-state shrink rule for bloomed objects is preserved through the existing tree/flower scale formula and does not need new wiring.
- R20. **`prefers-reduced-motion`** carries forward verbatim. (See origin R20.)
- R21. **Particle cap** (≤6 in flight) carries forward. (See origin R21.)
- R22. **Keyboard / screen reader on tray** carries forward. (See origin R22.)

---

## Scope Boundaries

- Server-side roundtrip per capture (Mirror → AutoConnector → verifier → engine) is out of scope for v1.
- "Forget" UI for individual captures on the home route is out of scope — not currently exposed.
- Tutorial / first-time-user overlay explaining the mechanic is out of scope; the tray label and badge are the discoverability surface.
- XP, levels, streaks, leaderboards remain out of scope (carried verbatim from origin's *Outside this product's identity*).
- Auto-bloom on timeout remains out of scope (carried verbatim from origin).

### Deferred to Follow-Up Work

- **VIPS claim binding (v2)** — wire the sprout state to verifier-accepted timeline entries. Requires: (a) invoking `runAutoConnectorAfterMirror` after a home-route capture, (b) a transport (sync RPC on session-complete is sufficient — SSE is overkill for a once-per-session event), (c) mapping `dimension` + `canonical_claim_id` onto sprout labels. Likely a separate plan under `feat/island-claim-binding`.
- **Mirror voice capture on home route** — currently `MirrorSession.tsx` is not mounted by the home route; this would be the same separate plan as VIPS binding.
- **Sprout dissolve on capture deletion** — requires user-facing "forget" surface first.
- **Localstorage → Postgres adapter migration** — engine-wide concern, tracked by the port plan.

---

## Context & Research

### Relevant Code and Patterns

- **Substrate**: `src/routes/index.tsx` → `src/components/StudentSpaceHost.tsx` mounts the engine. The dormant React/Three layer (`src/components/world/*`) is NOT mounted by any route.
- **Engine state slice pattern**: `src/engine/student-space/Game/State/MoodPins.js` — `add()` mutates → fans to `this.subscribers` → calls `_persist()`. `subscribe(cb)` returns unsubscribe. This is the template for the new `Sprouts` state slice. **Important caveats**: (a) the subscriber dispatch loop does NOT swallow exceptions — a throwing subscriber aborts the fan-out and skips the subsequent `_persist()`; (b) `Captures.add()` fires subscribers exactly once (the photo-downscale post-resize path calls `_persist()` directly with no re-fire), so there is no "double-fire" risk; (c) hydrate does NOT fire subscribers — slice state and any consumer state (like Sprouts) drift if storage is mutated out-of-band.
- **Sibling capture stores**: `src/engine/student-space/Game/State/Captures.js`, `MoodPins.js`. Each has `add()`, `subscribe()`, `recent(n)`, `_persist()`. `recent(n)` returns a **fresh array each call** via `slice(-n).reverse()` — this is significant for the React `useSyncExternalStore` bridge (see U6 / U1 below).
- **Engine View tick loop**: `src/engine/student-space/Game/View/View.js` and `Renderer.js` own the rAF loop. View modules (`Tree.js`, `Flowers.js`, `Fruits.js`, `Butterflies.js`, `Particles.js`) expose `tick(elapsed)`-style methods called per frame. **There is no existing engine View module that does subscribe-driven runtime reconciliation of a stateful set of island objects** — the closest analog is `Mailbox.js` and `Butterflies.js` (boot-time instantiation only). The Sprouts view is inventing this pattern, not mirroring it.
- **Existing particles**: `src/engine/student-space/Game/View/Particles.js` is a **closed ambient pollen-mote loop** with `COUNT = 36` fixed positions and Lissajous animation; it has no emit / pool / lifecycle / from-to primitives. The capture-to-island particle is a **new sibling subsystem**, not an extension. `src/engine/student-space/Game/View/CaptureFab.js:93-97` has an existing DOM-level particle emitter on capture that is a closer reference; the new particle is structurally adjacent to that pattern.
- **Existing audio**: `src/engine/student-space/Game/View/Sound.js` owns `AudioContext`, the `_muted` gate, and autoplay-on-first-gesture unlocking. **Bloom chime already exists**: `Sound.playOneShot('bloom')` plays an E6 → A6 two-ping sequence (~600ms) with delay shimmer. The onboarding already calls it. Sprouts bloom MUST call this — do not add a new `playChime()` method.
- **Existing camera focus pattern**: `src/components/world/createWorldScene.ts:401` (dormant) — port the easing curve `smootherstep` if the engine doesn't already have one. Confirm during implementation.
- **Existing `prefers-reduced-motion` checks (6 inline copies)**: `KiraDialogue.js:95`, `AskSheet.js:33`, `ObjectPeek.js:40`, `KiraNarrator.js:82`, `Tree.js:536`, `Flowers.js:476`, `Onboarding/OnboardingFlow.js:68`. The plan's "shared util" only becomes a single source of truth if these are migrated; otherwise it adds an abstraction alongside existing copies. v1 may pragmatically inline like the rest of the codebase — see U3.
- **`ObjectPeek.js` reality**: it is a 2-step Kira-companion flow with a `KIND_CONFIG` table keyed on `flower`, `mailbox`, `telescope`. The peek phase shows eyebrow + title + meaning + a CTA; the companion phase routes through AskSheet / FacetView / LettersSheet. Adding a `sprout` kind requires authoring KIND_CONFIG copy and deciding peek vs. companion flow; the "Done" button shape the plan describes is NOT how ObjectPeek exits today. v1 needs to either commit to a new lightweight peek surface or invest in adding a `sprout` kind to ObjectPeek properly.
- **Tree / Flower / Fruit view modules**: `Game/View/Tree.js`, `Flowers.js`, `Fruits.js`. Each builds **a single `THREE.InstancedMesh` per species sized to a fixed `PLACEMENTS` / `BUSH_PLACEMENTS` array at boot** — the instance count is baked in at construction. `Tree.js:531` `growIn(index, opts)` tweens a *pre-allocated* slot from scale 0; it is not a runtime-add API. `Fruits.js` attaches fruit to `BUSH_PLACEMENTS`, not trees. Adding a runtime spawn path is **architectural work** (pick: pre-allocate spare slots, re-allocate the InstancedMesh per bloom, or spawn standalone non-instanced meshes); see U5 Approach for the chosen strategy.
- **Persistence**: `Game/State/Persistence.js` — debounced `_persist()` writes to the storage adapter (localStorage in production). `KEY` (line 33-41), `SLICES` (line 43), and the `empty` default (line 230) are all hardcoded literals; adding `sprouts` requires modifying all three. `SCHEMA_VERSION` is global (in `schema.js`), not per-slice — the per-slice `{ version: 1, ... }` envelope inside Sprouts is independent of that.
- **Body classes & overlay rules**: per the port plan, the engine owns several body classes; React overlays (tray + toasts) must use portals that do not touch `document.body.className`.
- **`StudentSpaceHost.tsx`** is the right mount point for new React overlays.

### Institutional Learnings

- *(from `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`)* `createGame()` is a singleton — React mount must `dispose()` on cleanup; StrictMode double-mount is the canonical test. Any new engine state must respect this.
- *(from `docs/plans/2026-05-14-001-feat-student-space-rich-world-assets-plan.md`)* All new geometries / materials / textures must route through the engine's dispose path. Audit on every new visual.
- *(from `docs/plans/2026-05-15-001-fix-world-stage-real-data-plan.md`)* Decorative top-ups have been deleted twice. Sprouts must derive from real captures only — never from "the island looks bare." This is honored by the design (every sprout is a deterministic function of capture count).
- DRACO is self-hosted at `/draco/`; reuse the existing loader. Don't introduce a CDN dep.
- Reduced motion reduces *amplitude*; it does not blank the scene.
- `docs/solutions/` does not exist yet; create it as part of U8 to host this plan's learnings.

### External References

None gathered. Local patterns are well-established (MoodPins.js is a near-perfect template).

---

## Key Technical Decisions

- **Substrate: engine, not React/Three.** The origin doc's file references (`src/components/world/trees.ts`, etc.) point to a dormant layer. Implementation lives in `src/engine/student-space/Game/`. Rationale: live home page, existing primitives (Particles.js, Sound.js, MoodPins.js subscribe pattern), simpler v1.
- **v1 is pure-client; no server roundtrip per capture.** Captures and mood pins already drive engine state; sprouts become a third state slice derived from them. No new transport, no Connector trigger, no SSE. Rationale: shippable in days rather than weeks; the user's product intent ("feedback per capture, predictability, celebration") is fully served by client-only progression.
- **Progression rule: counter-on-active-sprout.** Each capture increments the count on the currently-active sprout. When count reaches the species threshold, that sprout becomes ready-to-bloom and a new active sprout is created on the next capture. This produces predictable, bounded growth without 1-capture-1-tree clutter. Default thresholds: 3 (tree), 3 (flower), 2 (fruit). Single config in `Game/State/sproutConfig.js`.
- **Single-species v1: trees only.** Every v1 sprout blooms into a tree. Threshold = 3 captures. Resolved 2026-05-18 in post-review: a deterministic rotation (tree/flower/fruit by index) was explicitly rejected as Tamagotchi-shaped — it would have tied species choice to activity index rather than meaning, contradicting the brainstorm's "Outside this product's identity" stance. Species variety waits for v2, where claim dimension (Values / Interests / Personality / Skills) drives species at bloom time. Trees were chosen as the v1 species because the existing engine has the richest tree variety (`oak`, `cherry`, etc. in PLACEMENTS), so visual variety can come from species *within* tree (cycled by sprout createdAt index) rather than across object kinds.
- **Toast copy** (capture-centric, v1):
  - First capture toward a new sprout: `New sprout · {species name} (1/{threshold})`
  - Subsequent captures: `+1 toward {species} ({n}/{threshold})`
  - Threshold crossed: `Ready to plant · {species}`
  - v2 will swap `{species}` for `{claim_label}` once the Connector bridge lands.
- **Live scene mutation via existing tick loop.** The engine already has a rAF loop in `View.js` / `Renderer.js`. Sprout meshes register with the existing tick loop the same way mood pins do; no new animation framework.
- **Audio: reuse existing `Sound.playOneShot('bloom')`** — already implemented (E6 → A6 two-ping, ~600ms, with shimmer; used by onboarding). Bloom dispatches it directly. Do NOT add a new `playChime` method; do NOT create a fresh `AudioContext` (port plan flags collision risk with `MirrorSession.tsx`'s MediaRecorder).
- **Reduced motion shared util.** Add `Game/View/reduceMotion.js` (single source of truth, lazily reads `window.matchMedia` once with SSR guard). All animations (particle, pulse, bloom) check this util.
- **State persistence** lives in `ss:v1:sprouts` localStorage key, debounced via `Persistence.js`. Schema is migration-friendly: `{ version: 1, sprouts: Sprout[], counter: number }` so a future v2 can superscript a `claimId` field without invalidating v1 data.
- **Toast and tray overlays** are React components mounted by `StudentSpaceHost.tsx` via portals to a sibling div, not the canvas root. Body classes remain engine-owned.
- **Brainstorm divergence is intentional.** The plan does not silently follow the brainstorm's stale substrate. The substrate-translation rules above are the bridge — reviewers comparing brainstorm and plan should look there.

---

## Open Questions

### Resolved During Planning

- **Substrate**: engine. (Resolved above.)
- **Connector bridge timing**: deferred to v2. (Resolved above.)
- **Sprout type assignment in absence of claim dimension**: deterministic rotation by sprout index. (Resolved above.)
- **Where audio is owned**: engine `Sound.js`. (Resolved.)
- **Where reduced motion is checked**: shared util in `Game/View/reduceMotion.js`. (Resolved.)

### Open Product Decisions

- **Species rotation vs single-species v1.** **Resolved 2026-05-18**: single-species v1 (trees only). Visual variety via tree-variety cycling (oak / cherry / …) within the tree kind. Flower / fruit / other species deferred to v2 alongside claim binding.
- **Reduced-motion celebratory beat.** The 200ms cross-fade is the only beat for reduced-motion users (no chime, no camera fly-in, no particle burst). Risks reading as a rendering glitch. **Deferred to implementer's eye** — try the cross-fade as-is; if it reads as a glitch in a manual reduced-motion check, add a brief high-contrast color pulse on the new object as a non-motion beat.
- **Toast copy voice.** Initial "+1 toward {species} ({n}/{threshold})" register is gamified. **Deferred to implementer's eye + copy review during U6** — try a reflection-voice register first: e.g., `"Heard. Something is growing on the island."` for `grew`, `"This one's ready."` for `markedReady`. Hold the points-style copy as a fallback if reflection voice undersells the predictability signal.
- **Alternative VIPS path (post-session payload).** The plan rejected the synchronous-Connector-in-v1 alternative. A separate async post-session-payload path was surfaced by review but **not pursued for v1** — this v1 ships first; the post-session-payload approach becomes the v2 candidate.

### Deferred to Implementation

- **Bloom animation exact easing curve.** Engine may or may not have a shared easing utility; implementer should reuse one if present, else inline a `smootherstep`-style curve. Not load-bearing for the plan.
- **Camera focus mechanics.** The engine `View.js` may not have a `focusOn(object)` helper; implementer should add one if absent or reuse an existing pattern. The dormant `createWorldScene.ts:401` has a working reference.
- **Sprout mesh fidelity.** A simple low-poly sprout (cone + sphere leaf cluster + glow ring) is the v1 baseline. Visual polish belongs in implementation; the descriptor schema is what the plan locks in.
- **Count badge: ready-state copy.** When `count === threshold` and `readyToBloom === true`, does the badge read `"3/3"` or `"Ready"` or hide? Pick during implementation; document in U3.
- **`placementSeed → world coord` math.** Engine doesn't have `positionOnIsland(seed)`; pick deterministic 2D positions from a seeded RNG over the island disk, clamped to safe zones. Implementer chooses approach.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                                                  ┌────────────────────────────┐
        Capture FAB ────► Captures.add()  ──────┐ │ React overlays (Host)      │
                                                 ├►│  • Toast (world-anchored)  │
        Mood Sheet ──────► MoodPins.add()  ─────┘ │  • Ready-to-plant tray     │
                                                  └────────┬───────────────────┘
                                                           │ (subscribe)
                            ┌──────────────────────────────▼──────────────────┐
                            │  Sprouts state slice (engine)                   │
                            │   • add(captureRef) → grow active sprout        │
                            │   • markReady(sproutId)                         │
                            │   • bloom(sproutId) → returns { species, seed } │
                            │   • subscribe(cb)                                │
                            └────────┬───────────────────┬─────────────────────┘
                                     │ (subscribe)       │ (on bloom)
                            ┌────────▼────────┐ ┌────────▼─────────────────────┐
                            │ Sprouts.js view │ │ Tree.js / Flowers.js /        │
                            │  • Mesh + badge │ │ Fruits.js                     │
                            │  • Pulse        │ │  • addInstanceAt(seed)        │
                            │  • Dissolve     │ │    (existing)                 │
                            └────────┬────────┘ └────────┬─────────────────────┘
                                     │                   │
                            ┌────────▼───────────────────▼─────────────────────┐
                            │ Particles.js (capture particle, bloom particles) │
                            │ Sound.js (bloom chime — existing AudioContext)   │
                            │ reduceMotion.js (shared check)                   │
                            └──────────────────────────────────────────────────┘
```

State flow per capture:

1. User taps FAB or completes mood pin.
2. `Captures.add()` / `MoodPins.add()` fan to subscribers (existing behavior, unchanged).
3. `Sprouts` subscriber fires `Sprouts.grow(captureRef)` which mutates the active sprout (or spawns one if none).
4. `Sprouts.subscribe` listeners fire: Sprouts.js view updates the badge / pulse; React overlays update tray + emit a toast; Particles.js emits a capture-to-sprout particle.
5. If the increment crossed the threshold, `Sprouts.markReady(id)` is called; ready-to-bloom pulse begins; the tray increments.
6. On student tap → `Sprouts.bloom(id)` → camera focus → 800ms bloom animation → existing Tree/Flower/Fruit view module spawns a real instance at the sprout's seed → sprout descriptor removed → narration overlay (v1 lightweight).

---

## Implementation Units

- U1. **`Sprouts` state slice (engine)**

**Goal:** Add the third state slice mirroring `MoodPins.js`. Owns sprout descriptors, the active-sprout pointer, and the persistence schema.

**Requirements:** R1 (thresholds), R6 (placement seed schema), R7, R8, R9, R10 (live mutation surface), R17–R19 (reconciliation on hydrate)

**Dependencies:** None

**Files:**
- Create: `src/engine/student-space/Game/State/Sprouts.js`
- Modify: `src/engine/student-space/Game/State/State.js` (register the new slice — verify the registration pattern in this file before implementing)
- Modify: `src/engine/student-space/Game/State/Persistence.js`: (1) add `sprouts: \`${NS}:sprouts\`` to the `KEY` literal (line 33-41); (2) add `'sprouts'` to the `SLICES` array (line 43); (3) add `sprouts: []` to the `empty` default (line 230). Without all three, `load()` silently no-ops and `save()` skips.
- Modify: `src/engine/student-space/Game/State/schema.js` (add `mergeSprout` / `mergeSproutArray` helpers; SCHEMA_VERSION is global — leave it alone unless other slices are also bumping).
- Modify: `src/engine/student-space/Game/Game.js` (add `Sprouts.instance = null` to the `dispose()` block at lines 193–203 alongside the other slice instances; without this, the StrictMode-survives-dispose contract is broken).
- Modify: `src/engine/student-space/Game/index.d.ts` (add `sprouts: { subscribe(...); recent(n); getActive() }` to the public state surface).
- Test: `test/engine/Sprouts.test.js`

**Approach:**
- Slice exports `Sprouts` class with `add(captureRef)`, `grow(captureRef)`, `markReady(id)`, `bloom(id)`, `getActive()`, `subscribe(cb)`, `recent(n)`, plus the singleton + persistence boilerplate mirrored from `MoodPins.js`.
- Schema: `Sprout = { id, createdAt, species: 'tree', treeSpecies: 'oak'|'cherry'|..., placementSeed: number, threshold: number, count: number, readyToBloom: boolean, bloomedAt: string|null, captureRefs: string[] }`. `species` is fixed to `'tree'` in v1 (the field is kept on the schema to make v2 species expansion a backwards-compatible enum widening). `treeSpecies` cycles deterministically through the existing engine PLACEMENTS variety (`oak`, `cherry`, …) by sprout createdAt index so the island still gets visual variety from sprout to sprout. `captureRefs` holds capture IDs for traceability and v2 claim binding (forward-compatible: v2 derives claim binding from captureRefs[i] → mirror entry → Connector decision → claim, and at that point may redirect species to flower/fruit based on dimension).
- Threshold constant: inline at the top of `Sprouts.js` as `const BLOOM_THRESHOLD = 3` (v1 has one species; no map needed).
- `_persist()` writes `{ version: 1, sprouts: [...], cycleIndex: number }` to `ss:v1:sprouts`. On read, future-version data fails open (logs once + starts empty).
- **Snapshot stability:** `recent(n)` and `getActive()` are read by React via `useSyncExternalStore` in U6. React requires `getSnapshot` to return referentially-stable values across calls when state hasn't mutated, or it throws the "cached" warning. Implementation: cache the most recent `recent()` array reference inside the slice; invalidate (clear cache) on `add`, `grow`, `markReady`, `bloom`. Same for `getActive()`. Alternative: expose a monotonic `version` counter and let the React hook compute `useMemo(() => slice.recent(50), [version])` — pick one, document the choice.
- **Hydrate-reconciliation:** the Sprouts slice loads its own persisted state on hydrate. To honor R17–R19 (forgotten captures should not leak into sprout state), `Sprouts.hydrate()` does a one-time reconciliation pass: any `captureRefs[]` that no longer resolve in `state.captures.entries` are filtered out; sprouts that fall below `count >= 1` are dropped. Document this as the v1 reconciliation path; it covers the "deleted captures via devtools" case the original plan promised without wiring.

**Patterns to follow:** `src/engine/student-space/Game/State/MoodPins.js` (subscribe/persist/uuid pattern).

**Test scenarios:**
- Happy path: `Sprouts.grow(captureRef)` on an empty store creates a new sprout with species from rotation index 0 (tree), count = 1.
- Happy path: 3 calls to `grow()` for tree threshold reaches readyToBloom = true on the 3rd call.
- Edge case: `grow()` after the active sprout becomes ready spawns a new sprout at the next rotation index.
- Edge case: `bloom(id)` removes the sprout from the active list and emits a `bloomed` event with `{ species, placementSeed }`.
- Edge case: persistence round-trip — call `grow()` twice, instantiate a fresh `Sprouts` against the same storage, expect 1 active sprout with count = 2.
- Edge case: persistence version mismatch — store with `{ version: 99 }` is ignored on load (logs once, starts empty).
- Edge case: singleton guard — instantiating `Sprouts` twice returns the same instance (mirroring MoodPins/Captures contract; protects StrictMode double-mount).

**Verification:**
- Vitest passes for `Sprouts.test.js`.
- `Sprouts` does not import anything from `View/`.

---

- U2. **Wire `Captures` + `MoodPins` → `Sprouts.grow`**

**Goal:** When a capture or mood pin is added, the active sprout grows. This is the only behavioral edge between the existing slices and the new one.

**Requirements:** R4 (per-capture trigger), R7 (live mutation)

**Dependencies:** U1

**Files:**
- Modify: `src/engine/student-space/Game/Game.js` (or wherever slice-to-slice wiring belongs after slices are constructed — verify the right insertion point during implementation)
- Test: `test/engine/Sprouts.integration.test.js`

**Approach:**
- At engine boot, after all slices are constructed, subscribe `Sprouts` to `Captures` and `MoodPins`. **Wrap each subscriber callback in try/catch** — the engine's subscriber dispatch loop does NOT swallow exceptions (verified in `MoodPins.js:50` and `Captures.js:93`), and an unhandled throw aborts fan-out and skips `_persist()`. The wrap is the boundary that enforces "grow is best-effort":
  ```
  captures.subscribe((entry) => {
    try { sprouts.grow({ kind: 'capture', captureId: entry.id }) }
    catch (err) { console.warn('[sprouts] grow failed', err) }
  })
  moodPins.subscribe((pin, _all) => {
    try { sprouts.grow({ kind: 'mood', pinId: pin.id }) }
    catch (err) { console.warn('[sprouts] grow failed', err) }
  })
  ```
- **MoodPins fires subscribers on both `add` and `patch`** (lines 50 and 61) — `patch` is used for post-save `cause` / `note` updates. Sprouts must NOT increment on patch. Dedupe by `pin.id` inside `grow`: if the active sprout's `captureRefs[]` already contains this id, return without incrementing.
- `Captures.add()` fires subscribers exactly once — the photo-downscale post-resize calls `_persist()` directly with no subscriber re-fire, so there is no double-fire in that path. The dedupe-by-id above is sufficient and also catches any future Captures `patch` if one is added.

**Patterns to follow:** look at `CaptureFab.js:95` (`this._offCaptures = this.state.captures.subscribe(...)`) for the canonical subscribe + unsubscribe pattern.

**Execution note:** Start with the integration test in `test/engine/Sprouts.integration.test.js` — boot a `createGame({ persistence: { storage: memoryAdapter() } })`, fire `captures.add(...)`, assert sprouts state.

**Test scenarios:**
- Integration: `captures.add({ kind: 'ask', text: '...' })` results in `sprouts.recent(1)` returning one sprout with count = 1.
- Integration: `moodPins.add({ emotion, intensity })` increments the same active sprout.
- Integration: `moodPins.patch(id, { cause })` does NOT increment (subscriber fires but `pin.id` is already in `captureRefs`).
- Integration: subscriber crash isolation — register a deliberately throwing `Sprouts.grow` (or stub it to throw); `captures.add()` still completes, the mood pin / capture is still persisted, and only a warn-log records the failure.
- Integration: dispose cleanup — calling `game.dispose()` then `captures.add()` does not throw (subscriptions cleared).

**Verification:**
- Integration test passes.
- StrictMode double-mount test (already in port plan) still passes after this change.

---

- U3. **Sprout view module (mesh, badge, pulse, dissolve)**

**Goal:** Render each active sprout as a 3D mesh on the island with a count badge, a ready-to-bloom pulse, and a dissolve animation on bloom.

**Requirements:** R3 (count badge), R6 (placement seed → world coord), R11 (ready-to-bloom pulse)

**Dependencies:** U1

**Files:**
- Create: `src/engine/student-space/Game/View/Sprouts.js`
- Modify: `src/engine/student-space/Game/View/View.js` (instantiate + tick)
- Modify: `src/engine/student-space/Game/View/Renderer.js` (register tick if needed)
- Test: `test/engine/SproutsView.test.js`

**Approach:**
- Subscribe to `state.sprouts` on construction; on each event, reconcile mesh set against active sprout list. There is NO existing engine View module that does this kind of subscribe-driven runtime reconciliation — the closest precedent is `CaptureFab.js:95`'s `_offCaptures = state.captures.subscribe(...)`, which uses the result only to refresh a button UI. The Sprouts view introduces this pattern; document it inline as a new convention worth carrying forward.
- Mesh = low-poly: small green stem + leaf cluster + faint emissive glow ring (intensity 0 when not ready, animated when ready). Non-instanced for v1 — Sprouts have a low count (<10 simultaneously) and short lifespan; instancing them is premature.
- **`placementSeed → world coord` mapping does not exist in the engine** (it lived in the dormant `src/components/world/island.ts`). Add a small helper in `Sprouts.js` (view) that mirrors the dormant `positionOnIsland(seed)` math, or pick deterministic 2D positions from a seeded RNG over the island disk and clamp to safe zones. Document the chosen approach in the unit's implementation note.
- Count badge: **use a DOM label projected by world-coord** — matches the existing precedent in `ObjectPeek.js:_anchorPeek()` which uses `tmpVec.project(camera)` to position a `position: fixed` DOM element. Route the label through the React overlay in U6 so DOM badges and toasts share one mounting strategy. Do NOT use THREE sprites for badges — fonts and accessibility diverge from the existing DOM convention.
- Ready-to-bloom pulse: rim-light intensity sin wave + vertical bob (~3px, 2.5s period). Inline `window.matchMedia('(prefers-reduced-motion: reduce)').matches` check (matching `Tree.js:536` / `Flowers.js:476` precedent); reduced-motion path drops bob → 0 and pulse → static glow.
- Dispose: every geometry/material/texture registered with the engine's dispose graph.

**Patterns to follow:** `CaptureFab.js:95` for subscribe + unsubscribe. `ObjectPeek.js:_anchorPeek()` for DOM-projected labels.

**Test scenarios:**
- Test expectation: none on visual fidelity. Snapshot-test the mesh-count reconciliation: after `sprouts.add()`, the Sprouts view contains one Object3D in its root group.
- Reconciliation: after `sprouts.bloom(id)`, the corresponding mesh is removed from the root group.
- Edge case: reduced-motion mode skips bob/pulse but the mesh still renders.

**Verification:**
- Engine boots with no console errors.
- Manually firing `state.captures.add(...)` from the dev console in the running app produces a visible sprout.

---

- U4. **Capture-to-island particle (NEW sibling subsystem to `Particles.js`)**

**Goal:** Each `captures.add` / `moodPins.add` emits a small particle that travels from the on-screen capture UI to the sprout's island position.

**Requirements:** R4 (per-input particle), R21 (cap ≤6 in-flight)

**Dependencies:** U1, U3 (sprout must exist before particle can target it)

**Files:**
- Create: `src/engine/student-space/Game/View/CaptureParticles.js` — new file, NOT a modification to the existing ambient `Particles.js`
- Modify: `src/engine/student-space/Game/View/View.js` (instantiate + tick + register dispose)
- Test: `test/engine/CaptureParticles.test.js`

**Approach:**
- `Particles.js` is a closed ambient pollen field (fixed `COUNT = 36` motes on a single `THREE.Points` mesh with Lissajous animation). It has no emit/pool/lifecycle primitives. Building on top of it would pollute the dust loop's clean shader-uniform model. The capture particle is a **sibling subsystem** — a separate module with its own pool of sprites and lifecycle.
- **Choose particle space at design time, not implementation:** v1 uses **DOM-overlay particles** to match the existing `CaptureFab.js:_emitParticle` precedent. The target position is computed by projecting the sprout's world coord to screen via `tmpVec.project(camera)`, then animating a DOM element from the capture-UI anchor to that screen position over ~1.0s with ease-out. This avoids needing world-coord origin (the FAB lives in DOM, not the canvas) and is the lowest-risk path. THREE.Sprite-based variant is deferred to v2 alongside claim binding.
- Pool: an array of ≤6 reusable DOM elements; check-out on emit, check-in on animation end. If 7th call arrives, drop (no coalesce in v1).
- Color: species color (tree = green, flower = pink, fruit = warm yellow). Dimension-tinted in v2 when claims are bound.
- **Trigger / anchor source:** the engine subscriber wrapper (U2) is the trigger; the screen-anchor for "where the particle starts" comes from a small DOM-level event the capture UI fires when the sheet completes — `window.dispatchEvent(new CustomEvent('ss:capture-screen-anchor', { detail: { x, y } }))` fired by AskSheet/PhotoSheet/MoodSheet on close. `CaptureParticles.js` listens for the most recent anchor (held in a 100ms-stale buffer) and uses it on the next `grow` event. If no anchor was set in the last 100ms, fall back to the FAB's current `getBoundingClientRect()` center. Document this contract.

**Patterns to follow:** `CaptureFab.js:_emitParticle` for DOM-particle pattern; `ObjectPeek.js:_anchorPeek()` for world → screen projection.

**Test scenarios:**
- Happy path: `captureParticle({ from, to })` produces one sprite in the particle pool; after the duration, it's released.
- Edge case: 7th simultaneous call returns false / no-ops (cap respected).
- Edge case: reduced-motion path: particle fades over 200ms in place instead of traveling.

**Verification:**
- Manual: capture from the FAB → visible particle to a sprout.
- No memory leak across 50 captures (pool reused).

---

- U5. **Bloom CTA & transition**

**Goal:** Student tap on a ready-to-bloom sprout triggers camera focus + 1.5s bloom animation + spawn of the real Tree/Flower/Fruit at the sprout's seed.

**Requirements:** R11 (pulse → tap → bloom), R12 (tray CTA), R13 (animation timing), R14 (audio cue), R15 (narration panel — v1 divergence noted)

**Dependencies:** U1, U3

**Files:**
- Modify: `src/engine/student-space/Game/View/Sprouts.js` (raycast click handler + bloom orchestration)
- Modify: `src/engine/student-space/Game/View/Tree.js` (add a runtime spawn path — see InstancedMesh strategy below)
- Modify: `src/engine/student-space/Game/View/ObjectPeek.js` (add a `sprout` entry to `KIND_CONFIG` — copy: eyebrow="growing", title from `treeSpecies`, meaning = capture count, primary CTA = "Done" returning camera; or a slim peek-only variant that bypasses the Kira companion phase. Pick during implementation.)
- Modify: `src/engine/student-space/Game/View/View.js` (camera focus helper if not already present)
- Test: `test/engine/SproutsBloom.test.js`

**Approach:**
- **InstancedMesh runtime-spawn strategy.** `Tree.js` builds a single `THREE.InstancedMesh` per tree variety (oak, cherry, …), sized to a fixed `PLACEMENTS` array at boot. v1 chooses **pre-allocate spare slots**: extend each variety's PLACEMENTS array with N reserved slots (default N=12) marked `hidden=true` at boot. The new method `revealAt(slotIndex, worldX, worldZ)` writes the matrix for the reserved slot, sets `instanceMatrix.needsUpdate`, and calls the existing `growIn(index)` tween. Rationale: zero GPU resource churn per bloom, deterministic memory ceiling, works with existing `growIn`. Documented trade: caps total user-bloomed trees per variety at N=12; once exhausted the bloom logs and the tray rejects further blooms of that variety (rare path; v2 raises the ceiling and adds flower/fruit varieties).
- Click handler: pick raycast on the sprout's hit-target (invisible inflated sphere matching the existing hotspot pattern in `Game/View` — there is no `Game/View/MoodPins.js` view to mirror; use the engine's existing raycast usage in `View.js` as reference). On hit + `readyToBloom === true`, dispatch `sprouts.bloom(id)`.
- Animation orchestration: 700ms camera ease-in to the sprout's world position → 800ms bloom (sprout dissolves into upward particles via U4's sibling subsystem; the new Tree/Flower/Fruit `revealAt(slot, x, z)` + `growIn(slot)` scales up via the existing tick loop).
- **Bloom interruption policy:** tapping a different sprout during an active bloom is **ignored** for the duration of the 1.5s animation. The tray button is also disabled (visually dimmed, `aria-disabled="true"`) for that window. Document at the click-handler entry point.
- Narration: v1 opens `ObjectPeek` with a new `sprout` kind. v1 copy is intentionally lightweight (species + count of captures + Done). v2 (claim binding) swaps the copy for the claim summary and may invoke the Kira companion phase. The `sprout` KIND_CONFIG entry is new work in v1, not "reuse as-is."
- Audio: `Sound.playOneShot('bloom')` — already implemented (E6 → A6 two-ping, ~600ms). Internally gates on `_muted`. Sprouts View additionally suppresses the call when `prefers-reduced-motion: reduce` is set, matching R14's "no chime in reduced-motion" intent.

**Patterns to follow:** `ObjectPeek.js` itself for click → peek-panel pattern (the engine's actual existing pattern for "tap an island object, see a panel"). The dormant `src/components/world/createWorldScene.ts:401` for camera transition easing (port the `smootherstep` math, not the React surface).

**Execution note:** Reduce-motion path implemented in parallel; verify both paths exit at the spawned object before declaring done.

**Test scenarios:**
- Happy path: clicking a ready sprout removes it and spawns one new instance from the matching view module.
- Edge case: clicking a not-yet-ready sprout opens the ObjectPeek (preview) but does not bloom.
- Edge case: reduced-motion path completes in ≤300ms with no camera fly-in and no particle storm; the new object still appears.
- Edge case: clicking during another bloom's animation is queued (or ignored — pick one and document).
- Integration: a bloom's spawn position equals the sprout's `placementSeed` projection.

**Verification:**
- Manual: 3 captures → tap sprout → tree appears.
- Reduced-motion manual check.

---

- U6. **React overlays: "Ready to plant" tray + toasts**

**Goal:** Mount a small React UI above the engine canvas — a tray showing the count of ready-to-bloom sprouts (tap to focus + bloom), plus transient toasts on each capture.

**Requirements:** R5 (toasts), R12 (tray CTA), R16 (capture-with-no-link copy — adapted), R22 (a11y)

**Dependencies:** U1, U5 (tray uses the bloom path)

**Files:**
- Create: `src/components/IslandProgressionOverlay.tsx`
- Create: `src/components/IslandProgressionOverlay.module.css` (verify CSS convention against existing `src/components/*.tsx` files before committing)
- Modify: `src/components/StudentSpaceHost.tsx` (mount the overlay as a sibling element inside the host root, NOT a portal to `document.body`; pass `game` as a ref-prop once the dynamic import resolves — overlay renders `null` while `game === null`)
- Test: `test/components/IslandProgressionOverlay.test.tsx`

**Approach:**
- **Engine-state binding:** call `useSyncExternalStore` directly inside `IslandProgressionOverlay.tsx`, matching the existing precedent in `src/components/AgentDebugPanel.tsx:73`. No new `src/hooks/useEngineState.ts` generic abstraction — one consumer, one inline call. The `getSnapshot` reads `sprouts.recent(50)` and `sprouts.getActive()` from the Sprouts slice — both must return **referentially stable** values until the next mutation (U1 covers this requirement on the slice side).
- **Engine-handoff during async import.** `StudentSpaceHost.tsx` dynamically imports the engine inside `useEffect`; the game ref does not exist on first render. The overlay accepts `game: Game | null` and renders `null` until the game resolves. Add a portal target div as a sibling to the canvas container inside the host root (NOT `document.body`, to preserve engine-owned body classes).
- **Tray position: NOT bottom-right.** `zoom-hud` already occupies `position: fixed; bottom: 16px; right: 16px`. Tray goes **bottom-center, above the `mood-hud` band** (which is `bottom: 16px; left: 50%`) — verify in CSS during implementation. Empty state hides; otherwise `"Ready to plant · {n}"`. Click → focus first ready sprout (insertion order ascending) and dispatch bloom. Disable visually + `aria-disabled="true"` for the 1.5s of an active bloom.
- **Toast position:** stack near the tray (bottom-center column rising upward). The brainstorm's R5 "anchored near the landing point" is deferred to v2 — anchoring a toast to a moving 3D-projected point near screen edges introduces clamping/clipping work that doesn't earn its keep in v1. Tray-anchored toasts read cleanly and place predictably. Document the trade.
- Triggered by: `sprouts.subscribe` events: `grew` → "+1 toward {species} ({n}/{threshold})", `markedReady` → "Ready to plant · {species}", `bloomed` → no toast (the animation is the celebration).
- **Pre-first-capture state:** the very first capture toast fires correctly (the toast for `grew` is the first signal). Before any capture, the island has no sprout, no toast, no tray. This is intentional — discoverability comes from the first capture event; do not add a tutorial overlay in v1.
- Accessibility: tray button has `aria-label="Ready to plant: {n} sprouts"`. Toast region is `role="status"` with `aria-live="polite"`.

**Patterns to follow:** `src/components/AgentDebugPanel.tsx` for the `useSyncExternalStore` precedent (no new hooks directory needed). Existing CSS convention in `src/components/` for the stylesheet approach.

**Test scenarios:**
- Render: empty tray when no ready sprouts.
- Render: tray shows count = 2 when two sprouts are ready (mock the slice via `memoryAdapter` + manual `sprouts.markReady` calls).
- Interaction: clicking the tray button calls `sprouts.bloom(...)` for the oldest ready sprout (verify ordering — likely insertion order, document if not).
- Accessibility: button has correct `aria-label`; toast region is announced via `role="status"`.
- Reduced motion: toasts skip entrance animation but still render.

**Verification:**
- `pnpm test` passes new tests.
- Manual: capture twice → see toast each time → after threshold, tray badge increments.

---

- U7. **DROPPED.** Reduced-motion and audio-routing are absorbed into U3/U5/U6 directly: each new module inlines `window.matchMedia('(prefers-reduced-motion: reduce)').matches` matching the existing 6 inline copies in the codebase (`Tree.js:536`, `Flowers.js:476`, `ObjectPeek.js:40`, `KiraDialogue.js:95`, `KiraNarrator.js:82`, `AskSheet.js:33`, `OnboardingFlow.js:68`). The audio path is `Sound.playOneShot('bloom')` which already exists. A shared util that ignores the 7 existing inline copies is half-consolidation — defer to a follow-up cleanup PR that migrates everything together. Test coverage for reduced-motion behavior lives in U3 (Sprouts view) and U6 (overlay) where it actually changes behavior.

---

- U8. **Tests, docs, and `docs/solutions/` learning capture**

**Goal:** Cover the cross-cutting integration paths not covered by unit tests, document the substrate decision for future planners, and create `docs/solutions/` (it does not exist yet).

**Requirements:** All

**Dependencies:** U1–U6

**Files:**
- Create: `test/engine/Progression.e2e.test.tsx` (boots StudentSpaceHost, drives `captures.add` via the engine surface, asserts tray increments + sprout appears + bloom replaces sprout)
- Create: `docs/solutions/2026-05-18-island-progression-engine-substrate.md` (institutional learning: brainstorm referenced dormant React/Three layer; live work targets engine; rule of thumb for future authors; also notes the InstancedMesh pre-allocate-spare-slots pattern for runtime spawn)
- Modify: `docs/brainstorms/2026-05-18-island-object-progression-requirements.md` (append a short "Implementation note (2026-05-18)" pointing to this plan and noting substrate translation; do not rewrite the brainstorm itself)

**Approach:**
- e2e test uses `memoryAdapter()` and React Testing Library; bypasses the 3D scene for engine state assertions but mounts the overlay.
- Solution doc captures: (a) the dormant-vs-live substrate trap, (b) the rule "live home page is the engine; the React/Three world is dormant until the next mount", (c) pointers to MoodPins.js as the canonical state-slice template, (d) the `_persist()` debounce + StrictMode dispose pattern.

**Test scenarios:**
- e2e: capture twice → tray hidden. Capture 3rd time → tray shows "Ready to plant · 1". Click tray → sprout disappears, tree appears, tray hides.
- e2e: 7th capture (after the first bloom) drops onto the next-rotation species (flower).
- e2e: `prefers-reduced-motion: reduce` matchMedia mock active → e2e still completes; all transitions are instantaneous.

**Verification:**
- All `pnpm test` passes.
- `docs/solutions/` exists with the new entry.
- Brainstorm has a one-paragraph implementation note linking to this plan.

---

## System-Wide Impact

- **Interaction graph:** New subscriptions from `Sprouts` to `Captures` and `MoodPins`. New React overlay above the engine canvas via portal. No changes to the server (`persistMirror`, AutoConnector) in v1. No changes to the dormant React/Three layer.
- **Error propagation:** Sprouts' `grow` is best-effort and must never throw into the Captures subscriber chain; failures log + continue (mirror MoodPins' tolerance of bad payloads).
- **State lifecycle risks:** localStorage quota — Sprouts is small (a few KB at most) and well within the 5MB budget Captures already negotiates against. Persistence is debounced; tab close uses synchronous adapter contract.
- **API surface parity:** `Game.state.sprouts.subscribe` is added to `index.d.ts` as part of the engine's host contract. Existing slices unchanged.
- **Integration coverage:** U2's integration test, U6's overlay test, and U8's e2e together cover the live path; unit tests alone cannot prove the cross-slice subscription chain.
- **Unchanged invariants:** `persistMirror` still returns `{ mirror_entry }` only. `runAutoConnectorAfterMirror` still only fires from manual / cron. `src/components/world/*` remains dormant. `StudentSpaceHost.tsx`'s dispose contract still owns cleanup of `createGame()`. Body classes remain engine-owned.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Substrate decision is wrong — user wanted the React/Three layer revived | Plan calls out substrate explicitly in Key Technical Decisions and Open Questions. v2 can revive React/Three or bridge engine to server data without touching v1's engine work. |
| Brainstorm's R15 "narration panel" assumes a richer claim summary than v1 can produce | v1 uses ObjectPeek with capture count + species. v2 swaps in the claim narration. The component contract is preserved. |
| MoodPins fires subscribers on both `add` and `patch` — sprout count could double-increment if the student edits a mood pin's cause/note | U2 dedupes by `pin.id` in `grow`; if the active sprout's `captureRefs[]` already holds the id, return without incrementing. (Captures.add fires exactly once; the photo-downscale path calls `_persist()` directly with no subscriber re-fire — there is no double-fire on the captures side.) |
| Engine subscriber dispatch does NOT swallow exceptions — a throwing `Sprouts.grow` would abort fan-out and skip `_persist()` on the captures/mood-pins slice | U2 wraps the subscriber callback in try/catch and logs; defense in depth at the boundary, not a fragile invariant on the producer. |
| Multiple sprouts ready-to-bloom queueing UX | Plan: tray shows count; clicking focuses the oldest. Document in U6; the order is `createdAt` ascending. |
| StrictMode double-mount creates duplicate sprouts | Sprouts singleton guard (mirroring MoodPins) prevents this; U1's singleton test pins the contract. U1 also adds `Sprouts.instance = null` to `Game.dispose()` so the singleton is fresh after dispose — the contract is "same instance within a Game lifecycle, fresh after dispose." |
| Vite HMR fragments the Sprouts singleton in dev (subscribers hold the old class identity) | Best-effort only — the codebase has no `import.meta.hot` plumbing; full page reload reseeds the singleton. Document in U1 as a known dev-time wart. |
| `useSyncExternalStore` infinite-loops or throws "cached snapshot" warning because `recent(n)` returns a new array each call | U1 makes `recent()` and `getActive()` return referentially-stable references until mutation. Tests pin this invariant. |
| InstancedMesh ceilings — pre-allocated spare slots exhausted (>12 user-bloomed per species) | v1 logs and rejects further blooms of that species via the tray; rare edge case. v2 raises the ceiling. |
| v1 sprouts in localStorage at v2 cutover have no claim binding | v2 hydrate ignores v1 sprouts and rebuilds from `captureRefs[]` → mirror entries → Connector decisions. The `captureRefs` field is the join key; v1 schema carries it forward intentionally. |
| Tamagotchi-shaped feedback risk (originally surfaced by review) | Resolved by shipping single-species v1 (trees only). Visual variety comes from cycling `treeSpecies` (oak, cherry, …) within the tree kind, driven by sprout createdAt index. v2 introduces flower/fruit when claim dimension can decide species meaningfully. |
| New `AudioContext` creation collides with Mirror capture | All chimes route through `Sound.js`'s existing context. Forbidden to create a new one. Code review checks `grep -r "new AudioContext" src/engine src/components/IslandProgressionOverlay*`. |
| Particle pool leak under high-frequency captures | Cap of 6 enforced at the queue level; old particles released to the pool, not GC'd. |
| Live home page suddenly mounts `src/components/world/*` again via a different plan | This plan is purely additive to the engine. No conflict. The dormant layer can be revived independently without breaking v1 sprouts. |
| `prefers-reduced-motion` user expects no audio either | `Sound.playChime` gates on `reduceMotion.isReduced()` as well — chime omitted in reduced-motion mode. Mentioned in R20's expansion above. |

---

## Documentation / Operational Notes

- `docs/solutions/2026-05-18-island-progression-engine-substrate.md` is created in U8 with the substrate-trap learning.
- Brainstorm gets a one-paragraph implementation note linking to this plan.
- No new env vars, no migrations, no rollout flags.
- localStorage key `ss:v1:sprouts` is namespaced consistently with the engine's existing `ss:v1:*` pattern; document in the schema comment so future Postgres adapter migration is straightforward.

---

## Alternative Approaches Considered

- **Revive `src/components/world/*` for sprouts.** Rejected — duplicates engine work, doubles the dispose surface, leaves the home page on a different code path than the rest of the engine features. Would only make sense if the team plans to retire the engine, which the port plan explicitly does not.
- **Run AutoConnector synchronously in v1 to get real claim-bound sprouts.** Rejected for v1 — adds 2–10s of latency to every capture, surfaces server failure modes into the home page (transport_error, schema_reject, etc.), and requires building the home-route Mirror UI first (currently not mounted). Defers to v2.
- **Post-session async payload for claim-bound sprouts (not weighed in initial draft; surfaced by doc review).** AutoConnector runs async on session-complete from the existing Mirror surface (wherever it is currently mounted), drops a `pending_claim_event` payload to localStorage or a polled endpoint, and the engine picks it up next time the home page mounts. **Trade vs v1+v2 staging:** ships the brainstorm's claim-bound product directly without staging through Tamagotchi v1; costs (a) a small server change to fan out events on session-complete, (b) no live update mid-session (acceptable — students rarely sit on the island while capturing), (c) requires figuring out where Mirror is mounted and confirming session-end is a stable signal. This is the highest-leverage alternative to the current v1 framing and remains a live decision (see Open Product Decisions).
- **Push sprouts purely as a React overlay (no 3D mesh).** Rejected — undersells the celebration moment; the brainstorm explicitly framed the bloom as an island-anchored visual event. Keeping the sprout in the canvas preserves the spatial metaphor.
- **Use a global event bus instead of slice-to-slice subscription.** Rejected — the engine's existing slices use direct `subscribe()` (`MoodPins`, `Captures`); a global event bus would introduce a parallel paradigm with no immediate benefit.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-18-island-object-progression-requirements.md](../brainstorms/2026-05-18-island-object-progression-requirements.md)
- Substrate context: [docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md](2026-05-18-001-feat-port-student-space-shell-plan.md)
- Evidence-only invariant (institutional): [docs/plans/2026-05-15-001-fix-world-stage-real-data-plan.md](2026-05-15-001-fix-world-stage-real-data-plan.md)
- Three.js lifecycle + reduced-motion conventions (institutional): [docs/plans/2026-05-14-001-feat-student-space-rich-world-assets-plan.md](2026-05-14-001-feat-student-space-rich-world-assets-plan.md)
- Engine state-slice template: `src/engine/student-space/Game/State/MoodPins.js`
- Engine host contract: `src/engine/student-space/Game/index.d.ts`
- Auto-Connector handler (for v2 bridge): `src/server/auto-connector.handler.server.ts`
