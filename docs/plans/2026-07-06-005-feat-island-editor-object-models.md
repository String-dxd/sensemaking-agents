---
title: Island editor — procedural object models (trees, bush, rock) + gallery
type: feat
status: done
date: 2026-07-06
written_against_commit: b375cdbb
base_branch: feat/island-editor-distributed-layout (or main once that has merged)
initiative: 2026-07-06-004-feat-island-editor-objects-overview.md
plan: A (of A→B→C)
---

# Plan A: Procedural object model factory + gallery

> **Executor instructions**: Follow step by step; run every verification command and
> confirm the expected result before moving on. Touch only in-scope files. On a STOP
> condition, stop and report. When done, flip `status:` in this frontmatter to `done`.
>
> **Base branch**: `feat/island-editor-distributed-layout` (commit `b375cdbb`), or
> `main` if that branch has merged. This plan is self-contained and does NOT depend on
> the hotbar/camera/panel code — it only adds new files (+ a 1-line gate in main.tsx),
> so it also applies cleanly on plain `main`. Create your branch:
> `git checkout -b feat/island-editor-object-models <base>`.
>
> **Drift check**: `git diff --stat b375cdbb..HEAD -- island-editor/src/main.tsx island-editor/src/terrain/terrainGrid.ts`
> If `terrainGrid.ts` lacks the `ObjectKind` type, this plan ADDS it (see Step 1); that's expected, not drift.

## Status

- **Priority**: P2 (feature foundation, user-requested)
- **Effort**: M
- **Risk**: LOW (all-new files + a 1-line entry gate; no existing behavior touched; models are visual but the factory is unit-testable in the node env)
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `b375cdbb`, 2026-07-06
- **Executed 2026-07-06** on branch `feat/island-editor-object-models` (commit `927b7ff7`, base `feat/island-editor-distributed-layout`/`b375cdbb`). Advisor-reviewed & APPROVED: exactly the 7 in-scope files, no deps; deterministic factory (no `Math.random`/`Date`); grounding shifts children (not `group.position`) so r3f `<primitive position>` callers place cleanly — good foresight for Plan B; gate green (107 tests). **Gallery browser QA PASSED** (on the stack tip): all 5 kinds render distinctly and sit on the ground — round apple tree w/ red fruit, layered pine, leaning palm w/ fronds+coconut, leafy bush, faceted rock (the AC/Pokopia look). Part of the objects stack; merges with the initiative.

## Why this matters

The island editor can terraform terrain but has no objects — no trees, bushes, or rocks
to bring the island to life. This plan builds a **procedural model factory** that
produces stylized low-poly models for five kinds (`fruitTree`, `pine`, `palm`, `bush`,
`rock`) from three.js primitives — the `bird-builder` approach: our own authorship, no
asset/licensing pipeline, parametric variety. It's the visual foundation the placement
system (Plan B) and the palette (Plan C) build on. This plan is mergeable on its own: it
adds the factory + a dev-only gallery to eyeball the models; it does not yet place
anything.

## Current state (verified at `b375cdbb`)

- The editor is an isolated pnpm workspace: three@0.171 + `@react-three/fiber@9` +
  `@react-three/drei@10`. No icon/asset library. Vitest `environment: 'node'`
  (`island-editor/vite.config.ts`), `include: ['test/**/*.test.ts']`.
- **three-object construction works in the node test env** — `test/buildIslandGeometry.test.ts`
  already imports `buildIslandGeometry.ts` (which imports `* as THREE from 'three'`) and
  runs green. So a model factory that builds `THREE.Group`s is unit-testable here
  (no WebGL/renderer needed to construct + inspect geometry).
- `src/terrain/terrainGrid.ts` holds the pure spec model (`IslandSpec` v3, `TerrainGrid`,
  `MAX_TIER`, `cellCenter`, etc.). It has **no** `ObjectKind` type yet.
- Entry: `src/main.tsx` renders `<App/>` into `#root`. `bird-builder/src/rig/` is the
  procedural precedent (`buildBird.ts`, `parts/`, `toon.ts`) — reference for structure,
  not for import (separate package).
- The scene lighting the models will sit under (from `src/scene/Backdrop.tsx`):
  `<color attach="background">`, `<Sky/>`, `<ambientLight intensity=0.6/>`,
  `<directionalLight position={[18,20,10]} intensity=1.15/>`. Models should read well
  under that (a lit toon-ish standard material with `flatShading` gives the low-poly look).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + tests | `pnpm check:island-editor` | exit 0 |
| Dev / gallery | `pnpm dev:editor` then open `http://localhost:5180/?gallery` | renders all 5 models |
| No new deps | `git diff island-editor/package.json` | empty |

## Scope

**In scope** (create unless noted):
- `island-editor/src/terrain/terrainGrid.ts` — ADD only `export type ObjectKind` +
  `export const OBJECT_KINDS` (nothing else in this file changes).
