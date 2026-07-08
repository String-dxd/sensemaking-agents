# Plan 016: Procedural wardrobe — garments generated in TypeScript, refit to natural stances

> **Executor instructions**: This plan runs ONLY after plans 013 AND 014
> have merged (README rows DONE; `src/core/procgen/` exists; archetypes are
> `quad-round`/`quad-slim`/`bird`). If not, STOP. Plan 015 should also have
> landed (garment masks rasterize through its pipeline); if it hasn't,
> STOP and report the ordering problem. Follow steps in order; run every
> verification. Read `advisor-plans/012-procedural-first-architecture.md`
> (D1, D2, D6) first. When done, update your row in
> `advisor-plans/README.md` (Wave 3).
>
> **Drift check (run first)**: find the latest wave-3 merge SHA
> (`git log --oneline -30`, record it), then `git diff --stat <SHA>..HEAD --
> character-studio/src/core/wardrobe character-studio/src/core/procgen
> character-studio/src/studio/viewport/CharacterRoot.tsx
> character-studio/src/studio/roster/companionExport.ts`
> Mismatch with "Current state" excerpts = STOP. Line numbers are as of
> `a8f7c8e1` (pre-wave-3); match by content.

## Status

- **Priority**: P2 (parity-critical, but characters are usable undressed)
- **Effort**: L
- **Risk**: MED-HIGH (garment fit on quadrupeds is unprecedented in this
  repo; weight/morph transfer is the technical crux)
- **Depends on**: 013, 014, 015
- **Category**: migration
- **Planned at**: commit `a8f7c8e1`, 2026-07-07
- **Recommended executor**: Opus 4.8 (precedented garment engineering with
  machine-checkable gates; escalate fit aesthetics via screenshots)

## Why this matters

"Changing clothes" is a core parity feature (plan 012 contract item 3). The
10 wardrobe items are Blender-authored GLBs fitted to the upright biped —
after plan 014 they no longer fit quadruped mammals (a tee authored for a
vertical torso cannot dress a horizontal one). This plan regenerates the
wardrobe procedurally with the plan-013 mesh kit, fitted per stance, and
deletes the last GLBs plus the entire retired Blender lane. After it lands,
the studio ships zero GLB assets — body, parts, clothes, motion, and
textures are all code.

## Current state

### Registry

`src/core/wardrobe/itemRegistry.ts` — zod-validated registry.
`WardrobeItemDefSchema` (lines 74–106): `slot, label, url, maskUrl,
attach('socket'|'skinned'|'mixed'), socket?, earModes?, hideBodyRegions?,
springChains?, paletteSlots, morphs`. Refinements: earModes headwear-only;
socket/mixed must declare a socket; hideBodyRegions only top/bottom/outfit.
Item spring chains are registry DATA over **item-internal bone names**
(scarf ends, drawstrings, straps — `chain()` presets at :146+) that must
NOT be canonical bone names (refine at :70). 10 items: strawhat,
cap-baseball, beanie (headwear, earModes), glasses-square,
sunglasses-round (eyewear), tee-basic, hoodie (top,
`hideBodyRegions: ['torso','hips']`, body-follow morphs), scarf (neck,
springs), backpack-mini (back, straps), mug (handheld).

**There is no `src/core/wardrobe/assets.ts`** — the wardrobe dir is
`dress.ts`, `itemRegistry.ts`, `index.ts`. (A `test/core/wardrobe/
assets.test.ts` exists — it validates the GLB *files* with gltf-transform
and is replaced in this plan.) Item GLBs load in exactly two places:
`CharacterRoot.tsx` (the single `useGLTF(gltfUrls)` call — items are the
tail of the URL list; after 013 they are the ONLY GLB entries left) and
`src/studio/roster/companionExport.ts` (`GLTFLoader.loadAsync(def.url)`,
:57 area — note the path: `src/studio/roster/`).

### Dressing contracts (`src/core/wardrobe/dress.ts` — OUT OF SCOPE, the fixed target your builders must satisfy)

- Lifecycle (header, :12-18): `applyWardrobe` (:175) MUTATES the assembled
  character and returns an `undress()` that restores everything; redress =
  undress → applyWardrobe; the caller rebuilds the spring rig after both.
