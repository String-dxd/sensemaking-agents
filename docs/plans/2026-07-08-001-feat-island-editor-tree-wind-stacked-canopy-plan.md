# Plan 2026-07-08-001: Wind sway + stacked-leaf-block canopy for the fruitTree

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 45ad84a3..HEAD -- island-editor/src/models/buildObjectModel.ts island-editor/src/scene/PlacedObjects.tsx island-editor/src/scene/ModelGallery.tsx island-editor/src/scene/PlaceGhost.tsx island-editor/test/buildObjectModel.test.ts`
> Empty output = no drift. If any in-scope file changed since this plan was
> written, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (visual polish, requested)
- **Effort**: M
- **Risk**: MED (touches the deterministic model builder + adds the editor's first per-frame animation)
- **Depends on**: the object-texture work (`2026-07-07-001`), which added the textured `fruitTree`, `leafMat`/`tinted`, `lumpy`, and the `?gallery` route. **Base this work on branch `worktree-agent-af4c6f016f8fe9b6b` (tip `45ad84a3`)**, or on `main` once that branch has merged. All "Current state" excerpts below are from `45ad84a3`.
- **Category**: direction (visual quality)
- **Planned at**: commit `45ad84a3`, 2026-07-08
- **Status**: DONE — executed via `improve execute` on branch
  `worktree-agent-af4c6f016f8fe9b6b` (commit `fff17eb2`, stacked on the textures
  work). **Advisor-reviewed & APPROVED**: typecheck exit 0; 129 tests green (incl.
  the new `canopy`-group test); scope clean (only the 4 in-scope files); no
  `Math.random`/`Date`; determinism + ±1.2 bounds verified (worst |xz|≈0.80 across
  300 seeds). **Visual confirmed** via `?gallery`: fuller stacked-cluster round
  canopy, textured per block; wind sway scoped to fruitTree only (pine/palm/bush/
  rock static across frames), trunks planted, trees sway out of phase. One approved
  deviation: the plan's example gallery-phase formula was 0 for all integer seeds
  (would sway in unison) — executor correctly used `hashString(String(seed))`.
  **Not merged, not pushed** — pending operator merge.

## Why this matters

The apple tree (`fruitTree`) reads as static and its canopy is a sparse
"one core puff + 3–4 bumps" cluster. The requester wants it to (a) **sway in
the wind** and (b) look like a **stack of rounded leaf blocks piled on top of
each other** — the dense, full, layered Animal-Crossing canopy (many small
rounded leaf clusters building one round mass), with the leaf texture on each
block. This plan reshapes the canopy into tiered lumpy leaf clusters and adds a
subtle per-tree wind sway, scoped to the fruitTree only.

## Current state (all paths from repo root; excerpts verified at `45ad84a3`)

### `island-editor/src/models/buildObjectModel.ts`

The **only** model builder. `buildObjectModel(kind, seed): THREE.Group`.
Deterministic: seeded `mulberry32(seed)`; **no `Math.random` / `Date`** (the
seeded PRNG is the only entropy). Material helpers already textured:

```ts
// blob(): a detail-1 icosphere puff
function blob(r: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat)
}
// tinted(): leaf material (carries the leaf texture map) + seeded HSL jitter
function tinted(base: number, rand: Rand, amount = 0.07): THREE.MeshStandardMaterial { … returns leafMat(c) }
// lumpy(): seeded organic vertex displacement (watertight; consumes ONE rand())
function lumpy(geo: THREE.BufferGeometry, rand: Rand, amount: number): void { … }
// addSunTip(): a small lighter lobe on the sun-facing upper side (consumes ONE rand())
function addSunTip(parts, center, r, base, rand): void { … }
```

The **current `fruitTree(rand)`** (lines ~149–201) pushes a flat list of parts:
root flare + 2-segment trunk (`flare`, `lower`, `upper`), then `core = blob(0.5, tinted(LEAF, rand))`
at `coreY = 0.95`, a sun-tip on the core, a loop of `bumpCount = 3 + floor(rand()*2)`
bumps (`blob(0.28..0.36, tinted(LEAF, rand))` around/above the core, each with a
sun-tip), then `appleCount = 3 + floor(rand()*3)` apples (`SphereGeometry(0.055)`,
`soft(APPLE)`). **All foliage is a direct child of the model group today — there is
no canopy sub-group.**

`buildObjectModel` (lines ~396–411) wraps the parts in a group, sets
`group.name = kind`, then **grounds** the model:

```ts
const dy = new THREE.Box3().setFromObject(group).min.y
for (const child of group.children) child.position.y -= dy   // shift CHILDREN, not group.position
```

This grounding shifts each top-level child by the same `dy`. **A canopy
sub-group is one top-level child**, so shifting its `.position.y` moves the whole
crown — the mechanism keeps working. Preserve it.

### The three render consumers (all render `<primitive object={model}>`, no animation today)

- `island-editor/src/scene/PlacedObjects.tsx` — `PlacedObjectMesh` builds
  `model = useMemo(() => buildObjectModel(o.kind, hashString(o.id)), [o.kind, o.id])`
  and renders `<primitive object={model} position rotation scale onPointerDown=…>`.
  Imports `hashString` from `../models/rand`. **No `useFrame`.**
- `island-editor/src/scene/ModelGallery.tsx` — `GalleryModel` builds
  `model = useMemo(() => buildObjectModel(kind, seed), [kind, seed])` and renders
  `<primitive object={model} position>` inside a `<Canvas>`. Reached via
  `http://localhost:5180/?gallery`. **No `useFrame`.**
