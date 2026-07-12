# Plan 016: Island editor — drag-painted grass replaces the dirt path (spec v5)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c78ba00..HEAD -- island-editor/src island-editor/test`
> Plans 014 and 015 may have landed since this was written — their changes to
> `specIO.ts`/`terrainGrid.ts` (014: tier-height migration) and
> `test/objectGlbs.test.ts` (015) are EXPECTED and fine. For any OTHER drift
> in the files this plan excerpts, compare against "Current state"; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (spec format bump + shader change + new render layer)
- **Depends on**: plans/015-island-editor-meshy-asset-refresh.md (needs
  `public/models/grass.glb`)
- **Category**: direction (feature)
- **Planned at**: commit `c78ba00`, 2026-07-12

## Why this matters

The maintainer wants the island editor's dirt-path tool **removed** and
replaced by a **grass tool**: drag-painting cells (exactly like the raise /
lower / path strokes work today) scatters 3D grass tufts (the
`public/models/grass.glb` asset from plan 015) across the painted cells. The
painted-surface data layer that today means "dirt path" is repurposed to mean
"grass", which changes the meaning of serialized data — so the island spec
version bumps to 5 with a load-time migration that clears old path paint
(the feature it encoded no longer exists) while preserving everything else.

## Current state

The island editor is an isolated pnpm workspace at `island-editor/`
(`pnpm dev:editor` → port 5180; gate: `pnpm check:island-editor` from repo
root — it is NOT covered by root `pnpm check`). React + @react-three/fiber +
drei on three@0.171. Pure terrain core has NO three imports
(`src/terrain/*.ts`, enforced by convention).

### The surface layer today

`island-editor/src/terrain/terrainGrid.ts:8-12`:

```ts
export const MAX_TIER = 4 // tiers 0..4
export const GRID_COLS = 64
export const GRID_ROWS = 64
export const SURFACE_AUTO = 0 // grass/sand derived from tier
export const SURFACE_PATH = 1 // dirt path tint
```

`grid.surface` is a row-major `number[]` of these codes, sibling to
`grid.tiers`. `CURRENT_SPEC_VERSION = 4` (`terrainGrid.ts:50`); the
`IslandSpec` interface has `version: 4` (`terrainGrid.ts:31`).

Every consumer of `SURFACE_PATH` (complete list, verified by grep):

- `src/terrain/gridOps.ts:6,13` — import + `clampSurface` upper bound.
- `src/editor/gridCodec.ts:5,82` — digit-string codec; decode max digit.
- `src/editor/specIO.ts:21,71` — numeric-grid validation max code.
- `src/agent/applyOps.ts:4,59-60` — `paintRect` op's allowed surface values.
- `src/App.tsx:35,169` — the `path` tool paints it (excerpt below).
- Tests: `test/gridOps.test.ts:11,87-89`, `test/gridCodec.test.ts:3,9,56`,
  `test/applyOps.test.ts:6,53,56,97`.

### The paint interaction (this is what "grass painting" reuses verbatim)

`src/App.tsx:158-175` — the stroke switch inside `paint()` (drag-driven; the
stroke lifecycle in App.tsx:102-191 handles snapshot/undo, drag interpolation
via `cellLine`, brush sizes, and single-touch-per-cell):

```ts
    switch (toolRef.current) {
      case 'raise':
        adjustTierToward(grid, cells, +1, strokeTarget.current)
        break
      case 'lower':
        adjustTierToward(grid, cells, -1, strokeTarget.current)
        break
      case 'water':
        setTier(grid, cells, 0)
        break
      case 'path':
        setSurface(grid, cells, SURFACE_PATH)
        break
      case 'erase':
        setSurface(grid, cells, SURFACE_AUTO)
        break
    }
```

The tool union lives in `src/ui/icons.tsx:4`
(`export type Tool = 'raise' | 'lower' | 'water' | 'path' | 'erase'`) with
`PathIcon` (icons.tsx:38-42), `TOOL_META` (icons.tsx:155-161); the toolbar
order and hints live in `src/ui/ToolPanel.tsx:6-15`:

