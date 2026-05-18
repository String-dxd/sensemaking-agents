---
date: 2026-05-18
topic: island-object-progression
---

# Island Object Progression — Sprout → Bloom

## Summary

A two-stage growth system that surfaces the hidden VIPS claim progression already happening in the data. Each capture either grows an existing tree/flower/fruit *or* contributes to a new **sprout** on the island. Sprouts show visible evidence count (e.g., `2/3`). When a sprout crosses its bloom threshold, it pulses with a "ready to plant" glow; the student taps it to trigger a celebratory bloom animation that summons the full object out of the island. Per-input feedback is a small particle that flies from the capture UI to its target on the island, plus a transient toast naming the claim it strengthened.

The goal is to make every capture feel weighted, give students a predictable read on "how close am I to the next thing," and turn the moment of growth into an active CTA the student triggers rather than a passive page-reload reveal.

---

## Problem Frame

The island today has real progression baked into its data model — `evidenceCount`, `evidenceState ∈ {pending, confirmed}`, `strength ∈ {low, medium, high}` — and tree/flower visuals already scale and fade based on those signals (`treeScale = 0.5 + 0.05·strength + 0.012·evidenceCount` in `src/components/world/trees.ts:95`). But three gaps mute the felt experience:

First, **the island is built once at page load.** `buildVipsWorldSceneModel` runs against the current persisted data and renders a static scene (`src/components/world/vipsWorldMapping.ts:190`). A student who finishes a capture mid-session sees nothing change on the island until they refresh. The moment of growth is invisible.

Second, **there is no per-input feedback tying a capture to an object.** When a Mirror entry is processed and the Connector links it to a claim, the only artifacts are a backend row update and (eventually) a slightly larger tree. There is no signal at the moment of capture that says "your input landed *there*."

Third, **there is no observable threshold or anticipation.** Pre-confirmation claims either silently accumulate evidence or wait to be confirmed by a verifier — the student cannot see "I'm 2 captures away from a new tree" and therefore cannot anticipate, predict, or feel close to a milestone. The system already has the data to express this; the UI doesn't.

The cost of leaving this as-is: students complete reflections without a strong sense that their input mattered, and the island — which is the most visually expensive surface in the product — under-delivers as a feedback loop. The bigger the corpus gets, the more this disconnect compounds.

---

## Actors

- A1. **Student** — Singapore secondary school student. Records reflections, watches the island update in response, taps ready-to-bloom sprouts to trigger their growth into full objects, reviews narration panels after bloom.
- A2. **Mirror agent** — Unchanged. Persists the reflection.
- A3. **Connector agent** — Unchanged behavior, but its proposed timeline entries now drive a live UI signal: each proposed entry that passes the verifier emits a `capture-linked` event the world scene listens to.
- A4. **Deterministic verifier** — Unchanged. Its accept/downgrade/drop decision determines whether a particle lands on the island (accept), lands but greys (downgrade to low), or fizzles short of the island (drop). The fizzle is silent — no error UI.
- A5. **World scene** — The 3D island in `src/components/world/`. New responsibilities: subscribe to capture-linked events, animate per-input particles, render sprouts as a new object class, render ready-to-bloom state, play bloom animation on student tap, spawn new claim objects without page reload.

---

## Key Flows

- F1. **Per-capture particle feedback**
  - **Trigger:** Mirror session ends → Connector proposes → verifier accepts at least one timeline entry.
  - **Actors:** A1, A2, A3, A4, A5
  - **Steps:** (1) Capture UI dispatches a `capture-linked` event for each accepted entry, carrying `{ claimId, dimension, evidenceCountAfter, threshold, isNewClaim, strength }`. (2) World scene animates a small dimension-tinted particle (~1.0s) from the on-screen capture UI to the target on the island. (3) For an existing object: particle lands on the matching tree/flower/fruit, which scales up by one growth tick; toast appears `+1 evidence · {label} ({count}/{threshold})`. (4) For a new claim with `isNewClaim === true` and no existing sprout: particle lands at the placementSeed coordinates, a sprout pops out of the ground with a small bounce + ring particle; toast `New sprout · {label} (1/{threshold})`. (5) If multiple entries are accepted from one capture, particles fire sequentially with a 150ms stagger.
  - **Outcome:** Every accepted capture produces a visible, located, named confirmation that the student's input contributed somewhere specific.
  - **Covered by:** R1, R2, R3, R4, R5, R6

