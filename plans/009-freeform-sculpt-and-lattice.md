# Plan 009: Freeform authoring — sculpt brushes, lattice deformation, and undo/redo

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.4, §4.1). Follow steps in order, verify each, honor STOP
> conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/sculpt character-studio/src/core/commands`
> Confirm plans 004+006 landed: spec `anatomy.sculptDelta` reserved field,
> assembled characters with fixed-topology authored meshes
> (`baseMeshVersion` concept in `ASSET-CONTRACT.md`). On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH (hardest algorithmic plan; interaction quality is the point)
- **Depends on**: plans/004, 006
- **Category**: direction
- **Recommended executor**: Fable 5 (novel geometry algorithms + interaction feel; Opus 4.8 acceptable with extra iteration on step 6)
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

The brief demands Spline-grade freeform control: "direct, freeform control of
the model's shape … so I can give a character a genuinely unique silhouette."
Sliders (plan 006 morphs) give parametric variety; this plan gives designers
hands-on deformation — soft-selection sculpt brushes and lattice cages —
stored as a portable delta layer that survives re-assembly, morphs, skinning,
and export. It also builds the editor-grade undo/redo stack the whole studio
adopts.

## Current state

- Characters assemble from fixed-topology authored meshes (plan 006); spec
  reserves `anatomy.sculptDelta: { baseMeshId, baseMeshVersion }`.
- No `src/core/sculpt/` or `src/core/commands/` content beyond `index.ts`.
- **Researched foundations** (plan 000 §2.4, §3):
  - **SculptGL** (MIT, archived) is the reference for brush algorithms —
    port the *algorithms* (brush falloff, grab/inflate/smooth/pinch vertex
    ops), depend on nothing from it.
  - **Fixed topology is a hard rule**: no dyntopo/remeshing (destroys UVs,
    weights, morphs). Sculpting = per-vertex position deltas on the base mesh.
  - **FFD**: Sederberg–Parry trivariate Bernstein lattice — no maintained
    three.js lib exists; implement from the paper's formula (it is ~40 lines
    of math).
  - **Undo/redo**: the three.js-editor command pattern — every mutation is a
    command object routed through one `execute()`; rapid drag updates
    **coalesce** into one history entry (`updatable` commands); history is
    serializable.
- Interaction stack available: r3f raycasting, drei `TransformControls`/
  `PivotControls` (use `PivotControls` for lattice points — researched as the
  more polished gizmo).

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/commands/{commandStack.ts, types.ts}` (new — studio-wide)
- `character-studio/src/core/sculpt/{brushes.ts, softSelect.ts, lattice.ts, deltaLayer.ts}` (new)
- `character-studio/src/studio/panels/SculptPanel.tsx`, `src/studio/viewport/SculptTool.tsx`, `LatticeTool.tsx` (new)
- `character-studio/src/core/spec/schema.ts` — fill the reserved `sculptDelta` payload (allowed, versioned: add fields, keep specVersion 1 since the field was reserved-optional)
- `character-studio/test/core/{commands,sculpt}/**`

**Out of scope**:
- Voxel remesh/dyntopo/multires (rejected), texture painting, retopology,
  sculpting wardrobe items (bodies + anatomy parts only for v1), migrating
  existing panels onto the command stack (follow-up; only sculpt/lattice use
  it now, but design the API studio-generic).

## Git workflow

- Branch: `advisor/009-freeform-sculpt`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Command stack (`commandStack.ts`)

`createCommandStack(limit = 200)` → `{ execute(cmd), undo(), redo(),
canUndo/canRedo, subscribe }`. `Command = { do(), undo(), tryCoalesce(next):
boolean, label }`. Coalescing: a drag emits many `SculptStrokeCommand`
updates; `tryCoalesce` merges same-stroke commands (keeps first `before`,
last `after`) so one drag = one undo step (the three.js-editor `updatable`
pattern). Keyboard: wire ⌘Z/⇧⌘Z at the App level.

Tests: do/undo/redo ordering, redo cleared on new execute, coalescing merges
only same-stroke ids, limit eviction.

### Step 2: Delta layer (`deltaLayer.ts`)

The persistence heart. `DeltaLayer = { baseMeshId, baseMeshVersion,
positions: Float32Array (3·N deltas, sparse-encoded on serialize) }`.
- `applyDelta(geometry, delta)` writes `basePosition + delta` into the
  position attribute (keep an immutable copy of base positions);
  recompute normals (respecting the smoothed-normal outline attribute from
  plan 005 step 3 — recompute both).
- **Morph compatibility**: deltas apply to the base positions *before* morph
  targets add on top (three.js applies morphs in-shader over the position
  attribute — so writing deltas into `position` composes correctly with
  morphs; document this).
- Serialization into the spec: sparse `{ indices: number[], values: number[] }`
  quantized to 1e-5 m; `sculptDelta` schema filled accordingly + zod.
- Version guard: `baseMeshVersion` mismatch on load → refuse with a clear
  error (surfaced as a studio toast later; throw typed error now).

Tests: apply/round-trip losslessness at quantization tolerance, sparse
encoding drops zero deltas, version-mismatch throws.