```ts
const TOOLS: Tool[] = ['raise', 'lower', 'water', 'path', 'erase']
...
  path: 'Paint a dirt path onto flat ground.',
  erase: 'Erase painted paths back to grass or sand.',
```

### The path tint in the ground shader

`src/scene/materials/IslandGroundMaterial.ts:134-136` (fragment shader; the
`vSurface` varying carries the containing cell's surface code, written as the
`aSurface` geometry attribute by `src/terrain/buildIslandGeometry.ts:106`):

```glsl
  // Path: dirt-tint lane on flat ground, tier ≥ 1 (applied before lighting).
  float pathF = smoothstep(0.5, 0.9, vSurface) * smoothstep(0.6, 1.0, vTierFlat);
  flatColor = mix(flatColor, vec3(0.62, 0.47, 0.30), pathF * 0.7);
```

`uGrassColor` (default `0x4a8f3f`) already exists as a uniform in the same
shader. `test/materials.test.ts` asserts the uniform list and that the
fragment ends with `#include <colorspace_fragment>` — it does NOT pin the
path GLSL, so replacing that block breaks no test.

### Spec validation / migration (where the v5 migration goes)

`src/editor/specIO.ts` — `validateSpecObject` accepts v1/v2 (rasterize via
legacy module), v3 (grid, `objects: []`), v4 (grid + objects), normalizing to
`CURRENT_SPEC_VERSION`. Key excerpt (specIO.ts:153-184, may have plan-014's
tier-height migration added nearby — that logic stays):

```ts
  if (o.version !== 3 && o.version !== CURRENT_SPEC_VERSION) {
    throw new Error(
      `Invalid island spec: version must be 1, 2, 3, or ${CURRENT_SPEC_VERSION}, got ${String(o.version)}`,
    )
  }
  ...
  const grid = toGrid(o.grid)
  // v3 migrates forward with an empty objects layer; v4 validates its objects.
  const objects = o.version === CURRENT_SPEC_VERSION ? validateObjects(o.objects, grid) : []
```

The autosave storage key deliberately survives format bumps
(`src/editor/persistence.ts:13`: `island-editor:spec:v1` — do not change it).

### Rendering pattern to follow for the grass layer