- `resolveWornItems` (:78) enforces conflict rules (one item per slot,
  last-wins, `outfit` occupies top+bottom, earMode validation).
- **Socket items**: each mesh parents to `mesh.userData.attachBone ??
  def.socket` (:262); meshes tagged `userData.wardrobeItem` (:269).
- **Skinned garments**: rebound onto the LIVE body skeleton **by bone
  name** (:243-257), throwing on unknown bones — garments must be
  `SkinnedMesh`es bound to canonical bones in reference space (same
  convention as anatomy parts, `assemble.ts:235-251`: inverse binds
  pre-scaled by archetype uniformScale at rebind time).
- **Hide regions**: `hideSet` from defs (:319); body submeshes matched via
  `o.userData.bodyRegion` (:323) — values `'torso'|'hips'|'upperLegs'`.
  Plan 013's procedural bodies carry these userData tags.
- **Ear modes**: `under` flattens `earL/R.1` to 15% (`EAR_FLATTEN_SCALE`,
  :50); `through` hats need ear openings in the mesh.
- **Body-follow morphs**: def `morphs` = names (subset of `BODY_MORPHS`)
  of morph targets baked INTO the garment; the dresser applies the spec's
  current body-morph weights to the garment's
  `morphTargetDictionary`/`morphTargetInfluences`. Your builders must emit
  these morph targets (step 2 says how).

### What 013/014/015 landed that this plan consumes (reconcile with their ACTUAL merged shapes before step 1 — the descriptions below are the plan-suite intent)

- 013: `AssetSource` union on body/part defs
  (`{kind:'procedural'; build} | {kind:'glb'; url}`), the `SceneSources`
  restructure in CharacterRoot (keyed, not index-addressed), the mesh kit
  (`kit/loft.ts`, `kit/sphereGrid.ts`, `kit/weights.ts`…), and
  `ProcBodyData` (body surface + analytic weights + meta). **If the landed
  names differ, follow the landed code and note the delta in your report.
  If the source union was never introduced, STOP.**
- 014: `stance` on `ArchetypeDef`; archetype ids `quad-round`/`quad-slim`/
  `bird`; quadruped rest tables.
- 015: `rasterizeChannels` for mask baking (garment masks move onto it) and
  the grain/`resolvesAuthored` composition.

### Known debts to avoid reintroducing (wave-1/2 record)