### Step 3: Soft-selection brushes (`softSelect.ts`, `brushes.ts`)

`pickBrushVertices(geometry, hitPoint, radius, falloff)` → weighted vertex
set. **Geodesic-aware approximation**: euclidean distance is wrong at ear/
body junctions (sculpting an ear tip must not drag the skull) — use
BFS over the vertex adjacency graph (build adjacency once per geometry,
cache) with edge-length-summed distances, falloff `smoothstep(1 - d/r)`.
Brushes (SculptGL algorithm ports, each a pure function on positions +
weights):
- `grab`: move by drag vector × weight (screen-space drag projected to the
  brush plane).
- `inflate`: move along vertex normal × strength × weight.
- `smooth`: Laplacian relax toward neighbor centroid × weight (uses adjacency).
- `pinch`: pull toward brush center tangentially × weight.
All emit coalescing commands carrying before/after delta snapshots of only
the touched indices.

Tests (headless, on a generated icosphere): grab moves picked verts by the
drag vector at weight 1; falloff monotonic; geodesic picking excludes
spatially-near-but-unconnected verts (two-sphere test geometry); smooth
reduces Laplacian energy; all brushes leave untouched indices bit-identical.

### Step 4: Sculpt tool UX (`SculptTool.tsx`, `SculptPanel.tsx`)

Viewport interaction: brush cursor ring projected on the surface (radius
preview), radius `[`/`]` keys + slider, strength slider, brush picker,
mirror-X toggle (default ON — characters are symmetric; mirror by
position-hashed vertex pairing computed once per geometry, tolerance 1e-4).
While sculpting: orbit locked to right-mouse, spring physics paused
(`reset()` on exit), face rig unaffected. Live normal recompute throttled to
every other frame during drag, exact on release.

**Verify**: `pnpm dev` → pulling an ear tip with grab (mirror on) reshapes
both ears smoothly with clean falloff; undo restores exactly; saved spec
reloads the sculpt (step 2 wiring through the store).

### Step 5: Lattice tool (`lattice.ts`, `LatticeTool.tsx`)

Sederberg–Parry FFD: `createLattice(bbox, resolution = 3×4×3)` around the
whole character or the selected part (part bboxes from plan-006 assembly).
Control points draggable via `PivotControls`; deformation maps every mesh
vertex through trivariate Bernstein interpolation of the displaced lattice;
output written into the same delta layer (lattice is a delta *authoring*
tool, not a separate persisted deformer — bake on apply, keep the session's
lattice editable until "Apply Lattice" commits one command).

Tests: identity lattice = zero delta; moving one control point displaces
only vertices in its Bernstein support with correct weights (hand-computed
case at cell center); apply/undo round-trip.

### Step 6: The silhouette gate (do not skip)

Produce (and describe in your report) one before/after: take the default
biped-round dog, and with sculpt+lattice only give it a visibly unique
silhouette (e.g. broader jowls, asymmetric bent ear tip with mirror off,
pot belly beyond the morph range) —
- deltas survive: archetype re-render, morph slider sweeps, Play Mode
  animation (skinning deforms the sculpted shape, no vertex swimming),
- normals stay clean (no faceting/seams at the sculpt boundary),
- undo history walks the whole session back losslessly.

## Test plan

`test/core/commands/commandStack.test.ts` (4+ cases),
`test/core/sculpt/{deltaLayer,brushes,lattice}.test.ts` (≥ 12 cases per
steps 2/3/5). All headless on generated geometry. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0 (≥ 4 new test files, ≥ 16 cases)
- [ ] Sculpt delta round-trips through spec serialize → reload (test + dev-verified)
- [ ] Mirror-X, geodesic falloff, and coalesced undo all demonstrable
- [ ] Sculpted character animates in Play Mode without artifacts (step 6) or pending-visual reported
- [ ] `grep -rn "from 'react'" character-studio/src/core/{sculpt,commands}/` → no matches
- [ ] `plans/README.md` updated

## STOP conditions

- Adjacency/geodesic picking too slow for interactive radius on the 18k-tri
  body (> 8 ms per pick) after caching — report measurements before
  considering spatial-hash euclidean fallback (a quality downgrade the
  advisor must approve).
- Delta-vs-morph composition produces double-displacement (would mean the
  plan's morph-compatibility assumption about three's in-shader morph path is
  wrong for this setup) — STOP with a minimal repro.
- Anything wants dyntopo/vertex-count changes.

## Maintenance notes

- Plan 011 bakes `basePositions + delta` into exported geometry (export never
  ships the delta separately — the GLB is self-sufficient; the spec keeps the
  editable delta).
- Artists bumping `baseMeshVersion` (plan 006 contract) invalidate saved
  sculpts by design — the version guard makes this loud, never silent.
- Follow-up (deferred): migrate all panels onto the command stack for
  studio-wide undo; sculpting wardrobe items.
- Reviewer: normals recompute cost during drag, mirror pairing on
  not-quite-symmetric authored meshes, sparse quantization epsilon vs visible
  detail.