- `island-editor/src/scene/PlaceGhost.tsx` — builds a translucent model for the
  cursor preview. **Leave static** (a swaying ghost is distracting) — do NOT add
  wind here.

`@react-three/fiber` exposes `useFrame((state) => …)` where
`state.clock.elapsedTime` is seconds since start. Both `PlacedObjects` and
`ModelGallery` already import from `@react-three/fiber`.

### Test contract — `island-editor/test/buildObjectModel.test.ts` (MUST keep passing)

The tests build models and assert: `group.name === kind`; `children.length > 0`;
**determinism** (same seed → identical `children.length`, `children[0].position`,
and **every descendant position** across two builds); varies with seed;
`box.min.y >= -0.05` and `box.max.y > 0.1` (grounded, real height); **footprint
`|x|,|z| < 1.2`**; every material is `MeshStandardMaterial` with `map` either
`null` (node) or a `THREE.Texture`. The determinism tests are why **wind must NOT
live in the builder** (the builder must stay time-free and fully seeded).

`island-editor/` is an **isolated pnpm workspace** (own lockfile, `three@0.171`,
r3f/drei). Run its commands from inside it; it is NOT covered by root `pnpm check`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (fresh worktree) | `cd island-editor && pnpm install` | exit 0 |
| Typecheck + tests | `pnpm check:island-editor` (repo root) | exit 0 |
| Tests only | `cd island-editor && pnpm vitest run` | all pass |
| Dev server | `cd island-editor && pnpm dev` | serves `http://localhost:5180` (add `?gallery` for the model lineup) |

## Scope

**In scope** (the only files you may modify):

- `island-editor/src/models/buildObjectModel.ts` — reshape `fruitTree` only:
  wrap its foliage in a named `canopy` sub-group and rebuild the canopy as
  stacked lumpy leaf clusters. Add at most one small private helper if useful.
- `island-editor/src/scene/PlacedObjects.tsx` — add the wind `useFrame`.
- `island-editor/src/scene/ModelGallery.tsx` — add the wind `useFrame` (so the
  gallery shows the sway).
- `island-editor/test/buildObjectModel.test.ts` — add the canopy-group assertion.

**Out of scope** (do NOT touch):

- The other builders (`pine`, `palm`, `bush`, `rock`), the material helpers
  (`bark`/`leafMat`/`soft`/`stone`/`tinted`/`lumpy`/`addSunTip` — reuse, don't
  rewrite), and the `buildObjectModel` signature + grounding mechanism.
- `PlaceGhost.tsx` (ghost stays static), the terrain, the ground shader, any
  texture PNG, the product app (`src/`), `bird-builder/`.
- Any new npm dependency.

## Git workflow

- Work on top of the textures branch (`worktree-agent-af4c6f016f8fe9b6b` @ `45ad84a3`).
  Commit here (do not push, no PR unless instructed).
