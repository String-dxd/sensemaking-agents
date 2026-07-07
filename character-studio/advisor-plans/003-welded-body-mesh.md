# Plan 003: Weld the body into one continuous mesh (AC-grade limb junctions)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1fd7413..HEAD -- character-studio/scripts/blender/ character-studio/src/core/skeleton/partRegistry.ts character-studio/test/core/skeleton/assets.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (visual re-check of plan 002 after this lands)
- **Category**: tech-debt (asset-pipeline architecture; fixes the broken-junction defect class)
- **Planned at**: commit `1fd7413`, 2026-07-06

All commands run from the `character-studio/` directory. Asset generation
requires Blender at `/Applications/Blender.app/Contents/MacOS/Blender`
(the path hardcoded in `package.json`'s `gen:assets`).

## Why this matters

The archetype bodies are a **union of separate overlapping shells** (head,
torso, arm capsules, hands, legs, feet — `scripts/blender/bodies.py`). Arm
roots are deliberately buried inside the torso (`root_pull = 0.52`,
`bodies.py:216-217`), and an SDF smooth-union fillet reshapes arm-root
vertices onto the blended surface **once, at rest pose, at build time**
(`fillet_limb_into_torso`, `bodies.py:70-121`). The moment anything moves a
limb relative to the torso — a walk clip rotating `upperArmL`, a `chubby`
morph (which displaces arm and torso vertices by *different* rules,
`bodies.py:349-353`), an anatomy bone-scale slider — the baked fillet no
longer matches: the buried root swings out of the torso, the intersection rim
becomes visible, and because the toon material is front-side culled the
camera sees straight into the hollow shell interior. These are the "half-cut
arms / seeing the inside / fin membranes" defects reported from dogfooding.

The benchmark: AC villagers are authored as **one continuous mesh** — limbs
are welded into the torso with smooth skin-weight falloff across the
junction, so no pose can ever open a seam. This plan makes the generated
bodies match that structure: boolean-union the shells into a single closed
manifold, transfer UVs/weights/mask-channels/morphs onto it, and smooth the
skin weights across the junction zones.

## Current state

Files and roles (all generation is headless-Blender python driven by numpy —
"no interactive modeling ops, so every asset is 100% regenerable from code",
`meshkit.py:1-13`):

- `scripts/blender/bodies.py` — builds shells per archetype
  (`build_body_shells`), analytic weights (`_chain_weights`,
  `_torso_weights`), palette-mask channels, SDF fillet, and the five body
  morphs (`body_shape_keys`).
- `scripts/blender/meshkit.py` — `Shell` dataclass (verts/faces/params/
  weights/channels/uv_rect), `sphere_shell`, `ellipsoid`, `capsule_along`,
  `mirror_x`, `shell_loop_uvs` (per-face-corner UVs into island rects),
  `rasterize_mask`, `write_png`.
- `scripts/blender/gen_assets.py` — headless entry: builds shells →
  Blender objects → exports `src/assets/anatomy/body-<archetype>.glb` +
  `textures/body-*.mask.png` + preview renders; enforces
  `TRI_BUDGET_BODY = 18000`; computes per-face hide-region ids
  (`body_region_ids`, for plan-008 wardrobe hide submeshes) from vertex
  positions.
- `scripts/blender/blender_io.py` — pydata → Blender mesh/armature/skinning/
  shape-keys/GLB-export plumbing.
- `src/core/skeleton/partRegistry.ts` — `BODY_REGISTRY` with per-body
  `meshVersion` (line ~264); `meshVersionOf` feeds the sculpt-delta
  compatibility check.
- `src/core/sculpt/` — saved sculpt payloads are keyed by
  `(assetId, meshVersion, vertex layout)`; a changed body mesh **invalidates
  saved sculpt deltas** (`SculptDeltaMismatchError` handled in
  `CharacterRoot.tsx:262-268`).
- `fixtures/` — roster fixtures (e.g. the Mochi shiba) that may embed
  sculpt deltas against the current body meshes.
- `test/core/skeleton/assets.test.ts` — structural validation of the
  committed body/part GLBs (the pattern: `NodeIO` from `@gltf-transform/core`
  reading the GLB in vitest — same as `test/core/motion/clips.test.ts`).

Key excerpts as of `1fd7413`:

`bodies.py:216-220` (buried arm root + rest-pose fillet):

```python
root_pull = 0.52 if archetype == "biped-round" else 0.44
arm_root = j["upperArmL"] * np.array([root_pull, 1.0, 1.0]) + np.array([0.0, 0.018, 0.0]) * u
arm = capsule_along("armL", tuple(arm_root), tuple(j["handL"]), arm_r * 1.45, arm_r * 0.78, useg=12, vseg=10, fullness=0.55)
# sculpted fillet: the shoulder flares tangentially into the torso
fillet_limb_into_torso(arm, arm_root, j["handL"], arm_r * 1.45, arm_r * 0.78, torso_sdf, k=0.055 * u)
```

`bodies.py:221-222` (weight islands — arm verts belong ONLY to arm bones;
nothing ties the junction to the torso):

```python
t = arm.params[:, 1]
_chain_weights(arm, ["upperArmL", "foreArmL"], t, [0.5], 0.18)
```

`bodies.py:349-353` (morphs displace limb vs torso by different rules —
divergence opens the junction even without posing):

```python
elif shell.name in ("armL", "armR", "legL", "legR", "handL", "handR", "footL", "footR"):
    centroid = v.mean(axis=0)
    radial = v - centroid[None, :]
    keys["chubby"][off : off + m] = radial * 0.10
    keys["slim"][off : off + m] = radial * -0.08
```

`meshkit.py:8-11` (the design note this plan supersedes for bodies):

```python
#   - ... Bodies/parts are unions of
#     shells; overlaps hide inside the volume (the AC "parts tucked into the
#     body" pattern).
```

## Approach (decided by the operator: true weld, not cross-weighted fillets)

Do the weld **in Blender** (headless, scripted — still "regenerable from
code"), not in numpy: boolean union is a solved problem there, and the
original shells remain available as data-transfer sources.

Pipeline per archetype body, inside `gen_assets.py` (new module
`scripts/blender/weld.py` for the logic):

1. Build shells exactly as today (keep the SDF fillet — it pre-shapes the
   junction so the boolean seam lands on a smooth surface).
2. Create Blender mesh objects per shell as today.
3. Duplicate the shell set; on the duplicate, apply **Boolean (EXACT, UNION)**
   modifiers to merge torso + head + limbs + hands + feet into ONE object;
   then `bpy.ops.mesh.remove_doubles` (merge-by-distance, epsilon ~1e-5) and
   recalc outside normals.
4. **Data transfer from the original shells** onto the welded mesh (Blender's
   Data Transfer modifier / `object.data_transfer`, nearest-face-interpolated):
   - UV loops (`UV` layer, `POLYINTERP_NEAREST`),
   - vertex groups / skin weights (`VGROUP_WEIGHTS`, `NEAREST` vertex mapped),
   - color attributes holding the mask channels (author the channels as a
     vertex color layer on the originals first so they transfer with the same
     mechanism).
5. **Junction weight smoothing**: for vertices within the fillet band
   (|torso_sdf(p)| < k·1.5 for any limb junction — reuse `make_torso_sdf` and
   the per-limb axis data, exported from `bodies.py` in the shells' metadata),
   run several iterations of Laplacian weight smoothing
   (`bpy.ops.object.vertex_group_smooth` scoped to a junction vertex group,
   or numpy adjacency smoothing on the extracted weights). Target: every
   junction vertex has ≥ 2 bone influences and adjacent-vertex weight vectors
   differ by < 0.5 in L1.
6. **Morphs on the welded mesh**: recompute the five shape keys analytically
   on the welded vertex positions. The rules in `body_shape_keys` are
   functions of (position, source-shell identity); classify each welded
   vertex by nearest original shell (smallest absolute SDF / nearest surface
   point via a BVH over each source shell) and apply that shell's rule. Add a
   position-blend across the junction band (lerp the two rules by the same
   smoothstep as the weight band) so `chubby`/`slim` no longer tear the seam
   — this fixes the `bodies.py:349-353` divergence structurally.
7. Rasterize masks from the ORIGINAL shells exactly as today (UVs are
   transferred, so the existing mask PNGs' layout stays valid — regenerate
   anyway for the blur-band cleanliness).
8. Recompute `body_region_ids` per-face on the welded mesh — the existing
   rules are position-based (`gen_assets.py` `body_region_ids`: y vs spine/
   knee joints, shell identity replaced by the nearest-shell classification
   from step 6).
9. Export the welded object as the body GLB (same path), enforce
   `TRI_BUDGET_BODY`. Boolean output is triangulated/ngon-mixed; run
   `bpy.ops.mesh.quads_convert_to_tris` for deterministic export, and if the
   tri count exceeds budget add a **Decimate (collapse)** pass on non-junction
   regions only, or reduce source segment counts — report the counts either way.

Parts (ears/muzzles/tails) stay separate meshes — they mount on sockets and
were not the defect; only the BODY shells weld.

## Commands you will need

| Purpose | Command (in `character-studio/`) | Expected on success |
|---------|----------------------------------|---------------------|
| Regenerate skeleton JSON | `pnpm gen:skeleton-json` | writes `scripts/blender/build/skeleton.json`, exit 0 |
| Regenerate bodies+parts | `pnpm gen:assets` | writes 3 body GLBs + masks + previews, exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Dev serve | `pnpm dev` | Vite on :5190 |

Blender must exist at the hardcoded path; if not, STOP (operator machine
dependency).

## Scope

**In scope**:

- `scripts/blender/weld.py` (create)
- `scripts/blender/bodies.py` (export junction metadata: per-limb axis,
  radii, fillet k, torso SDF params — as plain data on the shell list/meta)
- `scripts/blender/gen_assets.py` (weld step for bodies; region-id + budget
  handling on the welded mesh)
- `scripts/blender/blender_io.py` (only if data-transfer helpers are needed)
- `src/assets/anatomy/body-*.glb`, `src/assets/anatomy/textures/body-*.mask.png`
  (regenerated artifacts)
- `src/core/skeleton/partRegistry.ts` (bump each body's `meshVersion`)
- `test/core/skeleton/assets.test.ts` (extend with weld assertions)
- `fixtures/` (regenerate via `pnpm make:fixture` if fixtures embed sculpt
  deltas — see STOP conditions)

**Out of scope** (do NOT touch):

- `scripts/blender/parts.py`, part GLBs — parts stay separate meshes.
- `scripts/blender/clips.py`, the clip GLB — animation data is
  skeleton-relative and unaffected.
- `src/core/skeleton/assemble.ts` — it consumes whatever skinned meshes the
  GLB carries; one mesh instead of ten is transparently fine
  (`collectSkinnedMeshes` iterates).
- `src/core/sculpt/` runtime code — the version bump makes old payloads
  refuse cleanly; do not write migration logic.
- `scripts/blender/wardrobe.py` / garment GLBs — garments carry their own
  baked morphs; they follow the body via bone weights, not body topology.
  (But see Maintenance notes: verify visually.)

## Git workflow

- Branch: `advisor/003-welded-body-mesh`
- Commits per logical unit; style `feat(character-studio): ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export junction metadata from bodies.py

`build_body_shells` already computes everything the weld needs (torso SDF
params, per-limb axis endpoints/radii/fillet k). Return them in the existing
`meta` dict (`bodies.py:272`) as
`meta["junctions"] = [{"shell": "armL", "a": [...], "b": [...], "r0": r,
"r1": r, "k": k}, ...]` for both arms and both legs (mirror X for the R
side), plus `meta["torso_sdf_params"] = {"cy":..., "ry":..., "rx":...,
"rz":...}` (the profile callable itself can be reconstructed in weld.py from
`pear`/`taper` style values — include those too).

**Verify**: `pnpm gen:skeleton-json && pnpm gen:assets` still exits 0 and
produces byte-identical GLBs (`git status` shows no asset changes) — this
step is metadata-only.

### Step 2: Implement weld.py (boolean + transfer + smoothing)

Implement the Approach pipeline steps 3–5 as
`weld_body(shell_objects, shells, meta) -> welded_object`. Deterministic
requirements:

- Fixed modifier order; `use_self=False`; EXACT solver.
- `remove_doubles(threshold=1e-5)`; `shade_smooth()`; recalc normals outside.
- Weight transfer must preserve normalization: after transfer + smoothing,
  renormalize each vertex's weights to sum 1 (Blender's
  `vertex_group_normalize_all` with lock disabled).
- Junction band selection: vertex groups `junction.<limb>` built from the
  metadata SDFs evaluated in numpy on the welded verts (read verts via
  `foreach_get`), so the smoothing scope is code-defined, not manual.

**Verify**: run `pnpm gen:assets` — expect it to still export the OLD
(non-welded) bodies (weld not yet wired into the export path); exit 0.

### Step 3: Wire welding into gen_assets.py for bodies only

Swap the exported body object for `weld_body(...)`'s output; recompute
region ids (Approach step 8) and shape keys (Approach step 6) on the welded
mesh; keep part generation untouched. Print a per-archetype report line:
`welded <archetype>: verts=<n> tris=<n> (budget 18000) junction-verts=<n>`.

**Verify**: `pnpm gen:assets` → exit 0, three body GLBs regenerated, each
`tris ≤ 18000` per the printed report. Preview renders written (inspect the
four angles per archetype — junctions must show no crease/seam).

### Step 4: Bump mesh versions

In `src/core/skeleton/partRegistry.ts`, bump `meshVersion` on each of the
three `BODY_REGISTRY` entries (+1 each). This cleanly invalidates saved
sculpt payloads authored against the old vertex layout
(`SculptDeltaMismatchError` → console error, character still loads).

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Extend the asset structural tests

In `test/core/skeleton/assets.test.ts` (follow its existing NodeIO pattern),
add for each body GLB:

1. **Single skinned body mesh**: exactly one mesh primitive carries the body
   (or: primitive count equals the documented post-weld count — pin it).
2. **Closed manifold**: no boundary edges — every edge is shared by exactly
   2 triangles (build an edge→count map over the index buffer).
3. **Junction blending**: ≥ N vertices (pin N from the Step 3 report) have
   both an arm-bone weight and a torso-bone weight > 0.05 (read JOINTS_0 /
   WEIGHTS_0 accessors) — this is the regression test for the weight-island
   defect.
4. **Morph continuity**: for the `chubby` morph target, the max displacement
   delta between any two adjacent vertices is below a pinned threshold
   (e.g. 0.02 m) — regression for the seam-tearing morph divergence.
5. Tri budget: `≤ 18000` triangles.

**Verify**: `pnpm test -- assets` → all pass including the new assertions.

### Step 6: Pose-integrity runtime test

Add to `test/core/skeleton/assemble.test.ts` (or a new
`test/core/skeleton/junction.test.ts`): load the real biped-round body GLB
with three's GLTFLoader — if loader use in vitest is impractical, parse with
NodeIO and build a `SkinnedMesh` manually — rotate `upperArmL` by 60° about
Z, update matrices, compute skinned vertex positions
(`SkinnedMesh.applyBoneTransform` per vertex... three r180 API:
`boneTransform(index, target)`), and assert the maximum edge length in the
shoulder junction region grew by < 2× its rest length (no tearing) AND that
no junction vertex ended up farther than 1 cm inside the torso SDF
(no swallowed geometry). If per-vertex skinning math proves too heavy for a
unit test, replace with: junction vertices' weight blend guarantees (test 3
of Step 5) plus a scripted Blender render of the posed arm in
`gen_assets.py`'s preview pass (add one "arm raised 60°" preview per body)
and eyeball it — but say which route you took.

**Verify**: `pnpm test` → all pass.

### Step 7: Regenerate dependent fixtures + visual pass

1. If any fixture in `fixtures/` embeds `sculptDelta` against a body
   (check: `grep -l "sculptDelta" fixtures/*`), regenerate it with
   `pnpm make:fixture` (read `scripts/make-fixture.ts` usage first) or, if
   regeneration requires manual sculpt authoring, STOP and report which
   fixtures are affected — the operator decides whether to re-author or ship
   with the fixture's sculpt cleared.
2. `pnpm dev` visual pass, per archetype:
   - Rest pose: junctions read as one sculpted surface (no crease).
   - Play mode → walk + run + wave gesture: **no seam opens at shoulders or
     hips, no interior ever visible, no fin membranes** (the defect
     screenshots' scenario).
   - `chubby` and `slim` morph sliders at extremes: junctions stay closed.
   - Anatomy arm/leg bone-scale sliders at extremes: junctions stay closed.
   - Equip the tee + hoodie garments: no new poke-through at shoulders.

**Verify**: all observations hold; capture before/after screenshots at the
wave-gesture apex for the PR.

## Test plan

- Extended: `test/core/skeleton/assets.test.ts` — manifold, junction weight
  blending, morph continuity, tri budget (Step 5).
- New: pose-integrity test (Step 6).
- Full suite green: `pnpm test`.
- The sculpt tests (`test/core/sculpt/*`) must still pass — they use
  synthetic targets, not the real GLBs; if any loads a real body GLB and
  breaks on the new topology, update its pinned expectations (that is an
  expected artifact change, not a defect).

## Done criteria

ALL must hold:

- [ ] `pnpm gen:assets` exits 0; all three bodies report `tris ≤ 18000`
- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] New structural assertions (single mesh, closed manifold, junction
      blending, morph continuity) exist and pass for all three bodies
- [ ] `meshVersion` bumped for all three `BODY_REGISTRY` entries
- [ ] Visual pass (Step 7.2) completed; before/after screenshots captured
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Blender is absent at the hardcoded path, or its version lacks the EXACT
  boolean solver.
- Boolean union produces non-manifold output that `remove_doubles` +
  normal-recalc cannot repair (check with Blender's
  `bpy.ops.mesh.select_non_manifold` count) after two parameter attempts.
- The welded tri count cannot fit the 18000 budget without visibly degrading
  the junction zones.
- UV transfer visibly scrambles island boundaries (mask PNGs no longer land
  on the right body regions in the preview renders).
- Fixtures embed sculpt deltas that cannot be regenerated by script
  (Step 7.1).
- Garment fitting (tee/hoodie) shows new poke-through the old bodies didn't
  have — the wardrobe pipeline may assume shell topology; that's an
  operator-level scope decision.

## Maintenance notes

- **The SDF fillet is now a pre-shaper, not the seam-hider** — future limb
  styling changes in `bodies.py` should tune shapes, then rely on the weld
  for junction integrity. The `meshkit.py:8-11` "overlaps hide inside the
  volume" note should be updated to say bodies weld (leave parts as-is).
- Sculpt payloads and roster thumbnails authored against old bodies are
  invalidated by the version bump (by design). The console warns; documents
  keep their layers for unequipped assets.
- Anything that regenerates bodies (`pnpm gen:assets`) now takes longer
  (boolean + transfer); if CI ever runs it, budget minutes not seconds.
- Reviewer scrutiny: weight renormalization after smoothing (a vertex whose
  weights don't sum to 1 shears visibly), and determinism of the boolean
  output across Blender runs (pin the Blender version in the PR description).
- Follow-up candidates: weld the bird wing the same way (it goes through the
  same fillet path today); delete `fillet_limb_into_torso`'s deep-tuck
  branch once welding is proven (the tuck exists to hide overlap that no
  longer exists).