- F2. **Sprout growth toward bloom threshold**
  - **Trigger:** Subsequent captures linked to a claim that has an active sprout.
  - **Actors:** A1, A3, A5
  - **Steps:** (1) Particle from F1 lands on the existing sprout. (2) Sprout adds one leaf (visual increment) and updates a floating count badge `({n}/{threshold})`. (3) When `evidenceCount ≥ threshold` OR `strength === 'high'` (rare early shortcut), sprout enters **ready-to-bloom** state: a soft pulsing rim-light + slow vertical bob; a side panel "Ready to plant" tray counter increments. (4) Ready-to-bloom sprouts persist across sessions until tapped.
  - **Outcome:** Student can see exactly how close each sprout is to bloom; the island always renders ground truth without page reload.
  - **Covered by:** R7, R8, R9, R10

- F3. **Bloom CTA — student summons the object**
  - **Trigger:** Student taps a ready-to-bloom sprout (or taps a row in the "Ready to plant" tray, which focuses the matching sprout and then triggers).
  - **Actors:** A1, A5
  - **Steps:** (1) Camera flies to the sprout (~700ms ease). (2) Bloom animation plays (~1.5s): sprout dissolves into upward particles; the full ValueTree / InterestFlower / SkillFruit emerges from the ground with a scale-up from 0 to its target size; subtle audio cue. (3) Narration panel opens to the right summarizing the claim, the linked evidence, and the verbatim quotes — same panel currently used for hotspot clicks. (4) Sprout state in the scene model is replaced with the full object descriptor; the placementSeed is preserved so the object appears at the same spot the sprout grew. (5) A "Confirmed" badge appears on the object if the underlying claim already has `evidenceState === 'confirmed'`; otherwise it stays semi-transparent with the existing pending styling, and confirmation later just shifts opacity and adds a shimmer.
  - **Outcome:** The student actively chooses the moment of growth; the celebration is bound to their tap, not a background event.
  - **Covered by:** R11, R12, R13, R14, R15

- F4. **Capture that links to nothing**
  - **Trigger:** Verifier drops all proposed entries (no quote matches, or all linked claims are forgotten).
  - **Actors:** A1, A4, A5
  - **Steps:** (1) No particles fly to the island. (2) A neutral, non-failure toast appears: `Captured. Still listening for patterns.` (3) No island change, no error UI. (4) The raw Mirror entry persists as before; future captures may retroactively unlock a sprout once the corpus accumulates enough signal for a claim.
  - **Outcome:** Students whose first one or two captures don't yet form a claim are not told they failed; they are told the system is still listening. No silent confusion.
  - **Covered by:** R16

---

## Requirements

**Bloom threshold & predictability**
- R1. Each sprout has a **bloom threshold of 3 evidence pieces** for trees (Values), 3 for flowers (Interests), and 2 for fruits (Skills, because they are already attached to existing trees and have a lower visual cost). These numbers MAY be tunable via a single config object in `src/components/world/progression.ts`; they MUST NOT be hardcoded across multiple files.
- R2. **Early-bloom shortcut:** if the Connector emits `strength === 'high'` on the *first* accepted entry for a brand-new claim, the sprout MAY skip directly to ready-to-bloom on its first appearance. This preserves the rare case where one capture is genuinely diagnostic (e.g., a high-confidence Values claim from a strongly-worded reflection) without forcing students to manufacture more captures than the data warrants.
- R3. Each sprout displays a **floating count badge** `({n}/{threshold})` in screen-space above its 3D position. Badge typography matches existing hotspot label style.

**Per-input feedback (particle + toast)**
- R4. Each accepted timeline entry triggers exactly one **particle animation** from the capture UI position to the on-island target. Particle color is the dimension color (Values / Interests / Personality / Skills) already used elsewhere in the scene. Duration ~1.0s with ease-out.
- R5. Each particle landing produces a **transient toast** anchored near the landing point: `+1 evidence · {claim_label} ({count}/{threshold})` for growth; `New sprout · {claim_label} (1/{threshold})` for first-time spawn; `Ready to bloom · {claim_label}` if the increment crosses the threshold. Toast auto-dismisses after 2.4s.
- R6. **Particle target** for a growth event is the existing tree/flower/fruit at the matching `claimId`. **Particle target** for a new-claim event is the deterministic placement coordinate computed from `placementSeed` (already used by `positionOnIsland(seed)` in `src/components/world/island.ts:42-49`).

