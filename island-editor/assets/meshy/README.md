# Raw Meshy AI exports

**Not in git** (see `island-editor/.gitignore`) — these are 65 MB and 8 MB, and the
only thing downstream of them is the ~240 KB of built assets in `public/models/`,
which *are* checked in. Nothing at dev or build time reads this directory; only
`scripts/optimize-meshy-glb.mjs` does, and only when you re-run it.

| file       | source prompt         | raw size |
| ---------- | --------------------- | -------- |
| `tree.glb` | "Emerald Canopy"      | 65.6 MB  |
| `rock.glb` | "Lone Rock in the Meadow" | 8.1 MB |

## Rebuilding

```sh
pnpm build:models          # both
node scripts/optimize-meshy-glb.mjs tree   # one
```

The script prints what it did:

```
tree   64060 KB →  160 KB  (400× smaller)   tris 1,002,536 → 28,478   scale ×0.113
rock    7903 KB →   80 KB  (99× smaller)    tris     2,709 →  2,709   scale ×1.000
```

`test/objectGlbs.test.ts` is the guard rail — it fails if a rebuild drifts off the
runtime contract (size/triangle budget, world scale, the `canopy` wind pivot, no
resurrected emissive map).

## Adding another Meshy asset

Add an entry to `ASSETS` in `scripts/optimize-meshy-glb.mjs`, drop the raw `.glb`
here, and add the kind to `ObjectKind` in `src/terrain/terrainGrid.ts` (plus
`KIND_META` in `src/ui/icons.tsx` for its palette icon, and `GLB_MODEL_URLS` in
`src/models/useObjectModel.ts`).

The one setting worth understanding is `bakeVertexColors`. A Meshy mesh cannot be
decimated while it carries its UV atlas — the atlas splits vertices at every chart
border and meshoptimizer will not collapse across an attribute discontinuity, so
the tree floors out at ~547k triangles no matter how loose the error cap. Baking
the albedo into vertex colors and dropping the atlas is what unblocks it (and it
matches the house art direction). Turn it on for anything organic and high-poly;
leave it off for low-poly assets like the rock, where the texture is cheap and
carries detail the vertices never could. The long comment on `bakeVertexColors()`
has the full reasoning.
