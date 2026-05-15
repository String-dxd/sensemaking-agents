---
title: "feat: Bring richer Student Space world assets into the island"
type: feat
status: shipped
date: 2026-05-14
deepened: 2026-05-14
origin: docs/plans/2026-05-13-001-feat-student-space-world-stage-plan.md
followup: docs/plans/2026-05-14-003-feat-world-data-connectors-plan.md
---

# feat: Bring richer Student Space world assets into the island

## Summary

Upgrade the current VIPS world stage with more of the latest private `wondopamine/student-space` visual language: richer trees, articulated butterflies, fruit bushes, a calmer Kira-style resident bird, and selected atmospheric scene effects. This is a follow-up to the completed world-stage plan. It expands the visual/reference boundary, but still does not port Student Space product state, sheets, seed data, navigation, or persistence.

The goal is for the island to feel more alive and authored without changing what the app believes about the student. The existing app remains the source of truth for Mirror, Connector, Cartographer, VIPS timelines, review status, routing, auth, and persistence.

## Problem Frame

The current app already has a working Three.js island surface in `src/components/world/*`, with values as trees, interests as flowers, skills as fruit, recent reflections as butterflies, and a prompt bird. The latest Student Space repo is now more than the original three tree assets: it has procedural references for tree foliage, butterflies/fireflies, fruit bushes, Kira, aurora, rain, particles, sky, grass, and tuning docs. We should use those as a richer visual source while preserving this repo's evidence-driven scene model and React-owned UI.

## Requirements

- R1. Keep the real product model unchanged: Three.js code renders descriptors from `buildVipsWorldSceneModel`; it must not fetch, infer, persist, confirm, forget, or mutate VIPS evidence.
- R2. Expand the Student Space visual source boundary beyond the three public tree assets to include adapted procedural visual recipes from `student-space-v1/sources/Game/View/*`.
- R3. Do not import Student Space runtime modules directly. Adapt the visual recipes into this app's TypeScript, Three `0.184.0`, SSR-safe lifecycle, tests, and disposal patterns.
- R4. Preserve the existing app UI and flows: Mirror recording, Library, Connector review, Trajectory, profile/auth, and floating actions remain React-owned DOM.
- R5. Add richer value-tree silhouettes for all value species, not only oak/cherry. Existing approved GLBs stay useful for oak/cherry-like trees; the remaining species should be app-owned procedural variants inspired by Student Space.
- R6. Upgrade butterflies from simple wing sprites into articulated low-poly creatures, with optional dusk/firefly behavior that still represents recent Mirror entries.
- R7. Rework skill fruits toward Student Space's fruit-bush direction unless product review says fruit-on-value-tree is semantically more important. If bushes are used, they must still expose which skill and evidence they represent.
- R8. Replace or evolve the current prompt bird toward Kira's calmer resident-bird visual language and motion rules, while avoiding Student Space dialogue/product copy unless explicitly chosen later.
- R9. Bring in selected scene effects in priority order: twilight/sky polish, particles, aurora, firefly fold, then rain/weather. Effects must be subtle and reduced-motion aware.
- R10. Keep WebGL fallback, keyboard-accessible DOM controls, screen-reader names, and reduced-motion behavior intact.
- R11. Keep test coverage at the descriptor and component-boundary layers, and add targeted Three object tests where practical.
- R12. Verify visually in browser on desktop and mobile-sized viewports before shipping.

## Scope Boundaries

- No backend, database, agent prompt, Managed Agents, auth, tenancy, or persistence changes.
- No import of Student Space `State`, `View`, `Game`, seed data, sheets, debug studio, calendar, letters, profile, localStorage schema, or CSS chrome.
- No wholesale copy of `student_space_island_v0.html`.
- No new student-facing Kira dialogue system in this plan. The bird may expose one prompt/hotspot through the existing prompt-bird affordance, but conversational behavior stays out unless separately planned.
- No new capture modes or mood-journaling product flow. Mood visuals can be referenced later, but this plan is about world assets and atmosphere.
- No exact dependency downgrade to Student Space's Three `0.149.0` or Vite `4.1.0`; this app stays on its current stack.
- No external CDN for Draco decoders, textures, or effects. Assets must be served locally through this app.

## Current App Context