**Live scene updates (no page reload)**
- R7. The world scene MUST subscribe to a typed event stream (`capture-linked`, `sprout-spawned`, `sprout-bloomed`, `evidence-confirmed`) and apply the corresponding mutations to `VipsWorldSceneModel` *in place*. A full re-render of the scene is NOT acceptable; only the affected mesh transforms / materials should update.
- R8. The event stream MUST be the single source of truth for live updates. On page reload, `buildVipsWorldSceneModel` continues to be the source of initial state; the event stream replays nothing on reload — it only handles deltas from the moment of subscription.
- R9. New claims that have not yet reached the bloom threshold MUST be representable in the scene model as `SproutDescriptor` (new type), distinct from `ValueTreeDescriptor` / `InterestFlowerDescriptor` / `SkillFruitDescriptor`. Sprouts hold: `{ id, claimId, dimension, label, evidenceCount, threshold, readyToBloom, placementSeed, timelineEntryIds[] }`.
- R10. When a sprout blooms, the scene model MUST atomically replace the `SproutDescriptor` with the appropriate full descriptor (Tree / Flower / Fruit), preserving `placementSeed` so the object appears at the sprout's location. The sprout's `timelineEntryIds` MUST be carried forward onto the new descriptor.

**Bloom CTA & celebration**
- R11. Ready-to-bloom sprouts MUST have a visible **pulsing glow** (rim-light shader or equivalent) and a slow vertical bob (~3px amplitude, 2.5s period). Effect remains until the student taps.
- R12. A persistent **"Ready to plant" tray** in the world UI displays the count of bloom-ready sprouts. Tapping a row in the tray focuses the camera on the matching sprout and triggers bloom — same animation as tapping the sprout directly.
- R13. The bloom animation MUST be approximately 1.5s end to end: 700ms camera fly-in (ease-out), 800ms bloom (sprout dissolve into upward particles + full object scale-up from 0 to target). The narration panel opens during the last 400ms of the bloom so the student arrives at it with the object already in place.
- R14. A subtle **audio cue** plays on bloom — soft chime, default volume low. This MUST respect the existing global audio mute setting (whatever already governs world audio) and MUST NOT play if `prefers-reduced-motion` is set; in that case the bloom animation also reduces to a cross-fade (~200ms) and no camera fly-in.
- R15. After bloom, the narration panel reuses the **existing hotspot panel** (`src/components/world/hotspots.ts`) — same layout, same evidence-quote rendering, same Strength signal. No new panel surface.

**Capture-with-no-link**
- R16. When the verifier drops all proposed entries from a capture, the UI MUST show a neutral toast `Captured. Still listening for patterns.` for 2.4s. NO error styling, NO failure language, NO mention of the verifier internals. The Mirror entry is persisted as today.

**Forgetting & demotion**
- R17. If a student "forgets" the timeline entry that was the *only* evidence supporting a sprout, the sprout MUST disappear with a gentle dissolve animation (~600ms). No celebration, no error — the act of forgetting is the student's prerogative and the island reflects it.
- R18. If a student "forgets" enough timeline entries to push a fully-bloomed object back below its threshold, the object MUST NOT revert to a sprout. It stays as the full object but its scale / opacity recompute via the existing formulas. This avoids a "negative bloom" UX that would feel punitive.
- R19. Sprouts and bloom-ready states MUST NOT count `forgotten` evidence toward their thresholds. This must match how the existing scene model treats forgotten entries.

**Accessibility & performance**
- R20. All animations MUST honor `prefers-reduced-motion`: particle animations collapse to a fade, sprout pulse becomes a static glow, bloom animation becomes a cross-fade. Toasts and tray UI are unchanged — they are not motion-dependent.
- R21. Per-particle GPU cost MUST be bounded: at most 1 particle in flight per capture, and at most 6 simultaneous in-flight particles globally (queue any overflow). This bounds the worst case where a single capture surfaces many linked entries.
- R22. The "Ready to plant" tray MUST be keyboard-navigable and screen-reader-labelled (`Ready to bloom: {label}, {dimension}, {count} evidence`).

---

## Scope Boundaries

**In scope (this brainstorm → planning):**
- Sprout descriptor + live scene mutation
- Per-input particle + toast feedback
- Ready-to-bloom pulse + tray
- Student-triggered bloom animation + narration panel reuse
- Forgetting interactions for sprouts
- Reduced-motion fallbacks

**Deferred for later (explicitly not in v1):**
- Configurable per-student thresholds (e.g., "I want to feel each tree more, raise to 5"). v1 uses fixed defaults.
- Sprout-to-sprout merging when the Connector decides two pending claims are actually the same. Out of scope unless the Connector already does this; if it does, the world scene treats the merge as a delete + new spawn.
- Multi-student leaderboards or comparison views.
- Sound design beyond a single chime.
- Tutorial / onboarding overlay explaining the sprout-bloom mechanic. v1 ships with discoverability via the tray label and the first sprout's "tap to plant" affordance.

**Outside this product's identity:**
- Generic XP / level / badge systems. The progression is **evidence → claim**, not points. We do not show a numeric score or a "level" anywhere. Counts (`2/3`) are scoped to a specific claim, not to the student overall.
- Streaks. Streaks would push students to capture even when they have nothing to say, which contradicts the reflection-quality posture of the product.
- Forced bloom (auto-bloom after some timeout). Bloom is always student-triggered. Sprouts can sit ready indefinitely.