Hood↔backpack overlap when both worn; drawstrings bury at extreme
bellyRound; mug grazes thigh in profile; scarf tips read stiff at rest.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck && pnpm test` | exit 0 |
| Wardrobe tests | `pnpm test -- test/core/wardrobe` | pass |
| Dev | `pnpm dev` | :5190 |
| Runtime pkg | `pnpm --filter @sensemaking/companion-runtime test` | pass |

## Scope

**In scope**:
- `src/core/procgen/wardrobe/**` (new — garment builders)
- `src/core/wardrobe/itemRegistry.ts` (source union entries, fit params,
  maskUrl → rasterized channels)
- `src/studio/viewport/CharacterRoot.tsx` + `src/studio/roster/
  companionExport.ts` (drop the last GLB loading; after this the item
  loader inner-component from 013 can be deleted entirely)
- `test/core/wardrobe/**` (`assets.test.ts` replaced by builder validation)
- Final sweep (step 4): `src/assets/wardrobe/**`,
  the whole `scripts/blender/` directory, package entries `gen:assets`,
  `gen:clips`, `gen:wardrobe`, and `gen:skeleton-json` +
  `scripts/export-skeleton-json.ts` **iff** nothing outside
  `scripts/blender/` consumes them (`git grep -l "skeleton-json\|skeleton.json" -- src test scripts package.json` first;
  `gen:face-atlas`/`scripts/generate-face-atlas.ts` is tsx-based and STAYS).

**Out of scope**:
- `src/core/wardrobe/dress.ts` — dressing logic is the fixed contract. If a
  garment can't dress through the existing path, fix the garment, not the
  dresser.
- New wardrobe items, new wear slots, `schema.ts` (wardrobe entries are
  registry data, not spec data).
- Body/part builders beyond consuming their surface API (013), clips (014),
  grain library (015).

## Git workflow

Branch `advisor/016-procedural-wardrobe` off post-015 main; per-step
commits `feat(character-studio): <step>`; no push/PR without operator.

## Steps

### Step 1: Garment fit substrate

`src/core/procgen/wardrobe/fit.ts` — garments are generated AGAINST the
body: sample the plan-013 body surface (via `ProcBodyData` or a raycast
sampler over the built body mesh — whichever the landed kit makes cheap) to
derive per-archetype fit data: head band ring (hats), torso girth rings at
garment hems (on a quadruped the top becomes a jacket/saddle wrap around
the horizontal barrel), neck ring (scarf), back anchor patch (backpack),
eye-line width (glasses). Fit params are data on each registry entry, not
hardcoded in builders.

**Weight transfer (the crux, specified)**: for each garment vertex, find
the nearest point on the body mesh surface (BVH or brute-force closest
triangle — garment vertex counts are small) and copy that surface point's
interpolated skin weights (≤4 influences, renormalized). The body's weights
are the kit's analytic weights, so the transfer is smooth by construction.
Garments must be authored in reference space (scale 1) like anatomy parts —
the dresser's rebind applies archetype scaling.

**Body-follow morphs (specified)**: for each morph name the item declares
(subset of `BODY_MORPHS`), re-run the garment fit against the body with
that morph at weight 1.0; the per-vertex position delta (fitted-morphed −
fitted-rest) becomes the garment's morph target of the same name. This is
what keeps a tee tracking bellyRound.

**Verify**: `pnpm test -- test/core/procgen/wardrobeFit.test.ts` → fit
rings sit within ε of the body surface for all archetypes; transferred
weights normalized, ≤4 influences; morph-delta magnitudes within 25% of the
body's own morph displacement in the covered region.

### Step 2: Builders for all 10 items

`src/core/procgen/wardrobe/items/*.ts`, one per item, via
`buildProceduralItem(itemId): THREE.Object3D`, satisfying every dress.ts
contract from Current state:

- Socket items (hats, glasses, backpack, mug): meshes with
  `userData.attachBone` where multi-attach, origin at the socket's rest
  position, reference space. Hats generate per-earMode geometry variants
  (`through` = ear openings; `under` relies on the dresser's ear flatten).
- Skinned garments (tee, hoodie, scarf): `SkinnedMesh` bound to canonical
  bones (weights via step-1 transfer), plus item-internal spring bones with
  EXACTLY the bone names the def's `springChains` reference (hoodie
  drawstrings, scarf ends, backpack straps — graft points per the existing
  defs).
- Body-follow morph targets per def `morphs` (step-1 mechanism).
- Palette-mask channels per vertex (015's rasterizer bakes item masks at
  256²; `paletteSlots` drive the recolor pickers as today).
- Quadruped adaptations are silhouette-level: tee/hoodie = jacket/saddle
  wrap over back + chest, hood resting on the neck; scarf hangs from the
  horizontal neck; backpack rides the back saddle; mug attaches to a front
  paw (acceptable resting near the ground at rest — screenshot it).
  Where cheap, avoid the known debts (hood↔backpack overlap, drawstring
  burial); don't chase them beyond parity.

Triangle budgets: inspect each authored GLB's count BEFORE deletion and
record them in the test as ceilings.

**Verify**: `pnpm test -- test/core/wardrobe` → every item builds and
dresses via unchanged `applyWardrobe` (stub-assembled character, model
after `dress.test.ts`); spring-chain bone names resolve; ear modes produce
distinct geometry; budgets hold; determinism.

### Step 3: Registry + loader swap, live + export parity

Flip all `WARDROBE_REGISTRY` entries to the procedural source (adopting
013's landed union type); route item masks through 015's rasterizer;
remove the item-GLB loading from `CharacterRoot.tsx` (the inner
`useGLTF` component from 013 becomes dead — delete it) and from
`companionExport.ts` (`itemScenes` from builders). Live pass: dress every
item on one quadruped + the bird; wardrobe survives species apply/undo
(wave-2 behavior); Play Mode with scarf + hoodie shows spring motion on
drawstrings/scarf ends; bellyRound at 1.0 with the tee (morph-follow gate);
export a dressed character and load it in the runtime.

**Verify**: `pnpm typecheck && pnpm test` green; companion-runtime tests
green; screenshot set (10 items on quadruped + bird where slot-legal, plus
a dressed-walk webm).

### Step 4: Final sweep — zero-GLB, zero-Blender (gated)

After reviewer/operator approval of step 3 visuals: delete
`src/assets/wardrobe/` (GLBs + textures), the entire `scripts/blender/`
directory, the `gen:assets`/`gen:clips`/`gen:wardrobe` package entries, and
— after the consumer check in Scope — `gen:skeleton-json` +
`scripts/export-skeleton-json.ts`. Remove the `kind:'glb'` branch from the
source union if no def uses it.

**Verify**: `pnpm typecheck && pnpm test` green;
`find src/assets scripts -name "*.glb"` → empty;
`ls scripts/blender 2>/dev/null` → gone; `pnpm dev` → fully functional;
`git grep -n "useGLTF" -- src` → no matches at all (the last consumer was
the item loader; if anything else matches, justify it in your report —
HDRI/environment loading would be legitimate).

## Test plan

- `test/core/procgen/wardrobeFit.test.ts` — fit-ring surface distance,
  weight-transfer validity, morph-delta parity (step 1).
- Rewritten `test/core/wardrobe/assets.test.ts` — registry-driven builder
  validation (attach contract incl. `userData.attachBone`, spring bone
  names, morph names, budgets, determinism), replacing GLB inspection.
- `dress.test.ts` and `itemRegistry.test.ts` stay green with minimal edits
  (only registry-shape churn from the source union; if they need logic
  changes, that's a scope smell — justify in your report).
- Export round-trip: dressed character compile → runtime load → item spring
  chains present (`SEN_companion` data intact).

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0; companion-runtime tests exit 0
- [ ] All 10 items dress on every slot-legal archetype, ear modes and
      hide-regions working (screenshots + dressed-walk webm)
- [ ] Tee tracks bellyRound at weight 1.0 without float/clip (screenshot)
- [ ] `find character-studio/src/assets -name "*.glb"` → NO files (the
      zero-GLB milestone)
- [ ] `ls character-studio/scripts/blender 2>/dev/null` → directory gone;
      `gen:face-atlas` still present and working
- [ ] Dressed export loads in companion-runtime on three 0.149 and 0.185
- [ ] No files outside Scope modified; wave-3 README row updated (and note
      whatever known debts remain un-fixed so they aren't lost with the GLBs)

## STOP conditions

- 013/014 not merged, or 015 not merged (mask pipeline missing).
- 013's landed source-union/`SceneSources`/kit shapes differ from this
  plan's description in a way you can't mechanically reconcile — report the
  delta first. If no source union exists at all, STOP (do not invent one
  here; that contract belongs to 013).
- Weight transfer or morph-delta generation cannot produce a garment that
  survives the dress.ts rebind (unknown-bone throw, or visible detachment
  under pose) after two attempts — this is the likeliest hard failure;
  report with the failing item and evidence.
- An item cannot dress through unchanged `dress.ts` after two fit attempts.
- Item spring chains require canonical bone names or dresser changes.
- A top/outfit on the quadruped torso cannot avoid gross intersection with
  the front legs through fit params alone (may need a hide-region the
  procedural body lacks — coordinate with the 013 builder, don't patch the
  dresser).
- The `gen:skeleton-json` consumer check finds a live consumer outside
  `scripts/blender/`.

## Maintenance notes

- New wardrobe item = one builder + one registry row + rasterized mask —
  document this in the wardrobe module header as the successor to the
  ASSET-CONTRACT wardrobe section.
- Fit params are per archetype: adding an archetype (deferred ostrich)
  means fit rows for all 10 items — budget that in any future species wave.
- The weight-transfer sampler is reusable for any future "conforming
  attachment" (armor, saddlebags) — keep it in `fit.ts`, not inside an item
  builder.
- Restate whatever wave-1 debts remain (hood↔backpack, drawstring burial,
  mug graze, scarf stiffness) in the README notes so they survive the GLB
  deletion.
- Reviewer scrutiny: quadruped top silhouette (highest "looks wrong" risk);
  ear-mode hat openings on the new head positions; `dress.ts` byte-untouched
  in the diff; the final sweep not deleting `gen:face-atlas` or anything
  face-related.