- `src/components/world/createWorldScene.ts` owns the browser-only Three lifecycle, renderer, composer, camera, scene graph, raycasting, animation loop, and disposal.
- `src/components/world/vipsWorldMapping.ts` already outputs plain descriptors for `terrain`, `trees`, `flowers`, `fruit`, and `butterflies`.
- `src/components/world/trees.ts` already loads `oakTreesVisual.glb`, `cherryTreesVisual.glb`, and `foliageSDF.png`, then falls back to procedural trees.
- `src/components/world/butterflies.ts`, `src/components/world/fruits.ts`, `src/components/world/flowers.ts`, `src/components/world/island.ts`, `src/components/world/sky.ts`, and `src/components/world/promptBird.ts` are the main visual modules to evolve.
- `src/components/WorldScene.tsx` and `src/components/WorldStage.tsx` own React integration and fallback behavior.
- Existing tests to extend include `test/world/vipsWorldMapping.test.ts`, `test/components/WorldScene.test.tsx`, `test/components/WorldStage.test.tsx`, `test/components/FloatingWorldActions.test.tsx`, and `test/components/CaptureActionMenu.test.tsx`.

## Student Space Reference Inventory

| Reference file | What to use | How to adapt |
| --- | --- | --- |
| `student-space-v1/public/trees/oakTreesVisual.glb` | Existing oak/tree-body asset | Keep as approved asset in `public/world/trees/`. |
| `student-space-v1/public/trees/cherryTreesVisual.glb` | Existing cherry/tree-body asset | Keep as approved asset in `public/world/trees/`. |
| `student-space-v1/public/trees/foliageSDF.png` | Foliage mask for billboard leaf clouds | Keep as approved texture and reuse across trees/bushes where appropriate. |
| `student-space-v1/sources/Game/View/Tree.js` | Billboard leaf-cloud recipe, wind shader, sun-facing canopy shading | Adapt into `trees.ts` and shared foliage helpers. Remove singleton `View/State/Debug` dependencies. Use local Draco path. |
| `student-space-v1/sources/Game/View/Butterflies.js` | Articulated body, lobed wings, antennae, figure-eight motion, firefly fold | Adapt into `butterflies.ts` while keeping evidence state, recency, hotspots, and deterministic placement. |
| `student-space-v1/sources/Game/View/Fruits.js` | Fruit-bush metaphor, berry clusters, bush foliage reuse | Adapt into `fruits.ts`; decide whether fruit stays on trees or moves to bushes through descriptor metadata. |
| `student-space-v1/sources/Game/View/Kira.js` | Standing bird mesh catalog, calmer walk/settle motion, species palettes | Adapt into `promptBird.ts` or a new `residentBird.ts`; keep one resident, not a customization feature. |
| `student-space-v1/sources/Game/View/Aurora.js` | Twilight aurora ribbons and opacity timing | Adapt as optional `sceneEffects/aurora.ts`, driven by local terrain/time descriptors. |
| `student-space-v1/sources/Game/View/Fireflies.js` | Small glowing night sprites | Prefer integrating with butterflies' dusk fold before adding a separate layer. |
| `student-space-v1/sources/Game/View/Particles.js` | Sparse ambient motes | Adapt early because it is low-risk and high atmosphere. |
| `student-space-v1/sources/Game/View/Rain.js` | Rain streaks and refractive overlay | Defer or simplify. Full framebuffer refraction is high complexity and easy to overdo. |
| `student-space-v1/sources/Game/View/Sky.js`, `Aurora.js`, `CssSky.js` | Twilight signature and sky palette | Adapt palette/timing ideas into existing `sky.ts` rather than porting the full custom render pipeline. |
| `docs/asset-tuning-guide.md`, `docs/companion-bird.md`, `DESIGN.md` | Tuning constraints and tone | Use for visual QA, not runtime code. |

## Key Technical Decisions

