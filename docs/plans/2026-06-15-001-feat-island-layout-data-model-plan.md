---
title: Island Layout Data Model — data-driven authored placement (uuid ids, working-copy slice)
type: feat
status: proposed
date: 2026-06-15
revised: 2026-06-15 (post design-review)
written_against_commit: 22856862
part_of: 2026-06-15-000-feat-island-editor-engine-overview.md
plan_index: 001
---

# Island Layout Data Model — data-driven authored placement

## Overview

Make the island's hard-coded authored placement (`Tree.PLACEMENTS`, `Fruits.BUSH_PLACEMENTS`, the
seeded flower set, `Mailbox`/`Telescope` coords) into a typed, serializable **`IslandLayout`** owned
by a state slice. A **default layout** derived 1:1 from today's constants makes booting from it a
**visual no-op**. Each view kind then reads its base placements from the slice. The slice carries a
full CRUD API + events + a **working-copy-over-committed-base persistence model** (localStorage
working copy, a "diverged from default" flag, and `revertToDefault()`) so the later editor plans
have a real model to drive and a dev's in-progress edits survive reload.

**Ships no editor UI and no runtime add/remove of meshes** — foundation only. Keystone for 002–005.

> Read `…-000-…-overview.md` first. Locked decisions this plan honors: **statics-only** scope;
> **stable uuid ids** (not `kind:index`); **working-copy + committed-base** persistence.

---

## Preconditions / drift check (DO FIRST)

1. `git rev-parse --short HEAD` — if not `22856862`, re-verify the anchors.
2. Confirm anchors: `Tree.js` `PLACEMENTS:66` + `_placeAll:415` (pushes `entries` with `index`,
   `authoredScale`); `Fruits.js` `BUSH_PLACEMENTS:36` + `_placeBushes:92`; `Flowers.js` `seed=1337:359`,
   `_buildOne:378` (flower 0 pinned `-1.4,1.0`; `i>0` polar via `hash(seed,…)`), `INSTANCES=18`;
   `Mailbox.js:49`; `Telescope.js:27`; `View/Sprouts.js:618-681` (applies `getDecorOffset(kind,i)` by
   **index**); `Persistence.js` `KEY:33`/`SLICES:47`/`load.empty:234`; `State.js:79-125`; `schema.js`
   `coercePosition:471`/`mergeSprout:482`/`mergeArray:520`; `Game.dispose:310-359`.
3. **STOP and report** if: a view already reads placement from a slice; `Tree._placeAll` also renders
   grown/bloomed trees (not just the 7 statics); or a `Game/State/IslandLayout.js` /
   `Game/Data/islandLayout*` already exists.

---

## Requirements Trace

- **R1.** Typed serializable `IslandLayout` `{ v, objects: PlacedObject[] }` and `PlacedObject`
  `{ id, kind, species?, x, z, yaw?, scale?, locked? }`. `id` is a **stable uuid string** assigned
  once and never recomputed from position. `y` is never stored.
- **R2.** `defaultIslandLayout()` reproduces the current island **exactly** (objects, species,
  positions, scales, yaws). Default objects carry **frozen, deterministic** ids.
- **R3.** A singleton `IslandLayout` slice owns the live layout with `list`, `listByKind`, `get`,
  `addObject`, `removeObject`, `updateObject(id,patch)`, `moveObject(id,{x,z})`, `setLayout`,
  `resetToDefault`/`revertToDefault`, `isDiverged()`, `subscribe`, `hydrate`, `serialize` — following
  the `Sprouts.js` idiom (caches, `_invalidateCache`, `_fan`, `_persist`).
- **R4.** Mutations fan typed events (`objectAdded|objectRemoved|objectUpdated|layoutReplaced`),
  try/catch-wrapped.
