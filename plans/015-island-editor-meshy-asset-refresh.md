# Plan 015: Island editor — build the new Meshy assets (tree v2, grass tuft, animated character)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c78ba00..HEAD -- island-editor/scripts/optimize-meshy-glb.mjs island-editor/test/objectGlbs.test.ts island-editor/assets/meshy/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (asset-quality judgments; one visual gate)
- **Depends on**: none
- **Category**: direction (feature groundwork)
- **Planned at**: commit `c78ba00`, 2026-07-12

## Why this matters

The maintainer downloaded three new Meshy AI exports into
`~/Downloads/glb-models/` for the standalone island editor (`island-editor/`,
an isolated pnpm workspace, dev server `pnpm dev:editor` → port 5180):

1. **Emerald Canopy** — a higher-quality tree that replaces the current tree
   asset (same kind, same runtime contract).
2. **Grass Patch** — a grass tuft that a later plan (016) renders as
   drag-painted instanced ground cover.
3. **Sunny Chick biped** — an animated character (10 skeletal clips) that a
   later plan (017) lets the user place on the island (max 1) and cycle
   animations on.

Raw Meshy exports are unusable directly (the tree is 100 MB / 1.76 M
triangles). This plan lands all three through the repo's existing optimization
pipeline so plans 016/017 can consume small checked-in `.glb` files with
contract tests guarding them. This plan touches ONLY the asset pipeline and its
tests — no editor runtime code.

## Current state

All paths relative to the repo root unless noted. Commands for the editor
workspace run from `island-editor/`.

### Source files (the maintainer's downloads — inputs, do not modify)

(Renamed by the maintainer on 2026-07-12 from the original Meshy export names;
sizes verify identity: tree 100,301,704 B / grass 10,615,204 B / zip
12,541,753 B.)

- `~/Downloads/glb-models/tree-2.glb` (replaced the earlier Emerald Canopy
  export mid-execution, 2026-07-12; 50,608,764 B) — new tree. Verified by
  inspection: **31,365 tris (already low-poly)**, one mesh `Mesh_0`, bounds
  ~14.5 × 18.0 × 16.6 (y-up, base at y=0), 4 images incl. a normal map and a
  baked color texture (the stylized look lives in the texture), no animations.
- `~/Downloads/glb-models/grass.glb` (was `Meshy_AI_Grass_Patch_on_Grid_0711112222_texture.glb`)
  — grass tuft. 3,554 tris, one mesh, bounds 0.12 × 0.06 × 0.12 (a ~12 cm
  patch), 4 images, no animations.
- `~/Downloads/glb-models/bird.zip` (was `Meshy_AI_Sunny_Chick_biped.zip`) —
  internal paths unchanged; contains two GLBs:
  - `..._Character_output.glb` — rig + a single 0.03 s dummy clip. **Do not
    use this one.**
  - `..._Meshy_Merged_Animations.glb` — same mesh (`char1`, 8,730 tris,
    bounds 1.56 × 1.62 × 1.24, base at y=0), 1 skin, 26 nodes, texture
    `texture_0`, extensions `KHR_materials_specular`, and **10 animation
    clips** (verified names + durations):
    `Running` (0.63s), `Skip_Forward` (2.87s), `Stand_Talking_Angry` (20.8s),
    `Stand_To_Side_Lying` (9.67s), `Swim_Forward` (4.53s),
    `Talk_Passionately` (10.27s), `Talk_with_Right_Hand_Open` (3.77s),
    `Wake_Up_and_Look_Up` (3.5s), `Walking` (1.03s), `Wave_for_Help_2` (1.5s).
    This is the source to use — it is self-sufficient (mesh + skin + clips).

### The pipeline

- `island-editor/scripts/optimize-meshy-glb.mjs` — reads raw exports from
  `island-editor/assets/meshy/` (gitignored), writes optimized assets to
  `island-editor/public/models/` (checked in). Read the whole file before
  editing — its long comments are the design doc. Its `ASSETS` table currently
  has `tree` and `rock` entries; per-asset knobs (excerpt, lines 71–109):

```js
const ASSETS = {
  tree: {
    src: 'assets/meshy/tree.glb',
    out: 'public/models/tree.glb',
    material: 'tree-surface',
    meshNode: 'crown',
    height: 1.7,
    bakeVertexColors: true,
    colorContrast: 1.35,
    simplify: { ratio: 0.03, error: 0.05 }, // 1.0M tris → ~25k
    textureSize: 1024,
    doubleSided: true,
    windAmp: 0.55,
  },
  rock: { ... simplify: null, bakeVertexColors: false, windAmp: null },
}
```

  Pipeline stages in `build()`: strip emissive/MR/normal maps → (optional)
  `bakeVertexColors` → `dedup`/`weld`/`simplify` → `normalize` (bakes
  world-scale + base-at-y=0 into the VERTICES via `transformMesh`) → `reroot`
  (adds the `canopy` wind pivot when `windAmp` is set) → WebP + meshopt
  compression.