- Use adaptation, not module import. Student Space classes depend on singleton `Game`, `View`, `State`, `Debug`, localStorage, and Vite GLSL assumptions. This app should keep small functional factories that receive descriptors and return `THREE.Object3D`.
- Add a thin world-style layer. Shared palette, wind, time-of-day, and effect intensity should live in app-owned modules so trees, butterflies, fruits, bird, and effects do not each invent their own constants.
- Keep descriptors explicit. If fruits move from trees to bushes, `SkillFruitDescriptor` should expose `host: 'tree' | 'bush'` or equivalent so tests and hotspots know what happened.
- Keep hotspots product-owned. Every visual object that maps to evidence should still attach a `WorldHotspot` from `hotspots.ts`. Decorative effects should not become clickable.
- Prefer inline shader strings or TS modules over adding `vite-plugin-glsl`. Avoid build-config churn unless shader reuse becomes painful.
- Use local decoder assets only if the current GLBs require Draco. `trees.ts` currently points at `/world/draco/`; implementation should verify the files exist or remove Draco if unnecessary.
- Effects should degrade independently. If aurora/rain/particles fail, the island, capture controls, and fallback UI should still work.
- Reduce motion should reduce continuous motion amplitude and disable nonessential effects, not blank the scene.
- First pass should ship in layers: core asset upgrades first, then atmosphere. Rain is last because it touches render-order and framebuffer assumptions.

## High-Level Technical Design

This is a planning sketch, not an implementation contract. The important shape is the boundary between product evidence, scene descriptors, reusable visual helpers, and disposable Three objects.

```text
route loader / existing queries
  -> buildVipsWorldSceneModel(input)
      -> terrain, trees, flowers, fruit, butterflies, residentBird, effects
          -> createWorldScene({ model, reduceMotion })
              -> evidence objects: trees, flowers, fruit, butterflies, bird hotspot
              -> decorative objects: sky, particles, aurora, rain
              -> tick loop: motion, shader uniforms, effect opacity
              -> dispose: renderer, composer, geometries, materials, textures
```

The descriptor layer is the only place that knows about VIPS dimensions, timeline IDs, review status, and recent Mirror entries. The Three layer receives objects such as "confirmed oak value tree with strength high" or "pending recent-entry butterfly" and renders them. That keeps visual richness from leaking back into agent or persistence behavior.

Shared visual helpers should be small and app-owned:

- `worldStyle.ts`: palette, day/twilight/night factors, reduced-motion multipliers, and shared count caps.
- `foliage.ts`: Student Space-inspired billboard cloud geometry/material helpers used by trees and fruit bushes.
- `sceneEffects/*`: optional decorative layers with a common create/tick/dispose surface.

Decorative effects should never own product meaning. Butterflies may fold into firefly visuals because they still represent recent entries; loose particles and aurora are atmosphere only and should not have hotspots.

## Implementation Units

### U1. Visual Source Boundary and Shared World Style

Files:

- `src/components/world/assets.ts`
- `src/components/world/vipsWorldMapping.ts`
- `src/components/world/createWorldScene.ts`
- `src/components/world/worldStyle.ts` or `src/components/world/palette.ts` (new)
- `test/world/vipsWorldMapping.test.ts`
- `test/components/WorldScene.test.tsx`

Work:

- Extend asset metadata to distinguish copied binary assets from adapted procedural recipes.
- Add shared style/timing inputs for palette, wind intensity, twilight factor, night factor, and reduced-motion intensity.
- Keep the scene model serializable and independent of Three objects.
- Ensure `buildVipsWorldSceneModel` exposes enough metadata for richer rendering without coupling to Student Space modules.
- Add a descriptor-level home for resident-bird and effect preferences if implementation needs them, but keep these as visual settings, not student facts.
- Define global caps for tree foliage planes, fruit bush count, butterfly count, particles, and optional effects before implementation starts.

Test scenarios:

- Descriptor output remains stable for confirmed, pending, and forgotten evidence.
- Reduced-motion input changes scene options without altering evidence descriptors.
- Asset metadata includes provenance for copied assets and adapted recipes.
- WebGL fallback still renders when Three initialization fails.
- Scene options can disable optional effects without changing evidence-bearing descriptors.

### U2. Rich Value Trees

Files:

- `src/components/world/trees.ts`
- `src/components/world/island.ts`
- `src/components/world/vipsWorldMapping.ts`
- `src/components/world/hotspots.ts`
- `test/world/vipsWorldMapping.test.ts`
- `test/components/WorldScene.test.tsx`

Work:

- Extract reusable foliage-cloud helpers from the current GLB path.
- Keep oak and cherry backed by the existing GLBs when available.
- Add procedural variants for mangrove, pine, palm, maple, willow, and banyan using app-owned geometry inspired by Student Space's tree/botanical grammar.
- Apply consistent wind and sun-direction uniforms to tree leaves.
- Preserve fallback trees if asset loading fails.
- Keep per-species shape decisions in one table or helper so taxonomy mapping and rendering cannot drift.
- Avoid one material per leaf/blob where possible. Prefer shared geometries and cloned uniforms only where object-specific opacity/color requires it.