- Commit style: `feat(island-editor): <summary>`. One commit for the model
  reshape (+tests), one for the wind animation — or a single coherent commit is
  fine. Do NOT update `plans/README.md`.

## Steps

### Step 1: Wrap fruitTree foliage in a named `canopy` sub-group pivoted at the trunk top

Keep the trunk parts (`flare`, `lower`, `upper`) as **direct** parts (they must
not sway). Create `const canopy = new THREE.Group(); canopy.name = 'canopy'` and
give it a pivot at the trunk top so a later rotation bends the crown over the
trunk: `canopy.position.y = 0.72` (the trunk top is ≈ y 0.67–0.81 today). Add
**all foliage** (leaf lobes, sun-tips, apples) to `canopy` with positions
expressed **relative to the canopy origin** (i.e. subtract `0.72` from the world
Ys the code uses today — e.g. a lobe you want at world y `0.95` goes to canopy-
local y `0.23`). Finally `parts.push(canopy)`.

Do this as a pure refactor first (same lobe/apple layout as today, just re-
parented), so you can confirm the tests still pass before reshaping.

**Verify**: `cd island-editor && pnpm vitest run` → all pass (grounding still
lands base ≈ y 0; determinism holds; footprint unchanged). Exit 0.

### Step 2: Rebuild the canopy as a tiered stack of rounded lumpy leaf blocks

Inside `canopy` (local coords, origin at the trunk-top pivot), replace the
"core + bumps" with **3–4 stacked tiers of rounded leaf clusters** that assemble
into one full, round, dense mass (the requester's stacked-blocks look). For each
lobe: `const g = new THREE.IcosahedronGeometry(r, 1); lumpy(g, rand, 0.12 * r)`
then `new THREE.Mesh(g, tinted(LEAF, rand))` — so every block is lumpy **and
carries the leaf texture** (that is the "apply the texture for each block"
requirement; `tinted` → `leafMat` already maps the leaf texture).

Starting layout (tune fullness in the browser at Step 4; keep the hard bound):

- **Base tier** (widest), local y ≈ `0.20`: 1 center lobe `r ≈ 0.34` + a ring of
  5 lobes at ring-radius ≈ `0.34`, lobe `r ≈ 0.30`.
- **Mid tier**, local y ≈ `0.48`: ring of 5 lobes at ring-radius ≈ `0.28`, lobe
  `r ≈ 0.27`, rotated ~half a step off the base ring so blocks interlock.
- **Upper tier**, local y ≈ `0.74`: ring of 4 lobes at ring-radius ≈ `0.18`, lobe
  `r ≈ 0.23`.
- **Cap**, local y ≈ `0.96`: 1 lobe `r ≈ 0.21`.

Give each lobe a small seeded position/rotation jitter (reuse the existing
pattern: `+ (rand() - 0.5) * small`) and a `rotation.y = rand() * Math.PI` so the
lumpiness varies. Add a **sun-tip** (`addSunTip`) to the cap lobe and 2–3 of the
upper/outer lobes (upper-sun side). Keep the **apples** (relative to canopy
origin now; scatter them across the front/outer surface of the mid+upper tiers).

**Determinism rule**: consume `rand()` in a **fixed order**; never branch the
*number* of `rand()` calls on anything except earlier `rand()` results. Fixed
tier/lobe counts (as above) are simplest and safest.

**Footprint rule (hard)**: the assembled crown must keep `|x|,|z| < 1.2`. With
ring-radius ≤ `0.34` + lobe `r ≤ 0.30` + lumpy displacement, max extent ≈ `0.7` —
well inside. If a tweak pushes it past `1.2`, **shrink the lobe/ring, do not
loosen the test.**

**Verify**: `cd island-editor && pnpm vitest run` → all pass (bounds + determinism).
Then `pnpm check:island-editor` (repo root) → exit 0.

### Step 3: Add the wind sway in the render layer (fruitTree auto-scoped)

Because only `fruitTree` has a `canopy` child, animating
`model.getObjectByName('canopy')` automatically affects **only the apple tree** —
the other kinds return `undefined` and no-op. Do NOT special-case the kind.

In `island-editor/src/scene/PlacedObjects.tsx`, inside `PlacedObjectMesh`:

```ts
import { useFrame, type ThreeEvent } from '@react-three/fiber'
// …
// Per-tree phase so trees don't sway in lockstep. Deterministic from the id.
const phase = useMemo(() => ((hashString(o.id) % 1000) / 1000) * Math.PI * 2, [o.id])
const canopy = useMemo(() => model.getObjectByName('canopy'), [model])
useFrame((state) => {
  if (!canopy) return
  const t = state.clock.elapsedTime
  canopy.rotation.z = Math.sin(t * 1.1 + phase) * 0.05
  canopy.rotation.x = Math.cos(t * 0.9 + phase) * 0.035
})
```

Add the same sway to `ModelGallery.tsx`'s `GalleryModel` (derive `phase` from
`seed` there, e.g. `(seed * 1000 % 1000) / 1000 * Math.PI * 2`), so the gallery
shows motion.