- `island-editor/assets/meshy/README.md` — documents the raws table and how to
  add an asset. Update it in Step 6.
- `island-editor/test/objectGlbs.test.ts` — the contract guard over
  `public/models/*.glb` (size/tri budgets, world scale, canopy pivot, matte
  materials, meshopt). Read it before Step 5; new assets get contracts there.
  Current budgets: `tree: 400 KB / 40,000 tris`, `rock: 200 KB / 5,000 tris`;
  authored heights `tree: 1.7`, `rock: 0.24`.

### Constraints the executor must honor

- **`normalize()` uses `transformMesh`, which rewrites vertex positions. It is
  SAFE for static meshes and WRONG for the skinned character** — baking a
  transform into a skinned mesh's vertices without also rewriting the skin's
  inverse-bind matrices and every animation track corrupts the animation. The
  character therefore ships at its source scale (1.62 tall) and the runtime
  (plan 017) scales it; this plan's character path must NOT call `normalize`,
  `reroot`, `bakeVertexColors`, or `simplify`.
- **The tree source is pre-decimated (31k tris)** — it takes the rock's
  keep-the-atlas lane, NOT the old bake-and-decimate lane:
  `bakeVertexColors: false`, `simplify: null`, 1024² WebP base map. The
  objectGlbs test asserting "vertex colors, no texture" flips to "single WebP
  base map ≤ 1024²" (mirror the rock's texture test). Tri budget 40k stands
  (31k fits); size budget may be re-baselined to 700 KB with a WHY comment if
  the textured output exceeds 400 KB — compression ladder beyond that: WebP
  q80, then 512². (Amended 2026-07-12 when the source changed; the operator
  authorized gltf-transform compression judgment calls.)
