# Plan 017: Island editor — place one animated character, with collision rules and an animation cycler

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c78ba00..HEAD -- island-editor/src island-editor/test`
> Plans 014/015/016 are expected to have landed (016 renames the surface
> constant and bumps the spec to v5 — this plan builds on that). For drift in
> the files this plan excerpts beyond what those plans describe, compare
> against "Current state"; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (skinned-mesh cloning + animation plumbing)
- **Depends on**: plans/015-island-editor-meshy-asset-refresh.md (needs
  `public/models/character.glb`). Execute AFTER
  plans/016-island-editor-grass-paint-replaces-path.md (both edit `App.tsx`
  and `icons.tsx`; 016 also bumps the spec version this plan's tests assume).
- **Category**: direction (feature)
- **Planned at**: commit `c78ba00`, 2026-07-12

## Why this matters

The island editor (isolated pnpm workspace `island-editor/`, dev server
`pnpm dev:editor` → port 5180) gets its first inhabitant: the Sunny Chick
character asset built by plan 015 (`public/models/character.glb` — skinned
mesh, 10 animation clips). The maintainer's requirements:

1. The user can place **at most one** character on the island, through the
   same model-panel placement flow as trees/bushes/rocks.
2. **Collision rules**: the character needs an empty land cell; other objects
   cannot be dropped into the character's cell.
3. The character **animates** (skeletal clips from the GLB), and the user can
   **cycle through the animations from the UI**.

## Current state

Gate: `pnpm check:island-editor` from the repo root (NOT covered by root
`pnpm check`). React + @react-three/fiber + drei on three@0.171. The pure
terrain core (`src/terrain/*.ts`) has NO three imports.

### The character asset contract (from plan 015 — verify it landed)

`island-editor/public/models/character.glb`: skinned mesh `char1` (~8.7k
tris), **source scale** (~1.62 units tall, base at y=0, centered on X/Z —
deliberately NOT normalized: baking scale into a skinned mesh corrupts its
inverse-bind matrices, so the RUNTIME applies the world scale), matte
material, WebP map, meshopt-compressed, and exactly these 10 clips
(guarded by `test/objectGlbs.test.ts`):

`Running`, `Skip_Forward`, `Stand_Talking_Angry`, `Stand_To_Side_Lying`,
`Swim_Forward`, `Talk_Passionately`, `Talk_with_Right_Hand_Open`,
`Wake_Up_and_Look_Up`, `Walking`, `Wave_for_Help_2`.

### Placement flow today (what the character reuses)

- Kinds: `src/terrain/terrainGrid.ts:238-239`
  (`export type ObjectKind = 'tree' | 'bush' | 'rock'`, plus
  `OBJECT_KINDS`); `PlacedObject` = `{ id, kind, c, r, yaw, scale }`
  (terrainGrid.ts:257-269); world transform via `worldPositionOfObject`
  (terrainGrid.ts:273-280) — cell-center X/Z, terrain-top Y.
- Pure ops: `src/terrain/objectOps.ts` — `makePlacedObject(kind, c, r, rand)`
  (id + yaw jitter + `scale = 0.85 + rand() * 0.3`), `addObject`,
  `removeObject`. Immutable style, injected `rand`.
- App wiring: `src/App.tsx` — `placeKind` state arms a kind
  (ModelPanel), `IslandTerrain` reports hover/click in place mode,
  `placeObject` (App.tsx:201-218) validates `isLandCell` then pushes an
  undoable command:

```ts
  const placeObject = useCallback(
    (x: number, z: number) => {
      const kind = placeKindRef.current
      if (!kind) return
      const s = specRef.current
      const { c, r } = worldToCell(s.worldSize, s.grid, x, z)
      if (!isLandCell(s, c, r)) return
      const o = makePlacedObject(kind, c, r, Math.random) // runtime jitter is fine here
      applyObjects(addObject(s.objects, o))
      stack.push({
        label: 'Place object',
        do: () => applyObjects(addObject(specRef.current.objects, o)),
        undo: () => applyObjects(removeObject(specRef.current.objects, o.id)),
      })
      bumpStack()
    },
    [applyObjects, stack, bumpStack],
  )
```

- Rendering: `src/scene/PlacedObjects.tsx` maps `spec.objects` to
  `PlacedObjectMesh` — model from `useObjectModel(o.kind, hashString(o.id))`,
  positioned group with yaw/scale, hover box + **remove on pointer-down in
  place mode** (stopPropagation wins over the terrain's place handler).
- Models: `src/models/useObjectModel.ts` — drei `useGLTF` cache; GLB kinds
  clone the cached scene (`source.clone(true)`), mark
  `userData.sharedAssets = true` (never disposed), shadow-enable all meshes.
  `GLB_MODEL_URLS` maps kinds to `/models/*.glb`; every URL preloads.
  **A plain `.clone(true)` on a skinned scene is broken** — the clone's
  SkinnedMesh still references the ORIGINAL's skeleton bones, so it renders
  at the original's location/pose. Skinned scenes must go through
  `SkeletonUtils.clone` (`three/examples/jsm/utils/SkeletonUtils.js`, named
  export `clone`), which rebinds the cloned skeleton.
- Ghost preview: `src/scene/PlaceGhost.tsx` — `useObjectModel(kind, 1)`,
  translucent material swap, snaps to the hovered cell.
- Palette: `src/ui/ModelPanel.tsx` renders a tile per `OBJECT_KINDS` entry
  from `KIND_META` in `src/ui/icons.tsx:186-190`; panel visuals in
  `src/ui/panel.css`; the shared `IconButton` (icons.tsx:202-239) is the
  house button/tooltip.
- Legacy-kind migration precedent: `LEGACY_OBJECT_KINDS`
  (terrainGrid.ts:241-249) — spec files with retired kinds are rewritten on
  load, not rejected.
- Spec validation: `src/editor/specIO.ts` `validateObjects` checks
  `kind ∈ OBJECT_KINDS`, cell bounds, yaw/scale. After plan 016 the current
  spec version is 5.

### drei animation hook

`useAnimations(clips, ref)` from `@react-three/drei` returns
`{ actions, mixer }`, steps the mixer every frame, and cleans up on unmount.
The `clips` come from `useGLTF(url).animations`. Actions are keyed by clip
name. Standard clip switch: `actions[name]?.reset().fadeIn(0.25).play()` with
`fadeOut(0.25)` on the outgoing one.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck + tests (gate) | `pnpm check:island-editor` (repo root) | exit 0 |
| Tests only | `cd island-editor && pnpm test` | all pass |
| Visual check | `pnpm dev:editor` → http://localhost:5180 | see Step 8 |

## Scope

**In scope** (the only files you may modify/create):

- `island-editor/src/terrain/terrainGrid.ts` (ObjectKind union + OBJECT_KINDS)
- `island-editor/src/terrain/objectOps.ts` (occupancy + single-character helpers)
- `island-editor/src/editor/specIO.ts` (max-1 normalization on load)
- `island-editor/src/models/useObjectModel.ts` (character clone branch)
- `island-editor/src/models/characterAsset.ts` (create: clips/height constants)
- `island-editor/src/scene/CharacterActor.tsx` (create)
- `island-editor/src/scene/PlacedObjects.tsx` (route character kind)
- `island-editor/src/App.tsx` (placement rules, clip state, dock mount)
- `island-editor/src/ui/icons.tsx` (ChickIcon + KIND_META entry)
- `island-editor/src/ui/AnimationDock.tsx` (create) + `src/ui/panel.css`
  (dock positioning class only)
- `island-editor/test/` — `objectOps.test.ts`, `specIO.test.ts` (extend),
  `characterClips.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `scripts/optimize-meshy-glb.mjs`, `public/models/*` — plan 015 owns the
  asset; if it's wrong, STOP, don't rebuild it here.
- `PlacedObject`'s serialized shape — no new spec fields (the selected clip
  is ephemeral UI state, decided; see Maintenance notes), no version bump.
- `src/scene/useCanopyWind.ts`, wind, sea, terrain painting code.
- The existing stacking behavior of trees/bushes/rocks on each other
  (allowed today, stays allowed — only the character introduces occupancy).

## Git workflow

- Branch: `advisor/017-animated-character` off `feat/island-editor-v2`
  (with 015+016 landed).
- Commit style: `feat(island-editor): placeable animated character with clip cycler`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Data model — the `character` kind + pure helpers

1. `src/terrain/terrainGrid.ts`: extend
   `export type ObjectKind = 'tree' | 'bush' | 'rock' | 'character'` and
   append `'character'` to `OBJECT_KINDS`. Add a comment on the kind list:
   character is max-1 per island (enforced in `objectOps`/`specIO`) and
   renders through `CharacterActor`, not the shared `PlacedObjectMesh`.
2. `src/terrain/objectOps.ts` — add pure helpers in the file's immutable
   style (and adjust `makePlacedObject`):
   - In `makePlacedObject`: `const scale = kind === 'character' ? 1 : 0.85 + rand() * 0.3`
     — the character has ONE canonical size (comment why: its world scale is
     the runtime height contract, not decorative jitter).
   - `export function objectAt(objects, c, r): PlacedObject | undefined` —
     first object occupying cell (c, r).
   - `export function findCharacter(objects): PlacedObject | undefined`.
   - `export function withSingleCharacter(objects, o): PlacedObject[]` —
     removes any existing `character` entries, then appends `o` (the
     replace-on-place primitive).
3. `src/editor/specIO.ts` — in `validateObjects`, after the per-entry
   validation, enforce the invariant: keep the FIRST `character` entry, drop
   the rest (normalize, don't throw — match the `LEGACY_OBJECT_KINDS`
   "an island saved yesterday must still open" register). Note this also
   runs on `applyOps`' final in-memory gate.

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 2: Asset-facing constants

Create `src/models/characterAsset.ts` (no three imports):

```ts
// The character asset's runtime contract. CHARACTER_CLIPS mirrors the clips
// baked into public/models/character.glb — test/characterClips.test.ts fails
// if they drift. Order = the UI cycling order (friendly first).
export const CHARACTER_CLIPS = [
  'Walking',
  'Running',
  'Skip_Forward',
  'Wave_for_Help_2',
  'Talk_Passionately',
  'Talk_with_Right_Hand_Open',
  'Stand_Talking_Angry',
  'Wake_Up_and_Look_Up',
  'Stand_To_Side_Lying',
  'Swim_Forward',
] as const
export type CharacterClip = (typeof CHARACTER_CLIPS)[number]
export const DEFAULT_CLIP: CharacterClip = 'Walking'
/** World height of the placed character. The GLB ships at SOURCE scale
 *  (~1.62 — skinned meshes must not be scale-baked); the renderer divides
 *  this by the measured source height. Trees are 1.7 tall — a chick at 0.6
 *  reads as a small companion, not a kaiju. Tuning knob. */
