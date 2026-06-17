# Bird Builder — Asset Authoring Contract

This is the contract between **authored art** (the character pipeline, see
`docs/plans/2026-06-12-001-feat-pebble5-window-plan.md`) and the **bird-builder runtime**.
The builder is asset-driven: it loads a rigged base bird + per-slot clothing and assembles/
recolors/previews them. **It contributes no visual quality of its own** — AC-grade fidelity is
entirely in the assets authored to this contract. Author to it and assets drop in with **zero
code changes**; deviate and the rebind/attach/recolor will misbehave.

> V1 ships against the existing `public/birds/MaskedBower.glb` + crude procedural placeholder
> garments to prove the runtime. Replace them with assets authored per this contract.

---

## 1. The base bird (`bird-base.glb`)

- **One canonical skeleton.** ~15–20 bones, authored once; every garment binds to it by **exact
  bone name**. Recommended bones: `Root`, `Spine`, `Neck`, `Head`, `Wing.L`/`Wing.R` (+ tips
  `WingTip.L/.R`), `Leg.L`/`Leg.R`, `Foot.L`/`Foot.R`, `BeakUpper`/`BeakLower`, and one `Held.R`
  bone near the right wingtip for held items. (The current `MaskedBower.glb` exposes `MB_Rig`,
  `Wing.L/.R`, `BeakLower`, leg bones, and an `MB_Head` mesh — a clean base should add the named
  `Head`, `Neck`, `Held.R` bones the slots below expect.)
- **Proportions = the AC bar.** Head:body ≈ 3:2, spherical/softened joints, large readable
  silhouette. This is sculpted in Blender; nothing in code can retrofit it.
- **Clean, large-scale normals** so the 3-step toon ramp produces clean bands (no lumpy detail).
- **Feet at y=0, beak along Blender −Y** (the runtime applies +90° yaw → beak on +X, 0.30 scale).
- **Feather material channels:** name the recolorable feather materials so the runtime can tint
  them — `Feather_Base` (body) and `Feather_Accent` (accent). (Today the runtime tints
  `MB_BodyYellow`/`MB_HeadOrange`→body, `Uniform_TieStriped`→accent; migrate to the named
  channels.)
- **No baked-in clothing.** The base should be the *undressed* bird; outfits are separate assets.
  (`MaskedBower` bakes a uniform in — a clean base must drop it.)

## 2. Clothing & accessories (per-slot GLBs)

Slots the runtime knows (`src/bird/slots.ts`): **body** (skinned), **head** (rigid), **held**
(rigid). Extensible — add a slot def + the runtime resolves it.

- **Skinned garments** (body/outfit): a single `SkinnedMesh` skinned to the **same bone names**
  as the base (≤4 bone influences/vertex). Export **without its own skeleton** (or suppressed);
  the runtime clones (`SkeletonUtils.clone`) and rebinds (`bind(baseSkeleton, matrixWorld)`,
  `DetachedBindMode`). Bone-name mismatch ⇒ T-pose/!!! — names are load-bearing.
- **Rigid accessories** (head/held): a plain mesh; the runtime portals it to the slot's attach
  bone (`head`→`Head`, `held`→`Held.R`). Author at the origin; the runtime applies a per-item
  fit offset.
- **Material channels per garment:** name materials `base` and (optionally) `accent` — the
  runtime recolors those via `MeshToonMaterial.color` (tint multiplier). ≤2 material slots per
  garment. A low-res (≤64²) atlas is fine; recolor is a tint, not a texture swap.
- **Rounded, convex geometry** so the back-face outline (when added) reads cleanly; avoid deep
  creases/holes.

## 3. Body masking (poke-through)

When a **body** garment is worn, the torso under it must not poke through. Author one of:
- a **`wearing` morph target** on the base that insets the torso verts a hair, **or**
- a hidden-color torso UV region the (sufficiently thick) garment fully covers.

(V1's placeholders don't mask; this matters once real skinned outfits land.)

## 4. Shading & palette

- The runtime applies `MeshToonMaterial` + a 3-step `gradientMap`. Author **flat base colors**;
  let the ramp do the shading. No baked lighting in textures.
- **Palette discipline:** ≤~15 colors on a dressed bird; draw clothing colors from a shared
  curated palette (`src/bird/palettes.ts` `SWATCHES`). Feather presets live in `FEATHER_PRESETS`.

## 5. Budget

A fully dressed bird should stay ≈4–6 draw calls (base + per-garment ≤2 material slots). One
character on screen — no LOD needed. Keep meshes low-poly; the charm is silhouette + palette +
shading, not polycount.

---

**Summary:** author a softly-proportioned, cleanly-normaled, undressed rigged base with named
bones + named feather channels, and per-slot garments skinned/named to match. The runtime handles
clone, rebind, portal, mask, toon, recolor, and assembly. The art is the long pole; this contract
is how it lands without touching code.
