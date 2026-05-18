---
date: 2026-05-18
topic: island-progression-engine-substrate
tags: [substrate, engine, state-slice, three-js, react-bridge]
status: shipped
---

# Island progression — engine substrate is the live one

## The trap

The brainstorm for "more captures → more island objects"
(`docs/brainstorms/2026-05-18-island-object-progression-requirements.md`)
referenced files under `src/components/world/*` (`trees.ts`,
`vipsWorldMapping.ts`, `island.ts`, `hotspots.ts`) as the
implementation target. Those files exist and look like the live
3D scene.

They are not. The home route at `src/routes/index.tsx` mounts
`StudentSpaceHost`, which dynamically imports the vendored
**Student Space engine** under `src/engine/student-space/Game/`.
The React/Three layer under `src/components/world/*` is dormant —
no route mounts it. The plan
`docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`
documents this port; the world layer is retained only so the
quarantined tests under `test/world/**` can be deleted alongside
it in a cleanup milestone.

## Rule of thumb

If a brainstorm or plan references `src/components/world/*` as
the implementation target:

1. Verify by reading `src/routes/index.tsx` — what does the home
   route actually mount?
2. If the answer is `StudentSpaceHost`, the live substrate is
   `src/engine/student-space/Game/`. Translate the plan's file
   references accordingly.
3. The two substrates have different primitives:
   - State slices: live engine uses singleton classes under
     `Game/State/*.js` with `subscribe()` patterns (see
     `MoodPins.js`, `Captures.js`). React/Three layer uses
     descriptor-driven scene models (see `vipsWorldMapping.ts`).
   - 3D rendering: live engine uses single `THREE.InstancedMesh`
     per species baked at boot from a `PLACEMENTS` array in
     `Tree.js`. React/Three layer uses per-descriptor non-instanced
     groups in `trees.ts`.
   - Persistence: live engine uses `localStorage` via the
     `ss:v1:*` namespace. React/Three layer reads from Postgres
     via `vips_timeline_entries`.
4. The Connector → verifier pipeline is **not** live on the home
   route. `runAutoConnectorAfterMirror` exists in
   `src/server/auto-connector.handler.server.ts` but is invoked
   only from manual "Run Connector" / scheduled cron paths, NOT
   from `persistMirror`. Any brainstorm claiming "the Connector
   emits per-entry decisions to the world scene" is operating on
   stale architecture.

## The state-slice template

If you need a new singleton state slice on the engine side, mirror
`MoodPins.js` and `Captures.js` exactly:

- Singleton guard: `if (X.instance) return X.instance; X.instance = this`
- Subscribe pattern: `this.subscribers = new Set()`; mutations fan
  to subscribers; subscribers are tolerant of throws (wrap in
  try/catch — see U2 in `Sprouts.js`'s `wireSproutsToCaptures`)
- Persistence: extend `Persistence.js`'s `KEY` literal, `SLICES`
  array, AND `empty` default. Without all three, `load()`
  silently no-ops and `save()` skips
- Dispose: add `X.instance = null` to `Game.dispose()` block
  alongside the other slice nullings. Without this, StrictMode
  double-mount returns a stale singleton attached to a torn-down
  view
- Hydrate must NOT fan to subscribers. Bulk load is not a `spawned`
  / `add` event; firing subscribers on hydrate triggers UI
  cascades on every reload

## React bridge: stable snapshots

If a React overlay subscribes to an engine slice via
`useSyncExternalStore`, the slice's snapshot accessors
(`recent(n)`, `getActive()`) MUST return referentially-stable
references between mutations. The default pattern in MoodPins.js
and Captures.js (`this.entries.slice(-n).reverse()`) returns a new
array each call and trips React's "cached snapshot" warning,
which can infinite-loop or bail out unsafely.

Solution in `Sprouts.js`: cache the most recent `recent(n)` and
`getActive()` results in private fields; invalidate the cache on
every mutation (`add`, `grow`, `bloom`, `hydrate`). See
`_invalidateCache()` in that file.

Subscribe contract for the React side: `subscribe()` returns an
unsubscribe function. In `IslandProgressionOverlay.tsx`, the
subscribe wrapper deletes the snapshot cache + calls
`onStoreChange` so React re-reads on the next render.

## When extending engine InstancedMesh objects

`Tree.js`, `Flowers.js`, `Fruits.js` each build a single
`THREE.InstancedMesh` per species sized to a fixed `PLACEMENTS`
array at boot. There is NO runtime spawn API today.

If you need to spawn runtime instances, three paths:

1. **Pre-allocate spare slots** — extend PLACEMENTS at boot with
   N reserved slots marked hidden. `revealAt(slot, x, z)` moves
   the slot and calls existing `growIn()`. Zero GPU resource
   churn per spawn; capped at boot capacity.
2. **Re-allocate the InstancedMesh** — dispose and rebuild with
   `count + 1`. Real GPU churn per spawn.
3. **Spawn standalone non-instanced meshes** — breaks the
   instancing perf invariant.

The island progression feature (U5) chose a **fourth path**:
spawn the bloomed object as a separate small mesh inside
`Game/View/Sprouts.js` rather than touching `Tree.js`. This
preserves the visual celebration without invasive changes to
the existing instancing architecture. A v2 that wants to spawn
real engine Trees can re-evaluate path 1 with the data
contract (`bloomedTree.placementSeed`, `bloomedTree.treeSpecies`,
`bloomedTree.captureRefs`) already in place.

## Audio

Use `Sound.playOneShot('bloom')` for bloom celebrations — it
already exists (`Game/View/Sound.js`), routes through the
engine's existing `AudioContext` + `_muted` gate, and avoids
the AudioContext collision with `MirrorSession.tsx`'s
MediaRecorder.

Never create a new `AudioContext` in code that runs on the
home route. The port plan flags this collision; the engine's
`Sound.js` is the single owner.
