# Plan 019: Island editor — BOTW/anime toon lighting on objects + tree-3 source swap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 696a321..HEAD -- island-editor/scripts/optimize-meshy-glb.mjs island-editor/src/models island-editor/src/scene island-editor/test/objectGlbs.test.ts island-editor/test/buildObjectModel.test.ts`
> If any in-scope file changed since `696a321`, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (asset rebuild + material swap across every object kind)
- **Depends on**: plans 014–018 (all merged to `feat/island-editor-v2` @ 696a321)
- **Supersedes**: plan 018's unlit-objects contract — the maintainer saw the
  flat result and chose a Zelda-BOTW / Genshin-style TOON look instead (a
  reference screenshot of BOTW drove the decision). 018's pipeline/test
  changes are partially reversed by this plan, deliberately.
- **Category**: direction (visual style)
- **Planned at**: commit `696a321`, 2026-07-12

## Why this matters

The island editor's placed objects (tree, bush, rock, grass tufts, animated
chick character) currently render UNLIT (`KHR_materials_unlit` →
`MeshBasicMaterial`, plan 018): flat baked color, no sun side / shade side, no
received shadows. The maintainer wants the Breath-of-the-Wild look instead:
a warm sunlit side, a cool shaded side, a soft band between them — i.e. TOON
shading, which the terrain shader already implements
(`IslandGroundMaterial`'s warm-sun / cool-sky / soft-two-stop ramp). This plan
moves objects onto three's native `MeshToonMaterial` with a shared 3-step
gradient ramp so the whole scene shades as one system, and restores
received shadows on objects (unlit's known limitation).

It also swaps the tree's raw source to the maintainer's newest export
(`tree-3.glb` — a RETEXTURE of the current tree-2 source: same geometry,
31,358 tris, identical bounds ~14.5 × 18.0 × 16.6, new 4-image texture set),
riding the same asset rebuild.

Mechanism notes (decided, do not re-litigate):

- `MeshToonMaterial` + `gradientMap` is the chosen lane (native to three,
  works on skinned meshes AND `InstancedMesh`, receives shadows). MToon
  (`@pixiv/three-vrm-materials-mtoon`) was evaluated and deferred as a
  possible character-only upgrade — no new dependencies in this plan.
- The scene's existing lights already provide the BOTW split: warm
  directional sun + cool hemisphere fill (`Backdrop.tsx`). No light changes.
- Toon lighting CONSUMES VERTEX NORMALS, which plan 018's pipeline drops
  (`unlit()` before `prune()` lets prune evict them). So `unlit()` comes OUT
  of the pipeline and all four assets rebuild with normals restored.

## Current state

(All at `696a321` on `feat/island-editor-v2`. The editor is an isolated pnpm
workspace at `island-editor/`; gate = `pnpm check:island-editor` from the repo
root — 19 test files / 194 tests green at this commit.)

### Raw sources for the rebuild (gitignored — your worktree's `assets/meshy/` is EMPTY)

- `~/Downloads/glb-models/tree-3.glb` — NEW tree source (32,279,444 B).
  Verified by inspection: 31,358 tris, one mesh `Mesh_0`, bounds
  ~14.5 × 18.0 × 16.6, base at y=0, 4 images, no animations. Same geometry as
  the previous tree-2 source; only textures changed.
- `~/Downloads/glb-models/grass.glb` (10,615,204 B), `~/Downloads/glb-models/bird.zip`
  (12,541,753 B — use the `..._Meshy_Merged_Animations.glb` inside, NOT
  `..._Character_output.glb`).
- Rock raw is only in the MAIN working tree:
  `/home/rezailmi/Developer/sensemaking-agents/island-editor/assets/meshy/rock.glb` (~8.1 MB).

### The pipeline (`island-editor/scripts/optimize-meshy-glb.mjs`)

Plan 018 added `unlit()` immediately before `prune()` in BOTH `build()`'s
chain and `buildCharacter()`'s chain, plus a numbered header-comment item 5
explaining unlit (and noting that removing `unlit()` + rebuilding restores
normals). The tree's `ASSETS` entry uses the keep-the-atlas lane
(`bakeVertexColors: false`, `simplify: null`, `textureSize: 512`,
`textureQuality: 80`, `height: 1.7`, `windAmp: 0.55`, `meshNode: 'crown'`).

### The unlit contract to reverse

- `island-editor/test/objectGlbs.test.ts` — has an
  `it.each(KINDS)('%s is KHR_materials_unlit — ...')` test and a matching
  test in the character describe block (4 assertions total across them).
  `SIZE_BUDGET_KB = { tree: 850, rock: 200, grass: 250 }`.
- `island-editor/src/models/buildObjectModel.ts:~114` — the bush:

```ts
  // MeshBasicMaterial (unlit): the shading is already baked into those vertex
  // colors, matching the GLB assets' KHR_materials_unlit contract (plan 018).
  const mat = new THREE.MeshBasicMaterial({ color: LEAF, vertexColors: true })
```

- `island-editor/test/buildObjectModel.test.ts:~70` asserts
  `toBeInstanceOf(THREE.MeshBasicMaterial)`.

### Where object materials flow at runtime

- `island-editor/src/models/useObjectModel.ts` — the single choke point for
  placed-object models. GLB kinds clone drei's `useGLTF` cache
  (`source.clone(true)`; the character via `SkeletonUtils.clone` wrapped in a
  scaled group); clones SHARE materials with the cache
  (`userData.sharedAssets = true`; `disposeObjectModel` skips them). A
  traverse already sets `castShadow`/`receiveShadow` on every mesh and
  `frustumCulled = false` on skinned meshes.
- `island-editor/src/scene/GrassLayer.tsx` — does NOT use useObjectModel; it
  pulls `geometry`/`material` straight off the cached `useGLTF('/models/grass.glb')`
  scene into one `InstancedMesh` (folding the meshopt dequant node matrix into
  instance matrices).
- `island-editor/src/scene/PlaceGhost.tsx` — clones whatever materials the
  model carries and makes them transparent; works for any material class.
- `island-editor/src/scene/CharacterActor.tsx` — drei `useAnimations` mixer on
  the clone; materials come from the clone (shared with cache).

**Material lifecycle constraint (drives the design below): clones share
cache materials and are never disposed.** Therefore the toon conversion must
happen ONCE, IN PLACE, on the CACHED scene — not per clone — so sharing and
the existing disposal rules keep working unchanged.

### Scene lights (`island-editor/src/scene/Backdrop.tsx:21-27`) — unchanged

```tsx
      <hemisphereLight args={['#cfe5ff', '#c8bb94', 0.65]} />
      <directionalLight ... />
```

The hemisphere's cool sky term is what gives toon-shaded objects the BOTW
blue-ish fill on the shade side.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` (repo root) | exit 0 |
| Rebuild all assets | `cd island-editor && pnpm build:models` | four summary lines |
| Gate | `pnpm check:island-editor` (repo root) | exit 0 |
| Typecheck only | `cd island-editor && npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you may modify/create):

- `island-editor/scripts/optimize-meshy-glb.mjs` (remove `unlit()`, comment)
- `island-editor/assets/meshy/*.glb` (re-staged raws, gitignored)
- `island-editor/public/models/*.glb` (all four rebuilt)
- `island-editor/assets/meshy/README.md` (tree row → tree-3)
- `island-editor/src/models/toonMaterial.ts` (create)
- `island-editor/src/models/useObjectModel.ts` (invoke conversion)
- `island-editor/src/models/buildObjectModel.ts` (bush material)
- `island-editor/src/scene/GrassLayer.tsx` (convert extracted material)
- `island-editor/test/objectGlbs.test.ts` (flip unlit contract → normals contract)
- `island-editor/test/buildObjectModel.test.ts` (material class)
- `island-editor/test/toonMaterial.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `IslandGroundMaterial.ts`, `SeaMaterial.ts`, `Backdrop.tsx` — terrain/sea/
  lights stay exactly as they are; the point is objects joining the existing
  lighting, not relighting the scene.
- `CharacterActor.tsx`, `PlaceGhost.tsx`, `PlacedObjects.tsx` — no changes
  needed; they inherit converted materials via the cache.
- `@pixiv/three-vrm-materials-mtoon` or any new dependency.
- Spec/terrain core (`src/terrain/**`, `src/editor/**`, `src/agent/**`).

## Git workflow

- Branch: `advisor/019-toon-object-lighting` off `feat/island-editor-v2`
  (which is at `696a321`).
- Commit: `feat(island-editor): BOTW toon lighting on objects + tree-3 retexture`
- Do NOT push or open a PR.

## Steps

### Step 1: Pipeline — drop `unlit()`, keep everything else

In `scripts/optimize-meshy-glb.mjs`:

1. Remove `unlit` from the `@gltf-transform/functions` import and remove the
   `unlit()` call from BOTH chains (`build()` and `buildCharacter()`).
2. Rewrite the header comment's item 5 (added by plan 018) to record the
   reversal in the file's register: objects are now TOON-LIT at runtime
   (`MeshToonMaterial` via `src/models/toonMaterial.ts`), so the assets must
   ship VERTEX NORMALS — which also means `prune()` keeps them and files grow
   back ~2–14% vs the unlit build. Emissive/MR/normal-map stripping and all
   compression stays.

**Verify**: `grep -n "unlit" island-editor/scripts/optimize-meshy-glb.mjs` →
no code references (a comment line mentioning the 018 reversal is fine).

### Step 2: Re-stage raws (tree-3!) and rebuild all four assets

```sh
cd island-editor
cp ~/Downloads/glb-models/tree-3.glb assets/meshy/tree.glb
cp ~/Downloads/glb-models/grass.glb assets/meshy/grass.glb
unzip -o -j ~/Downloads/glb-models/bird.zip \
  "Meshy_AI_Sunny_Chick_biped/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb" -d assets/meshy/
mv "assets/meshy/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb" assets/meshy/character.glb
cp /home/rezailmi/Developer/sensemaking-agents/island-editor/assets/meshy/rock.glb assets/meshy/rock.glb
pnpm build:models
```

**Verify**: four summary lines. Tree output tris ≈ 31,358 (tree-3's count —
slightly different from the old 31,365 is EXPECTED, it's a new export);
rock 2,709 / grass 3,022 / character 8,730 tris and 10 clips unchanged.
Sizes: rock < 200 KB, grass < 250 KB, character < 3 MB; tree target ≤ 850 KB —
if the new texture pushes it over, raising `SIZE_BUDGET_KB.tree` to at most
**900** with a WHY comment (normals restored for toon lighting + retexture)
is pre-approved; beyond 900 KB is a STOP.

Update `assets/meshy/README.md`: tree row → source `tree-3.glb` (~32.3 MB,
retexture of the same 31k-tri model); refresh the pasted script-output block.

### Step 3: Flip the asset contract tests (unlit → normals)

In `test/objectGlbs.test.ts`:

1. DELETE the `it.each(KINDS)` KHR_materials_unlit test and the character
   describe block's unlit test (both added by plan 018).
2. ADD in their place (same spots):
   - `it.each(KINDS)('%s ships vertex normals — toon lighting consumes them', ...)`:
     every primitive's `getAttribute('NORMAL')` is non-null, and NO material
     carries `getExtension('KHR_materials_unlit')` (guards against the 018
     pipeline coming back by accident).
   - The same two assertions in the character describe block.
3. Adjust `SIZE_BUDGET_KB.tree` only if Step 2 required it (≤ 900).

**Verify**: `cd island-editor && npx vitest run test/objectGlbs.test.ts` →
all pass against the rebuilt assets.

### Step 4: The shared toon material module

Create `island-editor/src/models/toonMaterial.ts` (THREE allowed here; no
r3f). Contents:

```ts
import * as THREE from 'three'

// BOTW-style banding: a tiny NearestFilter ramp quantizes N·L into steps —
// dark base, mid band, lit top (values are the look's main tuning knob; keep
// the darkest step well above 0 so shade reads cool-tinted by the hemisphere
// light, never black — same intent as the terrain shader's sky ambient).
let sharedRamp: THREE.DataTexture | null = null
export function objectGradientMap(): THREE.DataTexture {
  if (sharedRamp) return sharedRamp
  const data = new Uint8Array([115, 115, 115, 255, 200, 200, 200, 255, 255, 255, 255, 255])
  sharedRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  sharedRamp.minFilter = THREE.NearestFilter
  sharedRamp.magFilter = THREE.NearestFilter
  sharedRamp.generateMipmaps = false
  sharedRamp.needsUpdate = true
  return sharedRamp
}

/** Convert every mesh material under `root` to MeshToonMaterial IN PLACE,
 *  preserving map / vertexColors / color / transparency / side / name.
 *  Idempotent (safe to call on the same cached scene more than once) — this
 *  is called on drei's useGLTF CACHED scenes, so all clones share the
 *  converted materials and the existing never-dispose-shared rule holds. */
export function applyToonMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const converted = mats.map((m) => {
      if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) return m
      const src = m as THREE.MeshStandardMaterial
      const toon = new THREE.MeshToonMaterial({
        map: src.map ?? null,
        color: src.color?.clone() ?? new THREE.Color(0xffffff),
        vertexColors: src.vertexColors ?? false,
        transparent: src.transparent ?? false,
        opacity: src.opacity ?? 1,
        side: src.side ?? THREE.FrontSide,
        gradientMap: objectGradientMap(),
      })
      toon.name = src.name
      return toon
    })
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0]
  })
}
```

(Exact ramp values are a starting point — see the visual check.) The old
GLB-loaded materials become unreferenced but stay owned by the useGLTF cache;
do NOT dispose them (the cache may be re-read).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Wire the conversion at the two loading choke points

1. `src/models/useObjectModel.ts` — in the `useMemo`, BEFORE cloning, run the
   conversion on the cached source scene:
   `applyToonMaterials(gltfs[GLB_URL_LIST.indexOf(url)].scene)` (guarded by
   its own idempotence). Both static clones and the character's
   SkeletonUtils clone then inherit toon materials; the shadow/frustum
   traverse stays as-is (toon materials receive shadows — that's part of the
   point).
2. `src/scene/GrassLayer.tsx` — in its `useMemo`, call
   `applyToonMaterials(gltf.scene)` before extracting `geometry`/`material`,
   so the InstancedMesh renders toon too.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: Toon bush

`src/models/buildObjectModel.ts` — the bush material becomes:

```ts
  const mat = new THREE.MeshToonMaterial({
    color: LEAF,
    vertexColors: true,
    gradientMap: objectGradientMap(),
  })
