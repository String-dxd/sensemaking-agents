# Plan 013: Procedural mesh kit — bodies and anatomy parts generated in TypeScript (biped parity first)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> Read `advisor-plans/012-procedural-first-architecture.md` first — it holds
> the decisions (D1–D6), the supersession record, and the parity contract
> this plan executes against. When done, update this plan's row in
> `advisor-plans/README.md` (Wave 3 table) — unless your reviewer maintains
> the index.
>
> **Drift check (run first)**:
> `git diff --stat a8f7c8e1..HEAD -- character-studio/src/core/skeleton character-studio/src/core/wardrobe character-studio/src/core/face character-studio/src/studio/viewport/CharacterRoot.tsx character-studio/src/studio/roster/companionExport.ts character-studio/src/core/export character-studio/scripts/blender`
> If any listed file changed since `a8f7c8e1`, compare the "Current state"
> excerpts below against the live code; on a mismatch, STOP and report.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (geometry generation with many hidden cross-lane contracts;
  the whole wave gates on it)
- **Depends on**: 012 (reference brief; no code)
- **Category**: migration
- **Planned at**: commit `a8f7c8e1`, 2026-07-07
- **Recommended executor**: Fable 5 (novel algorithm + silhouette judgment;
  do not silently downgrade — operator direction)

## Why this matters