- `island-editor/src/models/rand.ts` (new) — tiny seeded PRNG (pure, framework-free).
- `island-editor/src/models/buildObjectModel.ts` (new) — the factory + per-kind builders.
- `island-editor/src/scene/ModelGallery.tsx` (new) — dev view of all 5 kinds.
- `island-editor/src/main.tsx` — a `?gallery` gate (render `<ModelGallery/>` vs `<App/>`).
- `island-editor/test/rand.test.ts`, `island-editor/test/buildObjectModel.test.ts` (new).

**Out of scope**: `App.tsx`, the spec v-bump / `objects` field (that's Plan B), any
placement, the panel (Plan C), `package.json`.

## Git workflow

- Branch `feat/island-editor-object-models` from the base; commit per step; conventional
  messages (`feat(island-editor): procedural object model factory`). Do NOT push/merge.

## Target design

### `terrainGrid.ts` addition (kinds only)

```ts
export type ObjectKind = 'fruitTree' | 'pine' | 'palm' | 'bush' | 'rock'
export const OBJECT_KINDS: ObjectKind[] = ['fruitTree', 'pine', 'palm', 'bush', 'rock']
```

### `rand.ts` — seeded PRNG (pure)

```ts
/** Deterministic PRNG so a given seed always yields the same model variety
 *  (stable previews + reproducible placement on reload). mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Small stable string→int hash (for deriving a seed from a placed object's id). */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
```

### `buildObjectModel.ts` — the factory

Signature (the contract Plans B + C consume — do not change without updating them):

```ts
import * as THREE from 'three'
import type { ObjectKind } from '../terrain/terrainGrid'
import { mulberry32 } from './rand'

/** Stylized low-poly model for `kind`, centered on X/Z with its base at y=0 and a
 *  ~1-unit footprint (callers scale/position uniformly). Deterministic given `seed`. */
export function buildObjectModel(kind: ObjectKind, seed = 1): THREE.Group { … }
```

Implementation guidance — a shared material helper + per-kind builders using primitives.
Keep it low-poly (low segment counts) and flat-shaded for the toon look. Colors are
starting points; tune in Step 5 QA.

```ts
function toon(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 })
}
const TRUNK = 0x8a5a3b, LEAF_A = 0x5a8f4e, LEAF_DARK = 0x3f6b3a, APPLE = 0xd6483b, ROCK = 0x8a8276
```

- **fruitTree** — trunk `CylinderGeometry(0.09, 0.13, 0.55, 6)` (base at y=0 → position
  y=0.275); 2–3 overlapping `IcosahedronGeometry(r, 0)` canopies (r≈0.42–0.30) stacked
  around y≈0.7–1.0, colored `LEAF_A`; scatter 3–5 small `SphereGeometry(0.05, 6, 5)`
  `APPLE`s on the canopy surface (positions from the seeded rand on the canopy sphere).
  Canopy count + apple count + slight tint vary by seed.
- **pine** — trunk `CylinderGeometry(0.07, 0.1, 0.4, 6)`; 3 stacked `ConeGeometry(r, h, 7)`
  in `LEAF_DARK`, radii ≈ 0.5/0.38/0.26 and centers rising ~0.45/0.75/1.0, each slightly
  rotated by seed for irregularity.
- **palm** — trunk `CylinderGeometry(0.06, 0.09, 1.0, 6)` with a slight lean (rotate the
  trunk group ~0.05–0.12 rad by seed); a crown of 6–8 fronds at the top: each a thin
  flattened `ConeGeometry(0.06, 0.6, 4)` (or a scaled box) splayed radially and drooping
  (rotate outward ~1.0 rad + downward), `LEAF_A`; optional 2 small `SphereGeometry` brown
  coconuts under the crown.
- **bush** — no trunk; 3–4 overlapping `IcosahedronGeometry(0.22–0.32, 0)` low spheres
  clustered near y≈0.2, `LEAF_A` with slight per-lobe tint jitter (the leafy shrub).
- **rock** — 1–2 `IcosahedronGeometry(0.3–0.45, 0)` scaled non-uniformly (e.g.
  `scale(1, 0.7, 1.1)`) and randomly rotated by seed, `ROCK`, sitting with base near y=0.

Every kind: build children into a `THREE.Group`, ensure the lowest point is ≈ y=0
(objects sit ON the terrain, not floating/sunk), and the horizontal extent is ≈ ±0.5
(so a caller can scale to a cell). Set `group.name = kind`.

### `ModelGallery.tsx` — dev view

An r3f `<Canvas>` (reuse the editor's camera/lighting feel: `camera={{ position:[0,2,6],
fov:50 }}`, an `<ambientLight>` + `<directionalLight position={[18,20,10]}/>`, a neutral
`<color attach="background" args={['#bcd7ff']}/>`, `<OrbitControls/>`) that lays out all
`OBJECT_KINDS` in a row on a flat ground plane, each via a small wrapper that adds
`buildObjectModel(kind, seed)` as a `primitive` (`<primitive object={useMemo(() =>
buildObjectModel(kind, seed), [kind, seed])} position={[i*1.5 - offset, 0, 0]} />`).
Optionally render 2–3 seeds per kind (rows) to show variety. Include a tiny caption per
kind (drei `<Text>` or a DOM overlay). Dispose models on unmount.

### `main.tsx` — the `?gallery` gate

```tsx
const showGallery = typeof window !== 'undefined' && window.location.search.includes('gallery')
root.render(<React.StrictMode>{showGallery ? <ModelGallery /> : <App />}</React.StrictMode>)
```
(Match the existing render call's shape — keep StrictMode if present.)

## Steps

### Step 1: kinds + `rand.ts` + tests
Add `ObjectKind`/`OBJECT_KINDS` to `terrainGrid.ts`. Create `rand.ts`. Create
`test/rand.test.ts`: `mulberry32(42)` yields the same sequence on two calls (determinism);
values in [0,1); two different seeds diverge; `hashString` is stable + differs for
different strings.
**Verify**: `pnpm check:island-editor` → exit 0, new tests pass.

### Step 2: `buildObjectModel.ts` + tests
Implement the factory per "Target design". Create `test/buildObjectModel.test.ts`
(construct in the node env — no WebGL):
- Every `OBJECT_KINDS[k]` returns a `THREE.Group` with `> 0` children and
  `group.name === kind`.
- **Determinism**: `buildObjectModel(kind, 7)` and a second call with seed 7 produce the
  same child count (and same first-child position, within 1e-9) — i.e. seed-stable.
- Different seeds produce at least one differing kind's child count OR position (variety).
- **Sits on ground**: the group's `THREE.Box3().setFromObject(group)` has `min.y >= -0.05`
  and `max.y > 0.1` (base near 0, has height).
- Footprint bounded: `|min.x|,|max.x|,|min.z|,|max.z|` each `< 1.2` (roughly ±0.5–1 unit).
**Verify**: `pnpm check:island-editor` → exit 0, all model tests pass.

### Step 3: `ModelGallery.tsx` + `main.tsx` gate
Create the gallery; add the `?gallery` gate to `main.tsx`.
**Verify**: `pnpm check:island-editor` → exit 0. `git diff --stat <base>` shows only the
in-scope files. `git diff island-editor/package.json` empty.

### Step 4: Gallery QA
`pnpm dev:editor` → open `http://localhost:5180/?gallery`. Screenshots if you have a
browser tool; else report NOT RUN.
- [ ] All 5 kinds render, readable and distinct: a round apple-tree, a layered pine, a
      leaning palm with fronds, a leafy bush, a rock.
