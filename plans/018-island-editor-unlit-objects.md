# Plan 018: Island editor — render placed objects in unlit mode

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check**: this plan stacks on `advisor/017-animated-character`
> (which contains 014+015+016+017). Verify your base has
> `buildCharacter` in `island-editor/scripts/optimize-meshy-glb.mjs` and
> `character.glb` in `island-editor/public/models/` before starting; treat
> their absence as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED (asset rebuild + one visual gate)
- **Depends on**: plans 015–017 (asset pipeline + character; base branch
  `advisor/017-animated-character`)
- **Category**: direction (visual style)
- **Planned at**: 2026-07-12, against branch `advisor/017-animated-character`

## Why this matters

The maintainer wants the island editor's placed objects (tree, bush, rock,
grass tufts, character) rendered **unlit**: their baked texture / vertex
colors shown as-is, ignoring the scene's hemisphere + directional lights.
Meshy exports carry lighting baked into their color maps, so lighting them
again with the scene sun double-shades them; unlit is the intended stylized
look. The terrain and sea keep their existing custom shaders (BOTW ground
lighting, shore stack) — this plan changes OBJECT lighting only.

The clean mechanism is the standard `KHR_materials_unlit` glTF extension,
baked into the assets by the existing pipeline: gltf-transform ships an
`unlit()` transform (verified exported by the installed
`@gltf-transform/functions`), and three's GLTFLoader natively converts
`KHR_materials_unlit` materials to `MeshBasicMaterial` — including on skinned
meshes (skinning works with any built-in material in three r171). No editor
runtime code changes for GLB assets; the only runtime-lit material left is
the procedural bush's.

Expected behavior change to communicate in review: unlit objects still CAST
shadows onto the lit terrain (`castShadow` is a depth-pass concern), but no
longer RECEIVE shadows or react to the sun (`MeshBasicMaterial` cannot).
That is inherent to unlit mode, not a bug.

## Current state

(All against branch `advisor/017-animated-character`.)

- `island-editor/scripts/optimize-meshy-glb.mjs` — the asset pipeline.
  `build()`'s final transform chain ends with
  `textureCompress(...), prune(), meshopt(...)`; `buildCharacter()` has its
  own chain `resample(), dedup(), textureCompress(...), prune(), meshopt(...)`.
  Both import from `@gltf-transform/functions`.
- Raw sources are gitignored, so your fresh worktree's
  `island-editor/assets/meshy/` is EMPTY. Re-stage before rebuilding:
  - `cp ~/Downloads/glb-models/tree-2.glb island-editor/assets/meshy/tree.glb`
  - `cp ~/Downloads/glb-models/grass.glb island-editor/assets/meshy/grass.glb`
  - `unzip -o -j ~/Downloads/glb-models/bird.zip "Meshy_AI_Sunny_Chick_biped/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb" -d island-editor/assets/meshy/ && mv island-editor/assets/meshy/Meshy_AI_Sunny_Chick_biped_Meshy_AI_Meshy_Merged_Animations.glb island-editor/assets/meshy/character.glb`
  - Rock raw is NOT in Downloads — copy it from the MAIN working tree:
    `cp /home/rezailmi/Developer/sensemaking-agents/island-editor/assets/meshy/rock.glb island-editor/assets/meshy/rock.glb`
- `island-editor/src/models/buildObjectModel.ts:113` — the bush (the one
  procedural, runtime-built model):

```ts
  const mat = new THREE.MeshStandardMaterial({ color: LEAF, vertexColors: true, roughness: 1, metalness: 0 })
```

  Its shading is already baked into vertex colors (see the `sky` term around
  line 96), so switching to `MeshBasicMaterial` renders its intended look
  without double-lighting.
- `island-editor/test/objectGlbs.test.ts` — asset contract tests (KINDS =
  tree/rock/grass + a separate character describe block). The "matte"
  assertions read PBR factors, which remain present and unchanged when the
  unlit extension is added (it is additive) — they should keep passing.
- `island-editor/test/buildObjectModel.test.ts` — may assert the bush's
  material type/roughness; adjust only what the material swap breaks.