- **R5. Persistence model:** **base** = `defaultIslandLayout()` (plan 004 later swaps this to read the
  committed `defaultIslandLayout.json`); a **working copy** persists to localStorage; on hydrate the
  live layout = working copy if present else base; `isDiverged()` = working copy differs from base;
  `revertToDefault()` clears the working copy → live = base.
- **R6.** All five kinds read their **base** placements from the slice instead of the constant,
  preserving object **order** (so the index-keyed `decorOffsets` override at `View/Sprouts.js:618`
  still aligns at boot).
- **R7.** The shipped pick-and-plant override layer is **unchanged** and still applies on top.
- **R8.** New slice/singleton participates in `Game.dispose()`; no leaked listeners.
- **R9.** `IslandLayout.d.ts` (+ `index.d.ts` if it enumerates slices) types the surface, mirroring
  `Sprouts.d.ts`.
- **R10.** Unit tests: model + default parity, slice CRUD/events, serialize round-trip, working-copy
  hydrate + divergence + revert. `pnpm check` + `pnpm test` pass.

---

## Scope Boundaries

**In:** data model, default builder, slice (CRUD + working-copy/divergence/revert), persistence
wiring, const→slice base swap (all 5 kinds), types, tests.
**Not in:** any editor UI; runtime add/remove that spawns/despawns meshes (002/003 — the slice fans
events but views read **once at build** here); any change to pick-and-plant/`decorOffsets`/Sprouts;
grown/bloomed objects; species colors (plan 005); server persistence / committed file (plan 004);
terrain; `SCHEMA_VERSION` bump (additive slice is backward-compatible).

---

## Key Technical Decisions

1. **`PlacedObject`** as in R1. `y` derived from `island.heightAt(x,z)` always. `yaw`/`scale` default
   `0`/`1`; `locked` defaults `false` (semantics consumed later).