The studio's bodies and anatomy parts are Blender-authored GLBs regenerated
via `pnpm gen:assets` (requires a local Blender 5.1.2 install, byte-drifts on
every run, and makes every silhouette change an offline round-trip). The
operator has directed a move to fully procedural characters (see plan 012's
supersession record). This plan replaces the 3 archetype body GLBs and 12+
part GLBs with deterministic TypeScript generators **while keeping the
current upright stance and archetype ids**, so the existing test suite
(484 at plan time — re-measure, don't assume), clip set, springs, sculpt,
wardrobe, and export verify geometry parity in isolation. Plan 014 changes
stance afterward. After this plan, a silhouette tweak is a TS code change
with instant hot reload — no Blender.

**You are not inventing geometry from zero.** The current bodies are built
by an *analytic Python recipe* (`scripts/blender/bodies.py` +
`scripts/blender/meshkit.py`) — parametric sphere/capsule shells with
computed weights, UVs, palette channels, and morphs. That recipe is inlined
below as your porting spec. The one deliberate divergence: the Python lane
unions overlapping shells and welds them with a Blender boolean
(`weld.py`, wave-1 plan 003); TS has no robust boolean, so this kit
produces the welded result **by construction** — limbs stitched to body
openings ring-to-ring. Same silhouettes, different (cleaner) topology.

## Current state

Files and roles:

- `src/core/skeleton/partRegistry.ts` — part + body catalogs. `PartDef.url`
  (line 27) and `BodyDef.url` (line 320) are the only asset handles; both
  resolve GLBs via `new URL(..., import.meta.url)` (lines 77, 330).
  `BODY_REGISTRY` keys: `'biped-round' | 'biped-slim' | 'bird'` (line 332),
  all `meshVersion: 3`.
- `src/core/skeleton/canonical.ts` — `buildSkeleton(options)` (line 170)
  builds the 38-bone canonical skeleton in TS (rest pose, identity
  rotations). **The skeleton is already procedural** — only meshes come from
  GLBs.
- `src/core/skeleton/archetypes.ts` — `ARCHETYPES_DEF` proportion tables
  (line 64): per-archetype `offsetScales`, `uniformScale`, `headCenter`,
  `headRadius`. `archetypeBuildOptions(archetype)` feeds `buildSkeleton`.
- `src/core/skeleton/assemble.ts` — `assembleCharacter(spec, registry,
  assets)` (line 167) consumes `LoadedAssets` (lines 30–37: `bodyScene`,
  `partScenes`, `texturesByRegion`) — pre-loaded THREE scenes,
  source-agnostic. **Out of scope; must not change.**
- `src/studio/viewport/CharacterRoot.tsx` — viewport GLB loader. See "The
  loading seam is NOT small" below.
- `src/studio/roster/companionExport.ts` — the browser export loader
  (`loadBrowserAssets`, line 28) — **note the path: `src/studio/roster/`,
  not `src/core/export/`**. Loads body/part/item GLBs via
  `GLTFLoader.loadAsync`, keyed by def (`body.url` etc.), not by index.
- `src/core/export/compile.ts` — `CompileAssets` (lines 75–88) takes
  `bodyScene`/`partScenes` THREE scenes; the compiler reads live geometry
  attributes and bakes to GLB regardless of source.
- `src/core/face/faceComposite.ts` — the drawn-face compositor. Its head-UV
  contract constrains your UV generation (see below).
- `scripts/blender/bodies.py`, `meshkit.py` — the analytic recipe (inlined
  below). **Do not delete any `scripts/blender/*.py` in this plan** — they
  cross-import (`clips.py` line 48 does `import bodies`; `gen_assets.py`
  imports bodies/parts and drives `patterns.py`); plan 016 sweeps them all.
- `test/core/skeleton/assets.test.ts`, `test/core/wardrobe/assets.test.ts` —
  gltf-transform validation of shipped GLBs (the skeleton one gets replaced
  here; the wardrobe one is plan 016's).

Key excerpts (verify during the drift check):

```ts
// src/core/skeleton/partRegistry.ts:318-328
export interface BodyDef {
  /** GLB with the full canonical skeleton + skinned body mesh. */
  url: string
  maskUrl: string
  /** Body morph target names (shared contract across archetypes). */
  morphs: readonly string[]
  /** ASSET-CONTRACT `baseMeshVersion` (see PartDef.meshVersion). */
  meshVersion?: number
}
export const BODY_MORPHS = ['bellyRound', 'chubby', 'slim', 'headBig', 'headSmall'] as const
```

```ts
// src/core/skeleton/assemble.ts:30-37 — the substitution boundary
export interface LoadedAssets {
  bodyScene: THREE.Object3D
  partScenes: Partial<Record<PartSlot, THREE.Object3D>>
  texturesByRegion?: Partial<Record<Region, ResolvedTextures>>
}
```

```ts
// src/core/face/faceComposite.ts:74-79 — the head-UV contract
/**
 * The head shell's UV island in the body texture — (u0, v0, u1, v1) from
 * scripts/blender/bodies.py `UV_HEAD`, front-centered (azimuth 0 → island
 * u-center) with azimuth u∈[0,1] and polar v∈[0,1] bottom-up (meshkit.py
 * sphere_shell param mapping).
 */
export const HEAD_UV_ISLAND = [0.0, 0.45, 0.55, 1.0] as const
```

**The face-UV contract (hard requirement).** The drawn face (eyes, brows,
mouth) is composited into a 1024² overlay sampled with the body's own UVs
(`uFaceMap`, `toonMaterial.ts` FACE_FRAGMENT). `facePlacementToUvRect`
(`faceComposite.ts:133`) converts angular face placement to UV rects
assuming the head island is an **equirectangular spherical parameterization**:
u = azimuth (front-centered: azimuth 0 → island u-center, wrap seam at the
back), v = polar angle bottom-up, spanning `HEAD_UV_ISLAND`. Your procedural
head MUST reproduce exactly this mapping inside exactly that rectangle —
otherwise every face lands displaced. `createFaceCompositor` accepts a
`headIsland` override (`faceComposite.ts:221-223`), so if you must move the
island, thread the kit's rect through — but the default path is to keep
`[0.0, 0.45, 0.55, 1.0]` verbatim.

**Hide-region contract.** Wardrobe hides body submeshes by
`o.userData.bodyRegion` (`src/core/wardrobe/dress.ts:323`), values
`'torso' | 'hips' | 'upperLegs'` (`itemRegistry.ts:41`). In GLBs this is a
glTF *extra* (`ASSET-CONTRACT.md:189`); your builder simply sets
`mesh.userData.bodyRegion` on the corresponding submeshes. Do NOT rely on
mesh naming — the dresser reads userData only.

**The loading seam is NOT small.** `CharacterRoot.tsx` addresses one
positional `useGLTF(gltfUrls)` result array in FOUR places, all assuming
body at index 0:

- `gltfUrls` build + `useGLTF` — lines 113–117, 132
- assembly memo — `gltfs[0].scene` / `gltfs[i + 1].scene` (lines 145–149)
- dressing effect — `itemScenes[item.itemId] = gltfs[1 + equipped.length + j].scene`
  (lines 191–192)
- sculpt-session effect — `scene: gltfs[0].scene` (line 220) and
  `scene: gltfs[i + 1].scene` (line 231), plus `meshVersionOf(...)` reads
  (lines 221, 232, 240)

Going procedural for body+parts collapses that positional list (wardrobe
GLBs remain until plan 016, and with no items worn the URL list becomes
EMPTY — drei's `useGLTF` must not be called with an empty array). Step 4
restructures this honestly.

**Morph-magnitude coupling to still-GLB garments.** Garments bake
"body-follow" morph targets at the *authored* body-morph magnitudes
(`itemRegistry.ts:94-95`; applied in `dress.ts` and
`CharacterRoot.tsx:372-374` area). Your procedural `bellyRound` etc. must
displace the body surface by the same magnitudes as the authored GLB morphs,
or clothes float/clip when a morph or species preset is dialed. The morph
recipe below (from `bodies.py`) IS those magnitudes — port it numerically,
don't restyle it.

Repo conventions: `src/core/**` never imports React (enforced by
`test/core-no-react.test.ts`); no `Math.random` in core — inject a seeded
RNG; tests are vanilla vitest + real `three`, model after
`test/core/skeleton/assemble.test.ts` (stub registries/scenes, call
functions directly).

## The silhouette recipe (port source: `scripts/blender/bodies.py` — inlined so you never need to run Blender)

**UV atlas rectangles** (`bodies.py:16-26`) — reuse these EXACTLY (the face
contract pins UV_HEAD; the mask rasterizer in plan 015 consumes the rest):

```
UV_HEAD  (0.00, 0.45, 0.55, 1.00)   front-centered   UV_TORSO (0.55, 0.45, 1.00, 1.00)  seam at BACK
UV_ARM_L (0.00, 0.22, 0.20, 0.45)   UV_ARM_R (0.20, 0.22, 0.40, 0.45)
UV_HAND_L(0.40, 0.22, 0.50, 0.45)   UV_HAND_R(0.50, 0.22, 0.60, 0.45)
UV_LEG_L (0.60, 0.22, 0.80, 0.45)   UV_LEG_R (0.80, 0.22, 1.00, 0.45)
UV_FOOT_L(0.00, 0.00, 0.25, 0.22)   UV_FOOT_R(0.25, 0.00, 0.50, 0.22)
```

**Shell inventory** (`bodies.py:144-315`), sizes from the archetype
skeleton's world joints `j[bone]` and `archetypeHead` (center/radius), with
`u = uniformScale`:

| Piece | Primitive (segs) | Sizing |
|---|---|---|
| head | ellipsoid (32×22) | center `j.head + headCenter`, radii `headRadius × (head_wide, head_squash, 1)` |
| torso | profiled ellipsoid (24×18) | vertical span `hips.y − 0.42·torsoH` → `neck.y + 0.55·torsoH` (torsoH = neck.y − hips.y); radii `(headR·torso_rx, span/2, headR·torso_rz)`; radial profile `1 + pear·(1−v)²·sin(πv)·2 − taper·v²` (pear widest low) |
| arm ×2 | capsule along chain (12×10) | root pulled INSIDE the torso: `upperArm × (root_pull, 1, 1) + (0, 0.018, 0)·u` (root_pull 0.52 round / 0.44 slim) → `handL`; radii `arm_r·1.15 → arm_r·0.95` (plush near-constant width) |
| hand ×2 | ellipsoid (12×9) | mitten tucked into the arm end: center `handL + wristDir·hand_r·0.85`, radii `hand_r·(1, 0.92, 1.08)` |
| leg ×2 | capsule (12×10) | `upperLeg + (0, 0.05, 0)·u` → `footL × (1, 0.7, 1)` (tip dips into the foot so they join); radii `leg_r → leg_r·0.85` |
| foot ×2 | ellipsoid (12×9) | center `(footL.x, footL.y·0.55, footL.z + fz·0.42)`, radii per-archetype `foot` triple |
| bird wing (replaces arm+hand) | capsule (14×12), z-flattened ×0.55 | `upperArmL + (0.02, 0.005, 0)·u` → `handL + (0.04, −0.02, −0.03)·u`, radii `arm_r·2.0 → arm_r·0.85`, draped OUTBOARD of the flank (wave-1 plan 007 rev: an inboard drape gets swallowed — keep the visible mass) |

**Per-archetype style knobs** (`bodies.py:125-141`):

| | torso_rx | torso_rz | pear | shoulder_taper | arm_r | hand_r | leg_r | foot (x,y,z) | head_squash | head_wide |
|---|---|---|---|---|---|---|---|---|---|---|
| biped-round | 0.80 | 0.62 | 0.28 | 0.16 | 0.050 | 0.058 | 0.064 | 0.064, 0.044, 0.104 | 0.97 | 1.05 |
| biped-slim | 0.66 | 0.58 | 0.22 | 0.18 | 0.042 | 0.050 | 0.050 | 0.054, 0.038, 0.092 | 0.99 | 1.02 |
| bird | 0.88 | 0.80 | 0.36 | 0.14 | 0.034 | — | 0.028 | 0.056, 0.030, 0.102 | 0.96 | 1.04 |

(arm_r/hand_r/leg_r scale by `u / 0.9`.)

**Skin weights** (analytic, `bodies.py:327-346`): head → 1.0 to `head`;
torso → vertical smoothstep bands hips/spine/chest with band width
`0.45·(chest.y − hips.y)`; limbs → chain-parameter `t` split by
`smoothstep(s−w, s+w, t)` at splits `[0.5]` width 0.18 (arm:
upperArm/foreArm), `[0.5]` width 0.16 (leg: upperLeg/lowerLeg), wing
`[0.45, 0.8]` width 0.16 (upperArm/foreArm/hand); hand → 1.0 to `handL/R`;
foot → smoothstep toward toes: `footL 1−0.6·tz`, `toesL 0.6·tz` where tz is
a z-smoothstep over the front 70% of the foot. ≤4 influences, normalized —
the analytic recipe never exceeds 3.

**Palette-mask channels** (per-vertex R/G/B/A =
primary/secondary/belly/accentA, `bodies.py:349-371`): torso belly = soft
front ellipse (centred slightly below middle, gated to front-facing z);
torso back-saddle = secondary 0.9; head face-patch = belly 0.9 (forward +
slightly down); head cap = secondary 0.9 (top-back; bolder on bird); hands +
feet + wing tips = accent 0.85–0.9. **Your kit must compute and retain these
per-vertex channel values** — plan 015's TS rasterizer bakes them (and the
species patterns, which are more per-vertex field functions of the same
shape) into mask PNTextures. Store as a `Float32Array` (n×4) alongside the
geometry.

**Body morphs** (`bodies.py:379-411`) — port these NUMERICALLY (garment
compatibility, see above): `bellyRound` = lower-front torso radial push,
weight `(1 − smoothstep(0.4, 1, r))·frontGate`, magnitude `0.075·u` radial +
`0.02·u` forward; `chubby` = torso radial ×0.05·u, limbs radial ×0.10 from
centroid, head ×0.02; `slim` = torso −0.038·u, limbs −0.08; `headBig`/
`headSmall` = head radial ±0.13/−0.11 from head center.

**Junction shaping**: the Python lane's `fillet_limb_into_torso`
(`bodies.py:70-121`) reshapes limb-root verts onto the smooth-min union
surface (polynomial smin, k ≈ 0.05–0.055·u) — pure vector math, portable if
you want sculpted haunches on the stitched topology (recommended: apply it
to the rings near the stitch boundary). The stitched kit makes the *weld*
unnecessary but the *fillet look* is still the AC read.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass (484 at plan time — re-measure first) |
| One file | `pnpm test -- test/core/procgen/body.test.ts` | pass |
| Dev server | `pnpm dev` | studio at http://localhost:5190 |
| Runtime pkg | `pnpm --filter @sensemaking/companion-runtime test` | pass |

## Scope

**In scope** (files you may create/modify):
- `src/core/procgen/**` (new — the mesh kit)
- `src/core/skeleton/partRegistry.ts` (source union, builder wiring,
  meshVersion bumps)
- `src/studio/viewport/CharacterRoot.tsx` (loading seam restructure)
- `src/studio/roster/companionExport.ts` (loading seam — body/parts only)
- `test/core/procgen/**` (new), `test/core/skeleton/assets.test.ts`
  (replace GLB validation with builder validation)
- Final step only: delete `src/assets/anatomy/body-*.glb` and
  `src/assets/anatomy/parts/*.glb`. **Nothing else** — no `.py` files, no
  package-script entries (016 sweeps those; `gen:assets` becomes vestigial
  and harmless in the meantime).

**Out of scope** (do NOT touch):
- `src/core/skeleton/assemble.ts` and `src/core/wardrobe/dress.ts` — the
  whole point is that assembly/dressing do not change. If you find yourself
  editing either, STOP.
- `src/core/skeleton/canonical.ts`, `archetypes.ts` — stance is plan 014.
  This plan generates geometry for the EXISTING skeleton/pose/archetype ids
  (`biped-round`/`biped-slim`/`bird` — the `quad-*` ids do not exist yet).
- `src/core/spec/schema.ts` — no schema change (registry `source` is not
  spec data). Spec v3 is plan 014.
- Wardrobe GLBs, `itemRegistry.ts`, item entries in the loaders — plan 016.
  (You will *touch* the wardrobe indices inside CharacterRoot's effects
  while restructuring the seam — that's expected; the wardrobe *pipeline*
  must behave identically.)
- Clips (`src/assets/clips/`, PlayMode) — plan 014.
- Face, sculpt algorithms, materials, species modules.
- Any `scripts/blender/*.py` deletion.

## Git workflow

- Branch: `advisor/013-procedural-mesh-kit` off current main.
- Commit per step (executors die at session limits — per-step commits are
  mandatory), conventional style: `feat(character-studio): <step>`.
- Do not push or open a PR; the reviewer merges with operator approval.

## Steps

### Step 1: Mesh-kit substrate — deterministic stitched-shell primitives

Create `src/core/procgen/` (pure TS + three, no React):

- `kit/profiles.ts` — radial profile curves; include the torso pear profile
  from the recipe verbatim.
- `kit/sphereGrid.ts` — lat/long ellipsoid grids at the recipe's seg counts
  (32×22 head, 24×18 torso, 12×9 hand/foot) with profile support and
  **ring-opening extraction**: remove a cap of faces around a given
  direction, exposing a boundary ring of N vertices for limb stitching.
- `kit/loft.ts` — capsule-along-chain lofts (12×10 limbs, 14×12 wing) with
  per-ring radius interpolation, end caps, optional z-flatten.
- `kit/stitch.ts` — stitch a loft's opening ring to a shell opening ring
  (equal counts by construction) into ONE welded, manifold, indexed
  `BufferGeometry` — no interior faces, every edge shared by exactly 2
  triangles.
- `kit/fillet.ts` — port of `fillet_limb_into_torso` (smin-projection of
  near-junction rings; pure math, see recipe).
- `kit/weights.ts` — the analytic weight recipe above; ≤4 influences,
  normalized.
- `kit/uv.ts` — the UV atlas above, exported as data:
  `export const UV_ATLAS: Record<IslandName, readonly [u0,v0,u1,v1]>` plus
  the head equirect parameterization helper. Plan 015 imports this — keep
  the name `UV_ATLAS`.
- `kit/channels.ts` — per-vertex palette channel evaluation (recipe above),
  retained on the built body as `Float32Array` (n×4).
- `rng.ts` — seeded RNG (mulberry32-style). No `Math.random` anywhere.

**Determinism is the load-bearing property**: same params → identical vertex
count, order, UVs, and channels. Morph targets and sculpt deltas index
vertices by buffer position.

**Verify**: `pnpm test -- test/core/procgen/kit.test.ts` → pass;
`pnpm test -- test/core-no-react.test.ts` → pass.

### Step 2: Body builder for the three existing archetypes

`src/core/procgen/body.ts`:

```ts
export interface ProcBodyData {
  scene: THREE.Object3D           // canonical skeleton + one SkinnedMesh (+ hide submeshes)
  channels: Float32Array          // n×4 palette channels (plan 015 consumes)
  meta: {                         // pattern-field coordinate system (plan 015 consumes)
    torso: { cy: number; ry: number; rx: number; rz: number }
    headCenter: [number, number, number]
    headRadius: number
    shellRanges: Record<string, [start: number, end: number]>  // vertex ranges per piece
    limbParams: Record<string, Float32Array>                   // chain param t per limb vertex
  }
}
export function buildProceduralBody(archetype: Archetype): ProcBodyData
```

The `scene` must be shaped exactly like a loaded body GLB: skeleton from
`buildSkeleton(archetypeBuildOptions(archetype))`, one welded `SkinnedMesh`,
attributes POSITION/NORMAL/TEXCOORD_0(=UV atlas)/JOINTS_0/WEIGHTS_0, plus:

- The five `BODY_MORPHS` morph targets from the numeric recipe
  (`morphTargetInfluences` default 0).
- Hide-region submeshes: separate small meshes (or geometry groups exported
  as meshes) with `userData.bodyRegion` set to `'torso'`/`'hips'`/
  `'upperLegs'` — verify against `dress.ts:319-325` by dressing a tee in
  the dev studio and confirming the covered body region hides.
- Head UVs: equirect within `HEAD_UV_ISLAND` exactly as specified in
  Current state. **Face gate**: render a character in dev with eyes/brows/
  mouth visible and confirm the face sits correctly (front of head, not
  smeared or displaced) — include this screenshot in your report.
- ≤ 18k triangles.
- **meshVersion 4** on all three `BODY_REGISTRY` entries (topology changed;
  saved v3 sculpt deltas must refuse loudly — that's the existing designed
  behavior, note it in your report).

**Silhouette gate (screenshot)**: render each archetype's procedural body
side-by-side with its authored GLB (same camera/lighting — do this BEFORE
step 6 deletes the GLBs) and include the images in your report; the
reviewer judges "reads as the same character."

**Morph parity gate**: for each body morph at weight 1.0, sample ~200
surface points on authored vs procedural body; report max displacement
divergence. Target: same direction and magnitude within ~25% (garment
compatibility). If out of band after porting the numeric recipe, STOP.

**Verify**: `pnpm test -- test/core/procgen/body.test.ts` → pass (38 bones,
manifold weld check, morph names/count, triangle budget, determinism,
hide-region userData present, head-UV equirect probe: a vertex at the head
front maps to u≈island center).

### Step 3: Part builders for the full registry

`src/core/procgen/parts/` — one builder per part family (ears, muzzles,
beaks, tails, claws, crests) parameterized per part id;
`buildProceduralPart(partId: PartId): THREE.Object3D`. Match the assembly
conventions (`assemble.ts:235-273`): skinned parts = `SkinnedMesh` bound to
a reference-space canonical skeleton subset, weights only on chain bones;
rigid parts = plain meshes, origin at the attach bone's rest world position,
`userData.attachBone` for multi-attach parts (claws). Reproduce each part's
registry morphs (`length`, `width` where declared). Bump every part's
`meshVersion` by +1. Parts keep per-vertex channels too (ears/tails have
mask PNGs today — plan 015 rasterizes part masks from channels).

**Verify**: `pnpm test -- test/core/procgen/parts.test.ts` → every
non-null-url `PART_REGISTRY` id builds; attachment mode matches its def;
morph names match; ≤2.5k tris; determinism.

### Step 4: Registry source union + the loading-seam restructure

In `partRegistry.ts`:

```ts
export type AssetSource =
  | { kind: 'glb'; url: string }
  | { kind: 'procedural'; build: () => THREE.Object3D }
```

`BodyDef`/`PartDef` gain `source: AssetSource`; flip all body + part entries
to procedural; wardrobe defs are untouched (they don't share this type yet —
plan 016 adopts it). Keep `maskUrl` untouched (plan 015 owns masks).

Restructure `CharacterRoot.tsx` — this is a real refactor, not a patch.
Replace the positional `gltfs[]` array with an explicit sources object so
every consumer is keyed, not indexed:

```ts
interface SceneSources {
  bodyScene: THREE.Object3D                     // memoized build() per archetype
  partScenes: Partial<Record<PartSlot, THREE.Object3D>>
  itemScenes: Record<string, THREE.Object3D>    // still GLB until plan 016
}
```

- Body/parts: memoized `def.source.build()` (memo keys: archetype /
  part-id structural keys that already exist).
- Wardrobe: keep `useGLTF` for item URLs only. The URL list can now be
  EMPTY (no items worn) — `useGLTF` must not receive an empty array, so
  mount the item loader as an inner component rendered only when
  `itemUrls.length > 0`, passing `itemScenes` up (or via a callback ref
  into state). All four consumers (assembly memo :145-149, dressing effect
  :191-192, sculpt effect :220/:231) switch from `gltfs[index]` to the keyed
  `SceneSources` — after this change, `git grep -n "gltfs\[" src/studio`
  must return nothing.
- `companionExport.ts` (`src/studio/roster/`): in `loadBrowserAssets`,
  body/part scenes come from `def.source.build()` instead of
  `GLTFLoader.loadAsync(def.url)`; item loading unchanged.

**Verify**: `pnpm typecheck` → 0; `pnpm test` → all pass;
`git grep -n "gltfs\[" character-studio/src/studio` → no matches; dev: all
8 species + Custom render; part swapping works; **wardrobe binding gate**:
wear tee + cap + scarf simultaneously, confirm each dresses the correct
slot (a positional off-by-one would misbind here); **sculpt binding gate**:
sculpt the body, then a part, undo both — no crossed targets.

### Step 5: Parity gates across the full stack

1. `pnpm test` (studio) and `pnpm --filter @sensemaking/companion-runtime test`.
2. Rewrite `test/core/skeleton/assets.test.ts`: same assertions, new
   subject — `buildProceduralBody`/`buildProceduralPart` output (38 bones,
   rest pose translation-only vs `buildArchetypeSkeleton()` within 1e-4,
   attribute presence, morph names).
3. Live: Play Mode idle/walk/run/sit/talk + gestures on all three
   archetypes (clips still load from `clips-core-v1.glb` and target the
   unchanged skeleton — they must play identically); sculpt a body, save,
   reload (new meshVersion round-trips); dress GLB clothes over the
   procedural body **with bellyRound at 1.0** (morph-follow gate); export a
   `.companion.glb` from RosterView and load it in the runtime's tests.

**Verify**: all of the above; export stats `overBudget: false`.

### Step 6: Delete the GLB bodies/parts (gated)

**Only after the reviewer/operator approves step 2/5 screenshots**: delete
`src/assets/anatomy/body-*.glb` and `src/assets/anatomy/parts/*.glb`, and
the now-dead `kind:'glb'` handling for bodies/parts. Masks in
`src/assets/anatomy/textures/` STAY (015). All `scripts/blender/` files and
`gen:*` package entries STAY (016 sweeps).

**Verify**: `pnpm typecheck && pnpm test` → green;
`ls src/assets/anatomy/*.glb src/assets/anatomy/parts/*.glb` → no files;
`pnpm dev` → studio fully functional.

## Test plan

New tests (vanilla vitest + three, model after
`test/core/skeleton/assemble.test.ts`):

- `test/core/procgen/kit.test.ts` — determinism (two builds byte-equal),
  manifold check (every edge shared by exactly 2 faces), weight
  normalization + ≤4 influences, UV islands inside their `UV_ATLAS` rects,
  head equirect probe, channel array length = 4×vertexCount.
- `test/core/procgen/body.test.ts` — per archetype: bone completeness,
  morph names/count + numeric-recipe spot checks (bellyRound moves a
  front-lower-torso probe vertex outward by ≈0.075·u), triangle budget,
  hide-region userData, ProcBodyData.meta completeness.
- `test/core/procgen/parts.test.ts` — registry-driven loop (step 3).
- Updated `test/core/skeleton/assets.test.ts` (step 5.2).

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0 (pre-existing count +
      new; record the numbers)
- [ ] `pnpm --filter @sensemaking/companion-runtime test` exits 0
- [ ] `git grep -n "gltfs\[" character-studio/src/studio` → no matches
- [ ] `ls src/assets/anatomy/*.glb src/assets/anatomy/parts/*.glb` → no
      files (post step 6); `scripts/blender/` untouched (`git status`)
- [ ] Screenshot set: 3 archetypes × (GLB vs procedural) + face-visible
      close-up + dressed-with-bellyRound + Play-Mode walk capture
- [ ] Export from RosterView produces a conformant `.companion.glb` loading
      on three 0.149 and 0.185
- [ ] No files outside Scope modified (`git status`)
- [ ] `advisor-plans/README.md` wave-3 row updated

## STOP conditions

Stop and report (do not improvise) if:

- Drift check fails, or any "Current state" excerpt mismatches live code.
- You cannot achieve a welded manifold body with deterministic topology —
  do NOT fall back to overlapping shells (the wave-1 plan-003 regression)
  or marching-cubes/dyntopo (topology instability breaks morphs + sculpt).
- The head equirect UVs cannot coexist with the stitch topology at the neck
  opening (face contract vs weld conflict) after one honest attempt.
- The morph parity gate exceeds the ~25% band after porting the numeric
  recipe — the garment coupling makes freelancing here dangerous.
- Step-5 clip playback visibly breaks on procedural bodies (weights diverge
  too far) after one calibration attempt.
- Any change appears to require editing `assemble.ts`, `dress.ts`,
  `canonical.ts`, or `schema.ts`.
- The wardrobe or sculpt binding gates fail in a way that traces to the
  seam restructure and a second attempt doesn't fix it.

## Maintenance notes

- The kit's determinism contract now underpins morphs AND sculpt: any kit
  change that alters vertex count/order for an existing archetype/part MUST
  bump its `meshVersion` (loud sculpt-delta refusal is the designed
  behavior).
- `ProcBodyData` (channels + meta + UV_ATLAS) is plan 015's rasterization
  substrate and plan 016's garment-fit substrate — its shape is now a
  cross-plan contract; extend, don't rename.
- Plan 014 re-poses the skeleton and re-parameterizes bodies per stance —
  keep builders skeleton-driven (derive positions from `BuiltSkeleton`
  joints, as the recipe does), never hardcode upright world-Y assumptions
  in the kit.
- Reviewer scrutiny: silhouette parity screenshots; weld integrity under
  hard shoulder/hip rotation (no tears, no visible interior); the face
  close-up; `build()` memoization (rebuild storms would tank the editor);
  that `assemble.ts`/`dress.ts` are byte-untouched in the diff.