Test scenarios:

- Every value claim maps to a distinct `ValueTreeSpecies`.
- Pending trees render with tentative opacity/scale while confirmed trees render fully.
- Forgotten values are omitted.
- Tree hotspots still link to value pages or timeline anchors.
- Missing GLB/texture keeps a procedural fallback visible.
- Each species path can render without requiring a matching GLB.

### U3. Articulated Butterflies and Firefly Fold

Files:

- `src/components/world/butterflies.ts`
- `src/components/world/createWorldScene.ts`
- `src/components/world/vipsWorldMapping.ts`
- `src/components/world/hotspots.ts`
- `test/world/vipsWorldMapping.test.ts`
- `test/components/WorldScene.test.tsx`

Work:

- Replace the current simpler butterfly visual with articulated body, antennae, lobed wing shapes, eye spots, and path-facing motion.
- Keep bounded recent-entry behavior and evidence-state coloring.
- Add optional night/firefly fold as part of the same object layer rather than a separate product concept.
- Ensure butterfly motion is deterministic from `placementSeed` and `recencyWeight`.
- Keep the visual group and hit target separate: wing/body animation can be tiny, but pointer hit targets must remain usable.
- Treat night/firefly fold as a rendering mode on the same recent-entry object, not a second evidence marker.

Test scenarios:

- Recent entries cap at the configured limit.
- Pending review entries use tentative visuals; confirmed entries use vivid visuals.
- Forgotten entries never create butterflies.
- Butterfly objects retain clickable hotspots for their source reflection.
- Reduced motion freezes or calms wing/orbit animation without removing the evidence marker.
- Dusk/firefly mode does not duplicate hotspot entries or change the recent-entry count.

### U4. Skill Fruit Bushes or Tree-Attached Fruit

Files:

- `src/components/world/fruits.ts`
- `src/components/world/trees.ts`
- `src/components/world/vipsWorldMapping.ts`
- `src/components/world/hotspots.ts`
- `test/world/vipsWorldMapping.test.ts`
- `test/components/WorldScene.test.tsx`

Work:

- Decide implementation default: keep fruit on trees for VIPS metaphor clarity, or move to Student Space-style bushes for visual clarity.
- If bushes are used, add `host` metadata and place bushes deterministically near related value trees or clearings.
- Reuse foliage-cloud helpers for bushes where possible.
- Render berry clusters with skill color/ripeness/count.
- Keep hotspots tied to skill evidence and avoid turning bushes into generic decoration.
- If fruit moves to bushes, preserve the "skill serving a value" relationship in tooltip copy or hotspot routing, not just in hidden descriptor fields.
- If fruit stays on trees, borrow Student Space's berry-cluster geometry without adopting its standalone bush placement.

Test scenarios:

- Skills with related value IDs attach near the corresponding value tree or expose that relationship in the descriptor.
- Skills without a related value use a deterministic neutral placement.
- Evidence strength changes count/ripeness without changing claim identity.
- Pending skills are visually tentative.
- Skill hotspots link to the correct skill/VIPS surface.
- The chosen host strategy is visible in descriptor output and covered by tests so future refactors cannot silently switch metaphors.

### U5. Resident Bird Upgrade

Files:

- `src/components/world/promptBird.ts`
- `src/components/world/createWorldScene.ts`
- `src/components/world/hotspots.ts`
- `test/components/WorldScene.test.tsx`

Work:

- Replace the current prompt-bird mesh with a calmer Kira-inspired resident bird.
- Use one fixed visual by default. Do not expose species customization.
- Preserve the existing prompt/hotspot affordance if it remains product-useful.
- Add gentle walk, settle, breathing, and head-turn motion. Avoid chatty autonomous behavior.
- Keep all user-facing copy in this app's tone. Do not copy Student Space's Kira dialogue system wholesale.
- Keep the bird's geometry config local and minimal. Student Space's species catalog can inspire proportions and palettes, but this app should not carry unused customization tables.
- Define when the bird is hidden, muted, or noninteractive during recording/processing so it does not compete with Mirror.