- Repo conventions: comments explain WHY (match the script's register); pnpm
  only; the editor workspace has its own lockfile — run its commands from
  `island-editor/`.

## Commands you will need

| Purpose | Command (from `island-editor/`) | Expected on success |
|---------|--------------------------------|---------------------|
| Install (if needed) | `pnpm install` | exit 0 |
| Rebuild one asset | `node scripts/optimize-meshy-glb.mjs tree` | prints size/tris/scale line |
| Rebuild all | `pnpm build:models` | one line per asset |
| Typecheck + tests | `cd .. && pnpm check:island-editor` | exit 0 |
| Visual check | `cd .. && pnpm dev:editor` → http://localhost:5180 | see Step 7 |

## Scope

**In scope** (the only files you may create/modify):

- `island-editor/assets/meshy/tree.glb` (replace, gitignored),
  `island-editor/assets/meshy/grass.glb` (new, gitignored),
  `island-editor/assets/meshy/character.glb` (new, gitignored)
- `island-editor/scripts/optimize-meshy-glb.mjs`
- `island-editor/public/models/tree.glb` (rebuilt), `grass.glb` (new),
  `character.glb` (new) — build outputs, checked in
- `island-editor/test/objectGlbs.test.ts`
- `island-editor/assets/meshy/README.md`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- ALL editor runtime code (`island-editor/src/**`) — grass and character are
  wired up by plans 016/017. This plan must leave the running editor
  visually identical except for the new tree.
- `island-editor/public/models/rock.glb` and the rock pipeline entry.
- The product app (`src/`), root configs, lockfiles (no new dependencies —
  `@gltf-transform/*`, `meshoptimizer`, `sharp` are already devDeps of the
  editor workspace; verify with `grep gltf-transform island-editor/package.json`).

## Git workflow

- Branch: `advisor/015-meshy-asset-refresh` off `feat/island-editor-v2`.
- Commit style (from `git log`): `feat(island-editor): <imperative summary>` —
  e.g. `feat(island-editor): rebuild tree from Emerald Canopy + add grass/character assets`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stage the raw sources

```sh
cd island-editor
cp ~/Downloads/glb-models/tree.glb assets/meshy/tree.glb
cp ~/Downloads/glb-models/grass.glb assets/meshy/grass.glb
unzip -o -j ~/Downloads/glb-models/bird.zip \
  "Meshy_AI_Sunny_Chick_biped/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb" -d assets/meshy/
mv "assets/meshy/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb" assets/meshy/character.glb
```

**Verify**: `ls -la island-editor/assets/meshy/*.glb` → `tree.glb` ~100 MB,
`grass.glb` ~10 MB, `character.glb` ~6.9 MB, `rock.glb` untouched.
`git status` shows NO change for these (directory is gitignored).

### Step 2: Rebuild the tree from the new source (amended 2026-07-12 for tree-2)

Stage `cp ~/Downloads/glb-models/tree-2.glb assets/meshy/tree.glb`. In
`scripts/optimize-meshy-glb.mjs`, the tree entry switches to the rock's
keep-the-atlas lane: `bakeVertexColors: false` (drop `colorContrast`),
`simplify: null`; `height: 1.7`, `textureSize: 1024`, `doubleSided: true`,
`windAmp: 0.55`, `meshNode: 'crown'` unchanged. Update the entry's comments
(WHY: source is pre-decimated + textured; the look lives in the base map; the
shared build() still drops the normal/MR/emissive maps — the scene doesn't
light with them).

Run `node scripts/optimize-meshy-glb.mjs tree`.

**Verify**: the printed line reports source tris ≈ 31,365, output tris
**< 40,000** (≈ unchanged), one 1024² WebP base map. Size target 400 KB; up to
700 KB acceptable with the re-baselined budget (see Constraints). Contract
suite passes after Step 5's tree-texture-test flip.

### Step 3: Add the grass entry and build it

Add to `ASSETS` (after `rock`), matching the table's comment style:

```js
  grass: {
    src: 'assets/meshy/grass.glb',
    out: 'public/models/grass.glb',
    material: 'grass-tuft',
    meshNode: 'tuft',
    // One tuft ≈ one grid cell: the 64-cell grid over worldSize 24 gives a
    // 0.375-unit cell; the source patch is 0.12 wide × 0.06 tall, so height
    // 0.16 scales the footprint to ~0.32 — the instanced layer (GrassLayer,
    // plan 016) adds per-cell scale jitter on top.
    height: 0.16,
    // 3.5k tris — nothing to decimate, so the UV-atlas problem that forces the
    // tree's vertex-color bake never comes up; the 512² WebP keeps blade color.
    bakeVertexColors: false,
    simplify: null,
    textureSize: 512,
    doubleSided: true, // grass blades are open shells, visible from both sides
    windAmp: null, // rendered as a static InstancedMesh; the canopy spring never sees it
  },
```

Run `node scripts/optimize-meshy-glb.mjs grass`.

**Verify**: printed output size **< 250 KB**, tris ≈ 3,554 (unchanged), scale
≈ ×2.67. `ls island-editor/public/models/` now shows `grass.glb`.

### Step 4: Add the character build path (skinned — separate pipeline)

The shared `build()` would corrupt the character (see Constraints). Add a
dedicated `buildCharacter()` to the script and dispatch to it from the CLI
loop (e.g. give the `ASSETS` entry a `skinned: true` flag, or a separate
`CHARACTER` config object — match the file's style). Requirements:

1. Read `assets/meshy/character.glb` with the same `NodeIO` setup.
2. Material pass — same matte contract as the others, plus strip the Meshy
   specular extension:
   ```js
   for (const material of document.getRoot().listMaterials()) {
     material
       .setName('character-surface')
       .setEmissiveTexture(null)
       .setEmissiveFactor([0, 0, 0])
       .setMetallicRoughnessTexture(null)
       .setNormalTexture(null)
       .setMetallicFactor(0)
       .setRoughnessFactor(1)
     material.setExtension('KHR_materials_specular', null)
     material.setExtension('KHR_materials_ior', null)
   }
   ```
3. `await document.transform(resample(), dedup(), textureCompress({ encoder:
   sharp, targetFormat: 'webp', slots: /baseColorTexture/, resize: [1024, 1024],
   quality: 85 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))`
   — `resample` (import from `@gltf-transform/functions`) losslessly thins the
   dense animation keyframes; 1024² (not 512) because the character is the
   scene's hero and its face detail lives in the map.
   **No `weld`/`simplify`/`normalize`/`reroot`/`bakeVertexColors`.**
4. Write to `public/models/character.glb`; print the same one-line summary.
5. Add a comment block at `buildCharacter` stating the two contracts that
   differ from static assets: (a) ships at SOURCE scale (~1.62 tall, base at
   y=0) — the runtime scales it, because baking scale into a skinned mesh
   corrupts inverse-bind matrices; (b) animations and skin must survive every
   transform — that is why simplify/normalize are banned here.

Run `node scripts/optimize-meshy-glb.mjs character`.

**Verify**: `ls -la island-editor/public/models/character.glb` → **< 3 MB**.

### Step 5: Extend the contract tests

In `island-editor/test/objectGlbs.test.ts`:

1. Add `grass` to the static-asset coverage: extend `KINDS` to
   `['tree', 'rock', 'grass']`, `SIZE_BUDGET_KB` with `grass: 250`,
   `TRI_BUDGET` with `grass: 5_000`, `HEIGHT` with `grass: 0.16`. The
   existing `it.each` contracts (budget, world scale/grounded, matte, meshopt)
   then cover it automatically. Add one grass-specific test asserting it keeps
   a single 512² WebP base map and has NO `canopy` node (mirror the rock's
   tests).
2. Add a new `describe('character GLB asset', ...)` block (do NOT add
   character to `KINDS` — its scale contract differs):
   - size `< 3 * 1024` KB; triangles `< 12_000`;
   - exactly 1 skin (`doc.getRoot().listSkins()`);
   - animations: exactly 10 clips, and the name list equals the 10 names in
     "Current state" above (sorted compare) — plan 017 hardcodes these names
     in a UI constant, and this test is what keeps that constant honest;
   - bounds: height between 1.5 and 1.8 and `min[1] ≈ 0` — guards against
     someone "helpfully" running `normalize` on it later;
   - matte: emissive `[0,0,0]`, no emissive/MR/normal textures;
   - single WebP base map (1024²); `EXT_meshopt_compression` in use.

**Verify**: `npx vitest run test/objectGlbs.test.ts` → all pass (old + new).

### Step 6: Update the raws README

Update the table in `island-editor/assets/meshy/README.md`: tree row now
"Emerald Canopy" ~100.3 MB; add `grass.glb` ("Grass Patch on Grid", ~10.4 MB)
and `character.glb` ("Sunny Chick biped — Merged_Animations GLB from the zip",
~6.9 MB). Add one sentence: the character goes through `buildCharacter()`
(skinned: no decimation, no scale-baking) and is consumed by plans 016/017's
runtime work. Paste the fresh script output block over the stale example.

**Verify**: `grep -c "character" island-editor/assets/meshy/README.md` ≥ 2.

### Step 7: Full gate + visual check

1. From repo root: `pnpm check:island-editor` → exit 0.
2. `pnpm dev:editor` → http://localhost:5180. Confirm: existing placed trees
   render as the new Emerald Canopy (place one if none), sway in the wind, sit
   base-on-terrain, and nothing else changed (grass/character are not yet
   wired into the UI — correct at this stage).
3. Grass-asset spot check (its name says "Patch on Grid" — it may carry a
   flat base plaque under the blades). Quickest DOM-free check: temporarily
   drop a viewer snippet into a scratch HTML, or inspect bounds: run
   `node -e` with gltf-transform to print the mesh's y-distribution if unsure.
   If the tuft has a visible solid base plate that would look wrong scattered
   on terrain, STOP and report (the asset may need a mesh cleanup pass —
   that's an operator decision, not an improvisation).

**Verify**: screenshot or stated observation of the new tree in the editor.

## Test plan

- Extended `objectGlbs.test.ts` as in Step 5 (grass via the shared `it.each`
  contracts + atlas test; character via its own describe block with 8
  assertions). Model the character block on the existing rock texture test
  and the tree canopy test.
- Everything else: existing suites must pass unchanged
  (`pnpm check:island-editor`).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `ls island-editor/public/models/` → `tree.glb grass.glb character.glb rock.glb`
- [ ] `stat -c%s island-editor/public/models/tree.glb` < 716800 (400 KB target,
      700 KB re-baselined cap); `grass.glb` < 256000; `character.glb` < 3145728
- [ ] `npx vitest run test/objectGlbs.test.ts` (from `island-editor/`) passes,
      including the 10-clip-name assertion
- [ ] `git status` shows modifications only to the in-scope checked-in files
      (`public/models/*`, script, test, README, plans index)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any downloads file is missing or its size differs wildly from "Current
  state" (tree ~100 MB, grass ~10 MB, zip ~12.5 MB) — the maintainer may have
  replaced them.
- The rebuilt tree cannot get under 40,000 tris with `ratio: 0.02` and
  `error ≤ 0.05` — raising `error` past 0.05 or the budget is an operator
  decision.
- `buildCharacter` output loses clips (≠ 10), loses the skin, or exceeds 3 MB
  even after `resample` — do not start dropping clips to fit; report.
- The grass tuft has a baked-in ground plaque (Step 7.3).
- You find yourself wanting to edit anything under `island-editor/src/` —
  that work belongs to plans 016/017.

## Maintenance notes

- **The 10 clip names are now a contract** (test-guarded). Plan 017's UI
  constant depends on them; if the character asset is ever regenerated with
  different clips, update the test AND plan 017's `CHARACTER_CLIPS` constant
  together.
- **Character scale contract is "source scale, runtime scales"** — unique
  among the assets. The objectGlbs bounds test (1.5–1.8 tall) is the guard;
  reviewers should reject any future change that runs `normalize` on it.
- The raw sources live only in `~/Downloads` and the gitignored
  `assets/meshy/` — they are one `rm -rf ~/Downloads` away from gone. Worth
  the operator archiving them somewhere durable (out of scope here).
- Follow-ups deliberately deferred: grass wind sway (static instances for
  now), any use of the zip's `Character_output.glb` (dummy clip only).