```

with the comment updated (baked vertex-color shading now MULTIPLIES the toon
lighting — same system as the GLB objects; plan 019). Import
`objectGradientMap` from `./toonMaterial`. Update
`test/buildObjectModel.test.ts`'s material assertion to
`THREE.MeshToonMaterial`.

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 7: New unit test

Create `test/toonMaterial.test.ts` (node-only; model after
`buildObjectModel.test.ts`'s style):

1. `objectGradientMap()` returns the SAME texture instance on repeat calls;
   3×1, NearestFilter min+mag.
2. `applyToonMaterials` on a group holding a mesh with a
   `MeshStandardMaterial` (with a `map` set to a `new THREE.Texture()` and
   `vertexColors: true`) → material becomes `MeshToonMaterial`, `map`
   preserved (same instance), `vertexColors` true, `gradientMap` set.
3. Idempotence: calling it twice leaves the SAME material instance (no
   double-conversion).
4. A skinned-mesh-free InstancedMesh-style case is unnecessary — material
   conversion is mesh-type-agnostic; do not overbuild.

**Verify**: `cd island-editor && pnpm test` → all pass (expect ~4 new tests).

### Step 8: Gate + visual check

1. `pnpm check:island-editor` (repo root) → exit 0.
2. `pnpm dev:editor` → http://localhost:5180 (or state that the reviewer will
   do this if headless): trees show the NEW tree-3 texture; every object
   (tree/rock/bush/grass/chick) now has a lit warm side and a cooler shaded
   side with a visible soft band when orbiting; objects RECEIVE shadows again
   (chick darkens under a tree); character animation, wind sway, grass
   painting, ghost transparency all unaffected.

## Test plan

- Flipped: 4 unlit assertions → normals-present + no-unlit assertions
  (objectGlbs.test.ts); bush material class (buildObjectModel.test.ts).
- New: `test/toonMaterial.test.ts` (~4 cases, Step 7).
- Everything else must pass unchanged: `pnpm check:island-editor` → exit 0
  (expect ~197 tests: 194 base − 0 removed files + new cases; exact count in
  your report).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "unlit(" island-editor/scripts/optimize-meshy-glb.mjs` → no hits