export const CHARACTER_HEIGHT = 0.6
/** Bind-pose height of public/models/character.glb, guarded by
 *  test/objectGlbs.test.ts's "ships at source scale" test (1.5–1.8 band).
 *  AMENDED 2026-07-12: runtime must NOT measure this with Box3 — the asset is
 *  meshopt-quantized AND skinned, so the dequantization correction lives
 *  inside the skin's inverse-bind matrices and raw geometry bounds are in
 *  quantized units (±32767); a naive Box3 yields a near-zero scale. */
export const CHARACTER_SOURCE_HEIGHT = 1.62
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Skinned clone in `useObjectModel` (for the ghost)

In `src/models/useObjectModel.ts`:

1. Add `character: '/models/character.glb'` to `GLB_MODEL_URLS`.
2. Import `{ clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'`
   and `CHARACTER_HEIGHT` from `../models/characterAsset` (adjust path).
3. In the GLB branch, clone skinned scenes correctly and normalize the
   character's scale in a wrapper group (so the GHOST previews at world
   scale — the source is ~1.62 tall):

```ts
      const source = gltfs[GLB_URL_LIST.indexOf(url)].scene
      if (kind === 'character') {
        // SkeletonUtils.clone: a plain .clone(true) leaves the SkinnedMesh
        // bound to the ORIGINAL skeleton — it would render at the cache's
        // pose/position, not the clone's.
        // AMENDED 2026-07-12: scale from CHARACTER_SOURCE_HEIGHT, NOT a Box3
        // measurement (quantized skinned geometry — see characterAsset.ts).
        const inner = cloneSkinned(source) as THREE.Group
        model = new THREE.Group()
        model.add(inner)
        model.scale.setScalar(CHARACTER_HEIGHT / CHARACTER_SOURCE_HEIGHT)
      } else {
        model = source.clone(true) as THREE.Group
        randomizeInstance(model, seed)
      }
      model.userData.sharedAssets = true
```

   (`randomizeInstance` already no-ops for canopy-less models; skipping it
   for the character just makes that explicit.) In the shadow traverse, also
   set `node.frustumCulled = false` when `(node as THREE.SkinnedMesh).isSkinnedMesh`
   — animated verts move outside the static bounds and get culled mid-clip
   otherwise.