---

## Success Criteria

- S1. A student records a single Mirror session producing N accepted entries and observes N particles, N toasts, and the corresponding island deltas — without refreshing the page.
- S2. A student looking at the island can name, for at least one sprout, how many more captures they need before it blooms. (Verifies predictability.)
- S3. A student who has at least one ready-to-bloom sprout finds the "Ready to plant" tray and triggers a bloom without prior instruction. (Verifies discoverability.)
- S4. With `prefers-reduced-motion` on, the bloom flow is still completable — sprout becomes object, narration panel opens — but no large camera movement or particle storm occurs.
- S5. A student who forgets a sprout's only evidence sees the sprout disappear; a student who forgets evidence from a bloomed object sees the object shrink/fade but not revert.

---

## Dependencies / Assumptions

- The Connector + verifier pipeline already emits per-entry decisions per Mirror session. (Verified in `docs/brainstorms/2026-05-11-vips-wiki-pivot-requirements.md` R6–R10.) This brainstorm assumes that decision stream can be exposed as a typed event to the world scene with minimal backend change — likely a server-sent stream or a post-session payload the client replays on completion. The exact transport is a planning decision, not a brainstorm decision.
- `placementSeed` already exists on every descriptor and produces stable positions via `positionOnIsland(seed)`. New sprouts use the same mechanism so their later bloomed form occupies the sprout's exact location.
- The narration panel (`src/components/world/hotspots.ts`) is reusable as-is for bloom completion. Verified at the file-existence and shape level; planning should confirm by tracing one hotspot click end-to-end.
- The 3D scene already supports adding/removing meshes after initial build (the mood pins update over time). Live sprout spawn should follow that pattern; planning should confirm by inspecting how mood pins are added.
- `prefers-reduced-motion` handling — assumed not yet wired into the world scene. May require new infrastructure; flag in planning.

---

## Open Questions for Planning

These do not affect the *what*; they affect the *how* and should be resolved in `/ce-plan`:
- Transport for the live event stream (SSE, websocket, polling on session-complete, or single bulk payload after the Connector finishes).
- Exact shader / material strategy for the pulsing glow (existing materials may already support emissive; if not, planning chooses between rim-light shader or post-process bloom on the sprout mesh).
- Whether the "Ready to plant" tray lives inside the existing world UI overlay or is a new component.
- How forgotten-evidence cascades surface in the live stream (does the backend emit `evidence-forgotten` events, or does the client recompute on next page load only?).

---

## Notes

This requirements doc keeps the existing VIPS architecture and treats the island progression as a *rendering* of claims the system already infers — not as a parallel XP mechanic. The "more inputs → more objects" intuition is correct, but the *rule* is "inputs become evidence; evidence supports claims; claims become trees/flowers/fruit." The sprout is the visible intermediate state that has been invisible until now.

---

## Implementation note (2026-05-18)

v1 shipped on `feat/island-object-progression` per [docs/plans/2026-05-18-002-feat-island-object-progression-plan.md](../plans/2026-05-18-002-feat-island-object-progression-plan.md). Two substantive deviations from the brainstorm framing — both surfaced and resolved during ce-doc-review:

1. **Substrate**. The brainstorm referenced `src/components/world/*` (trees.ts / vipsWorldMapping.ts / hotspots.ts). Those files are dormant since the engine port; the live home route mounts `StudentSpaceHost` → the vendored engine under `src/engine/student-space/Game/`. v1 lives entirely in the engine. See [docs/solutions/2026-05-18-island-progression-engine-substrate.md](../solutions/2026-05-18-island-progression-engine-substrate.md) for the rule of thumb future authors should apply.

2. **Single-species v1**. The brainstorm assumed sprouts would derive species from VIPS claim dimension (Values/Interests/Personality/Skills). The Connector → verifier pipeline is not currently invoked from the home route, so v1 ships single-species (trees only, cycling oak/cherry by sprout createdAt index). Species variety driven by claim dimension is v2 work, alongside a Mirror → AutoConnector → engine bridge that the original Open Questions section already flagged. The `Sprout.captureRefs[]` field is the join key v2 will use to map captures → claims without invalidating v1 state.

The R1–R22 surface is preserved with two narrow adaptations: R5's toast copy uses reflection-voice ("Heard. Something is growing on the island.") rather than points-style ("+1 toward ..."), and R15's narration panel is the engine's `ObjectPeek` sprout kind rather than the dormant hotspot panel. The brainstorm's "Outside this product's identity" stance (no XP, no streaks, no auto-bloom) is honored throughout.
