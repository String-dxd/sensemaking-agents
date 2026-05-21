# PR description for `feat/island-object-progression`

> **Draft** — review this, then run the push + gh pr create at the bottom.

---

## Title

```
feat: island progression — captures grow species-tagged objects (v1)
```

(64 chars — under the 70 target.)

---

## Body

```markdown
## Summary

- Every capture earns a cinematic beat: camera glides to the active sprout on the island, holds while the badge ticks, then returns. Threshold-crossing capture stays focused and auto-blooms in the same beat — no tap, no tray, no deliberate plant step. One continuous flow per capture.
- After each capture submit, a small modal asks the student: *"What is this about?"* — Value / Interest / Personality / Skill. The pick is recorded on the capture AND locks the species of the sprout it lives in. The first capture's tag determines what eventually grows.
- Species determines the bloomed object: Value → tree, Interest → flower, Personality → butterfly, Skill → fruit. Mood pins auto-tag as Personality (mood is emotional state by construction). Single sprout always growing at a time; bloom replaces it with a persistent island object that survives reload.

## What's in the diff

Engine state (`src/engine/student-space/Game/State/`):
- New `Sprouts.js` slice — third state alongside MoodPins and Captures. Singleton + subscribe + persist + try/catch boundary. Snapshot accessors return referentially-stable references so React's `useSyncExternalStore` works correctly.
- `Sprouts.d.ts` companion types. Species enum: `pending | tree | flower | butterfly | fruit`. Dimension enum: `values | interests | personality | skills`.
- `wireSproutsToCaptures(captures, moodPins, sprouts)` helper — subscribes Sprouts to both capture sources; defense-in-depth try/catch so a buggy `grow` cannot break host slice persistence.
- `Captures.patch(id, updates)` — new method mirroring `MoodPins.patch`; used by the chip picker to attach dimension post-submit.
- `Sprouts.setDimensionForFirstCapture(captureId, dimension)` — locks species (first capture in sprout only); can flip readyToBloom if threshold shifts.
- `schema.js` — extended `mergeSprout` + `mergeCapture` with new dimension fields; lenient enum guards.
- `Persistence.js` / `Game.js` / `State.js` / `index.d.ts` — wired through KEY/SLICES/empty/dispose/host surface.

Engine view (`src/engine/student-space/Game/View/`):
- New `Sprouts.js` view module — per-sprout 3D mesh (stem + leaves + glow ring), DOM count badge projected to screen, ready-to-bloom pulse + bob, dissolve animation, click handler with drag-guard.
- Camera flow state machine — `flying → holding → (blooming →) returning`. Mirrors ObjectPeek's camera math (`view.camera.zoomTo` / `restoreZoom`). Concurrent events during in-flight flow update visuals without restarting the camera.
- Species-specific bloomed object builders: tree (existing oak/cherry), flower (6-petal with color hash), butterfly (4-wing hover on stem with color hash), fruit (3-icosphere bush with berries).
- Reduced-motion path: skip camera, brief tap-ack glow flash, dissolve+grow collapse to 200ms cross-fade.
- Wired into `View.js` update/dispose chain.

React layer (`src/components/`):
- New `IslandProgressionOverlay.tsx` — reflection-voice toasts on every grow/bloom event. Listens for `ss:sprout-tap-not-ready` CustomEvent to surface "Still growing — 2/3" feedback.
- New `CaptureTagPicker.tsx` — modal with 4 chips after each capture submit. Queues rapid-fire captures; ignores patch re-fires; defensive against partial game objects.
- `StudentSpaceHost.tsx` — lifts Game ref into React state; mounts both overlays once the engine boots.

Tests (`test/`):
- Sprouts unit tests (19): threshold progression, dedup, snapshot stability, hydrate-no-fan, persistence round-trip, singleton guard, subscriber crash isolation, dimension lock, threshold shift on tag.
- Cross-slice integration (9): captures→sprouts wiring, mood patch dedup, subscriber-throw isolation, mood auto-tag (spawn vs join).
- Component tests (12): tray + toasts, partial-game safety, CustomEvent listener, chip picker render/queue/pick/unmount.
- e2e (4): full chain from `captures.add()` through React overlay.
- 48 tests across the feature, 285 passing in the full suite.

Origin: `docs/brainstorms/2026-05-18-island-object-progression-requirements.md`
Plan: `docs/plans/2026-05-18-002-feat-island-object-progression-plan.md`
Substrate learning: `docs/solutions/2026-05-18-island-progression-engine-substrate.md`

## Design decisions worth review

- **Substrate**: live engine at `src/engine/student-space/Game/`. The legacy `src/components/world/*` layer was removed in the 2026-05-21 cleanup; the solutions entry documents the substrate decision so future contributors don't re-derive.
- **Species mechanism**: student tags V/I/P/S explicitly after capture (Path B per the iteration). Rejected modality-driven heuristic (Path A) after dogfooding showed it didn't match how captures actually work — a photo of teamwork is a value, not an interest. Rejected full Mirror→Connector v2 because the home route isn't wired to Mirror yet.
- **First-capture-wins species lock**: simpler model than blending. The student learns: the FIRST thing you tag in a sprout determines what it becomes.
- **Mood pins skip the picker**: auto-tag as Personality. Less friction; mood is inherently emotional state.
- **Auto-bloom in same camera moment**: threshold-crossing capture goes camera-fly → hold → bloom → return as one beat. No tap-to-plant step. Trades the brainstorm's deliberate plant moment for a smoother cinematic.
- **Tray removed**: with auto-bloom, sprouts never sit in ready-and-waiting state for the student to discover.
- **Bloomed mini-objects spawned in Sprouts view**, NOT through `Tree.js` / `Flowers.js` / `Fruits.js` InstancedMesh runtime-add. Those modules bake instance counts at boot; surgery on them was flagged in the plan as the heaviest unit and not worth it for v1. Mini-objects are small low-poly inline geometries.

## Test plan (dogfood)

- [ ] Capture once via FAB (ask or photo); camera flies to sprout, picker modal appears asking V/I/P/S; pick → camera returns
- [ ] Capture twice more (3 total ask/photo); badge climbs 2/3, then auto-blooms on threshold
- [ ] Each species visibly different on bloom:
  - Tag Value → mini-tree (oak or cherry)
  - Tag Interest → flower with hash-colored petals
  - Tag Personality → butterfly hovering on a thin stem
  - Tag Skill → bush with berries (blooms at 2, not 3)
- [ ] Mood pin → no picker, auto-tags as Personality → butterfly
- [ ] Tap a still-growing sprout → "Still growing — N/threshold" toast
- [ ] Reload → bloomed objects persist; active sprouts and counts persist
- [ ] `prefers-reduced-motion` → bloom collapses to 200ms cross-fade, no camera fly, no chime
- [ ] StrictMode double-mount: engine cleanly disposes and re-mounts (smoke via `test/engine/StudentSpaceHost.test.tsx`)

## Follow-ups / deferred

- **Camera flow holistic review** — `view.camera.zoomTo` now has 3 consumers (ObjectPeek, KiraNarrator, Sprouts) and the camera only saves pre-zoom state once. Chained/interleaved zooms may restore to the wrong state. Tracked in `docs/followups.md`.
- **Growing sprout species hint** — sprouts look generic (green stem + leaves) while growing; the species visual only appears at bloom. May want to surface a subtle hint (color tint, leaf shape) once tagged. Defer pending feedback.
- **Finer-grained tags** — V/I/P/S only in v1. The engine's `vipsTaxonomy.js` already has sub-claims (Teamwork, Curiosity, …). Adding a second-level picker is a follow-up.
- **Mirror → Connector v2** — the brainstorm's original vision had AI-classified species from `runAutoConnectorAfterMirror`. The home route isn't wired to Mirror yet; v2 work tracked separately.
- **U4 (per-capture DOM particle trail)** — deferred as polish; toast + count badge + camera-fly already deliver per-input feedback.

## Notes for review

- Branch was merged with main at `9abef80` to pick up `c7e9bbc fix(student-space): unstick onboarding flow`. Onboarding now works end-to-end.
- The existing `MoodPins.js` / `Captures.js` slices were unchanged behaviorally (Captures gained a `patch` method, mirroring MoodPins.patch). No breaking changes to existing engine consumers.
- `Sound.playOneShot('bloom')` reuses the existing engine audio path. No new AudioContext (which would have collided with `MirrorSession.tsx`'s MediaRecorder).
```

---

## Push + open PR commands

```bash
git push -u origin feat/island-object-progression
gh pr create \
  --title "feat: island progression — captures grow species-tagged objects (v1)" \
  --body-file <(awk '/^## Body$/{flag=1;next}/^## Push/{flag=0}flag' docs/pr-island-object-progression-draft.md | sed 's/^```markdown$//; s/^```$//')
```

(The awk extracts the body section between `## Body` and `## Push`; the sed strips the markdown code fences.)