**Reduced motion**: guard the sway with
`const reduce = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])`
and skip the per-frame update when `reduce` is true (leave the canopy at rest).

Amplitudes are small on purpose (a gentle sway, ≈ ±3°). Tune at Step 4.

**Verify**: `cd island-editor && pnpm vitest run` → still all pass (tests don't
render, so `useFrame` is untouched by them). `pnpm check:island-editor` → exit 0.

### Step 4: Visual check (operator-pending if headless)

`cd island-editor && pnpm dev`, open `http://localhost:5180/?gallery`: the
fruitTree column should read as a **full, round, dense canopy built from stacked
rounded leaf clusters** (not the old sparse cluster), each block textured, and
the trees should **sway gently and out of phase** with each other. Then open the
plain editor (`/`), place several apple trees, and confirm they sway, stay
grounded (no floating/sinking), and don't z-fight.

If you are headless and cannot open a browser, say so in NOTES — do NOT fabricate
a visual result. Do the code + test + typecheck verification fully.

### Step 5: Extend the contract test

Add to `island-editor/test/buildObjectModel.test.ts`:

- A test that `buildObjectModel('fruitTree', 7)` contains a child named
  `'canopy'` that is a `THREE.Group` with `children.length > 0`
  (`group.getObjectByName('canopy')`). This locks the render-layer contract (the
  wind hook depends on that name).

Keep every existing test passing unchanged (do not relax bounds/determinism).

**Verify**: `cd island-editor && pnpm vitest run` → all pass incl. the new test.
`pnpm check:island-editor` (repo root) → exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm check:island-editor` (repo root) exits 0.
- [ ] `cd island-editor && pnpm vitest run` exits 0, including the new
      `canopy`-group test; all pre-existing determinism/bounds/material tests
      still pass unchanged.
- [ ] `grep -n "Math.random\|new Date\|Date.now" island-editor/src/models/*.ts`
      → no matches (the builder stays seeded; wind lives only in the r3f layer).
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] Visual (operator-pending if headless): in `?gallery` the fruitTree is a
      full stacked-cluster round canopy, textured per block, swaying out of phase.

## STOP conditions

Stop and report (do not improvise) if:

- Any existing test fails and the only way to pass it is to loosen a bound or
  change the `buildObjectModel` signature.
- The reshaped canopy cannot stay within `|x|,|z| < 1.2` without looking sparse —
  report the tension rather than loosening the test.
- Grounding breaks (base drifts off y≈0) — likely the canopy pivot/relative-Y
  math is off; STOP rather than tuning blindly.
- Adding `useFrame` requires touching the builder's determinism (it must not) —
  STOP; wind belongs only in the render components.
- The "Current state" excerpts don't match the live code (drift).

## Maintenance notes

- **Contract**: `fruitTree` now returns a group containing a child named
  `'canopy'`; the wind hook in `PlacedObjects`/`ModelGallery` finds it by name.
  If you rename it or wrap other kinds' foliage in a `canopy` group too, wind
  will start affecting them — intended scoping is fruitTree-only.
- Wind is **render-layer only** — the builder stays deterministic (tests build
  twice and compare). Never move the animation into `buildObjectModel`.
- The sway amplitude/speed and the tier fullness are the two visual knobs; both
  are operator-tunable in the browser. `prefers-reduced-motion` freezes the sway.
- Deferred: vertex-shader wind (per-leaf flutter), wind on pine/palm/bush, and a
  global wind-direction control — all out of scope here.