- [ ] Each sits ON the ground plane (not floating or sunk).
- [ ] Seed variety is visible (if you rendered multiple seeds) — canopies/apples/lean differ.
- [ ] No console errors. The base editor still loads normally at `/` (no `?gallery`).

### Step 5: Tune (if the look is off)
Adjust colors/segment counts/proportions (all in `buildObjectModel.ts`), re-check
Steps 2 + 4 stay green. Keep it low-poly/stylized (this is the AC/Pokopia look, not
realism). Then flip `status`.

## Test plan

- `test/rand.test.ts` (determinism, range, hash stability).
- `test/buildObjectModel.test.ts` (per-kind structure, seed determinism, variety,
  sits-on-ground, bounded footprint) — modeled on `test/buildIslandGeometry.test.ts`
  (which likewise constructs three objects in the node env and inspects them).
- No component test for the gallery (visual; QA'd in Step 4).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0; the two new test files pass.
- [ ] `git diff --name-only <base>` shows ONLY the 7 in-scope files.
- [ ] `git diff island-editor/package.json` empty.
- [ ] `buildObjectModel` matches the overview's contract signature
      (`(kind: ObjectKind, seed?: number) => THREE.Group`).
- [ ] Step 4 gallery QA reported (run or NOT RUN); base editor at `/` unaffected.
- [ ] Frontmatter `status` updated.

## STOP conditions

- three-object construction fails in the vitest node env (unexpected — `buildIslandGeometry.test.ts`
  proves it works; if it doesn't, report rather than adding jsdom/WebGL mocks).
- A model can't be made to read as its kind with primitives after reasonable tuning
  (report with a screenshot; do NOT reach for a GLB asset — procedural was the chosen path).
- Any need for a new dependency or to touch out-of-scope files.

## Maintenance notes

- **The factory API is a contract** consumed by Plan B (places `buildObjectModel(kind,
  hashString(id))`) and Plan C (palette previews). If you change the signature, update
  the overview + both later plans.
- **Seed determinism matters**: placed objects store only `id` (Plan B); the model
  variety is re-derived via `hashString(id)` on every load, so it must be stable — keep
  `buildObjectModel` free of `Math.random`/`Date`.
- The `?gallery` gate is a dev affordance; it can stay (harmless) or be removed once the
  palette (Plan C) provides previews.
- GLB upgrade lane (deferred): a future `buildObjectModel` could dispatch to a loaded GLB
  per kind while keeping the same signature — the seam is the factory function.
