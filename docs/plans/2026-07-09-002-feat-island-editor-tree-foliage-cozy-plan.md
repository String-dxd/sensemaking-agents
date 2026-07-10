# Plan 002: Richer cozy foliage for the tree GLBs (Tiny Glade direction)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`.
>
> **Drift check (run first)**: `git diff --stat 9328feee..HEAD -- island-editor/scripts/build-tree-glbs.mjs island-editor/test/treeGlbs.test.ts`
> If these changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (asset-only; the runtime contract is frozen by tests)
- **Depends on**: none (independent of plan 001; touches only the GLB script).
  Written against branch `feat/island-editor-palm-remodel-orbit` (PR #89) —
  its palm remodel is the baseline; execute after it merges or on top of it.
- **Category**: direction
- **Planned at**: commit `9328feee`, 2026-07-09

## Why this matters

The current crowns are single-material masses: the broadleaf is 4 smooth blobs,
the pine is 5 plain cones. Cozy-game references (Tiny Glade especially) get
their warmth from *layered* foliage: overlapping tufts with color variation
between layers, lighter tips, and small silhouette breaks. This plan densifies
the crowns while keeping the checked-in-GLB pipeline, the vertex-bake shading
approach, and the runtime contract untouched — it is an art pass expressed as
authoring-script changes, so it stays reproducible and diffable.

## Current state

- `island-editor/scripts/build-tree-glbs.mjs` — the ONLY authoring surface.
  Node script (run from anywhere in the repo: `node island-editor/scripts/build-tree-glbs.mjs`)
  that builds three trees as three.js scenes and exports
  `island-editor/public/models/{fruitTree,pine,palm}.glb`. Deterministic:
  `mulberry32` seeded PRNG only — re-running must produce byte-identical
  output for unchanged code. Read the whole file's header comment before
  editing (contract, materials, wind).
- The contract, enforced by `island-editor/test/treeGlbs.test.ts` against the
  checked-in GLBs:
  - grounded (bbox min.y ≈ 0), footprint |x|,|z| < 1.2, height > 0.8
  - a named `canopy` group with `userData.windAmp` per kind
    (`fruitTree: 1, pine: 0.35, palm: 1.25`), trunk named `trunk` OUTSIDE it
  - material names preserved (`foliage`, `bark`, `foliage-cedar`, `bark-cedar`,
    `bark-palm`, `frond`) — the runtime attaches painted maps by name
  - fruitTree-specific, in two separate `it` blocks: exactly 4 vertex-colored
    crown masses + no fruit (`test/treeGlbs.test.ts:92-104`), and smooth
    (non-flat) normals on the masses (`test/treeGlbs.test.ts:106-125`) —
    **the mass-count block will need updating if the crown composition
    changes; that is expected and allowed** (see Step 2). The smooth-normals
    block must keep passing unchanged.
- Shading approach: vertex-color bakes (`bakeCrownShading` — global bottom-dark
  → top-light gradient × per-puff crevice darkening), hue-NEUTRAL grayscale for
  map-carrying materials. New foliage layers must be baked the same way, not
  lit differently.
- Runtime composition variety: `island-editor/src/models/useObjectModel.ts`
  `randomizeComposition` re-scales/nudges fruitTree canopy children per
  placement (±10%) — many small tufts tolerate this fine, but VERY small tufts
  can detach visually when nudged ±0.07; keep added tufts overlapping their
  parent mass by ≥ 30% of their radius.
- Visual iteration loop: `pnpm dev:editor` → `http://localhost:5180/?gallery`
  (dev-only gallery: every kind × 3 seeds, live texture-theme switcher, same
  lighting as the editor). Themes: Classic / Pastel / Storybook / Off.

## Suggested executor toolkit

- **Visual iteration protocol** — read the section of that name in
  `docs/plans/2026-07-09-000-feat-island-editor-cozy-interactions-overview.md`
  before Step 1. This plan is an ART pass: the protocol's
  capture→critique→tweak loop IS the implementation method here, not an
  afterthought. Expect 3–4 rounds per tree; the palm remodel this suite builds
  on took four.
- `agent-browser` CLI for captures (see protocol for install fallback).

## Commands you will need

| Purpose | Command (repo root) | Expected on success |
|---------|---------------------|---------------------|
| Rebuild GLBs | `node island-editor/scripts/build-tree-glbs.mjs` | 3 `wrote …` lines |
| Typecheck + tests | `pnpm check:island-editor` | exit 0 |
| Gallery | `pnpm dev:editor` → `http://localhost:5180/?gallery` | trees render |

## Scope

**In scope**:
- `island-editor/scripts/build-tree-glbs.mjs`
- `island-editor/public/models/*.glb` (regenerated artifacts)
- `island-editor/test/treeGlbs.test.ts` (ONLY the fruitTree mass-count/shape
  assertions if the crown composition changes, and windAmp values if the
  operator approves a change)

**Out of scope**:
- `island-editor/src/**` — no runtime changes; if richer foliage seems to need
  runtime code, the approach is wrong for this plan.
- Texture PNGs (`public/textures/**`) — work with the existing maps.
- The palm — just remodeled/simplified by PR #89 and its follow-up; do not
  redesign it. Palm may only receive the shared color-variation bake if it
  drops in cleanly (Step 3), nothing structural.

## Git workflow

- Branch: `feat/island-editor-cozy-foliage`
- Commits: `feat(island-editor): <summary>`; commit script + regenerated GLBs
  together (they must stay in sync).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the before-state

Rebuild and screenshot the gallery (all three themes) before touching code, so
every change has a visual baseline. Confirm `pnpm check:island-editor` is green.

**Verify**: baseline screenshots exist; tests pass.

### Step 2: Layered broadleaf crown (fruitTree)

In `buildFruitTree`, keep the 4-mass silhouette but add a layer of 6–10 small
satellite tufts (`blob(...)` with radius 0.10–0.16) nestled into the seams
between the existing lobes and around the dome's shoulder, each overlapping its
parent mass ≥ 30% of its radius. Bake each with the existing `bakeCrownShading`
but vary the per-tuft crevice depth (0.10–0.22 seeded) and add a small seeded
brightness offset (±6%, multiplied into the bake colors) so layers read as
distinct clumps under one canopy — the Tiny Glade "stacked clumps" read.

Update `test/treeGlbs.test.ts`'s fruitTree assertions: the crown is now
"4 primary masses + N satellite tufts"; assert ≥ 10 vertex-colored meshes and
keep the no-fruit and smooth-normal checks unchanged.

**Verify**: `node island-editor/scripts/build-tree-glbs.mjs` → 3 files written;
`pnpm check:island-editor` → exit 0.

**Visual iteration (protocol; expect 3–4 rounds)** — named criteria, judged in
side + top-down + eye-level, all three themes AND textures Off:

- **Layered, not lumpy**: distinct clump boundaries visible in the silhouette
  (top edge shows 3+ scallops that weren't there in the baseline), yet the
  crown still reads as ONE canopy — no satellite tuft floats free of the mass.
- **Brightness variation reads as depth**: with textures OFF (flat matte), the
  ±6% offsets must still be visible as subtle patchwork; if only the texture
  carries the variation, the bake step failed.
- **Top-down (the game view)**: clump pattern breaks the old 4-blob clover
  outline; no bald seams showing trunk/sky through the crown center.
- **Per-seed variety**: the 3 gallery seeds show different clump arrangements
  (runtime `randomizeComposition` nudges them — verify none detach at ±10%
  scale / ±0.07 nudge; if one floats, increase its overlap and rebuild).
- **Baseline comparison**: put round-N and baseline screenshots side by side
  every round — "richer than baseline" is the point; drift toward "different
  but not richer" means revert the round and re-approach.

### Step 3: Pine tier softening

In `buildPine`, break each cone hem with 4–6 small `blob` tufts (radius
0.06–0.10) tucked under each skirt's rim (same material, same bake), so tiers
read as foliage rather than lampshades. Keep the stacked-cone silhouette and
the peak. Do not change skirt counts/positions (the dense stack prevents
see-through gaps — that property must survive).

**Verify**: rebuild + tests green.

**Visual iteration (protocol; expect 2–3 rounds)** — named criteria:

- **Soft hems**: each tier's lower rim broken by tufts in the silhouette
  (side view) — no perfectly straight cone hem remains.
- **No see-through**: orbit a full circle at eye-level AND from ~30° above;
  zero sky-colored slivers between tiers at any angle (this is the property
  the dense stack exists for — check it every round, it's the likeliest
  regression).
- **Still a conifer**: squint test at game zoom in the main editor — pointed
  peak, stepped-inward tiers; if it starts reading as a broadleaf, the tufts
  are too large.
- **Cedar palette intact**: in Classic theme the pine stays darker/bluer than
  the fruitTree (they share the bake pipeline but not the map — a wrong
  material name on a new tuft would silently pick up the broadleaf map; the
  contract test catches names, the capture catches the color).

### Step 4: Regression + size gate

GLB size is a proxy for runaway geometry: `ls -la island-editor/public/models/`.
Budget: each file ≤ 300 kB. If over, reduce tuft detail (icosahedron detail 1,
not 2) before reducing tuft count.

**Verify**: sizes within budget; `pnpm check:island-editor` green; gallery
screenshots (after) captured for the PR/report.

## Test plan

- Updated fruitTree composition assertions (Step 2) in
  `island-editor/test/treeGlbs.test.ts` — model on the existing
  `'fruitTree is the simplified AC stack…'` test.
- All other contract tests must pass UNCHANGED — they are the proof the art
  pass didn't break the runtime.
- Manual: gallery check across all 4 theme settings at three zoom levels.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `node island-editor/scripts/build-tree-glbs.mjs` re-run produces zero
      `git diff` on the GLBs (determinism holds)
- [ ] Each GLB ≤ 300 kB
- [ ] Before/after gallery screenshots captured for every iteration round,
      final set taken AFTER the last rebuild, covering side/top/eye-level ×
      (Classic, Pastel, Storybook, Off)
- [ ] Wind still visibly moves both crowns (3 frames ~2 s apart differ — the
      added tufts live inside the `canopy` groups, so this catches a tuft
      accidentally parented outside one)
- [ ] Status row updated in the overview doc

## STOP conditions

- Any contract test other than the fruitTree composition assertions needs
  editing to pass — that means the art pass broke the runtime contract.
- The look requires new texture maps or runtime material changes — out of
  scope; report with a recommendation instead.
- Determinism breaks (second rebuild diffs) — a `Math.random`/iteration-order
  bug crept in; fix or report, never commit non-reproducible assets.

## Maintenance notes

- Anyone editing crowns later must re-run the build script AND commit the
  GLBs; CI has no build step for them (the test suite validates the checked-in
  artifacts instead).
- The satellite-tuft brightness offset interacts with texture themes: it
  multiplies the map, so extreme offsets tint themes unevenly — keep within
  the ±6% this plan specifies unless re-checking all themes.
- Deferred: per-leaf silhouette cards (alpha-tested sprites) — a bigger visual
  jump but needs a texture pipeline addition; revisit after this pass ships.