2. **Stable uuid ids, frozen at authoring.** Default objects get **deterministic** ids in
   `defaultIslandLayout()` — e.g. `tree-0`…`tree-6`, `flower-0`…`flower-17`, `fruit-0`…, `mailbox-0`,
   `telescope-0`. These are *labels assigned once*, not recomputed from live array index — so they
   survive add/remove/reorder. Editor-added objects (002/003) get fresh `crypto.randomUUID()` (or the
   `uuid()` helper `Sprouts.js` already imports). Plan 004 freezes the default ids into the committed
   JSON. (This replaces the first draft's live `kind:index` identity.)
3. **Default reproduces constants, incl. flowers.** Export the flower base-placement formula from
   `Flowers.js` (`FLOWER_SEED=1337`) and consume it from both `_buildOne` and the default builder —
   one source of truth. Trees/fruits/mailbox/telescope bake their explicit coords.
4. **Reuse `coercePosition` + lenient-merge convention** (`mergePlacedObject`/`mergeIslandLayout`).
5. **Working-copy persistence (locked decision C).** The slice persists a working copy to
   localStorage (so a dev's edits survive reload) over a base default, with `isDiverged()` + revert.
   Base = `defaultIslandLayout()` here; plan 004 repoints base at the committed file.
6. **Views read the layout once at build** (mirrors where they read the const). Live reconcile = 003.
7. **Order preserved** so the index-keyed `decorOffsets` still aligns at boot; plan 004 re-keys
   `decorOffsets` to uuid (then order no longer matters).

---

## Implementation Units

### U1 — Data model + default builder (uuid ids)
**Files:** create `Game/Data/islandLayout.js` (+ `.d.ts`); modify `View/Flowers.js` (export formula);
export `PLACEMENTS`/`BUSH_PLACEMENTS` from `Tree.js`/`Fruits.js` (or re-declare locally — escape hatch
below).
**Approach:** export `flowerBasePlacement(i)` from `Flowers.js` (`FLOWER_SEED=1337`, the `i===0` pin +
the `hash`-based polar formula — bit-identical to the current inline math) and call it from
`_buildOne`. `defaultIslandLayout()` builds `{ v:1, objects }`: trees from `PLACEMENTS` (`id:
\`tree-${i}\``), fruits from `BUSH_PLACEMENTS` (`fruit-${i}`), 18 flowers from `flowerBasePlacement`
(`flower-${i}`), `mailbox-0` (`-0.6,2.5`, `locked:true`), `telescope-0` (`cos1.30·4.85, sin1.30·4.85`,
`locked:true`). 31 objects. JSDoc typedefs + `islandLayout.d.ts`.
**Escape hatch:** if exporting the consts creates an import cycle, re-declare them in `islandLayout.js`
+ a test asserting equality with the view-module values.
**Done:** `defaultIslandLayout().objects.length === 31`; U7 parity passes.

### U2 — Schema mergers
**Files:** `State/schema.js`.
**Approach:** add `mergePlacedObject` (known-keys `id,kind,species,x,z,yaw,scale,locked`; `kind` in the
5-set; `x/z/yaw/scale` finite; `locked` bool; `id`+`kind` required else reject) and
`mergeIslandLayout(raw)` (`{ v, objects: mergeArray(raw.objects, mergePlacedObject) }`, `null` if no
`objects[]`). Mirror `mergeSprout` exactly.

### U3 — `IslandLayout` slice (working-copy model)
**Files:** create `Game/State/IslandLayout.js` (+ `.d.ts`).
**Approach (mirror `Sprouts.js`):** singleton; `this._base = defaultIslandLayout()`,
`this.objects = clone(this._base.objects)`. Frozen-snapshot caches for `list`/`listByKind`/`get`.
Mutations validate → mutate → `_invalidateCache` → `_fan(event)` → `_persist()`:
`addObject` (merge; assign `\`${kind}-${uuid()}\`` if no id; reject dup id; `objectAdded`),
`removeObject(id)` (`objectRemoved`), `updateObject(id,patch)` (never change `id`/`kind`;
`objectUpdated`), `moveObject(id,{x,z})` (via `coercePosition`), `setLayout(layout)`
(`mergeIslandLayout`; `layoutReplaced`), `revertToDefault()` (objects ← base; clear working copy;
`layoutReplaced`). `isDiverged()` = objects deep-differ from `_base.objects`. `subscribe`/`_fan` =
copy `Sprouts.js`. `hydrate(snapshot)` = if a valid non-empty working copy → `objects ← it`, else keep
base. `serialize()` = `{ v:1, objects }`. `_persist()` = `Persistence.getInstance().save('islandLayout',
this.serialize())`.

### U4 — Persistence + State + dispose + types
**Files:** `Persistence.js` (add `islandLayout` to `KEY`, `SLICES`, and `empty` in `load()`);
`State.js` (`import IslandLayout`; construct `this.islandLayout = new IslandLayout()` near `this.island`;
`this.islandLayout.hydrate(snapshot.islandLayout)` in the hydrate block); `Game.js` dispose (null the
singleton the same way siblings are nulled); create `IslandLayout.d.ts` (mirror `Sprouts.d.ts`: export
`PlacedObject`, `IslandLayout`, the event union, the typed class); add to `index.d.ts` if it lists slices.
**Escape hatch:** match the existing `Game.dispose` mechanism exactly; if unrecognized, STOP & report.

### U5 — Trees render base from slice (proof)
**Files:** `Tree.js`. Replace `for(const placement of PLACEMENTS)` in `_placeAll` with
`for(const placement of this.state.islandLayout.listByKind('tree'))` (each has `{id,species,x,z,yaw,
scale}`; existing destructure unchanged). Keep `PLACEMENTS` exported as the default seed. Replace
`PLACEMENTS.length` (`:565`) with the slice count / `this.entries.length`. Carry the layout `id` onto
each `entry` (for 002/004). **Verify** the 7 trees render identically and pick-and-plant survives a
reload. **Escape hatch:** if `_placeAll` runs before State exists, or leaf-InstancedMesh bookkeeping
breaks, STOP & report.

### U6 — Remaining kinds render base from slice
**Files:** `Fruits.js`, `Flowers.js`, `Mailbox.js`, `Telescope.js`. Same swap, preserve order/index,
carry the layout `id` onto each record. Flowers: build from `listByKind('flower')` using each object's
`x/z/yaw/species` (identical to baked seed). Mailbox/Telescope: read `get('mailbox-0')`/`get('telescope-0')`
(fallback to const). **Escape hatch:** if `Flowers._buildOne` can't take external coords cleanly, defer
Flowers (trees+fruits prove the pattern) and report.

### U7 — Tests + gates
**Files:** `test/engine/IslandLayout.test.ts`, `test/engine/islandLayout.defaults.test.ts`.
**Scenarios:** default parity (31 objects; per-kind counts 7/4/18/1/1; `tree-i` deep-equals
`PLACEMENTS[i]`; `flower-i` equals `flowerBasePlacement(i)`; `mailbox-0`/`telescope-0` coords); schema
merges (U2 cases); CRUD + events; ids stay stable across remove (removing `tree-2` does not renumber
`tree-3`); serialize round-trip; **working-copy hydrate** (mutate → `serialize` → fresh `hydrate`
restores it via a `memoryAdapter`); **divergence** (`isDiverged()` true after a mutation, false after
`revertToDefault()`); dispose nulls the singleton.
**Verify:**
```bash
pnpm test test/engine/IslandLayout.test.ts test/engine/islandLayout.defaults.test.ts
pnpm test     # full suite; Sprouts.pickPlant.test.ts + IslandSnapshotBridge.test.ts MUST stay green
pnpm check
```
Patterns: `test/engine/Sprouts.test.ts`, `Sprouts.pickPlant.test.ts`.

---

## System-Wide Impact

- **Pick-and-plant:** unchanged; index-keyed offsets still align at boot (order preserved). Plan 004
  re-keys them to uuid (then order-independent). Until then, do not reorder default objects in a way
  that ships.
- **`IslandSnapshotBridge`/`vips_island_snapshots`:** unchanged (serializes `Sprouts`, not the layout).
- **`SCHEMA_VERSION`:** unchanged; old snapshots lack `islandLayout` → slice uses base default.
- **Perf/render:** identical mesh construction; only the *source* of the placement array changes.

## Risks

| Risk | Mitigation |
|---|---|
| Flower formula drift | one exported `flowerBasePlacement`; U7 per-index parity |
| Import cycle | U1 escape hatch (local re-declare + parity test) |
| Slice built after a view's `_placeAll` | State builds before View; U5 escape hatch |
| Dispose teardown misunderstood | U4 escape hatch; U7 asserts clean re-construct |
| Flowers `_buildOne` too entangled | U6 escape hatch (defer Flowers) |

## Done Criteria
1. `pnpm check` + `pnpm test` exit 0; new tests green; `Sprouts.pickPlant`/`IslandSnapshotBridge` green.
2. `defaultIslandLayout().objects.length === 31` with uuid-style frozen ids.
3. `pnpm dev` on `/` is visually identical to `main`; pick-and-plant survives reload per kind.
4. A slice mutation persists to localStorage and `isDiverged()`/`revertToDefault()` behave.

## Sources
Overview `…-000-…`. Consts: `Tree.js:66/415/565`, `Fruits.js:36/92`, `Flowers.js:359/378`,
`Mailbox.js:49`, `Telescope.js:27`. Override (untouched): `View/Sprouts.js:618-681`. Slice idiom:
`State/Sprouts.js` (`setDecorOffset:263`, `serialize:490`, `hydrate:424`). Schema: `schema.js:471/482/520`.
Persistence: `Persistence.js:33/47/234`. State: `State.js:79-125`; dispose `Game.js:310-359`. Bounds:
`State/Island.js`. Types: `Sprouts.d.ts`. Tests: `test/engine/Sprouts*.test.ts`.