Test scenarios:

- Bird is added to the scene with a named hotspot.
- Bird prompt selection remains bounded and deterministic enough for tests.
- Reduced motion lowers or disables walking while preserving the visual marker.
- Bird disposal does not leak geometries/materials.
- Recording/processing states do not allow the bird prompt to interrupt the primary reflection flow.

### U6. Scene Effects Layer

Files:

- `src/components/world/sky.ts`
- `src/components/world/createWorldScene.ts`
- `src/components/world/disposeThree.ts`
- `src/components/world/sceneEffects/particles.ts` (new)
- `src/components/world/sceneEffects/aurora.ts` (new)
- `src/components/world/sceneEffects/rain.ts` (new, deferred unless simple)
- `test/components/WorldScene.test.tsx`

Work:

- First adapt twilight/sky palette and sparse particles.
- Add aurora as a subtle twilight/night-only ribbon effect if it does not crowd the island.
- Integrate firefly behavior through butterflies before adding a separate firefly layer.
- Defer rain until after core visuals are stable; if implemented, start with simple streaks before framebuffer refraction.
- Route all effects through a single tick/dispose path.
- Make each effect configurable by intensity and enabled flag so visual tuning does not require deleting code.
- Keep rain as a follow-up unless simple streaks are enough; framebuffer refraction needs extra composer/render-target scrutiny.

Test scenarios:

- Effects can be disabled independently.
- Reduced motion lowers particle/aurora/rain animation intensity.
- Scene still renders when an optional effect is unavailable.
- `disposeThree` disposes effect geometries, materials, textures, and render targets.
- Decorative effects never create `WorldHotspot` records.

### U8. Performance, Disposal, and Test Harness Hardening

Files:

- `src/components/world/disposeThree.ts`
- `src/components/world/createWorldScene.ts`
- `src/components/world/trees.ts`
- `src/components/world/butterflies.ts`
- `src/components/world/fruits.ts`
- `src/components/world/sceneEffects/*` (new, if U6 creates it)
- `test/components/WorldScene.test.tsx`

Work:

- Audit each new geometry/material/texture/render target for ownership and disposal.
- Keep object counts capped and centralized in world-style constants.
- Reuse shared geometry/material templates where possible, then clone only object-specific uniforms or colors.
- Confirm optional effects do not require extra render passes unless the visual payoff is obvious.
- Add test seams that let `WorldScene` initialize with effects disabled, reduced motion enabled, and asset-load fallbacks.

Test scenarios:

- Disposing the scene calls disposal paths for new object families and optional effects.
- The scene can mount with effects disabled and still render evidence objects.
- Asset-load failure for tree GLBs or foliage texture does not prevent flowers, fruit, butterflies, or DOM fallback from appearing.
- Reduced-motion mode avoids starting unnecessary animation-heavy effects.

### U7. Browser Verification and Tuning

Files:

- No product files unless tuning exposes small constants in the modules above.
- Optional screenshots or notes can live under `docs/` only if useful for review.

Work:

- Run the local app and visually verify the home island at desktop and mobile widths.
- Check the reference app at `student-space-v1` for visual comparison, especially `?debug=1` twilight.
- Verify objects do not overlap key floating controls.
- Verify hotspots are discoverable but not visually noisy.
- Verify no text overlaps inside DOM controls and fallback states.
- Verify the scene remains legible with empty, sparse, and dense VIPS evidence states.
- Verify hover/tap targets are usable on a narrow mobile viewport, even when butterfly or fruit geometry is visually small.

Test scenarios:

- `pnpm check`
- `pnpm test`
- `pnpm build`
- Browser smoke test of `/` or the current home/reflect route, including one narrow mobile viewport.
- Visual smoke checks confirm nonblank canvas, correct framing, visible evidence objects, and no DOM overlap.

## Sequencing

1. U1 first: define the style/provenance boundary and descriptor changes before touching visuals.
2. U2 and U3 next: trees and butterflies are the highest-value evidence visuals already present in the app.
3. U4 after tree helpers stabilize: fruit bushes can reuse foliage helpers and placement utilities.
4. U5 after object scale is clearer: the bird needs to sit naturally among the richer trees/fruits.
5. U6 after core object grammar: atmosphere should enhance the scene, not hide unfinished objects.
6. U8 runs alongside U2-U6 and gets a final pass before browser verification.
7. U7 throughout each visual slice, with a final focused tuning pass before shipping.