**Verify**: `npx tsc --noEmit` → exit 0. Dev-server spot check comes later.

### Step 4: `CharacterActor` — the animated placed character

Create `src/scene/CharacterActor.tsx`. It mirrors `PlacedObjectMesh`'s
group/hover/remove contract (read PlacedObjects.tsx first and match it) and
adds the mixer. Sketch of the load-bearing parts:

```tsx
export function CharacterActor({ spec, object: o, blurred, placeMode, onRemove, clip }: {
  spec: IslandSpec; object: PlacedObject; blurred: Float32Array
  placeMode: boolean; onRemove: (id: string) => void; clip: CharacterClip
}) {
  const model = useObjectModel('character', hashString(o.id)) // scaled wrapper from Step 3
  useEffect(() => () => disposeObjectModel(model), [model])
  const groupRef = useRef<THREE.Group>(null)
  const { animations } = useGLTF('/models/character.glb')
  // Bind clips against the clone under groupRef (names survive SkeletonUtils.clone).
  const { actions } = useAnimations(animations, groupRef)

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().fadeIn(0.25).play()
    return () => { action.fadeOut(0.25) }
  }, [actions, clip])

  const { x, y, z } = worldPositionOfObject(spec, o, blurred)
  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, o.yaw, 0]}
      onPointerDown={...} onPointerOver={...} onPointerOut={...}>  {/* copy PlacedObjectMesh's place-mode remove/hover handlers + hover box */}
      <primitive object={model} />
      {/* AMENDED 2026-07-12 — hover bounds box uses FIXED dims, not Box3
          (quantized skinned clone reads quantized units): size ≈
          [0.61, 0.63, 0.49] (source 1.56×1.62×1.24 × the 0.370 normalization,
          +6% padding like PlacedObjectMesh), center [0, 0.31, 0]; same
          translucent material, raycast={() => null}. */}
    </group>
  )
}
```

