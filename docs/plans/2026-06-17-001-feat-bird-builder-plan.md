---
title: "feat: Bird Builder — asset-driven dress-up & customization runtime (AC-grade-ready)"
type: feat
status: active
date: 2026-06-17
supersedes: the procedural-builder draft of this file (superseded after the costume/quality benchmark)
---

# Bird Builder — asset-driven dress-up & customization runtime

## Overview

Build `bird-builder/` — a standalone, isolated workspace (the convention `island-editor/`
established in PR #74) that loads a **canonical rigged base bird** and lets you **dress it in
swappable costumes**, recolor every layer, tune fit with direct-manipulation handles, and
preview it on a turntable with **Animal-Crossing-style toon shading + outlines**. It exports a
small JSON **bird config** (which base, which item per slot, per-item colors) and a PNG.

**The core architectural decision — read this first.** A builder cannot *generate* AC-grade art;
it *assembles, dresses, recolors, and previews* authored art. So this is an **asset-driven**
runtime (load a rigged base GLB + per-slot clothing GLBs), not a procedural-from-sliders
generator. This is the benchmarked, proven pattern (Roblox layered clothing, Ready Player Me,
Animal Crossing villager clothing). It supersedes the earlier procedural-bird draft, which would
have produced low-poly birds with no clothes — not the bar you set.

**What this reaches, honestly.** The builder reaches **AC-level birds with costumes *when fed
AC-level assets*.** The builder code is ~1 week; AC-grade *fidelity* is delivered by the pebble5
character-art pipeline (`docs/plans/2026-06-12-001-feat-pebble5-window-plan.md`) — roughly 3–6
months of dedicated 3D character art (base bird + 20+ clothing pieces) per the benchmark. This
plan therefore ships the **runtime + a starter/placeholder asset set + an asset-authoring
contract** so the art pipeline produces drop-in-conforming assets. The repo's existing bird is
already rigged and already wears a baked uniform, giving us a real base to build the runtime
against today; the AC-grade base GLB swaps in later under the same rig/bone-name contract.

---

## Problem Frame

The team wants charming, dressable birds (Animal-Crossing villager energy: a distinct silhouette
in a swappable outfit). The repo has a rigged bird (`MaskedBower.glb`, with `MB_Rig` + wing/leg/
beak bones and a baked `Uniform_*` outfit) but no system to swap costumes, recolor layers, or
preview at the right art bar. The genre's clothing systems (benchmarked) converge on one proven
architecture: a single canonical skeleton, clothing authored against it, runtime skeleton-rebind
for skinned garments, bone-portals for rigid accessories, body-masking under clothes, and toon
shading + outline for the look. This plan implements that runtime and defines the asset contract
the art pipeline must hit; it does **not** attempt to author the AC-grade art itself.

---

## Requirements Trace

- R1. `bird-builder/` is a standalone, isolated pnpm workspace mirroring `island-editor/` (own root + lockfile, own r3f/drei/three@0.171); root `pnpm check`/`test`/`build` stay unaffected.
- R2. Load a **canonical rigged base bird GLB** and render it with **AC-style toon shading**: `MeshToonMaterial` + 3-step `gradientMap` (NearestFilter) + a back-face-inflation **outline** pass; color-managed Canvas.
- R3. **Layered clothing/accessory slots** (Body, Head, Face/Bill, Feet, Held, Badge — extensible): swap an authored item per slot. **Skinned** garments rebind to the base skeleton (`SkeletonUtils.clone` → `bind(baseSkeleton, matrixWorld)`, `DetachedBindMode`); **rigid** accessories mount via `createPortal(<mesh/>, bone)`.
- R4. **Body masking** under body clothing (morph-target inset or hidden-UV) so the torso doesn't poke through.
- R5. **Recolor** per layer via `MeshToonMaterial.color` tint uniforms (base + accent per item; a feather palette for the bird), from curated swatches; palette discipline (≤~15 colors on the bird at once).
- R6. **Spline-like fit/morph handles** (the island-editor `CoastlineHandles` mechanic): drag handles to position/scale rigid accessories on their bone, and to drive any base-bird **morph targets** (pull-to-morph proportions, Sims-style). Drag disables orbit; one undoable command per drag.
- R7. **Builder loop:** live turntable preview, per-slot pickers, recolor swatches, **constrained randomize**, undo/redo (+ ⌘Z/⇧⌘Z), localStorage autosave, **URL-hash** share, **JSON export/import** of the bird config, **PNG** screenshot.
- R8. A **starter/placeholder asset set** (the existing rigged bird as base, with its baked uniform optionally hidden; ≥1 simple placeholder garment for a few slots) proves the runtime end-to-end; the real catalog arrives via the art pipeline.
- R9. An **asset-authoring contract** doc (rig + exact bone names, per-slot attach bones, material/atlas/UV + toon-normal conventions, body-mask convention) so pipeline-authored AC-grade assets drop in without code changes.
- R10. Pure modules (`birdConfig`, slot registry, `handleMap`, `randomize`, `commandStack`, `persistence`, `exportConfig`, `urlHash`) unit-tested in the workspace's own Vitest; the r3f scene/clothing/handles/panel/App are verify-by-running (matching `island-editor`).
- R11. `bird-builder` typecheck + test + build pass; a short note documents the standalone studios in root `CLAUDE.md`/`README.md`, including the honest art-is-the-long-pole framing.

---

## Scope Boundaries

**In (V1):** the isolated workspace; load rigged base + swappable clothing GLBs; skeleton rebind (skinned) + bone-portal (rigid); body masking; toon shading + outline + recolor; Spline-like fit/morph handles; the builder loop (pickers, recolor, randomize, undo, autosave, URL-hash, export/import, PNG); a starter/placeholder asset set; the asset-authoring contract; tests; docs.

**Not in (V1) — and explicitly the long pole, owned by the art pipeline, not this plan:**
- The **AC-grade base bird mesh** and the **clothing catalog** (the 3–6-month art investment). V1 proves the runtime against the existing rigged bird + placeholders.
- Cloth simulation / animated garments.
- Roblox-style **cage-mesh** poke-through removal (V1 uses the simpler morph/hidden-UV mask; cage is a V2 upgrade if clipping shows).
- Procedural-from-sliders bird *geometry* (a possible COULD "blockout" mode; not the path to AC-grade).
- Animation beyond idle turntable; full HSV color wheel (V1 = curated swatches).
- Editing the product engine or auto-applying a config back into it (the config JSON is the bridge).

### Deferred to Follow-Up Work
- Art pipeline deliverables (pebble5): AC-grade base bird + clothing catalog authored to the contract (R9).
- Cage-mesh masking, advanced HSV recolor, pattern overlays on clothing, share-by-short-code, GLB export, additional slots (Wing-accessory, Bottom) — SHOULD/COULD per the costume benchmark.

---

## Context & Research

### Costume-system benchmark (the technical recipe + the reality check)

- **Layered-clothing architecture (proven):** one canonical ~15-20-bone skeleton in the base GLB; clothing authored against the same bone names; on load `SkeletonUtils.clone(gltf.scene)` then `clothingMesh.bind(baseSkeleton, clothingMesh.matrixWorld)` with `DetachedBindMode`; rigid accessories via r3f `createPortal(<mesh/>, boneRef.current)` (clean React pattern; avoids imperative `bone.add`). Sources: Roblox Layered Clothing docs, three.js discourse shared-skeleton threads, Ready Player Me outfit spec.
- **Body masking:** for low-poly, a "wearing" **morph target** that insets torso verts, or a hidden-color torso UV + sufficiently thick garments. Reserve Roblox cage meshes for V2.
- **AC-style shading:** `MeshToonMaterial` + 3-step `gradientMap` (NearestFilter) ≈ AC's 2-3 tone; **back-face-inflation outline** (drei `<Outlines>` or a 2nd inverted-normal pass) for the AC silhouette line. Keep clothing geometry rounded/convex so outlines read cleanly.
- **Recolor:** low-res atlas + `MeshToonMaterial.color` tint multiplier (no texture swap on recolor); ≤2 material slots per garment (base/accent); a fully dressed bird ≈ 4-6 draw calls.
- **Clothing taxonomy for a bird:** Body (torso+wing cover, skinned), Bottom (skinned), Head (hat, rigid), Face/Bill (glasses/beak deco), Feet (shoes), Wing-accessory (cape, skinned), Held (rigid, on a "held" bone), Badge/Pin (chest decal).
- **THE reality check:** the builder contributes slot/swap/recolor/preview/serialization — **zero visual quality on its own**. AC-grade = authored proportions (head:body ≈ 3:2, spherical joints), clean large-scale normals for clean toon bands, palette discipline, thin consistent outlines, per-UV-designed clothing. ≈3–6 months of art. The builder makes the art reusable; it cannot manufacture it.

### Interaction + workspace template — the island shore editor (`island-editor/`)
- `src/scene/CoastlineHandles.tsx` → the Spline-like draggable-handle mechanic reused for **fit/morph handles** (R6): `onPointerDown`→drag, window `pointermove` raycast → value, `onDragChange` disables orbit, hover/drag feedback.
- `src/App.tsx` → wiring shape: config in state/ref, autosave effect, one command per drag gesture, undo/redo + ⌘Z, hidden-input import, `setControls` camera ref.
- `src/editor/{commandStack,persistence,exportSpec}.ts` → reuse (commandStack verbatim; persistence/export adapted to `BirdConfig`).
- `src/ui/ToolPanel.tsx` + `panel.css` → hover-reveal panel vocabulary.
- `{package.json,vite.config.ts,tsconfig.json}` → isolated-workspace contract.

### Existing rigged bird (V1 base)
- `public/birds/MaskedBower.glb` (rigged: `MB_Rig`, `Wing.L/R`, `BeakLower`, leg bones; materials incl. baked `Uniform_TieStriped/Button/BlueBadge/White/CollarEdge`). Loaded today by `src/engine/student-space/Game/View/Kira.js` `loadMaskedScene` (scale 0.30, yaw +π/2, `/draco/` decoder — though the GLB is uncompressed). V1 base; the baked uniform can be hidden to expose a dressable body.

### Carry-overs from the prior draft's doc-review
- Isolated workspace; color-managed Canvas; loading + error states (no silent voids); cut `leva`. The "cargo-cult undo/persistence" finding stays resolved — a dress-up builder with many slots + recolor earns undo/redo + save/share.

### Institutional Learnings
- `docs/solutions/` has no relevant three.js/clothing learning.

---

## Key Technical Decisions

- **Asset-driven, not procedural** — the only path to AC-grade. The builder loads authored GLBs; quality lives in the assets. (Supersedes the procedural-foundation decision of the prior draft.)
- **Skeleton-rebind layered clothing** — the proven Roblox/RPM/three.js pattern (clone + `bind` + `DetachedBindMode` for skinned; `createPortal` to bone for rigid). Documented, low-risk when bone names match — hence the asset contract (R9).
- **Morph-target body masking** for V1 (simplest poke-through fix for low-poly); cage meshes deferred.
- **`MeshToonMaterial` + gradientMap + back-face outline** for the AC look; recolor via `color` tint uniforms (no re-export on recolor).
- **`BirdConfig` is the durable artifact** (mirrors `islandSpec`): `{version, baseId, slots:{[slot]: {itemId, colors:{base,accent}} | null}, featherPalette}`. Export/import/URL-hash/persistence round-trip this.
- **Spline-like handles survive as fit/morph handles** (R6) — drag to place/scale accessories and to drive base-bird morph targets (pull-to-morph), honoring the island-editor model while fitting the asset-driven reality.
- **V1 base = the existing rigged GLB** (uniform optionally hidden) + placeholder garments — proves the runtime now; AC-grade base swaps in later via the contract.
- **Asset-authoring contract (R9) is a first-class deliverable** — it's what lets the art pipeline (pebble5) feed the builder without code changes.

---

## Open Questions

### Resolved During Planning
- Foundation → asset-driven rigged base + clothing layer (benchmark-decided; procedural superseded).
- Clothing architecture → skeleton-rebind (skinned) + bone-portal (rigid).
- Masking → morph-target/hidden-UV for V1.
- Look → `MeshToonMaterial` + 3-step gradient + back-face outline.
- Spline-like request → preserved as fit/morph handles.
- V1 base → existing `MaskedBower.glb`.

### Deferred to Implementation
- Does `MaskedBower.glb` expose usable named bones + (any) morph targets, or do we add a minimal morph in Blender for the proportion handle? Confirm at U3/U7; if no morphs exist, V1 ships placement handles only and proportion morphs await an authored base.
- Whether to hide the baked uniform on the base for V1 (cleaner dressable body) or keep it and layer only Head/Held/Badge accessories first.
- Exact slot set shipped in V1 placeholders (lean: Head + Held + Body) vs. the full taxonomy.
- drei `<Outlines>` vs. a hand-rolled inverted-hull pass; gradientMap step count/tuning.
- Color-management exact stance (ColorManagement off + NoToneMapping vs. a chosen sRGB).

---

## Output Structure

    bird-builder/
      package.json · pnpm-workspace.yaml · tsconfig.json · vite.config.ts · index.html · .gitignore · README.md
      ASSET-CONTRACT.md          # the rig/bone/slot/material/UV/mask conventions the art pipeline must hit
      public/
        bird-base.glb            # V1: copied/derived from MaskedBower.glb (the rigged base)
        items/                   # placeholder garments (a cap, a cape, a held item) proving the slots
      src/
        main.tsx
        App.tsx                  # Canvas + Backdrop + Bird + Clothing + FitHandles + OrbitControls + ToolPanel
        bird/
          birdConfig.ts          # pure: BirdConfig, defaults, validators, isHexColor
          slots.ts               # slot registry: id, label, skinned|rigid, attach bone, material channels
          palettes.ts            # curated swatches + feather palettes (seeded from species presets)
          randomize.ts           # constrained-combo randomizer
          handleMap.ts           # pure drag-delta → clamped fit/morph value (tested)
        rig/
          loadBird.ts            # load base GLB; clone (SkeletonUtils); expose bones + base skeleton
          attachClothing.ts      # skinned: clone+bind(DetachedBindMode); rigid: portal-to-bone descriptor
          bodyMask.ts            # apply/clear torso morph-inset (or hidden-UV) under body clothing
          toon.ts                # MeshToonMaterial + gradientMap + outline + recolor helpers
        editor/
          commandStack.ts        # verbatim
          persistence.ts · exportConfig.ts · urlHash.ts
        scene/
          Backdrop.tsx           # color-managed neutral stage + key/fill + contact shadow
          Bird.tsx               # base + per-slot clothing (skinned rebind / rigid portal) + masking + shading
          FitHandles.tsx         # Spline-like handles for accessory fit + base morphs
        ui/
          ToolPanel.tsx          # slot pickers, recolor swatches, randomize/undo/redo/reset/export/import/screenshot
          panel.css
      test/
        birdConfig.test.ts · randomize.test.ts · handleMap.test.ts
        commandStack.test.ts · persistence.test.ts · exportConfig.test.ts · urlHash.test.ts

---

## High-Level Technical Design

> *Directional guidance for review, not implementation spec.*

**Assembly flow:**

    BirdConfig (state) ──► loadBird(baseId) ──► base SkinnedMesh + skeleton + bones
        │                       │
        │   per slot ──► attachClothing(item, baseSkeleton):
        │                   skinned → SkeletonUtils.clone + bind(skeleton, DetachedBindMode)
        │                   rigid   → createPortal(<mesh/>, bone) + fit offset
        │                 bodyMask: if Body slot filled → inset torso morph
        ├──► toon: MeshToonMaterial + gradientMap + Outlines; recolor = material.color = config color
        └──► autosave + urlHash

    FitHandles (drag) ─► handleMap(delta) ─► clamped fit/morph value ─► onChange ─► (commit) one command
    ToolPanel (slot swap / recolor / randomize) ─► onChange ─► (atomic) one command

**Clothing item descriptor (in `slots.ts`):** `{ slot, kind:'skinned'|'rigid', attachBone?, materialChannels:['base','accent'] }`.

---

## Implementation Units

- U1. **Isolated `bird-builder/` workspace scaffold** — configs (mirror `island-editor`; r3f/drei/three@0.171; no `leva`), color-managed Canvas baseline, `commandStack.ts` verbatim. **Files:** `bird-builder/{package.json,pnpm-workspace.yaml,.gitignore,tsconfig.json,vite.config.ts,index.html}`, `src/main.tsx`, `src/editor/commandStack.ts`. **Deps:** none. **Test:** none (config; verified by U11). **Patterns:** `island-editor` configs.

- U2. **Pure `BirdConfig` model + slot registry + palettes + randomize** — `BirdConfig`, `defaultBirdConfig`, validators, `isHexColor`; `slots.ts` (slot id/label/kind/attachBone/channels); curated swatches/feather palettes; `randomizeConfig`. **Files:** `src/bird/{birdConfig,slots,palettes,randomize}.ts`; **Test:** `test/{birdConfig,randomize}.test.ts`. **Deps:** none. **Requirements:** R5, R7. **Test scenarios:** Happy — `defaultBirdConfig()` valid (version 1, slots present/nullable, palette hexes); `randomizeConfig` always valid + within curated combos + deterministic per seed. Edge — slot registry ids unique; `isHexColor` accepts/rejects correctly.

- U3. **Base load + skeleton access (`loadBird`)** — load base GLB, `SkeletonUtils.clone`, expose the base `SkinnedMesh`, its `Skeleton`, and a bone-name map; optionally hide baked `Uniform_*`. **Files:** `src/rig/loadBird.ts`; **Test:** none (asset/three runtime; verified by running). **Deps:** U1. **Requirements:** R2. **Verification:** base bird renders; bones enumerated; uniform hideable. **Risk:** confirm `MaskedBower.glb` bone names/morphs.

- U4. **Clothing attach (`attachClothing`) — skeleton rebind + bone portal** — skinned: clone + `bind(baseSkeleton, matrixWorld)` `DetachedBindMode`; rigid: descriptor for `createPortal` to the slot's bone + fit offset. **Files:** `src/rig/attachClothing.ts`; **Test:** none (skinned-mesh runtime; verified by running — a placeholder garment follows the rig). **Deps:** U3. **Requirements:** R3. **Execution note:** prove with one skinned + one rigid placeholder before generalizing. **Risk (highest):** bone-name match + bind mode — mitigated by the documented pattern + the asset contract (U10).

- U5. **Body masking (`bodyMask`)** — inset torso morph (or hidden-UV) when a Body item is worn; clear when removed. **Files:** `src/rig/bodyMask.ts`; **Test:** none (visual). **Deps:** U3. **Requirements:** R4.

- U6. **Toon look + recolor (`toon.ts`)** — `MeshToonMaterial` + 3-step `gradientMap` (NearestFilter) applied to base + clothing; back-face-inflation outline (drei `<Outlines>` or inverted hull); `recolor(mesh, channel, hex)` via `material.color`. **Files:** `src/rig/toon.ts`; **Test:** none (visual). **Deps:** U3. **Requirements:** R2, R5. **Patterns:** three.js `MeshToonMaterial` + drei `<Outlines>`.

- U7. **Editor primitives — persistence, exportConfig, urlHash** — `bird-builder:config:v1` autosave (StorageLike seam); JSON export/import w/ validation; Base64 URL-hash encode/decode. **Files:** `src/editor/{persistence,exportConfig,urlHash}.ts`; **Test:** `test/{persistence,exportConfig,urlHash}.test.ts`. **Deps:** U2. **Requirements:** R7. **Test scenarios:** persistence round-trip + null on corrupt/invalid; export round-trip + descriptive throws; urlHash encode/decode round-trip + null on malformed. **Patterns:** `island-editor/src/editor/*`.

- U8. **Spline-like `FitHandles` + `handleMap`** — draggable handles (mirror `CoastlineHandles`) to place/scale rigid accessories on their bone and drive base morph targets; `handleMap` pure + tested; orbit disabled on drag; one command per drag. **Files:** `src/scene/FitHandles.tsx`, `src/bird/handleMap.ts`; **Test:** `test/handleMap.test.ts`. **Deps:** U4, U9. **Requirements:** R6. **Execution note:** `handleMap` test-first. **Test scenarios:** maps min/mid/max anchors → clamped param; monotonic; clamps out-of-range.

- U9. **Scene — `Backdrop` + `Bird`** — color-managed stage + lights + contact shadow; `Bird` composes base + per-slot clothing (skinned rebind via U4 / rigid portal) + masking (U5) + toon (U6); click-to-select a slot's item. **Files:** `src/scene/{Backdrop,Bird}.tsx`. **Test:** none (visual). **Deps:** U3, U4, U5, U6. **Requirements:** R2, R3.

- U10. **`ToolPanel` + App composition** — panel: per-slot pickers, recolor swatches (base/accent/feather with hex + active-item readouts), randomize/undo/redo/reset/export/import/screenshot/copy-link; App: mirror `island-editor/App.tsx` (config state/ref, autosave + urlHash, command-per-gesture undo + ⌘Z, PNG via `gl.domElement.toDataURL`, hidden import input, `<Canvas shadows>` color-managed → Backdrop/Bird/FitHandles/OrbitControls/ToolPanel). **Files:** `src/ui/{ToolPanel.tsx,panel.css}`, `src/App.tsx`. **Test:** none (integration/UI; logic tested in U2/U7/U8). **Deps:** U7, U8, U9. **Requirements:** R6, R7. **Verification (run):** swap a slot → garment appears rebind/portal; recolor → live tint; drag handle → one undo step; reload → autosave/URL restore; export→import round-trips; PNG downloads.

- U11. **Starter assets + asset contract + docs + verification** — `public/bird-base.glb` (from `MaskedBower.glb`); ≥1 placeholder garment per a few slots (Head + Held + Body) — simple meshes proving skinned + rigid + masking; `ASSET-CONTRACT.md` (rig + exact bone names, per-slot attach bones, material channels, UV/atlas + toon-normal conventions, body-mask convention) for the art pipeline; `README.md`; root `CLAUDE.md`/`README.md` note (incl. the honest art-is-the-long-pole framing). Verify `pnpm install`→`typecheck`→`test`→`build`; root `pnpm check` unaffected; turntable screenshot. **Deps:** U1–U10. **Requirements:** R8, R9, R11. **Test:** none (docs/assets/verification).

---

## System-Wide Impact

- **Interaction graph:** none into the product app — isolated workspace, own root; nothing in `src/` imports it; it reuses the bird *asset* read-only (copied/derived into the studio's `public/`), not engine code.
- **Error propagation / state:** confined to the studio (own localStorage key + URL hash).
- **Unchanged invariants:** product app, engine, `three@0.149`, and root `pnpm check`/`test`/`build` unaffected (root Biome/Vitest/tsconfig scoping verified).
- **Cross-team dependency (explicit):** AC-grade output depends on the **art pipeline** producing a base bird + clothing catalog conforming to `ASSET-CONTRACT.md`. The builder is necessary-not-sufficient for the visual goal.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Art is the long pole** — builder ≠ AC-grade; quality needs 3–6 months of authored assets | Stated up front; V1 proves the *runtime* against the existing bird + placeholders; `ASSET-CONTRACT.md` lets the pipeline feed it. Set this expectation with stakeholders before estimating "done." |
| Skinned-clothing skeleton rebind is fiddly (bone-name mismatch, bind mode, T-pose bug) | Use the documented `SkeletonUtils.clone` + `bind(...DetachedBindMode)` pattern; enforce bone names via the contract; prove with one placeholder (U4) before scaling. |
| `MaskedBower.glb` may lack morph targets for proportion handles | Confirm at U3/U7; if absent, V1 ships placement/fit handles only; proportion morphs await an authored base (contract item). |
| Poke-through under clothing | Morph-inset/hidden-UV mask (U5) for V1; cage meshes deferred to V2. |
| Toon outline breaks on concave/ detailed clothing | Keep garment geometry rounded/convex (contract guidance); tune inflation. |
| Scope creep toward authoring the catalog in this plan | Catalog is explicitly out (art pipeline); V1 = runtime + placeholders + contract. |

---

## Sources & References

- Costume/clothing benchmark (this session): Roblox Layered Clothing (cage/WrapDeformer/HSR), three.js discourse shared-skeleton + `createPortal`-to-bone, Ready Player Me outfit spec, ACNH villager clothing (texture-swap + silhouette-first design), Sims 4 slot/swatch model, Club Penguin slot taxonomy, `MeshToonMaterial`/gradientMap/outline. (Full source list in the agent digest.)
- Character-builder benchmark (prior session): MUST/SHOULD/COULD tiers, constrained randomize, URL-hash share, PNG export, preset→refine.
- Interaction + workspace template: `island-editor/` + its plans `docs/plans/2026-06-15-00{0..3}-*`.
- V1 base asset + rig: `public/birds/MaskedBower.glb`; `src/engine/student-space/Game/View/Kira.js` `loadMaskedScene`.
- Art pipeline (the quality long pole): `docs/plans/2026-06-12-001-feat-pebble5-window-plan.md`.
- Prior procedural draft (superseded) + its 5-reviewer doc-review, folded into decisions/carry-overs.
