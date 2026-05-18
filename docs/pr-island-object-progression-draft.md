# Draft PR description for `feat/island-object-progression`

> **Draft only** — saved here so it's ready when you're at a keyboard.
> Branch is one commit behind main (`c7e9bbc fix(student-space): unstick onboarding flow`); rebase or merge main before pushing.

---

## Title

```
feat: island progression — captures grow sprouts into trees (v1)
```

(63 chars — under the 70-char target.)

---

## Body

```markdown
## Summary

- Every capture (ask / photo / mood pin) now visibly contributes to the island. A small sprout appears on the plateau; its count badge tracks `n/threshold` overhead; the third capture flips it to "Ready," pulsing with a warm glow. Tap the pulsing sprout → it dissolves and a persistent oak (or cherry) grows in its place over ~1.2s, with a `Sound.playOneShot('bloom')` chime.
- Shipped as a third engine state slice (`Game/State/Sprouts.js`) alongside MoodPins/Captures, plus a Sprouts view module (`Game/View/Sprouts.js`) for 3D rendering, plus a small React overlay (`IslandProgressionOverlay.tsx`) for the "Ready to plant" tray and reflection-voice toasts.
- v1 is single-species (trees only, cycling oak/cherry per sprout index) and pure-client; the brainstorm's VIPS claim-binding path (sprout species = inferred Value/Interest/Personality/Skill dimension) is explicitly deferred to v2 along with a Mirror → AutoConnector → engine bridge. `Sprout.captureRefs[]` carries the join key v2 will use.

## What's in the diff

| Layer | File | What |
|---|---|---|
| State | `Game/State/Sprouts.js` (+ `.d.ts`) | Singleton slice with `grow`/`bloom`/`subscribe`. Snapshot accessors (`recent`, `getActive`) cache referentially-stable references for React's `useSyncExternalStore`. |
| State | `Persistence.js`, `schema.js`, `State.js`, `Game.js`, `index.d.ts` | Three-file extension contract (KEY, SLICES, empty default) + `Sprouts.instance` nulling in `Game.dispose()` to survive StrictMode double-mount + `mergeSprout` lenient schema. |
| State | `wireSproutsToCaptures` helper (in Sprouts.js) | Bridges Captures + MoodPins subscriptions to Sprouts.grow with try/catch wrappers. The engine's subscriber loop does NOT swallow exceptions, so a throwing `grow` would otherwise abort fan-out and skip `_persist`. |
| View | `Game/View/Sprouts.js` | Per-sprout group (stem + leaf cluster + glow ring) reconciled from slice events. DOM count badge projected by world-coord. Click handler raycasts ALL active sprouts: ready → bloom, not-ready → tap-acknowledgement bump + CustomEvent for the overlay. Persistent mini-tree (trunk + 3-icosphere canopy) grows from scale 0→1 over 1.2s on bloom. |
| View | `Game/View/View.js` | Wires Sprouts into `update()` + dispose chain. |
| UI | `components/IslandProgressionOverlay.tsx` | React tray (bottom-center, above mood-hud) + reflection-voice toasts via `useSyncExternalStore`. Listens for `ss:sprout-tap-not-ready` CustomEvent to surface "Still growing — 2/3" feedback. |
| UI | `components/StudentSpaceHost.tsx` | Lifts `Game` ref into React state and mounts the overlay once the engine boots. |

## Tests

38 tests across the feature, all passing:

- 16 unit tests on the Sprouts state slice (threshold progression, dedup on patch re-fire, snapshot stability, hydrate-no-fan, persistence round-trip, singleton guard, subscriber crash isolation)
- 7 integration tests on the cross-slice wiring helper (captures → sprouts, mood patch re-fire safety, subscriber-throw isolation)
- 7 component tests on the overlay (tray visibility, toast variants, partial-game safety, CustomEvent listener cleanup)
- 4 e2e tests (`Progression.e2e.test.tsx`) chaining real Captures + real Sprouts + real overlay through `captures.add()`
- 4 existing StudentSpaceHost lifecycle tests still pass unchanged

`pnpm build` clean.

## Design decisions worth surfacing for review

- **Substrate**: live engine at `src/engine/student-space/Game/`, not the dormant `src/components/world/*`. See `docs/solutions/2026-05-18-island-progression-engine-substrate.md` for the rule of thumb.
- **InstancedMesh strategy**: bloomed trees are spawned as small per-instance meshes inside `Game/View/Sprouts.js` rather than pre-allocating spare slots in `Tree.js`. Preserves the celebration moment without surgery on the baked InstancedMesh sizing; v2 can revisit.
- **Single-species v1**: explicitly chose to ship trees-only after doc-review flagged that rotation-by-index = Tamagotchi-shaped feedback the brainstorm explicitly disclaimed. Species variety is v2 when claim dimension can drive it meaningfully.
- **Connector deferred**: `runAutoConnectorAfterMirror` exists but is not invoked from `persistMirror` today. v1 uses pure-client engine state; v2 is a separate plan.
- **Toast voice**: reflection-style ("Heard. Something is growing on the island.") not points-style ("+1 toward tree"). Per doc-review's product-lens finding.

Origin: `docs/brainstorms/2026-05-18-island-object-progression-requirements.md`
Plan: `docs/plans/2026-05-18-002-feat-island-object-progression-plan.md`

## Test plan

- [ ] Open the home page; verify the island still renders before any captures
- [ ] Capture once via the FAB → sprout appears, `1/3` badge above it, toast "Heard. Something is growing on the island."
- [ ] Capture twice more → badge climbs to `2/3` → `Ready`; sprout pulses with warm gold glow; "Ready to plant · 1" tray appears bottom-center
- [ ] Tap the pulsing sprout → chime plays, sprout dissolves, oak grows in place over ~1.2s, toast "Planted. A new tree on the island."
- [ ] Tap a NOT-ready sprout → brief scale bump, toast "Still growing — 2/3"
- [ ] Reload the page → bloomed tree persists in the same spot; active sprouts and their counts persist
- [ ] Add a 4th capture after a bloom → new sprout appears (separate species per rotation), not added to the bloomed tree
- [ ] Capture via mood pin → grows the same active sprout (not a separate one) — proves the moodPins → sprouts wiring
- [ ] Test `prefers-reduced-motion` (macOS: System Settings → Accessibility → Display → Reduce Motion) → bloom collapses to a 200ms cross-fade, no camera fly-in, no chime, no particle storm
- [ ] StrictMode double-mount: navigate away and back → engine cleanly disposes and re-mounts; no duplicate sprouts

## Follow-up / deferred

- **U4 (capture particles)** — particles flying from FAB to sprout target. Deferred as polish; toast + count badge + sprout pulse already give per-input feedback. Plan: `docs/plans/2026-05-18-002-feat-island-object-progression-plan.md`.
- **v2 — VIPS claim binding** — bridge captures → Mirror → AutoConnector → engine. Sprout species/labels become claim-dimension-driven. `Sprout.captureRefs[]` is the v2 join key.
- **v2 — Reduced-motion celebratory beat** — 200ms cross-fade may need a non-motion accent (color flash, haptic). Defer until first reduced-motion user reports a feel issue.

## Branch state notes

- One commit behind main (`c7e9bbc fix(student-space): unstick onboarding flow`). Rebase or merge main before final review.
- 13 commits on the branch (3 docs, 10 feature/chore). Conventional commits throughout; merge-as-is is OK if you prefer a cleaner main history.
```

---

## Command to open the PR (when ready)

```bash
git push -u origin feat/island-object-progression
gh pr create \
  --title "feat: island progression — captures grow sprouts into trees (v1)" \
  --body-file docs/pr-island-object-progression-draft.md
```

(Strip the "Draft PR description" heading and the "Branch state notes" / "Command" sections before piping to `gh pr create`; the body is everything between `## Body` and `## Branch state notes`.)