- Scene lights (`island-editor/src/scene/Backdrop.tsx:21-27`): hemisphere +
  directional (shadow-casting) — UNCHANGED; the terrain shader consumes them.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` (repo root) | exit 0 |
| Rebuild all assets | `cd island-editor && pnpm build:models` | four summary lines |
| Gate | `pnpm check:island-editor` (repo root) | exit 0 |
| Visual | `pnpm dev:editor` → localhost:5180 | objects flat-lit |

## Scope

**In scope**:

- `island-editor/scripts/optimize-meshy-glb.mjs` (add `unlit()` to both chains)
- `island-editor/assets/meshy/*.glb` (re-staged raws, gitignored)
- `island-editor/public/models/tree.glb`, `rock.glb`, `grass.glb`,
  `character.glb` (rebuilt)
- `island-editor/src/models/buildObjectModel.ts` (bush material only)
- `island-editor/test/objectGlbs.test.ts` (add unlit assertions)
- `island-editor/test/buildObjectModel.test.ts` (only if the material swap
  breaks an assertion)
- `plans/README.md` (status row)

**Out of scope**:

- Terrain/sea/backdrop shaders and lights (`IslandGroundMaterial`,
  `SeaMaterial`, `Backdrop`) — the scene stays lit; only objects go unlit.
- `useObjectModel.ts` / `CharacterActor.tsx` / `GrassLayer.tsx` — no runtime
  changes needed; GLTFLoader does the conversion. (Leave the
  `castShadow/receiveShadow` traverse as-is — receiveShadow becomes inert on
  basic materials, which is fine.)
- Asset budgets/knobs beyond adding `unlit()` (sizes should barely move).

## Git workflow

- Branch: `advisor/018-unlit-objects` off `advisor/017-animated-character`.
- Commit: `feat(island-editor): render placed objects unlit`
- Do NOT push or open a PR.

## Steps

### Step 1: Add `unlit()` to the pipeline

In `scripts/optimize-meshy-glb.mjs`: import `unlit` from
`@gltf-transform/functions`; insert `unlit()` immediately before `prune()` in
BOTH `build()`'s chain and `buildCharacter()`'s chain. Add a WHY comment in
the file's register: Meshy maps carry baked lighting; the scene's sun would
double-shade them; `KHR_materials_unlit` → GLTFLoader gives
`MeshBasicMaterial` with zero loader-side setup, and the objects still cast
onto the lit terrain.

**Verify**: `node -e "require('@gltf-transform/functions').unlit"` exits 0
(or equivalent import check via the build run in Step 2).

### Step 2: Re-stage raws and rebuild all four assets

Run the staging commands from "Current state", then
`cd island-editor && pnpm build:models`.

**Verify**: four summary lines print; output sizes within existing budgets
(tree < 850 KB, rock < 200 KB, grass < 250 KB, character < 3 MB — unlit adds
only an extension flag; a large size change means something else regressed).

### Step 3: Contract tests

In `test/objectGlbs.test.ts`:

- Add to the shared `it.each(KINDS)` coverage (or one new `it.each`): every
  material carries the unlit extension —
  `material.getExtension('KHR_materials_unlit')` is non-null — and
  `KHR_materials_unlit` appears in `listExtensionsUsed()` names.
- Same two assertions inside the character describe block.
- Run the existing matte tests unchanged — if any fail because `unlit()`
  pruned a PBR property they read, adjust ONLY the mechanically-broken
  reads and document it in NOTES.

**Verify**: `cd island-editor && npx vitest run test/objectGlbs.test.ts` →
all pass.

### Step 4: Unlit bush

`src/models/buildObjectModel.ts:113` →
`const mat = new THREE.MeshBasicMaterial({ color: LEAF, vertexColors: true })`
with a one-line WHY (shading is baked into the vertex colors; keep parity
with the GLB assets' KHR_materials_unlit). Fix `buildObjectModel.test.ts`
only if it asserted the old material class/props.

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 5: Gate + visual

`pnpm check:island-editor` (repo root) → exit 0. Then `pnpm dev:editor`:
tree/rock/grass/bush/character render with flat baked colors (no sun-side /
shade-side difference when orbiting); objects still cast shadows on the
ground; character animation and wind sway unaffected.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "unlit" island-editor/scripts/optimize-meshy-glb.mjs` → import
      + two chain insertions + comment
- [ ] `grep -n "KHR_materials_unlit" island-editor/test/objectGlbs.test.ts` → assertions present
- [ ] `grep -n "MeshBasicMaterial" island-editor/src/models/buildObjectModel.ts` → bush swapped
- [ ] All four `public/models/*.glb` rebuilt (git shows binary changes) within budgets
- [ ] `git status` — no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

- Base branch lacks 017's work (no `buildCharacter`, no character.glb).
- Any raw source missing (Downloads: tree-2.glb / grass.glb / bird.zip; main
  tree: island-editor/assets/meshy/rock.glb) or byte-size wildly off
  (50.6 MB / 10.6 MB / 12.5 MB / 8.1 MB).
- `unlit()` not exported by the installed `@gltf-transform/functions`.
- A rebuilt asset's size or tri count moves materially (> a few KB / any tri
  change) — unlit must not change geometry.
  **AMENDED 2026-07-12 after first execution**: a size DECREASE of ~2–14% is
  expected and accepted — `unlit()` before `prune()` lets prune evict the
  now-unused vertex NORMAL attribute (MeshBasicMaterial and the shadow
  depth-pass never read it). Triangle counts must still be unchanged. If lit
  materials are ever wanted back, remove `unlit()` and rebuild — normals
  regenerate from the raws.
- The character loses clips/skin after rebuild (compare against
  objectGlbs.test.ts's assertions — they gate this).

## Maintenance notes

- Unlit is now part of the ASSET contract, enforced by objectGlbs.test.ts —
  a future rebuild without `unlit()` in the chain fails tests, not just eyes.
- If receive-shadows-on-objects is ever wanted back, that's a real lighting
  redesign (custom shader or lit materials with baked-light compensation),
  not a knob — record it as a new plan.
- The ghost preview (PlaceGhost) clones materials and sets
  transparent/opacity — works identically on MeshBasicMaterial.
