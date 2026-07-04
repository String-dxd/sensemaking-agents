---
title: Island editor — sandbox terraforming refactor (Animal Crossing / Pokopia-style)
type: feat
status: implemented — all 10 steps done on branch feat/island-editor-sandbox-terraforming; gates green; live QA + adversarial review passed; P1 fixed. PENDING operator look sign-off before merge.
date: 2026-07-03
revised: 2026-07-03 (grill pass 1 — rendering rebuilt around the product island's materials; grill pass 2 — terrace math fixed for thin features, 2× shore field, color-space guidance, staged execution + operator look sign-off)
written_against_commit: 62e28619
---

# Plan: Refactor the island editor from spline modeling to sandbox-game terraforming

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving to the next step. If anything
> in the "STOP conditions" section occurs, stop and report — do not improvise. When
> done, flip `status:` in this file's frontmatter to `done` (or `blocked: <reason>`).
>
> **Drift check (run first)**:
> `git diff --stat 62e28619..HEAD -- island-editor/ src/engine/student-space/Game/View/Island.js public/student-space/textures/`
> If any of those paths changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (user-directed refactor)
- **Effort**: L
- **Risk**: MED (concentrated in the look: terraced terrain reading as crisp cliffs, and the ported materials matching the product island; every knob and constraint is identified below)
- **Depends on**: none
- **Category**: direction / feature
- **Planned at**: commit `62e28619`, 2026-07-03
- **Wave 1 (Steps 1–6)**: DONE — executed 2026-07-03 on branch `feat/island-editor-sandbox-terraforming` (commits `5ddf57ce…255089a8`), advisor-reviewed & approved; gates re-verified (15 files / 117 tests, CLI smoke re-run). Reviewer-accepted deviations: CLI imports swapped to `specIO` (needed for the v3 smoke; Step 9 deletes `exportSpec` anyway); `validateSpecObject` accepts serialized AND numeric grids (the applyOps final gate runs on in-memory specs); shore-field pond test uses a 3×3 pond — a single carved cell does not read as water at `BLUR_MIX=0.25` (known asymmetry; re-judge in Wave 3 QA).
- **Wave 2 (Steps 7–8)**: DONE — commits `59567c83`, `bae13969`; advisor-reviewed & approved (gates 17 files / 130 tests re-verified; all four PNGs `cmp`-identical; provenance greps clean — both shaders are clean-room with `colorspace_fragment`; no Bruno GLSL markers). Executor finding carried into Wave 3 QA: at `SEGMENTS=128` (exact 2× of the 64 grid), a straight 2-tier cliff face lands lattice vertices on the intermediate ledge (`aWallness = 0`) and can render with flat-surface material stretched down the slope — if visible, tune `W → 0.45` or take SEGMENTS off the 2× alignment. 1-tier steps and isolated cells are unaffected.
- **Wave 3 (Steps 9–10)**: cutover DONE & committed (`2562de56`); died on a session limit during QA. Advisor completed the live visual QA directly (screenshots): seed island renders with product-look materials + terracing; raise/lower/water/path/erase all work; carved water gets dynamic shore foam (validates the shore-distance-field design); 2-tier faces render as stacked textured steps (Wave-2 concern benign); undo/redo correct; no console errors. Adversarial 5-lens review (workflow `wf_eb97b78c-d6a`) found ONE confirmed **P1**: `SeaSurface.tsx` allocates the shore `DataTexture` once at the seed resolution and never reallocates, so importing a v3 file with `grid.cols !== 64` either throws `RangeError` (larger grid) or samples a stale buffer (smaller). Fix landed & advisor-verified: commit `5b08b487` (reallocate in `updateShoreDataTexture` on size mismatch + `key` on `<SeaSurface>` + 2 regression tests), `Backdrop.tsx` committed `34fb5c16`. Final gates: `check:island-editor` exit 0 (11 files / 83 tests), root `pnpm check` exit 0. Working tree clean; branch tip `5b08b487`; 11 commits from baseline `62e28619`. **All executor work advisor-APPROVED. Sole remaining item: operator look sign-off, then merge (`gh pr merge --squash --delete-branch` per repo convention — the user's call, not the advisor's).**

## Why this matters

The standalone island editor (`island-editor/`, `pnpm dev:editor`, port 5180) currently
edits terrain the way Spline or Blender would: drag Catmull-Rom coastline control
points, tune five numeric height-profile sliders, and airbrush a continuous relief
heightfield. That is a 3D-modeling-tool mental model. The product goal is the
opposite: an island designer that feels like **Animal Crossing: New Horizons' Island
Designer or Pokémon Pokopia's terraforming** — a tile grid, discrete cliff tiers you
raise and lower one stamp at a time, water you carve, paths you paint, instant
readable feedback — and an island that **looks like the product island** (the main
app's sand, cliff, grass, and sea treatment), not like a debug vertex-color mesh.

This plan replaces the editing paradigm, the spec format (v3: a tile grid with
discrete elevation tiers + a surface-paint layer), and the entire rendering (rebuilt
from scratch around the main app's island materials). It keeps what is good about
the current package: the pure headless-testable core discipline, the command stack,
autosave/validate/import/export, and the agent op-runner + CLI. Nothing in the
product app consumes the spec yet (verified below), so the format can change now at
zero downstream cost — and the v3 format is deliberately *easier* to bind to the
engine later (O(1) height lookup, no polygon math).

## Decisions locked with the requester (grill-me pass, 2026-07-03)

Implement as written; a reviewer can veto, but the executor must not relitigate:

| # | Decision |
|---|---|
| Audience | **Standalone editor first.** Players are the eventual destination; engine binding stays deferred (existing plan `2026-06-19-003`). |
| Paradigm | **Replace, don't add a mode.** Coastline-spline editing and the freeform sculpt brush are removed entirely. Island shape is designed by raising land out of the ocean and carving it back. |
| Art direction | **Terraced is the product island's future look.** Freeform relief dies with no regrets. |
| Spec v3 | Tile grid, 64×64 cells over `worldSize` 24; 5 tiers (0 = ocean floor, 1 = beach, 2 = ground/grass ≈ today's plateau 1.0, 3–4 = cliffs); per-cell surface layer. |
| Rendering | **Rebuild from scratch — do NOT reuse the editor's current rendering code** (`buildTerrainGeometry.ts` vertex-color scheme). The island uses the **main app's materials**: `sand-soft-ripples.png`, `cliff-soft-strata.png`, the app's grass tone and sea palette. |
| Scene parity | **Materials only.** Flat studio stage, fixed pleasant daylight. No curved-earth displacement, no day cycle, no planet-limb ocean disc. |
| Sea | **New simplified sea shader** using the app's palette + foam textures + a grid-derived shore-distance field. The app's TinySkies-derived water layers are provenance-🔴 and MUST NOT be copied (exact list below). |
| Water model | Sea-level-only in v1: the water tool carves cells to tier 0; elevated water tables / waterfalls deferred. |
| Paths | **Keep in v1, as a dirt-tint lane** in the ground shader — no new texture asset. |
| Meshing | Fresh terraced-heightfield implementation (terrace a blurred tier field). True per-tile meshing is the documented upgrade if the look disappoints (STOP condition, advisor approval). |
| Compatibility | v1/v2 files (exports, localStorage autosaves, the seed) rasterize to the v3 grid on load; the validator keeps its accepts-old-versions-normalizes-to-current contract. |
| Agent ops | Grid vocabulary (`fillRect`/`adjustRect`/`paintRect`/`reset`); op-runner fold + CLI mechanics unchanged. |
| Deferred | Elevated water/waterfalls; object placement (plan `2026-06-19-004`); engine binding (plan `2026-06-19-003`); multiple path materials; curved earth/day cycle in the editor. |
| Grid granularity | **64×64 confirmed** (grill pass 2). Chunky-toy proportions accepted; raising resolution later is a one-constant change (`GRID_COLS/ROWS`) — old saves migrate through the same rasterizer. |
| Execution | **Three staged executor dispatches** with advisor diff-review between waves: Wave 1 = Steps 1–6 (pure core), Wave 2 = Steps 7–8 (rendering), Wave 3 = Steps 9–10 (cutover + QA). |
| Look sign-off | **Operator demo approval is a hard gate.** The cutover branch does not merge until the requester has run the editor (or reviewed side-by-side screenshots vs :3000) and approved the look. Advisor review alone is NOT sufficient. |

## Current state (verified at `62e28619` — all excerpts from direct reads)

**The product engine does NOT consume the editor's spec.** `grep -rn "IslandSpec"
src/` at the repo root matches nothing; the only `relief` hits in `src/` are an
unrelated comment (`src/engine/student-space/Game/State/Island.js:26`) and chat copy.
Changing the spec format breaks nothing outside `island-editor/`.

### The editor package (`island-editor/src`)

- `terrain/islandSpec.ts` — the v2 spec + evaluation. `IslandSpec` (lines 31–39) is
  `{ version: 2, worldSize, coastline: Vec2[], heightProfile, relief: ReliefGrid }`;
  `CURRENT_SPEC_VERSION = 2` (line 45); Catmull-Rom `sampleCoastline` (line 50);
  `isInsidePolygon`/`distanceToPolygon` (lines 78–108); `baseHeightAt`/`reliefAt`/
  `evaluateHeight` (lines 119–163); the seed silhouette copied from the engine and
  `seedFromCurrentIsland(controlPoints = 24, reliefResolution = 192)` (lines
  175–212; the comment at line 202 notes `plateauHeight: 1.0` "matches plateauTopY").
- `terrain/brush.ts` — continuous sculpt brush; `applyBrush(...)` mutates
  `relief.data` in place (line 38), modes `raise|lower|smooth|flatten`.
- `terrain/coastlineOps.ts` — pure `insertPointAfter`/`deletePoint`/`movePointTo`.
- `terrain/buildTerrainGeometry.ts` — the old vertex-color mesh pipeline
  (`BaseField`, `composeGeometry`, in-place `updateGeometry`,
  SEAFLOOR/SAND/GRASS/ROCK color bands). **Deleted; do not reuse its code** (locked
  decision) — only its *architecture idea* (cache static lattice, cheap in-place
  refresh) carries forward.
- `scene/Terrain.tsx` — r3f mesh; pointer paint: `onPointerDown/Move` call
  `onPaint(e.point.x, e.point.z)` while `painting.current` (lines 55–73);
  window-level `pointerup` ends strokes off-mesh (lines 44–53); ring cursor.
  **Deleted** (replaced, same interaction skeleton rewritten fresh).
- `scene/CoastlineHandles.tsx` — draggable control-point spheres. **Deleted.**
- `scene/Sea.tsx` — a single translucent `#2a6f97` plane. **Replaced** (new shader).
- `scene/Backdrop.tsx` — `<Sky>`, ambient + directional light, drei `Grid`. Kept,
  with the light direction aligned to the new ground material's sun uniform.
- `ui/ToolPanel.tsx` — `EditMode = 'shape' | 'sculpt'` (line 6); profile sliders;
  brush controls; undo/redo; Top view / Export / Import / Reset. CSS class names
  `tool-panel__*` in `ui/panel.css` — reuse them.
- `App.tsx` — state + wiring. Relief lives in a ref mutated in place with a
  `reliefTick` bump (lines 49–59 — the StrictMode-safe pattern to keep); one undo
  command per brush stroke (lines 159–187: snapshot `data.slice()` on paint-start,
  push `{do, undo}` on paint-end); keyboard ⌘Z/⇧⌘Z/^Y (197–216); reset/export/import
  (219–258); `topView` via the captured OrbitControls instance (263–274).
- `editor/commandStack.ts` — generic undo/redo; `push()` records an
  **already-applied** command. Kept unchanged.
- `editor/exportSpec.ts` — `serializeSpec` (line 6); `validateSpecObject` (line 61)
  accepts `version === 1 || CURRENT_SPEC_VERSION` and **normalizes to current**
  (lines 102–108); `downloadSpec` (123) / `importSpecFromFile` (140).
- `editor/reliefCodec.ts` — sparse `{i, h}` relief encoding. **Replaced.**
- `editor/persistence.ts` — `STORAGE_KEY = 'island-editor:spec:v1'` (line 13; the
  comment says the storage slot key deliberately does NOT track the format version);
  `saveSpec` validates before persisting; debounced `createAutosaver`.
- `agent/ops.ts` — op union (`movePoint`, `insertPointAfter`, `deletePoint`,
  `setHeightProfile`, `raiseRegion`/`lowerRegion`/`smoothRegion`/`flattenRegion`,
  `clearRelief`) + `OpError {index, op, message}`.
- `agent/applyOps.ts` — pure fold; per-op try/catch into `OpError`s;
  exhaustive-`never` default arm (lines 45–52); final `validateSpecObject` gate
  (line 72). Structure kept, vocabulary replaced.
- `scripts/apply-ops.mjs` — CLI: `pnpm --filter island-editor apply-ops <spec.json>
  <ops.json> [out.json]`; exits 1 on any op error; refuses output when the final
  validate gate failed (lines 56–60). Mechanics kept.
- Tests in `island-editor/test/*.test.ts` (vitest, `environment: 'node'`, include
  `test/**/*.test.ts` per `island-editor/vite.config.ts`). Style exemplar:
  `test/brush.test.ts` — small pure-function cases with hand-built fixtures.

### The product island's look (the source of truth for materials) — `src/engine/student-space/Game/View/Island.js`

Read it as **reference only** (never modified, and see the provenance rules below):

- **Textures** (lines 39–42), served from `public/student-space/textures/`:
  `sand-soft-ripples.png`, `cliff-soft-strata.png`, `water-foam-cells.png`,
  `water-short-bubbles.png`. Loader config: `SRGBColorSpace` (color textures),
  `RepeatWrapping`, linear mipmaps (lines 273–349).
- **Sand**: world-space UVs `world.xz * 0.36` (line 436), with a wet-sand darkening
  band keyed off world Y near the waterline (lines 441–449) and a subtle broad-noise
  brightness variation.
- **Cliff**: texture sampled by a wall-following UV (azimuth × height in the app,
  lines 452–454) with vertical shading variation.
- **Grass/plateau**: flat color `0x4A8F3F` (line 479) with two octaves of hash noise
  for broad/grain variation and a rim darkening (lines 503–525).
- **Sea palette**: `SEA = 0x2A8CA0`, `SEA_DEEP = 0x1560A0`, `FOAM = 0xB3FFFF`
  (lines 27–29); depth gradient shallow→deep away from shore; a crisp white shore
  halo (`contactLip`/`foamLip`, lines 794–799, 828–831); wet tint at the waterline;
  foam-texture bands hugging the shore (lines 743–750, 814–819).
- **Lighting**: ambient + directional + a constant hemisphere fill
  (lines 549–553).
- The app's shore effects are all driven by an **analytic radial silhouette**
  (`silhouette(theta)`, lines 688–695) — a hack that only works for its hard-coded
  peanut island. The editor's islands are arbitrary, which is why this plan
  introduces a grid-derived shore-distance field instead (a genuine improvement,
  and the shape the provenance cleanup wants anyway).

### Provenance rules (from `docs/plans/2026-06-12-asset-provenance-audit.md` — binding)

- ✅ **Free to copy**: the four texture PNGs (authored upstream by Wondo — audit
  KEEP, pending his one-line authorship confirmation; the editor inherits the same
  status as the app, no new risk). The sea *palette constants*, depth gradient,
  crisp shore halo, wet-sand tint recipes (our own legacy `buildWater` lineage).
  Sand/cliff geometry + island terrain recipes (our authorship).
- 🔴 **MUST NOT be copied or adapted** (TinySkies-derived, audit says "replace"):
  1. The water **foam-blob layer** — the `w1…w7` sine products
     (`View/Island.js:725-739`, signature `w1 * w2 * w4 * w6 + w3 * w5 * w7 * 0.3`).
  2. The water **sparkle layer** (`View/Island.js:752-769`, `sp1…sp5`/`spMask`).
  3. The shore **contour-ripple layer** (`View/Island.js:807-812`,
     `fract((shoreT + noiseOff) * 4.0 + t * 0.16)`).
  Write the editor's sea with fresh structure and fresh coefficients; if gentle
  open-water motion is wanted, derive a NEW sine set (different structure, different
  numbers), or rely on the foam textures alone.
- Also do not copy `Materials/GrassMaterial.js` or its GLSL (Bruno-derived, audit
  🔴) — the editor's grass is the flat-tone + hash-noise recipe, written fresh.

## Target design (v3)

### Spec format

In-memory:

```ts
export const MAX_TIER = 4               // tiers 0..4
export const GRID_COLS = 64
export const GRID_ROWS = 64
export const SURFACE_AUTO = 0           // grass/sand derived from tier
export const SURFACE_PATH = 1           // dirt path tint

export interface TerrainGrid {
  cols: number
  rows: number
  /** row-major, length cols*rows, integer 0..MAX_TIER */
  tiers: number[]
  /** row-major, length cols*rows, integer surface code (0 | 1) */
  surface: number[]
}

export interface IslandSpec {
  version: 3
  /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
  worldSize: number
  /** World Y of the water surface. */
  seaLevel: number
  /** World Y of each tier's flat top, ascending, length MAX_TIER + 1. */
  tierHeights: number[]
  grid: TerrainGrid
}

/** Default tier tops. Tier 2 = 1.0 matches the engine's plateauTopY (see the
 *  v2 seed comment). Seafloor matches v2 seafloorDepth. */
export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]
```

Serialized (JSON): identical shape except `grid.tiers` and `grid.surface` are
**arrays of digit strings, one string per row** — e.g. 64 strings of 64 chars
`"0001122210…"`. Human-readable, git-diffable, agent-writable, ~4 KB per layer
(vs ~150 KB dense v2 relief). Digits are the integer codes; this caps codes at 9
(MAX_TIER = 4, fine).

### Height evaluation (the terraced-cliff shape)

```
cellSize = worldSize / cols                       // cell (c, r) center:
centerX(c) = -worldSize/2 + (c + 0.5) * cellSize  // ...same for Z with r

// 1. Blur (precompute once per grid edit): 3×3 tent kernel (1 2 1 / 2 4 2 / 1 2 1)/16
//    over tier values as floats. Out-of-bounds neighbors count as tier 0 (ocean
//    surrounds the island). Output: Float32Array(cols*rows).

// 2. Continuous field at world (x, z) — bilinear in cell-center space, sampled
//    from BOTH the raw grid and the blurred grid, then mixed:
u = clamp((x + worldSize/2) / cellSize - 0.5, 0, cols - 1)
v = clamp((z + worldSize/2) / cellSize - 0.5, 0, rows - 1)
BLUR_MIX = 0.25                                   // corner-rounding strength (knob, 0..0.4)
t = mix(bilinear(tiers, u, v), bilinear(blurred, u, v), BLUR_MIX)

// WHY the mix (do not "simplify" to blur-only): a fully-blurred field destroys
// thin features — an isolated tier-2 cell tent-blurs to 0.5, which terraces to
// BELOW sea level, i.e. stamping one cell of land would be invisible. Terracing
// the raw bilinear field preserves single-cell amplitude exactly; the bounded
// blur mix only rounds plan-view corners. At BLUR_MIX = 0.25 an isolated
// tier-2 cell keeps ≈ 95% of its height.

// 3. Terrace — flat tops at integer tiers, steep rounded walls between:
i = floor(t); f = t - i                           // i clamped to MAX_TIER - 1 when t == MAX_TIER
W = 0.35                                          // wall width fraction (tuning knob)
g = clamp((f - 0.5 + W/2) / W, 0, 1)
s = g * g * (3 - 2 * g)                           // smoothstep rounds lip + base
height = lerp(tierHeights[i], tierHeights[i + 1], s)
```

Interior flat cells sit at `tierHeights[tier]` (isolated single cells within ~5%);
walls between differing neighbors are steep with rounded lips; plan-view corners
come out rounded by the blur mix. Export `evaluateHeight(spec, x, z)` — O(1) per
query, which is what makes future engine binding cheap. Also export
`terraceBlend(t, wallWidth): {i, s}` so the geometry builder derives wall/flat
factors without recomputing.

### Shore-distance field (drives all water/foam effects)

`shoreDistanceField(grid, worldSize, scale = 2): {res: number, data: Float32Array}`
— a lattice at `scale ×` the grid resolution (default 128×128; the grid's 0.375u
cells are coarser than the 0.3u shore-lip band, so the field must be finer than the
grid). Each lattice point is land when `sampleTierField(...) ≥ 0.5` at its world
position, water otherwise; the signed distance (world units, positive on water,
negative on land) comes from a multi-source BFS over the lattice from all
land↔water boundary points (8-neighbor, distance ≈ steps × latticeStep —
approximate is fine for foam bands). If everything is water or everything is land,
fill with a large constant of the appropriate sign. Pure, unit-testable, recomputed
per grid edit (16k points — trivial), uploaded as a single-channel float
`DataTexture` for the sea shader.

This replaces the app's analytic `silhouette(theta)` radial shore hack and works
for ANY drawn coastline — including carved interior rivers/ponds, which get foam
edges and depth shading for free.

### Rendering (all-new; no code reuse from `buildTerrainGeometry.ts`)

**Geometry** — a fresh heightfield module. Static per-resolution lattice
(positions' XZ, triangle indices) cached; per-edit pass writes: vertex heights (via
blur + terrace), and three custom attributes for the material — `aTierFlat` (the
effective tier at the vertex, float), `aWallness` (`s * (1 - s) * 4`, 0 on flat
tops → 1 mid-wall), `aSurface` (the containing cell's surface code). Then
`computeVertexNormals()`. Default `SEGMENTS = 128` (129² ≈ 16.6k verts).

**Ground material** — ONE `THREE.ShaderMaterial` (fresh GLSL, three 0.171):

- Uniforms: `uSandTexture`, `uCliffTexture`, `uGrassColor` (`#4A8F3F`),
  `uSunDirection` (fixed, matching the Backdrop directional light), `uSeaLevel`.
- Fragment logic (per the app's recipes where they are ours, adapted):
  - **Wall** (`aWallness > 0.35`): cliff texture, planar UV
    `vec2(world.x + world.z, world.y * 2.4)`, slight brightness variation by hash
    noise.
  - **Flat, tier ≤ 1**: sand texture at `world.xz * 0.36`, with a wet-sand
    darkening band where `world.y` is within ~0.08 of `uSeaLevel` (adapt the app's
    wet-band idea keyed to seaLevel, not its radial `sandR` terms).
  - **Flat, tier ≥ 2**: `uGrassColor` with two hash-noise octaves
    (broad `* 2.0`, grain `* 8.0`) modulating ±10% brightness.
  - **Path** (`aSurface == 1`, flat, tier ≥ 1): mix 70% toward dirt
    `vec3(0.62, 0.47, 0.30)` before lighting.
  - **Lighting**: simple lambert `max(dot(N, uSunDirection), 0.0) * 0.65 + 0.35`
    (write fresh — do not copy the app plateau's sun-shade lines).
- Blend bands with `smoothstep`, not hard branches, so transitions are soft.

**Sea** — replaces `Sea.tsx`: a `worldSize * 4` plane at `seaLevel` with a fresh
`ShaderMaterial`:

- Uniforms: `uSea` (`#2A8CA0`), `uDeep` (`#1560A0`), `uFoam` (`#B3FFFF`),
  `uShoreTex` (the distance-field DataTexture + uniforms mapping world→texture UV),
  `uFoamCells`, `uShortBubbles`, `uTime`.
- Vertex: at most a tiny 2-sine height ripple with **fresh coefficients** (or none —
  flat is acceptable); nothing copied from the app.
- Fragment, all bands driven by `d` = shore distance sampled from `uShoreTex`
  (outside the grid, clamp → deep):
  - depth gradient `mix(uSea, uDeep, smoothstep(0.0, 8.0, d))`;
  - crisp white shore lip at `d ∈ [0, 0.3]` (the app's own halo idea);
  - `water-foam-cells.png` band at `d ∈ [0.1, 1.6]`, world-space UV `* 0.18`,
    slow scroll `uTime * 0.01`;
  - `water-short-bubbles.png` tight band at `d ∈ [0, 0.5]`, UV `* 0.16`;
  - slight alpha (~0.94) so carved riverbeds read through shallow water.
- **Forbidden**: the three TinySkies-derived layers listed in the provenance rules.
  The new shader is deliberately a clean-room candidate to later back-port to the
  app (audit task T2f).

### Tools & interaction

- Tool enum replaces `EditMode`: `'raise' | 'lower' | 'water' | 'path' | 'erase'`.
  - **raise**: tier +1 (clamped at MAX_TIER), applied **once per cell per stroke**
    (a `Set<number>` of visited cell indices per stroke).
  - **lower**: tier −1 (clamped at 0), once per cell per stroke.
  - **water**: set tier = 0 (carve to ocean; the sea plane shows through).
  - **path** / **erase**: set `surface` = `SURFACE_PATH` / `SURFACE_AUTO`.
- Brush size 1 | 2 | 3 (N×N cells centered on the pointed cell,
  `c = floor((x + worldSize/2) / cellSize)`).
- Undo: one command per stroke — snapshot `tiers.slice()` + `surface.slice()` on
  paint-start, push `{do, undo}` on paint-end (the `App.tsx:159-187` pattern, two
  arrays).
- Cell cursor: a brush-sized translucent quad (`#ffd166`, `depthTest: false`)
  snapped to the hovered cell block, y = sampled height + 0.03.
- Camera: keep OrbitControls + Top view; add a **Designer view** preset (the
  captured-controls pattern of `App.tsx:263-274`) placing the camera at
  `(target.x, target.y + dist * 0.79, target.z + dist * 0.61)` — the elevated
  ~52° three-quarter view the games use.
- The height-profile sliders, world-size field, and coastline UI are removed.
  `worldSize`/`seaLevel`/`tierHeights` stay in the file format but are not
  UI-editable in v1.

### Migration (v1/v2 → v3)

Rasterize: for each cell center `(x, z)`, compute `inside` and `h` with the legacy
v2 functions (hoist `sampleCoastline(spec.coastline)` out of the loop), then:

```
tier = argmin over i of |h - DEFAULT_TIER_HEIGHTS[i]|   // nearest tier top
if (!inside) tier = 0                                   // offshore is always ocean
surface = SURFACE_AUTO
```

With the v2 seed (coast ramps 0 → 1.0 over falloff 2.0) this yields ocean → a sand
ring where the ramp passes near 0.12 → grass interior near 1.0: the default island
keeps today's silhouette, terraced. `seedIsland()` = rasterize(v2 seed) — one code
path for both the seed and imports.

## Commands you will need

All verified against this repo (run from the repo root):

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (editor) | `pnpm --filter island-editor typecheck` | exit 0 |
| Tests (editor) | `pnpm --filter island-editor test` | all pass (baseline: 9 files) |
| Both gates | `pnpm check:island-editor` | exit 0 |
| Dev server | `pnpm dev:editor` | serves http://localhost:5180 |
| Product app (for look comparison) | `pnpm dev` | serves http://localhost:3000 |
| Ops CLI | `pnpm --filter island-editor apply-ops <spec> <ops> [out]` | exit 0, writes spec |
| Root app untouched | `pnpm check` | exit 0 (must stay green) |

## Suggested executor toolkit

- `agent-browser` (or any screenshot-capable browser automation) for Step 10's
  visual QA — including a side-by-side against the product island at :3000.
- Do NOT install new dependencies; everything needed (three, r3f, drei, vitest, tsx)
  is already in `island-editor/package.json`.

## Scope

**In scope** (the only paths you may create/modify):

- `island-editor/src/**` (new files, rewrites, deletions listed in Step 9)
- `island-editor/test/**`
- `island-editor/public/textures/` (new — receives byte-identical copies of the four
  PNGs from `public/student-space/textures/`)
- `island-editor/scripts/apply-ops.mjs` (docstring only)
- `island-editor/package.json` (the `description` string only)
- This plan file (status frontmatter).

**Read-only references** (open them, never modify):

- `src/engine/student-space/Game/View/Island.js` — material recipes (subject to the
  provenance rules above).
- `public/student-space/textures/*.png` — copy source.
- `docs/plans/2026-06-12-asset-provenance-audit.md` — the binding provenance list.

**Out of scope** (do NOT touch, even though they look related):

- Everything under repo-root `src/`, `test/`, `docs/` (except this plan's status
  line) — do not wire the spec into the engine (that is plan `2026-06-19-003`).
- `island-editor/scripts/poc-apply-op.mjs` — throwaway PoC, leave as-is.
- `bird-builder/`, `pnpm-workspace.yaml`, lockfiles, `island-editor/vite.config.ts`.
- Dependencies: no additions, removals, or version bumps.

## Git workflow

- Branch: `feat/island-editor-sandbox-terraforming` (branched from `main`).
- One commit per step below; messages `feat(island-editor): <step summary>` /
  `refactor(island-editor): …` / `test(island-editor): …`.
- Do NOT push or open a PR unless the operator instructed it.

## Execution strategy (locked)

This plan runs as **three staged dispatches**, each reviewed by the advisor before
the next begins. An executor given a wave executes ONLY that wave's steps and stops:

- **Wave 1 — pure core**: Steps 1–6 (grid, legacy+seed, ops, shore field, IO,
  agent ops). Fully headless-verifiable.
- **Wave 2 — rendering**: Steps 7–8 (textures, geometry, materials). Stacked on
  Wave 1's reviewed result.
- **Wave 3 — cutover + QA**: Steps 9–10. Ends at the operator sign-off gate below.

**Operator sign-off gate (hard)**: after Step 10, the branch stays unmerged until
the requester has run `pnpm dev:editor` themselves (or reviewed side-by-side
screenshots vs the product island at :3000) and approved the look. Advisor
screenshot review alone does NOT satisfy this gate.

## Steps

Steps are ordered so every step ends green (`pnpm check:island-editor` exit 0).
Steps 1–8 are purely additive; Step 9 is the cutover; Step 10 is visual QA.

### Step 1: Grid core — `src/terrain/terrainGrid.ts`

Create the v3 pure core (NO three/r3f imports): the types and constants from
"Target design" above, plus:

- `cellIndex(grid, c, r)`, `inBounds(grid, c, r)`,
  `cellCenter(worldSize, grid, c, r): {x, z}`,
  `worldToCell(worldSize, grid, x, z): {c, r}` (floor-based; may be out of
  bounds — callers check).
- `createOceanGrid(cols = GRID_COLS, rows = GRID_ROWS): TerrainGrid`.
- `blurTiers(grid): Float32Array` — 3×3 tent blur, out-of-bounds = 0.
- `BLUR_MIX = 0.25` (exported constant) and
  `sampleTierField(grid, blurred, worldSize, x, z): number` — bilinear of the raw
  grid and of the blurred grid in cell-center space, mixed by `BLUR_MIX`, clamped
  (see the WHY comment in "Height evaluation" — reproduce it in the code).
- `terraceBlend(t, wallWidth = 0.35): {i, s}` and
  `terraceHeight(t, tierHeights, wallWidth = 0.35): number`.
- `evaluateHeight(spec, x, z, blurred?): number` — convenience composition.

New `test/terrainGrid.test.ts` (model after `test/brush.test.ts` style): flat
uniform grid evaluates to exactly `tierHeights[tier]` at cell centers; a single
isolated tier-2 cell evaluates within 0.1 of `tierHeights[2]` at its center (the
thin-feature regression this design guards against) and `tierHeights[0]` far away
with a monotonic wall between; `terraceHeight` at integer t returns the exact tier
top; blur treats out-of-bounds as ocean; `worldToCell`/`cellCenter` round-trip.

**Verify**: `pnpm check:island-editor` → exit 0, new tests pass, all 9 existing
files still pass.

### Step 2: Legacy v2 module + seed — `src/terrain/legacy/specV2.ts`, `src/terrain/seed.ts`

`legacy/specV2.ts`: a **self-contained copy** (copy, do not import from
`islandSpec.ts` — deleted in Step 9) of everything migration needs, renamed with a
`V2` suffix where names collide: `Vec2`, `HeightProfile`, `ReliefGrid`,
`IslandSpecV2`; `sampleCoastline`, `isInsidePolygon`, `distanceToPolygon`,
`baseHeightAt`, `reliefAt`, `evaluateHeightV2`; the seed silhouette + `seedV2()`
(copy of `seedFromCurrentIsland`); the v1/v2 shape validators
(`validateSpecV2Object`, copied from `editor/exportSpec.ts:61-109`) and the
sparse-relief decode (from `editor/reliefCodec.ts`). Add
`rasterizeV2ToGrid(v2, cols, rows): TerrainGrid` (the migration rasterizer from
"Target design"). Header comment: this module exists only to open old files; only
`specIO.ts` and `seed.ts` may import it.

`seed.ts`: `seedIsland(): IslandSpec` = v3 spec around
`rasterizeV2ToGrid(seedV2(), GRID_COLS, GRID_ROWS)` with `worldSize: 24`,
`seaLevel: 0`, `tierHeights: DEFAULT_TIER_HEIGHTS`.

New `test/seed.test.ts`: seed grid is 64×64; center cell tier ≥ 2; all four corner
cells are tier 0; at least one tier-1 cell exists (beach ring); every tier is an
integer in 0..MAX_TIER.

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 3: Grid editing ops — `src/terrain/gridOps.ts`

Pure, framework-free. Follow the existing convention — **mutate the passed arrays
in place; callers own cloning** (see `brush.ts:33-37` and the pre-clone in
`applyOps.ts:36`):

- `brushCells(grid, centerC, centerR, size): number[]` — in-bounds N×N block
  indices, size 1|2|3.
- `adjustTier(grid, cells, delta)` — tier += delta clamped to 0..MAX_TIER.
- `setTier(grid, cells, tier)` / `setSurface(grid, cells, surface)` — clamped sets.
- `fillRect(grid, c0, r0, c1, r1, apply)` — inclusive rect iteration helper.

New `test/gridOps.test.ts`: raise clamps at MAX_TIER; lower clamps at 0; brush
blocks clip at grid edges; setSurface touches only listed cells; fillRect covers
the inclusive rectangle exactly.

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 4: Shore-distance field — `src/terrain/shoreField.ts`

Pure: `shoreDistanceField(grid, worldSize, scale = 2)` exactly per "Target design →
Shore-distance field" (2× lattice, land mask from `sampleTierField ≥ 0.5`, signed
BFS distances in world units, degenerate all-land/all-water fallback).

New `test/shoreField.test.ts`: result lattice is `scale ×` the grid resolution; a
single land cell in ocean → negative at the lattice points over that cell, positive
at its neighbors and increasing outward ~latticeStep per ring; all-ocean grid →
uniformly large positive; a carved 1-cell pond inside land is positive at the pond
center; sign flips exactly at the boundary.

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 5: Serialization + validation — `src/editor/gridCodec.ts` + `src/editor/specIO.ts`

`gridCodec.ts`: `encodeGrid(grid)` → `{cols, rows, tiers: string[], surface:
string[]}` (digit rows) and `decodeGrid(serialized): TerrainGrid`; throw with
field-level messages on bad shapes (row count ≠ rows, row length ≠ cols, non-digit
chars, digit > MAX_TIER for tiers / > SURFACE_PATH for surface).

`specIO.ts` (new file so Steps 6–8 can use it while the old pipeline still exists;
`exportSpec.ts` dies in Step 9):

- `serializeSpec(spec): string` — JSON, 2-space pretty, grid via `encodeGrid`.
- `validateSpecObject(parsed): IslandSpec` — **keeps the version contract**: on
  `version === 3` validate v3 shape (finite `worldSize > 0`, finite `seaLevel`,
  `tierHeights` strictly-ascending finite array of length MAX_TIER + 1, grid
  decodes) and return with a decoded numeric grid; on `version === 1 || 2` validate
  via `validateSpecV2Object` then return the **migrated** v3 spec
  (`rasterizeV2ToGrid`, `DEFAULT_TIER_HEIGHTS`, `seaLevel` from the v2
  `heightProfile.seaLevel`, keep the file's `worldSize`); any other version throws.
- `deserializeSpec(json)`, `downloadSpec(spec, filename?)`,
  `importSpecFromFile(file)` — mechanics per `exportSpec.ts:111-160`.

New `test/gridCodec.test.ts` (round-trip; each malformed-shape throw) and
`test/specIO.test.ts` (v3 round-trip; a hand-built v2 spec validates and returns as
v3 with a 64×64 grid; version 4 throws; malformed JSON throws).

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 6: Agent ops v2 — rewrite `src/agent/ops.ts` + `src/agent/applyOps.ts`

Replace the op union (only the CLI and their tests import these files):

```ts
export type Op =
  | { op: 'fillRect'; c0: number; r0: number; c1: number; r1: number; tier: number }
  | { op: 'adjustRect'; c0: number; r0: number; c1: number; r1: number; delta: number }
  | { op: 'paintRect'; c0: number; r0: number; c1: number; r1: number; surface: number }
  | { op: 'reset' }
```

Cell coordinates: integers, 0-based, inclusive. `applyOps` keeps its exact
structure — pure fold, per-op try/catch into `OpError`s, the exhaustive-`never`
default arm, clone `tiers`/`surface` before mutating via `gridOps`, final
`validateSpecObject` gate now imported from `specIO.ts`. Op-level validation throws
on: non-integer or out-of-bounds coordinates, `c0 > c1`/`r0 > r1`, tier/surface out
of range, delta ∉ {−1, 1}. `reset` returns `seedIsland()`.

Rewrite `test/applyOps.test.ts` for the new vocabulary (keep its structure):
fillRect sets the rect and nothing else; adjustRect clamps; an out-of-bounds op
records an `OpError` and later ops still apply; reset returns the seed; a valid
batch passes the final gate. Update the usage docstring in `scripts/apply-ops.mjs`.

**Verify**: `pnpm check:island-editor` → exit 0. CLI smoke (scratch dir): write the
seed spec to JSON (tiny tsx one-liner or fixture), run
`pnpm --filter island-editor apply-ops seed.json ops.json out.json` with
`[{"op":"fillRect","c0":30,"r0":30,"c1":33,"r1":33,"tier":4}]` → exit 0 and
`out.json` rows 30–33 contain `4444` at columns 30–33.

### Step 7: Textures + geometry — `island-editor/public/textures/`, `src/terrain/buildIslandGeometry.ts`

Copy the four PNGs byte-identically:
`cp public/student-space/textures/{sand-soft-ripples,cliff-soft-strata,water-foam-cells,water-short-bubbles}.png island-editor/public/textures/`
(provenance: audit-KEEP assets; the editor inherits the app's status).

`buildIslandGeometry.ts` (this module MAY import three; write it fresh — the old
`buildTerrainGeometry.ts` stays untouched until Step 9 and must not be copied
from):

- `IslandField` — static per-resolution lattice: `segments`, `n`, `xs`, `zs`,
  triangle `indices` (standard (segments+1)² grid — write it fresh).
- `buildIslandField(worldSize, segments = 128): IslandField`.
- `composeGeometry(field, spec): THREE.BufferGeometry` and in-place
  `updateGeometry(geo, field, spec)` — one pass per edit: `blurTiers(spec.grid)`
  once, then per vertex write `position` (terrace) and the attributes `aTierFlat`
  (float effective tier: `s > 0.5 ? i + 1 : i`), `aWallness` (`s * (1 - s) * 4`),
  `aSurface` (containing cell's surface code); then `computeVertexNormals()` +
  `computeBoundingSphere()`.

New `test/buildIslandGeometry.test.ts`: position count = (segments+1)²; on the
seed, min Y ≈ `tierHeights[0]` and max Y ≤ `tierHeights[MAX_TIER]` + ε; a vertex at
an interior grass cell center sits within 0.01 of its tier top; `aWallness` is 0
(±0.01) at flat cell centers and > 0.5 somewhere between a tier-2 cell and an
adjacent tier-0 cell; all three attributes exist with itemSize 1.

**Verify**: `pnpm check:island-editor` → exit 0. `ls island-editor/public/textures`
shows the four PNGs.

### Step 8: Materials — `src/scene/materials/IslandGroundMaterial.ts` + `src/scene/materials/SeaMaterial.ts`

Fresh GLSL per "Target design → Rendering". Each file exports a factory
(`createIslandGroundMaterial(textures, opts)` / `createSeaMaterial(textures,
shoreTex, opts)`) returning a configured `THREE.ShaderMaterial`, plus a small
helper to build the shore `DataTexture` from `shoreDistanceField` output
(`THREE.DataTexture`, single channel, `THREE.RedFormat` + `THREE.FloatType`,
linear filtering) with the uniforms mapping world XZ → texture UV.

**Color-space guidance (three r171 pitfall — do not skip):** raw `ShaderMaterial`s
get NO automatic output color-space conversion, so ported colors render washed-out
or dark next to the app. Load `sand-soft-ripples.png`/`cliff-soft-strata.png` with
`texture.colorSpace = THREE.SRGBColorSpace` (foam masks stay linear — they are
data, matching the app's loader at `View/Island.js:317-350`), and end BOTH fragment
shaders with `#include <colorspace_fragment>` as the last line of `main()` (it
converts `gl_FragColor` to the renderer's output space; `ShaderMaterial` defaults
`toneMapped = false`, so no tonemapping include is needed).

Provenance guard is enforced HERE: the sea fragment contains only depth gradient,
shore lip, wet tint, and the two foam-texture bands. Include the header comment:
"Clean-room sea: no TinySkies-derived layers (see
docs/plans/2026-06-12-asset-provenance-audit.md); candidate back-port for audit
task T2f."

Texture loading lives with the scene (Step 9) via `THREE.TextureLoader` from
`/textures/<name>.png` (island-editor's own public dir), configured like the app:
`SRGBColorSpace` for sand/cliff, `RepeatWrapping`, linear mipmaps.

No unit tests for GLSL; the factories get a smoke test in
`test/materials.test.ts` guarded to skip if `THREE.ShaderMaterial` construction
needs a GL context (it does not — constructing the material and asserting uniform
presence is enough).

**Verify**: `pnpm check:island-editor` → exit 0.

### Step 9: Cutover — scene, UI, App, persistence; delete the v2 pipeline

1. New `src/scene/IslandTerrain.tsx` (replaces `Terrain.tsx` — same interaction
   skeleton, rewritten): mesh with `composeGeometry`/`updateGeometry` +
   `createIslandGroundMaterial`; pointer paint (`painting` ref, window `pointerup`,
   `e.point.x/z` → `onPaint(x, z)`); the brush-sized cell-snapped cursor quad.
2. New `src/scene/SeaSurface.tsx` (replaces `Sea.tsx`): plane + `createSeaMaterial`;
   recomputes the shore `DataTexture` when the grid ticks; advances `uTime` via
   `useFrame`.
3. Rewrite `ToolPanel.tsx`: tool buttons Raise / Lower / Water / Path / Erase,
   brush size 1/2/3, undo/redo, Designer view / Top view / Export / Import / Reset.
   Keep the `tool-panel__*` CSS classes; drop `NumberField` and all profile/
   coastline props. One hint line per tool.
4. Rewrite `App.tsx`: `grid` in a ref with a tick (the `reliefRef`/`reliefTick`
   StrictMode-safe pattern), `tool`, `brushSize`; stroke lifecycle with the
   visited-`Set` and two-array snapshot undo; keyboard undo/redo; autosave;
   reset/export/import via `specIO` + `seedIsland`; `topView` + new `designerView`;
   orbit disabled while painting. Remove all coastline/profile/worldSize UI state
   and `DRAG_SEGMENTS`.
5. `persistence.ts`: swap imports `exportSpec` → `specIO` (same API, same
   `STORAGE_KEY` — a saved v2 autosave now loads and migrates transparently).
6. Update `Backdrop.tsx` only to align the directional light with the ground
   material's `uSunDirection`.
7. Delete: `src/scene/Terrain.tsx`, `src/scene/CoastlineHandles.tsx`,
   `src/scene/Sea.tsx`, `src/terrain/brush.ts`, `src/terrain/coastlineOps.ts`,
   `src/terrain/buildTerrainGeometry.ts`, `src/terrain/islandSpec.ts`,
   `src/editor/exportSpec.ts`, `src/editor/reliefCodec.ts`, and tests
   `brush.test.ts`, `coastlineOps.test.ts`, `buildTerrainGeometry.test.ts`,
   `terrain.test.ts`, `exportSpec.test.ts`, `reliefCodec.test.ts`.
8. Rewrite `test/persistence.test.ts` against v3 (save/load round-trip; invalid
   spec not persisted keeps last-good; autosave debounce; plus: a serialized v2
   spec planted under `STORAGE_KEY` loads as a v3 spec).

**Verify**: `pnpm check:island-editor` → exit 0.
`grep -rn "coastline\|Coastline" island-editor/src | grep -v legacy` → no matches.
`grep -rn "applyBrush\|HeightProfile\|ReliefGrid\|vertexColors" island-editor/src | grep -v legacy`
→ no matches. `pnpm check` (root) → exit 0.

### Step 10: Visual QA + polish

Run `pnpm dev:editor` (and `pnpm dev` for the product app) and verify — screenshots
if you have a browser tool; otherwise report the checklist as NOT RUN for a human:

- [ ] The seed island loads terraced with the **product look**: the app's sand
      texture on the beach ring, cliff strata on walls, the app's grass green on
      tops — side-by-side with :3000, materials read as the same family.
- [ ] Sea: depth gradient + white shore lip + foam textures hugging the actual
      coastline (including around a freshly carved river/pond) — and NO copied
      TinySkies patterns (see Done criteria greps).
- [ ] Raise: click-drag stamps readable cliffs with flat tops, near-vertical
      walls, rounded corners; a cell raised twice becomes a 2-tier mesa.
- [ ] Lower reverses symmetrically; Water carves a river across land; Path paints
      a dirt lane; Erase reverts it.
- [ ] Undo/redo (⌘Z/⇧⌘Z) restores strokes exactly; Export → Import round-trips;
      Reset reseeds.
- [ ] Orbit, Top view, Designer view behave; painting never fights the camera.
- [ ] No console errors; painting responsive at SEGMENTS = 128 (drop to 96 and
      note it if it hitches).

- [ ] Colors match the app's hues (not washed-out/dark — the color-space include
      from Step 8 is working; compare the sand tone directly against :3000).

Tuning knobs if the look is off (adjust constants, keep tests green): wall width
`W` (0.25–0.45), `BLUR_MIX` (0–0.4; higher = rounder corners, weaker thin
features), `SEGMENTS` (96–160), wallness threshold (0.25–0.5),
`DEFAULT_TIER_HEIGHTS` steps, texture UV scales, foam band widths.

Then update `island-editor/package.json` `description` ("Standalone sandbox island
designer (r3f + drei) — tile-grid terraforming with discrete cliff tiers, water,
and paths, rendered with the product island's materials; exports an engine-agnostic
island spec") and flip this plan's frontmatter `status`.

**Verify**: `pnpm check:island-editor` → exit 0; checklist reported item by item.

## Test plan (summary)

New/rewritten files in `island-editor/test/`, style modeled on `brush.test.ts`:
`terrainGrid.test.ts`, `seed.test.ts`, `gridOps.test.ts`, `shoreField.test.ts`,
`gridCodec.test.ts`, `specIO.test.ts`, `applyOps.test.ts` (rewrite),
`buildIslandGeometry.test.ts`, `materials.test.ts`, `persistence.test.ts`
(rewrite). Unchanged: `commandStack.test.ts`.
Expected final suite: 11 files, ≥ 55 tests, all passing.

## Done criteria

ALL must hold:

- [ ] `pnpm check:island-editor` exits 0
- [ ] `pnpm check` (root) exits 0; `git status` shows no changes outside
      `island-editor/` + this plan file
- [ ] `grep -rn "coastline\|Coastline\|applyBrush\|HeightProfile\|ReliefGrid\|vertexColors" island-editor/src | grep -v legacy` → empty
- [ ] `grep -rn "from 'three'\|from '@react-three" island-editor/src/terrain island-editor/src/editor island-editor/src/agent | grep -v buildIslandGeometry` → empty (pure core stays pure)
- [ ] Provenance greps → empty (the TinySkies signatures must not exist in the editor):
      `grep -rn "w3 \* w5 \* w7\|spMask\|noiseOff) \* 4.0" island-editor/src`
- [ ] `ls island-editor/public/textures` → the four PNGs, byte-identical to
      `public/student-space/textures/` (`cmp` each pair)
- [ ] The Step 6 CLI smoke passes (fillRect visible in `out.json`)
- [ ] A v2 export imports successfully (covered by `specIO.test.ts` + Step 10
      manual import if a real file is available)
- [ ] Step 10 checklist reported (run, or explicitly handed to a human as NOT RUN)
- [ ] **Operator look sign-off recorded** (the hard gate in "Execution strategy" —
      the branch does not merge without it)
- [ ] This file's frontmatter `status` updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `island-editor/`, `View/Island.js`, or the texture files
  changed since `62e28619` and any "Current state" excerpt no longer matches.
- Any of the four texture PNGs is missing from `public/student-space/textures/`.
- After exhausting the Step 10 tuning knobs, terraces still do not read as cliffs
  (walls smeared over > ~1.5 cells, or corners visibly diamond-shaped) — report
  with a screenshot; the fallback (true stepped per-tile meshing) is a design
  change the advisor must approve.
- Matching the product look appears to require porting one of the provenance-🔴
  layers (foam blobs / sparkles / contour ripples) or Bruno's grass GLSL — it does
  not; report instead of porting.
- The seed migration produces a degenerate island (all-ocean, all-land, or no
  beach ring) and the rasterizer thresholds don't obviously explain it.
- Any fix appears to require touching repo-root `src/` or adding a dependency.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Engine binding just got easier** (future plan `2026-06-19-003`): v3
  `evaluateHeight` is O(1) bilinear + terrace with a precomputable 64×64 blur — no
  polygon queries. An engine consumer needs only `terrainGrid.ts` + a spec JSON.
  `tierHeights[2] = 1.0` deliberately matches the engine's `plateauTopY`; if the
  engine's island scale changes, revisit `DEFAULT_TIER_HEIGHTS` and the seed.
- **The editor's sea shader is a clean-room candidate for audit task T2f** (replace
  the app's TinySkies-derived water layers). If it looks good in the editor,
  back-porting it (with the shore-distance field replacing the analytic
  `silhouette(theta)` hack) kills a provenance 🔴 and generalizes the app's water
  to future data-driven islands in one move.
- **The placement GUI plan (`2026-06-19-004`) should snap to this grid** if built.
- **The agent op vocabulary changed** — `docs/island-editor-agent-editing-design.md`
  and the `2026-06-19-002` plan describe the old ops; the CLI contract (spec in,
  ops in, spec out, exit codes) is unchanged.
- **Texture duplication is deliberate**: `island-editor/public/textures/` carries
  byte-identical copies (the workspace is dependency-isolated by design). If the
  app's textures are ever re-authored, re-copy — the Done-criteria `cmp` check
  documents the pairing.
- **Reviewer focus**: Step 9 (the cutover) — no stray v2 imports; the stroke
  visited-set prevents runaway raises during drags; grid mutations stay in the
  ref+tick pattern (StrictMode safety); and the sea shader contains nothing from
  the 🔴 list.
- Deliberately deferred: elevated water/waterfalls, multiple path materials,
  auto-rounded path corners, character-scale walk preview, curved-earth/day-cycle
  parity, engine consumption. Each is additive on the v3 grid.