In `src/scene/PlacedObjects.tsx`, route the kind:

```tsx
      {spec.objects.map((o) =>
        o.kind === 'character' ? (
          <CharacterActor key={o.id} spec={spec} object={o} blurred={blurred}
            placeMode={placeMode} onRemove={onRemove} clip={clip} />
        ) : (
          <PlacedObjectMesh key={o.id} ... />
        ),
      )}
```

`clip` threads down from App via a new `PlacedObjects` prop.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Placement rules (collision) in App

In `src/App.tsx`'s `placeObject` (excerpted in "Current state"), after the
`isLandCell` check:

```ts
      const objs = s.objects
      if (kind === 'character') {
        // Needs an EMPTY land cell; replaces any existing character (max 1).
        if (objectAt(objs, c, r)) return
        const prev = findCharacter(objs)
        const o = makePlacedObject(kind, c, r, Math.random)
        applyObjects(withSingleCharacter(objs, o))
        stack.push({
          label: 'Place character',
          do: () => applyObjects(withSingleCharacter(specRef.current.objects, o)),
          undo: () =>
            applyObjects(
              prev
                ? withSingleCharacter(removeObject(specRef.current.objects, o.id), prev)
                : removeObject(specRef.current.objects, o.id),
            ),
        })
        bumpStack()
        return
      }
      // Static kinds: never drop INTO the character's cell (visual collision);
      // stacking on each other stays allowed (pre-existing behavior).
      const blocker = objectAt(objs, c, r)
      if (blocker?.kind === 'character') return
```

…then the existing static-kind flow continues unchanged. Also add App-level
clip state and derive presence:

```ts
  const [clip, setClip] = useState<CharacterClip>(DEFAULT_CLIP)
  const hasCharacter = spec.objects.some((o) => o.kind === 'character')
```

Pass `clip` into `<PlacedObjects …>`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: UI — palette tile + animation cycler

1. `src/ui/icons.tsx`: add a filled `ChickIcon` silhouette in the style of
   TreeIcon/RockIcon (`fill="currentColor"`, e.g. a round body + head circle
   + small beak triangle), and `KIND_META` entry
   `character: { label: 'Chick', Icon: ChickIcon }`. ModelPanel picks it up
   automatically from `OBJECT_KINDS`.
2. Create `src/ui/AnimationDock.tsx` — shown only when a character exists.
   Compose from the existing `IconButton` + a text label; style with a new
   `.animation-dock` class in `panel.css` positioned bottom-center ABOVE the
   hotbar (the hotbar's own class shows the fixed-positioning pattern to
   copy). Contents: `‹` button, the current clip name with underscores
   replaced by spaces (e.g. "Wave for Help 2"), `›` button. Cycling wraps
   around `CHARACTER_CLIPS` in both directions.
3. Mount in `App.tsx` next to the other panels:
   `{hasCharacter && <AnimationDock clip={clip} onPrev={…} onNext={…} />}`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 7: Tests