- [ ] `grep -rn "KHR_materials_unlit" island-editor/test/objectGlbs.test.ts` →
      only in the "must NOT carry" assertions
- [ ] `grep -rn "MeshToonMaterial" island-editor/src/models` → toonMaterial.ts
      + buildObjectModel.ts hits
- [ ] `grep -n "applyToonMaterials" island-editor/src/models/useObjectModel.ts island-editor/src/scene/GrassLayer.tsx` → one hit each
- [ ] All four `public/models/*.glb` rebuilt; tree tris ≈ 31,358; budgets hold
      (tree ≤ 900 KB documented if > 850)
- [ ] `git status` — no files outside the in-scope list
- [ ] `plans/README.md` — 019 row updated AND 018's row annotated
      "superseded by 019 (unlit → toon)" (reviewer may handle the index)

## Amendment (2026-07-12, reviewer, during execution)

The Step 2 rebuild hit the 900 KB STOP: tree output = 995,336 B (972 KB).
Diagnosis (verified by reviewer in the executor's worktree): NOT texture
entropy — the output's single 512² WebP is ~50 KB. Tree-3's re-atlased UVs
split the same 31,358-tri mesh into **88,542 vertices** (~2.82 verts/tri,
vs tree-2's ~58k), and those survive the pipeline's existing `dedup()+weld()`
(gltf-transform v4 welds exact matches only; seam vertices differ in UV).
Restoring normals for toon lighting adds ~12 B/vertex on top. No lossless
lever exists: position-only welding would corrupt the atlas, `simplify` is
deliberately off for the tree (and floors out at chart borders per the
script's own header), and the texture is already tiny.

**Resolution (authorized under the operator's ship-it goal): accept the
972 KB tree; raise `SIZE_BUDGET_KB.tree` to 1000** with a WHY comment
(tree-3 retexture re-atlased UVs → +53% seam-split vertices + normals
restored for toon lighting; texture ~50 KB; geometry irreducible without
simplify). This supersedes the plan's 900 KB ceiling and the Step 3 /
done-criteria references to it. Reclaiming ~120 KB later requires a tree-3
re-export sharing tree-2's UV layout — recorded as a follow-up option, not
a blocker.

## STOP conditions

- `~/Downloads/glb-models/tree-3.glb` missing or size wildly off 32,279,444 B
  (the maintainer iterates on these files — if a tree-4 appears instead,
  report, don't guess).
- Tree output exceeds 900 KB, or any OTHER asset's budget fails after the
  normals-restoring rebuild.
- Character loses clips (≠10) or its skin after rebuild.
- Toon conversion type-checks but you have evidence the character renders
  black/unshaded — suspect the material swap on the SkinnedMesh path; verify
  `applyToonMaterials` ran on the cached scene BEFORE `SkeletonUtils.clone`,
  then report if unresolved.
- You find yourself wanting to add `@pixiv/three-vrm-materials-mtoon`, edit
  `Backdrop.tsx` lights, or patch shaders with `onBeforeCompile` — all
  deliberately out of scope; report instead.

## Maintenance notes

- **The look's tuning knobs**: the 3 ramp values in `objectGradientMap()`
  (band depths), and — outside this plan — `Backdrop`'s hemisphere colors
  (cool fill) and the terrain shader's constants. Tune ramp first.
- **018 relationship**: unlit is fully superseded for objects. If unlit is
  ever wanted back, revert this plan's runtime changes AND re-add `unlit()`
  to the pipeline — the objectGlbs normals test will flag half-reverts.
- **Character upgrade lane (deferred)**: MToon
  (`@pixiv/three-vrm-materials-mtoon`) adds rim light + inverted-hull
  outlines for a Genshin-style character pop; drei `<Outlines>` is the
  lighter option. Either would be a new plan.
- **Reviewer focus**: idempotence of `applyToonMaterials` (it mutates drei's
  shared cache — double-conversion or per-clone conversion would leak);
  the PlaceGhost still ghosts correctly (it clones the now-toon materials);
  tree-3's texture entropy vs the 850/900 KB budget.