## System-Wide Impact

- Product data boundary: richer visuals must not alter Connector verification, VIPS timeline persistence, raw reflection review, or Cartographer trajectory generation.
- Route and UI boundary: `src/routes/index.tsx`, `WorldStage`, floating actions, capture controls, and bottom sheets remain DOM-owned. Canvas objects can provide shortcuts/hotspots but not replace accessible navigation.
- Asset boundary: copied binary files stay under `public/world/trees/`; adapted procedural recipes live in app-owned TS files with provenance comments or manifest entries in `assets.ts`.
- Render lifecycle: all new object families join the existing `createWorldScene` create/tick/dispose lifecycle. No module-level scene singletons should be introduced.
- Test boundary: descriptor tests prove evidence behavior; component tests prove mount/fallback/control behavior; browser verification proves visual framing and nonblank canvas.
- Performance boundary: richer assets increase draw calls, shader work, and animation cost. Counts, pixel ratio, and optional effect intensity must remain bounded.
- Accessibility boundary: the canvas stays supplementary. Keyboard, screen reader, capture, and navigation affordances remain in React DOM and must still work when WebGL fails.
- Privacy boundary: no scene effect, bird prompt, or visual object should introduce new capture, camera, or AI-inference behavior.

## Risks and Mitigations

- Risk: importing too much Student Space architecture. Mitigation: adapt recipes into existing `src/components/world/*` factories; never import `Game`, `View`, `State`, or `Debug`.
- Risk: visual richness overwhelms reflection. Mitigation: cap counts, keep motion slow, make effects opt-in by intensity, and test mobile first.
- Risk: semantic drift from fruit-on-tree to fruit-bushes. Mitigation: make the host decision explicit in descriptors and tests, and preserve links back to skill evidence.
- Risk: shader/build friction. Mitigation: use inline shader strings or TS shader modules before adding a new Vite plugin.
- Risk: performance regression. Mitigation: cap instancing counts, reuse geometries/materials, keep pixel ratio bounded, and test low viewport sizes.
- Risk: asset provenance confusion. Mitigation: keep `assets.ts` as the manifest for copied files and adapted sources.
- Risk: accessibility regression. Mitigation: React controls remain DOM-owned; canvas objects supplement but do not replace accessible navigation.
- Risk: memory leaks from richer Three objects. Mitigation: add U8, route all new object families through `disposeThree`, and test disposal seams where practical.
- Risk: optional effects become product semantics. Mitigation: only evidence-bearing objects get hotspots; decorative effects remain noninteractive and can be disabled.
- Risk: rain/refraction destabilizes the composer. Mitigation: ship rain only after core visuals pass browser verification, and start with simple streaks before render-target refraction.
- Risk: Kira becomes a parasocial/chat layer. Mitigation: keep the bird visual and optional prompt affordance only; defer autonomous dialogue to a separate product plan.

## Open Questions

- Should skills remain visibly attached to value trees for metaphor clarity, or move to Student Space-style fruit bushes for visual clarity?
- Should the resident bird be purely ambient, or should tapping it keep the current prompt affordance?
- Should aurora be a default signature moment, or only appear in demo/twilight states?
- Should rain/weather ship in this pass, or wait until the core object vocabulary feels settled?
- Do we want a tiny in-app tuning/debug surface for scene constants, or should tuning happen through code constants and browser screenshots only?
- Should U4 ship fruit-bushes in the first implementation, or should it first improve current tree-attached fruit and leave bushes as a second visual iteration?
- Should U6 define a fixed twilight demo state for visual QA, or should it rely only on real time / seeded scene options?

## Definition of Done

- Richer trees, butterflies, fruits, bird, and at least one atmospheric effect are implemented without changing agent/data behavior.
- Every evidence-bearing object still comes from `buildVipsWorldSceneModel` and has deterministic tests.
- Optional effects are reduced-motion aware and disposable.
- All copied/adapted Student Space sources have clear provenance in `assets.ts`, comments, or the plan.
- Performance caps and optional-effect toggles are centralized rather than scattered through object modules.
- The app passes `pnpm check`, `pnpm test`, and `pnpm build`.
- Browser verification confirms the island is nonblank, framed correctly, readable on mobile, and not fighting the DOM controls.