`src/scene/PlacedObjects.tsx` + `src/models/useObjectModel.ts` show the house
GLB conventions: drei `useGLTF` (meshopt decoder auto-registered; assets are
`EXT_meshopt_compression`'d), models under `<Suspense>` in `App.tsx:418-421`,
shadows enabled per mesh. **Meshopt quantization caveat** (from
useObjectModel.ts:30-39): the quantization compensation translate+scale sits
on the node that HOLDS the mesh — so when instancing the grass geometry you
must fold that node's matrix into every instance matrix (Step 5).

Deterministic seeded variety uses `mulberry32` from `src/models/rand.ts`
(exported, already used by useObjectModel).

Terrain height at any world point: `evaluateHeight(spec, x, z, blurred)` from
`src/terrain/terrainGrid.ts:225` (pass a precomputed `blurTiers(spec.grid)`
in loops); cell centers via `cellCenter(worldSize, grid, c, r)`
(terrainGrid.ts:63); land test via `isLandTier(tier, tierHeights, seaLevel)`
from `src/terrain/gridOps.ts:65`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck + tests (gate) | `pnpm check:island-editor` (repo root) | exit 0 |
| Tests only | `cd island-editor && pnpm test` | all pass |
| Visual check | `pnpm dev:editor` → http://localhost:5180 | see Step 8 |

## Scope

**In scope** (the only files you may modify/create):

- `island-editor/src/terrain/terrainGrid.ts`
- `island-editor/src/terrain/gridOps.ts`
- `island-editor/src/editor/gridCodec.ts`
- `island-editor/src/editor/specIO.ts`
- `island-editor/src/agent/applyOps.ts`
- `island-editor/src/App.tsx`
- `island-editor/src/ui/icons.tsx`, `island-editor/src/ui/ToolPanel.tsx`
- `island-editor/src/scene/materials/IslandGroundMaterial.ts`
- `island-editor/src/scene/GrassLayer.tsx` (create)
- `island-editor/test/` — `gridOps.test.ts`, `gridCodec.test.ts`,
  `applyOps.test.ts`, `specIO.test.ts`, `grassLayer.test.ts` (create, pure
  logic only), plus any `version: 4` literals in test helpers
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `island-editor/src/agent/ops.ts` — the `paintRect` op shape is unchanged
  (surface stays a number; only the accepted values' meaning shifts).
- `src/terrain/legacy/specV2.ts` — v1/v2 rasterization already writes only
  `SURFACE_AUTO`; nothing to migrate there.
- `SeaSurface`/`shoreField`/`persistence.ts` — untouched by this feature.
- `scripts/optimize-meshy-glb.mjs`, `public/models/*` — plan 015 owns assets.
- The product app (`src/` at repo root).

## Git workflow

- Branch: `advisor/016-grass-paint` off `feat/island-editor-v2` (after 015 is
  merged/landed — this plan reads `public/models/grass.glb`).
- Commit style: `feat(island-editor): drag-painted grass replaces the dirt path`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Repurpose the surface code (pure core)

In `src/terrain/terrainGrid.ts`:

- Replace `export const SURFACE_PATH = 1 // dirt path tint` with
  `export const SURFACE_GRASS = 1 // painted grass tufts (v5; was dirt path in ≤v4)`.
- Bump `CURRENT_SPEC_VERSION` to `5` and the `IslandSpec` interface to
  `version: 5`. Update the doc comment on `CURRENT_SPEC_VERSION` to note v5 =
  "surface code 1 means grass; ≤v4 files' path paint is cleared on load".
- `src/terrain/gridOps.ts`: update the import and `clampSurface`'s upper
  bound to `SURFACE_GRASS`.
- `src/editor/gridCodec.ts`: import + `decodeLayer(..., SURFACE_GRASS)`.
- Fix every other compile error from the rename mechanically (specIO import,
  applyOps import — their logic changes come in Steps 2–3).

**Verify**: `cd island-editor && npx tsc --noEmit` → only errors remaining (if
any) are the `version: 4` literals in tests/seed, fixed next.

### Step 2: Spec v5 migration in `validateSpecObject`

In `src/editor/specIO.ts`:

- Accept versions 1, 2, 3, 4, and 5 (update the error message).
- Objects: validate for versions 4 AND 5 (`o.version >= 4`); v3 still gets
  `objects: []`.
- **Migration**: when `o.version === 3 || o.version === 4`, replace the
  decoded grid's surface layer with all `SURFACE_AUTO` — code 1 meant the
  now-removed dirt path. Style it like the file's existing migration comments
  ("an island saved yesterday must still open"): paths silently disappear;
  tiers and objects are untouched. v5 input keeps its surface as-is.
- `src/terrain/seed.ts`: the seed spec's `version` literal → `5` (its surface
  layer is already all-AUTO via the v2 rasterizer).
- Update `version: 4` literals in test helper specs (`test/applyOps.test.ts:10`,
  `test/buildIslandGeometry.test.ts:16`, `test/terrainGrid.test.ts:21`) to `5`.

**Verify**: `cd island-editor && pnpm test` → suites compile; specIO tests may
have version-literal expectations to update (do so — e.g. round-trip asserts
`version: 5`); everything else passes.

### Step 3: Agent op + editor tool switch

- `src/agent/applyOps.ts:58-61`: `paintRect` accepts `SURFACE_AUTO` or
  `SURFACE_GRASS`; update the error string accordingly.
- `src/ui/icons.tsx`: `Tool` union `'path'` → `'grass'`; replace `PathIcon`
  with a `GrassIcon` (blade silhouette in the file's stroke style, e.g. three
  upward curved strokes from a common baseline — match `svgProps` usage);
  `TOOL_META` entry `grass: { label: 'Grass', Icon: GrassIcon }`.
- `src/ui/ToolPanel.tsx`: `TOOLS` array `'path'` → `'grass'`; hints:
  `grass: 'Click-drag to plant grass on land.'` and
  `erase: 'Erase painted grass back to bare ground.'`.
- `src/App.tsx`: import `SURFACE_GRASS` (drop `SURFACE_PATH`); the paint
  switch's `case 'path'` becomes `case 'grass'` painting `SURFACE_GRASS`.

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.
`grep -rn "SURFACE_PATH\|'path'" island-editor/src` → no hits.

### Step 4: Ground shader — path tint becomes grass under-tint

In `src/scene/materials/IslandGroundMaterial.ts`, replace the path block
(lines 134-136, excerpted in "Current state") with a green under-tint so the
ground reads grassy beneath the tufts and painted cells are visible even
before the instances load:

```glsl
  // Painted grass (surface code 1): tint the ground under the instanced tufts
  // (GrassLayer) toward the grass tone so patch edges blend instead of sitting
  // on bare sand. Land only (tier ≥ 1) — paint on water cells stays invisible.
  float grassPaintF = smoothstep(0.5, 0.9, vSurface) * smoothstep(0.6, 1.0, vTierFlat);
  flatColor = mix(flatColor, uGrassColor * 0.85, grassPaintF * 0.55);
```

Also update the file-top comment's mention of the path lane.

**Verify**: `cd island-editor && npx vitest run test/materials.test.ts` → pass
(it pins uniforms + colorspace include, not this block).

### Step 5: The instanced grass layer

Create `src/scene/GrassLayer.tsx` — one `THREE.InstancedMesh` covering every
grass-painted LAND cell. Follow the conventions in "Current state". Sketch:

```tsx
// Painted grass: one InstancedMesh over every SURFACE_GRASS land cell. A single
// draw call regardless of coverage (up to the full 64×64 grid). Deterministic
// per-cell yaw/scale jitter (mulberry32 seeded by cell index) so the meadow is
// stable across edits/reloads. Static — no wind (the canopy spring drives only
// placed objects; see plan-015 notes).
export function GrassLayer({ spec }: { spec: IslandSpec }) {
  const gltf = useGLTF('/models/grass.glb')
  // Meshopt parks its dequantization translate+scale on the node holding the
  // mesh ('tuft'), so that node matrix must be folded into every instance.
  const { geometry, material, dequant } = useMemo(() => {
    let mesh: THREE.Mesh | undefined
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((n) => { if (!mesh && (n as THREE.Mesh).isMesh) mesh = n as THREE.Mesh })
    if (!mesh) throw new Error('grass.glb has no mesh')
    return { geometry: mesh.geometry, material: mesh.material as THREE.Material, dequant: mesh.matrixWorld.clone() }
  }, [gltf])

  const meshRef = useRef<THREE.InstancedMesh>(null)
  const capacity = spec.grid.cols * spec.grid.rows // 4096; count set per edit

  useEffect(() => {
    const im = meshRef.current
    if (!im) return
    const { grid, worldSize, tierHeights, seaLevel } = spec
    const blurred = blurTiers(grid)
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion()
    const p = new THREE.Vector3(); const s = new THREE.Vector3()
    let n = 0
    for (let i = 0; i < grid.tiers.length; i++) {
      if (grid.surface[i] !== SURFACE_GRASS) continue
      if (!isLandTier(grid.tiers[i], tierHeights, seaLevel)) continue
      const c = i % grid.cols, r = Math.floor(i / grid.cols)
      const rand = mulberry32(i + 1) // +1: mulberry32(0) degenerate seed
      const { x, z } = cellCenter(worldSize, grid, c, r)
      p.set(x, evaluateHeight(spec, x, z, blurred), z)
      q.setFromAxisAngle(UP, rand() * Math.PI * 2)
      s.setScalar(0.95 + rand() * 0.4)
      m.compose(p, q, s).multiply(dequant)
      im.setMatrixAt(n++, m)
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  }, [spec, dequant])

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false} // instance bounds aren't tracked; island is always in frame
      raycast={() => null}  // never intercept paint/place picks
    />
  )
}
useGLTF.preload('/models/grass.glb')
```

Extract the per-cell instance-matrix computation into a PURE exported helper
(`grassInstanceTransforms(spec): {x,y,z,yaw,scale}[]` in a small
`src/terrain/grassField.ts`, NO three imports, mirroring the terrain core
style) so it is unit-testable; `GrassLayer` then just composes matrices from
it. Mount `<GrassLayer spec={spec} />` inside the existing `<Suspense>` block
in `App.tsx` (next to `<PlacedObjects …>`).

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 6: Tests

- `test/gridOps.test.ts`, `test/gridCodec.test.ts`, `test/applyOps.test.ts`:
  mechanical `SURFACE_PATH` → `SURFACE_GRASS` (same value 1 — behavior
  assertions unchanged).
- `test/specIO.test.ts` — new migration cases:
  1. a v4 payload with some surface digits `1` → loads as version 5 with
     surface all `0`, tiers and objects preserved;
  2. a v3 payload with surface `1`s → same clearing, `objects: []`;
  3. a v5 payload with surface `1`s → surface PRESERVED (grass survives its
     own round-trip);
  4. serialize→deserialize round-trip emits `version: 5`.
- `test/grassField.test.ts` (create; model after `test/gridOps.test.ts`
  structure): transforms are emitted only for grass-painted LAND cells (paint
  on a water cell yields none); determinism (two calls → identical output);
  y equals `evaluateHeight` at the cell center; scale within [0.95, 1.35].

**Verify**: `cd island-editor && pnpm test` → all pass including new cases.

### Step 7: Full gate

`pnpm check:island-editor` (repo root) → exit 0.

### Step 8: Visual check

`pnpm dev:editor` → http://localhost:5180:

1. Grass tool tile shows in the hotbar where Path was; drag-paint on land →
   tufts appear following the stroke, ground beneath tints green; brush sizes
   2/3 paint wider swaths; undo/redo restores both tufts and tint.
2. Painting across a waterline: no tufts on water cells.
3. Erase tool removes grass; export → import round-trips the meadow.
4. Raise/lower terrain under painted grass → tufts follow the new height on
   the next edit tick.
5. If an old autosave with a dirt path loads: the path is gone (cleared), no
   grass appears in its place, nothing crashes.

**Verify**: state observations; screenshot if the harness supports it.

## Test plan

Covered in Step 6 — new: 4 specIO migration cases + a pure grassField suite
(4 cases); updated: three mechanical renames. Pattern exemplars named per
file above.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -rn "SURFACE_PATH\|dirt path" island-editor/src` → no code hits
      (comment mentioning "was dirt path in ≤v4" in terrainGrid.ts is allowed)
- [ ] `grep -n "'grass'" island-editor/src/ui/ToolPanel.tsx` → in `TOOLS`
- [ ] `grep -n "version must be 1, 2, 3, 4, or 5" island-editor/src/editor/specIO.ts` → one hit
- [ ] New tests from Step 6 exist and pass
- [ ] `git status` — no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `public/models/grass.glb` does not exist (plan 015 not landed) — this plan
  depends on it.
- Plan 014's tier-height migration is mid-flight in `specIO.ts` and your
  changes conflict beyond a trivial merge — reconcile with its landed form,
  or report if it is half-applied.
- The instanced tufts render at a wildly wrong scale or floating/sunken —
  suspect the meshopt dequantization fold (Step 5's `dequant`); verify with a
  single instance at the origin before touching anything else. If it still
  fails, report rather than switching to per-tuft `<primitive>` clones (that
  defeats the perf design).
- `test/materials.test.ts` fails after Step 4 — it should not; do not edit
  its provenance-signature assertions.
- You want to change `persistence.ts`'s STORAGE_KEY or `ops.ts`'s op shapes.

## Maintenance notes

- **Surface code 1 changed meaning at v5.** Any future surface kind (flowers,
  snow?) is code 2+ with another version bump; the digit codec caps at 9.
- The grass under-tint constants (0.85 / 0.55 in Step 4) and the tuft scale
  jitter (0.95–1.35) are the meadow's look knobs; tune visually, keep the
  grassField test's scale-range assertion in sync.
- GrassLayer allocates the full 4096-instance buffer once (256 KB) — fine; if
  the grid ever grows, revisit capacity.
- Reviewer focus: the v3/v4 surface-clearing migration (silent data drop — by
  design, but say so in the PR); `raycast={() => null}` on the instanced mesh
  (without it, painting over grass would hit tufts instead of terrain).
- Deferred deliberately: grass wind sway; per-cell multi-tuft scatter
  (visual-density knob — one tuft/cell first, judge, then decide).
