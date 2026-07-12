# Raw Meshy AI exports

**Not in git** (see `island-editor/.gitignore`) — these range from ~7 MB to ~50 MB,
and the only thing downstream of them is the ~1.8 MB of built assets in
`public/models/`, which *are* checked in. Nothing at dev or build time reads this
directory; only `scripts/optimize-meshy-glb.mjs` does, and only when you re-run it.

| file            | source prompt                              | raw size |
| ---------------- | ------------------------------------------ | -------- |
| `tree.glb`       | "Emerald Canopy" (re-export, `tree-2.glb` on disk) | 50.6 MB |
| `rock.glb`       | "Lone Rock in the Meadow"                  | 8.1 MB   |
| `grass.glb`      | "Grass Patch on Grid"                       | 10.6 MB  |
| `character.glb`  | "Sunny Chick biped" — the `..._Meshy_Merged_Animations.glb` GLB from the zip (NOT `..._Character_output.glb`, which only carries a 0.03s dummy clip) | 6.9 MB |

The maintainer's downloads for these landed under generic names (`tree.glb`,
`tree-2.glb`, `grass.glb`, `bird.zip`) rather than their original Meshy export
filenames — content was verified by inspection (triangle counts, bounds, material
layout, animation clip names/durations) before staging, not by filename.

## Rebuilding

```sh
pnpm build:models          # all four
node scripts/optimize-meshy-glb.mjs tree   # one
```

The script prints what it did:

```
tree      49423 KB →  819 KB  (60× smaller)   tris    31,365 → 31,365   scale ×0.094
rock       7903 KB →   80 KB  (99× smaller)   tris     2,709 →  2,709   scale ×1.000
grass     10366 KB →   89 KB (116× smaller)   tris     3,022 →  3,022   scale ×1.600
character  6757 KB →  541 KB  (12× smaller)   tris     8,730 →  8,730   clips 10
```

`test/objectGlbs.test.ts` is the guard rail — it fails if a rebuild drifts off the
runtime contract (size/triangle budget, world scale, the `canopy` wind pivot, no
resurrected emissive map, and — for the character — the skin, clip count and clip
names surviving intact).

## Adding another Meshy asset

Add an entry to `ASSETS` in `scripts/optimize-meshy-glb.mjs`, drop the raw `.glb`
here, and add the kind to `ObjectKind` in `src/terrain/terrainGrid.ts` (plus
`KIND_META` in `src/ui/icons.tsx` for its palette icon, and `GLB_MODEL_URLS` in
`src/models/useObjectModel.ts`).

The one setting worth understanding is `bakeVertexColors`. A Meshy mesh cannot be
decimated while it carries its UV atlas — the atlas splits vertices at every chart
border and meshoptimizer will not collapse across an attribute discontinuity, so a
1M+-triangle atlas'd source floors out at roughly half its triangle count no matter
how loose the error cap. Baking the albedo into vertex colors and dropping the
atlas is what unblocks it (and it matches the house art direction). Turn it on for
anything organic, high-poly, AND undecimated (i.e. still carrying its original
atlas); leave it off for assets that are already low-poly (rock, grass) or already
pre-decimated with the detail living in their texture (tree, as of the 2026-07-12
"Emerald Canopy" re-export — see the `tree` entry's comment), where the texture is
cheap relative to the model and carries detail the vertices never could. The long
comment on `bakeVertexColors()` has the full reasoning.

## The character is a different pipeline

`character.glb` is SKINNED (a rig + 10 animation clips), and the shared `build()`
pipeline above would corrupt it: baking a scale/recenter into a skinned mesh's
vertices (`normalize()`) without also rewriting the skin's inverse-bind matrices
and every keyframe breaks the pose, and decimating (`simplify`/`weld`) can break
the skin-index/weight correspondence. `optimize-meshy-glb.mjs` dispatches skinned
`ASSETS` entries (`skinned: true`) to a dedicated `buildCharacter()` instead: no
decimation, no scale-baking, no rerooting — just material cleanup, `resample()`
(losslessly thins dense per-frame keyframes), texture compression, and `meshopt`.
The asset therefore ships at its SOURCE scale (~1.62 tall, base at y=0); the
runtime (plan 017) scales it at placement time. This is consumed by plans 016
(grass) and 017 (character) runtime work.