- `test/characterClips.test.ts` (create): read
  `public/models/character.glb` with gltf-transform's NodeIO exactly as
  `test/objectGlbs.test.ts` does (copy its `beforeAll` IO setup), and assert
  the GLB's animation-name set equals `CHARACTER_CLIPS` (sorted compare) —
  the constant is UI truth and must not drift from the asset.
- `test/objectOps.test.ts` (extend, matching its existing style):
  - `makePlacedObject('character', …)` → `scale === 1`; other kinds keep
    jitter range.
  - `objectAt` hit/miss; `findCharacter` present/absent.
  - `withSingleCharacter` on a list with zero and with one existing character
    → exactly one character after, others untouched, order stable.
- `test/specIO.test.ts` (extend): a v5 spec whose `objects` contain TWO
  character entries → validates with exactly one (the first), everything else
  preserved; a spec with one character round-trips unchanged.

**Verify**: `cd island-editor && pnpm test` → all pass, including the new
suites.

### Step 8: Full gate + visual check

1. `pnpm check:island-editor` (repo root) → exit 0.
2. `pnpm dev:editor` → http://localhost:5180:
   - Chick tile in the model panel; arming shows the ghost at chick size
     (~⅓ tree height) snapping to land cells.
   - Click empty land → chick appears, feet on the ground, playing Walking
     in place, casting a shadow. AnimationDock appears; `‹`/`›` cross-fade
     through all 10 clips (names readable, wrap-around works).
   - Click another empty cell while armed → chick MOVES there (replace);
     undo returns it to the previous cell; undo again removes it (dock hides).
   - Try to place the chick on a cell holding a tree → nothing happens; try
     to place a tree on the chick's cell → nothing happens.
   - Place-mode click on the chick removes it. Raise/lower terrain under the
     chick → it rides the new height. Export → import keeps the chick.
   - Reload the page: chick persists (autosave) and resumes DEFAULT_CLIP.

**Verify**: state observations (screenshot/video if available).

## Test plan

Step 7 in full: 1 new asset-contract suite (clip-name drift guard), ~6 new
pure objectOps cases, 2 specIO normalization cases. UI/scene components have
no test harness in this workspace (pure/node Vitest only) — their logic is
deliberately pushed into `objectOps`/`characterAsset`, which is where the
tests bind.

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "'character'" island-editor/src/terrain/terrainGrid.ts` →
      in both the union and `OBJECT_KINDS`
- [ ] `grep -n "SkeletonUtils" island-editor/src/models/useObjectModel.ts` → present
- [ ] `grep -rn "CHARACTER_CLIPS" island-editor/src island-editor/test` →
      constant + dock + test hits
- [ ] New tests from Step 7 exist and pass
- [ ] `git status` — no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `public/models/character.glb` is missing or `test/objectGlbs.test.ts` has
  no character contract (plan 015 not landed as specified).
- Plan 016 has not landed (spec still v4 / `SURFACE_PATH` still exists) —
  this plan's specIO edits assume 016's final shape.
- `useAnimations` typing or the `SkeletonUtils.js` import path fails against
  the workspace's drei/three versions — check
  `island-editor/node_modules/@react-three/drei/core/useAnimations.d.ts`
  first; if genuinely absent, report (do NOT hand-roll a mixer loop without
  flagging it).
- The clone renders distorted, at the origin, or frozen — that is the
  plain-clone-vs-SkeletonUtils failure mode (see Step 3); verify the clone
  path before touching anything else, then report if unresolved.
- Cross-fades stutter or the mixer leaks actions across clip switches after
  a reasonable fix attempt (drei's cleanup should handle it).
- You find yourself adding a field to `PlacedObject` or bumping the spec
  version — out of scope by decision.

## Maintenance notes

- **Selected clip is ephemeral UI state by decision** — a reload resumes
  `DEFAULT_CLIP`. If persistence is wanted later, add an optional
  `clip?: string` to `PlacedObject` (spec-version bump + validation), don't
  bolt it on elsewhere.
- **Collision model is cell-occupancy** (one grid cell), matching the grid
  world. The character does not path-find or wander; Walking/Running play in
  place. If wandering is ever added, the occupancy rules here become the
  walkability predicate's seed.
- A character on a cell later carved to water stands on the seafloor — known,
  accepted (the user can switch to `Swim_Forward` manually; auto-swim was
  deliberately deferred).
- `useObjectModel` preloads every GLB including the ~2–3 MB character on
  first paint; if editor cold-load ever feels heavy, split the preload.
- Reviewer focus: the replace-on-place undo closure (prev vs o — easy to
  invert); `frustumCulled = false` on skinned meshes; the max-1 normalization
  running inside `applyOps`' final gate (agent batches can never sneak in a
  second character).
