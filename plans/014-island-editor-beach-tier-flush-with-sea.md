# Plan 014: Lower the island-editor beach tier so the shoreline sits nearly flush with the sea

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat c78ba00..HEAD -- island-editor/src/terrain/terrainGrid.ts island-editor/src/terrain/legacy/specV2.ts island-editor/src/editor/specIO.ts island-editor/src/scene/materials/IslandGroundMaterial.ts island-editor/src/terrain/gridOps.ts island-editor/test/specIO.test.ts island-editor/test/gridOps.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of the Character Studio suite, plans 000–013)
- **Category**: bug (visual)
- **Planned at**: commit `c78ba00`, 2026-07-12

## Why this matters

In the standalone island editor (`island-editor/`, `pnpm dev:editor`, port 5180),
the beach tier's flat top sits at world Y = 0.12 while the sea plane sits at
Y = 0. On a 24-unit world that 0.12 freeboard reads as a raised sand plate with
a visible brown cliff lip all around the shoreline, instead of a beach that
meets the water. The maintainer wants the shore to sit nearly flush with the
ocean. The fix is a tuning change to one constant, plus three guard rails so it
lands correctly: freeze the old value for legacy-file rasterization (so the
seed island's silhouette doesn't shift), migrate saved/imported specs that
still carry the old default heights (so the maintainer's autosaved island
actually picks up the change), and retighten the wet-sand shader band that was
tuned relative to the old freeboard.

## Current state

All paths relative to the repo root. The island editor is an isolated pnpm
workspace under `island-editor/` (own lockfile, three@0.171 + r3f) — see the
repo `CLAUDE.md`. Its checks are NOT covered by root `pnpm check`; the
dedicated gate is `pnpm check:island-editor` (run from the repo root).

Relevant files:

- `island-editor/src/terrain/terrainGrid.ts` — pure headless terrain core; owns
  the constant to change.
- `island-editor/src/terrain/legacy/specV2.ts` — legacy v1/v2 spec rasterizer;
  its `nearestTier` currently reads the tunable constant (must be frozen).
- `island-editor/src/editor/specIO.ts` — spec validation/migration
  (`validateSpecObject`); where the saved-spec migration goes.
- `island-editor/src/scene/materials/IslandGroundMaterial.ts` — ground shader;
  wet-sand band keyed to sea level.
- `island-editor/src/terrain/gridOps.ts` — comment references the old array.
- `island-editor/test/specIO.test.ts`, `island-editor/test/gridOps.test.ts` —
  tests to extend / whose comments to touch up.

### The constant (island-editor/src/terrain/terrainGrid.ts:44-46)

```ts
/** Default tier tops. Tier 2 = 1.0 matches the engine's plateauTopY (see the
 *  v2 seed comment). Seafloor matches v2 seafloorDepth. */
export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]
```

Tier 0 (-1.2) is the seafloor; tier 1 (0.12) is the beach; sea level is 0
(`island-editor/src/terrain/seed.ts:13`). The sea plane is rendered at
`spec.seaLevel` (`island-editor/src/scene/SeaSurface.tsx:58`).

### Why the new value must stay above ~0.035 (island-editor/src/scene/materials/SeaMaterial.ts:73-76)

The sea vertex shader bobs the plane vertically:

```glsl
  // Tiny fresh 2-sine ripple — gentle open-water motion, nothing ported.
  wp.y += sin(wp.x * 0.9 + uTime * 0.7) * 0.015 + sin(wp.z * 1.3 - uTime * 0.5) * 0.012;
```

Peak crest = 0.015 + 0.012 = **0.027** above sea level. If the beach top is at
or below that, water intermittently clips through the sand flat. Target value
for this plan: **0.05** (0.023 clearance at crest — water visibly laps near the
lip, which is the desired look). Do not go below 0.035.

### The legacy rasterizer coupling (island-editor/src/terrain/legacy/specV2.ts:338-350)

```ts
/** Index of the DEFAULT_TIER_HEIGHTS entry closest to `height`. */
function nearestTier(height: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i <= MAX_TIER; i++) {
    const d = Math.abs(height - DEFAULT_TIER_HEIGHTS[i])
    ...
```

`rasterizeV2ToGrid` maps the v2 analytic height profile to grid tiers via this
nearest-neighbor lookup. The **seed island** (`island-editor/src/terrain/seed.ts`)
is built by rasterizing the historical v2 silhouette, so if `nearestTier` sees
the new tier-1 value, the tier-0/1 and tier-1/2 midpoint boundaries move and
the default island's coastline/grass line shifts slightly. The v2 profile was
authored against the old heights; freeze them for this mapping.

### The migration point (island-editor/src/editor/specIO.ts:165-183)

`validateSpecObject` handles v3/v4 specs like this (v1/v2 files already get
`DEFAULT_TIER_HEIGHTS.slice()` at line 147, so they need no change):

```ts
  if (!validateTierHeights(o.tierHeights)) {
    throw new Error(
      `Invalid island spec: tierHeights must be a strictly-ascending finite array of length ${MAX_TIER + 1}`,
    )
  }
  ...
  return {
    version: CURRENT_SPEC_VERSION,
    worldSize: o.worldSize,
    seaLevel: o.seaLevel,
    tierHeights: (o.tierHeights as number[]).slice(),
    grid,
    objects,
  }
```

Saved islands (localStorage autosave via `island-editor/src/editor/persistence.ts`,
and exported `.json` files) carry their own `tierHeights` array. Without a
migration here, changing the default would only affect brand-new islands — the
maintainer's current autosaved island would keep the 0.12 lip forever. The repo
already has a precedent for silent load-time migration:
`LEGACY_OBJECT_KINDS` in `terrainGrid.ts:241-249` ("an island saved yesterday
must still open"). Follow that precedent: migrate ONLY when the saved array
exactly equals the old default — custom-authored tier heights must pass through
untouched.

### The wet-sand band (island-editor/src/scene/materials/IslandGroundMaterial.ts:120-123)

```glsl
  // Wet-sand darkening where the ground sits near the waterline (keyed to
  // seaLevel, not the app's radial terms).
  float wet = 1.0 - smoothstep(0.0, 0.08, abs(vWorld.y - uSeaLevel));
  sand = mix(sand, sand * vec3(0.72, 0.70, 0.62), wet * 0.45);
```

The band ends at 0.08 — below the old 0.12 freeboard, so the beach's flat top
was fully dry and only the wall rim darkened. With the top at 0.05 the whole
beach flat would land inside the band (~17% darkening everywhere). Tighten the
band end to **0.04** so the flat top (|0.05 − 0| > 0.04) stays dry and the wet
gradient stays a rim effect, preserving the original design intent.

### Downstream consumers that need NO code change (for your confidence, not action)

- `isLandTier` (`island-editor/src/terrain/gridOps.ts:65-68`) checks
  `top > seaLevel`; 0.05 > 0 still holds. Only its doc comment cites the old
  array (see Step 5).
- Placed objects and the hover highlight derive Y from `evaluateHeight` /
  `terraceHeight` at render time — they follow the constant automatically.
- All existing tests reference `DEFAULT_TIER_HEIGHTS` symbolically (asserting
  against the array's values, not literals), so they pass unchanged; only two
  code comments in `test/gridOps.test.ts` mention `0.12` (see Step 5).

### Repo conventions that apply

- Comments in the terrain core explain WHY, often with a "WHY" or dated note —
  see the `LEGACY_OBJECT_KINDS` comment at `terrainGrid.ts:241-244` and the
  `BLUR_MIX` comment. Match that register.
- Commit style (from `git log`): `fix(island-editor): <imperative summary>`.
- The editor's TS is strict; the terrain core has NO three/r3f imports.

## Commands you will need

Run from the **repo root** unless noted.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (only if node_modules missing) | `cd island-editor && pnpm install` | exit 0 |
| Typecheck + tests (the gate) | `pnpm check:island-editor` | exit 0, all tests pass |
| Tests only, watch-free | `cd island-editor && pnpm test` | exit 0 |
| Visual check | `pnpm dev:editor` then open `http://localhost:5180` | beach meets water with a thin lip |

## Scope

**In scope** (the only files you should modify):

- `island-editor/src/terrain/terrainGrid.ts`
- `island-editor/src/terrain/legacy/specV2.ts`
- `island-editor/src/editor/specIO.ts`
- `island-editor/src/scene/materials/IslandGroundMaterial.ts`
- `island-editor/src/terrain/gridOps.ts` (comment only)
- `island-editor/test/specIO.test.ts` (add tests)
- `island-editor/test/gridOps.test.ts` (comments only)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `spec.seaLevel` and the sea plane position — the sea stays at 0; only the
  land moves.
- `island-editor/src/scene/materials/SeaMaterial.ts` — shore foam bands are
  driven by the plan-view shore-distance field, not by height; they need no
  retune. Also protected by a provenance signature guard in
  `island-editor/test/materials.test.ts`.
- `island-editor/src/terrain/seed.ts` — it already reads the constant.
- `DEFAULT_WALL_WIDTH`, `BLUR_MIX`, tier heights other than index 1.
- The product app's engine (`src/engine/student-space/`) — the editor is a
  separate workspace; nothing there consumes these constants.

## Git workflow

- Branch off the current feature branch: `advisor/014-beach-tier-flush` (base:
  `feat/island-editor-v2`).
- One commit is fine: `fix(island-editor): lower beach tier to sit flush with the sea`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Lower the beach tier and freeze the legacy array (`terrainGrid.ts`)

In `island-editor/src/terrain/terrainGrid.ts`, replace lines 44–46 with the new
constant, a WHY note, and a frozen legacy array for migration/rasterization:

```ts
/** Default tier tops. Tier 2 = 1.0 matches the engine's plateauTopY (see the
 *  v2 seed comment). Seafloor matches v2 seafloorDepth. Tier 1 (the beach) was
 *  lowered 0.12 → 0.05 on 2026-07-12 so the shore sits nearly flush with the
 *  sea; the floor is the sea shader's ripple crest (+0.027 — see the vertex
 *  2-sine in SeaMaterial.ts), so keep it above ~0.035 or waves clip the sand. */
export const DEFAULT_TIER_HEIGHTS = [-1.2, 0.05, 1.0, 1.65, 2.3]

/** The default tier tops before the 2026-07-12 beach lowering. Saved/exported
 *  specs that still carry exactly this array migrate to DEFAULT_TIER_HEIGHTS on
 *  load (see validateSpecObject) — an island saved yesterday must still open,
 *  and should pick up the retuned shoreline. Custom-authored heights are never
 *  rewritten. Also keeps legacy v1/v2 rasterization stable (see specV2.ts). */
export const LEGACY_DEFAULT_TIER_HEIGHTS = [-1.2, 0.12, 1.0, 1.65, 2.3]
```

**Verify**: `cd island-editor && pnpm test` → all existing tests still pass
(they assert against the array symbolically).

### Step 2: Pin the legacy rasterizer to the frozen array (`specV2.ts`)

In `island-editor/src/terrain/legacy/specV2.ts`:

1. In the import from `../terrainGrid` (line ~13), replace
   `DEFAULT_TIER_HEIGHTS` with `LEGACY_DEFAULT_TIER_HEIGHTS`. If
   `DEFAULT_TIER_HEIGHTS` is referenced elsewhere in the file besides
   `nearestTier`, STOP (see STOP conditions) — as of `c78ba00` `nearestTier`
   is the only user.
2. In `nearestTier` (lines 338–350), use `LEGACY_DEFAULT_TIER_HEIGHTS[i]` and
   update the doc comment:

```ts
/** Index of the LEGACY_DEFAULT_TIER_HEIGHTS entry closest to `height`. The v2
 *  analytic profile was authored against those heights; pinning the mapping to
 *  them keeps v1/v2 rasterization (and the seed island's silhouette) stable
 *  when DEFAULT_TIER_HEIGHTS is retuned. */
```

**Verify**: `cd island-editor && pnpm test` → all pass (in particular
`terrainGrid.test.ts` and `buildIslandGeometry.test.ts`, which exercise the
seed/rasterized grids, are unchanged).

### Step 3: Migrate saved specs that carry the old default heights (`specIO.ts`)

In `island-editor/src/editor/specIO.ts`:

1. Add `LEGACY_DEFAULT_TIER_HEIGHTS` to the existing import from
   `../terrain/terrainGrid`.
2. In `validateSpecObject`, in the v3/v4 path, after the
   `validateTierHeights` check (line ~169) compute the migrated array, and use
   it in the returned spec instead of `(o.tierHeights as number[]).slice()`:

```ts
  // Specs saved before the 2026-07-12 beach lowering carry the old default
  // heights; rewrite exactly that array to the current defaults so autosaved
  // islands pick up the retuned shoreline. Custom heights pass through as-is.
  const th = o.tierHeights as number[]
  const isLegacyDefault =
    th.length === LEGACY_DEFAULT_TIER_HEIGHTS.length &&
    th.every((v, i) => v === LEGACY_DEFAULT_TIER_HEIGHTS[i])
  const tierHeights = isLegacyDefault ? DEFAULT_TIER_HEIGHTS.slice() : th.slice()
```

…and in the return object: `tierHeights,`.

**Verify**: `cd island-editor && pnpm test` → all pass (new tests for this land
in Step 6).

### Step 4: Tighten the wet-sand band (`IslandGroundMaterial.ts`)

In `island-editor/src/scene/materials/IslandGroundMaterial.ts` line 122, change
the band end `0.08` → `0.04` and extend the comment:

```glsl
  // Wet-sand darkening where the ground sits near the waterline (keyed to
  // seaLevel, not the app's radial terms). Band end must stay below the beach
  // freeboard (tier 1 top − seaLevel, 0.05) so the flat top reads dry and the
  // wet gradient stays a rim effect.
  float wet = 1.0 - smoothstep(0.0, 0.04, abs(vWorld.y - uSeaLevel));
```

**Verify**: `cd island-editor && pnpm test` → all pass. (`materials.test.ts`
guards provenance signatures, not these numbers — if it fails here, STOP.)

### Step 5: Update stale comments

- `island-editor/src/terrain/gridOps.ts:62` — in the `isLandTier` doc comment,
  change `[-1.2, 0.12, 1.0, 1.65, 2.3]` to `[-1.2, 0.05, 1.0, 1.65, 2.3]`.
- `island-editor/test/gridOps.test.ts:128` — comment `// 0.12 > 0` → `// 0.05 > 0`.
- `island-editor/test/gridOps.test.ts:135` — comment `// 0.12 <= 0.5` → `// 0.05 <= 0.5`.

(Values, not just comments, still hold: 0.05 > 0 and 0.05 ≤ 0.5.)

**Verify**: `grep -rn "0\.12" island-editor/src/terrain/ island-editor/test/gridOps.test.ts`
→ the only remaining hit is the `LEGACY_DEFAULT_TIER_HEIGHTS` literal in
`terrainGrid.ts` (plus, unrelated, `wind.ts`/`buildObjectModel.ts` if you grep
wider — leave those; they are unrelated 0.12s in wind/lighting math).

### Step 6: Add migration tests (`test/specIO.test.ts`)

In `island-editor/test/specIO.test.ts`, add a `describe('tierHeights migration', ...)`
block modeled on the file's existing v4 round-trip tests (same helpers/imports;
import `LEGACY_DEFAULT_TIER_HEIGHTS` alongside `DEFAULT_TIER_HEIGHTS`). Build a
minimal valid v4 spec object the way the file's existing tests do (a
`createOceanGrid()` grid, `objects: []`, `worldSize: 24`, `seaLevel: 0`).
Three cases:

1. **Legacy defaults migrate**: a v4 spec whose `tierHeights` is
   `LEGACY_DEFAULT_TIER_HEIGHTS.slice()` → after `validateSpecObject`,
   `spec.tierHeights` equals `DEFAULT_TIER_HEIGHTS` (use `toEqual`).
2. **Custom heights preserved**: `tierHeights: [-1, 0.3, 0.9, 1.4, 2]` →
   returned verbatim (`toEqual` the same array).
3. **Near-miss NOT migrated**: `tierHeights: [-1.2, 0.12, 1.0, 1.65, 2.31]`
   (last entry differs) → returned verbatim, proving the exact-match guard.

**Verify**: `cd island-editor && pnpm test` → all pass, including 3 new tests.

### Step 7: Full gate + visual check

1. From the repo root: `pnpm check:island-editor` → exit 0.
2. `pnpm dev:editor`, open `http://localhost:5180`. Confirm: the beach's flat
   top sits just above the water with the waves lapping near the lip (compare:
   before, a ~0.12-high cliff lip ringed the whole shoreline); no water
   flickering through the sand flat; the beach top is not uniformly darkened
   (wet band is a rim, not a wash). If the editor loads an autosaved island
   from localStorage, it should ALSO show the lowered shore (that's Step 3
   working); a hard-refresh with devtools → Application → Local Storage →
   delete `island-editor:spec:v1` gives you the seed island for comparison.

**Verify**: screenshot or state observed result. This step is observational —
the numbers were derived above; only clipping (water through sand) is a
failure, and it means the value floor was violated somewhere (STOP).

## Test plan

- New: 3 cases in `island-editor/test/specIO.test.ts` (Step 6): legacy-default
  migration, custom-heights passthrough, near-miss non-migration. Model after
  the file's existing v4 validate/round-trip tests.
- Existing suites (`terrainGrid`, `buildIslandGeometry`, `gridOps`, `applyOps`,
  `materials`) must pass unchanged — they reference the constant symbolically.
- Verification: `pnpm check:island-editor` (repo root) → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check:island-editor` exits 0 (typecheck + all tests, incl. 3 new)
- [ ] `grep -n "0.05" island-editor/src/terrain/terrainGrid.ts` shows
      `DEFAULT_TIER_HEIGHTS = [-1.2, 0.05, 1.0, 1.65, 2.3]`
- [ ] `grep -n "LEGACY_DEFAULT_TIER_HEIGHTS" island-editor/src/terrain/legacy/specV2.ts island-editor/src/editor/specIO.ts`
      → at least one hit in each file
- [ ] `grep -n "DEFAULT_TIER_HEIGHTS\[i\]" island-editor/src/terrain/legacy/specV2.ts`
      → no matches (rasterizer reads only the legacy array)
- [ ] `grep -n "smoothstep(0.0, 0.04" island-editor/src/scene/materials/IslandGroundMaterial.ts`
      → one hit (the wet band)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 014 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows in-scope files changed since `c78ba00` and the
  "Current state" excerpts no longer match the live code.
- `DEFAULT_TIER_HEIGHTS` is referenced in `specV2.ts` anywhere other than
  `nearestTier` — the freeze in Step 2 would then be incomplete.
- Any existing test fails after Step 1 or Step 2 — that means a test asserts
  the old literal or the seed silhouette shifted; do not "fix" tests to match.
- `test/materials.test.ts` fails after Step 4 — the provenance signature guard
  is stricter than expected; do not edit that test.
- The visual check shows water clipping through the sand flat — the ripple
  amplitude in `SeaMaterial.ts` has changed since planning; re-derive the floor
  instead of guessing.
- You find the editor persisting specs anywhere other than
  `island-editor/src/editor/persistence.ts` (a second path would dodge the
  Step 3 migration).

## Maintenance notes

- **Tuning knob**: the shoreline look is `DEFAULT_TIER_HEIGHTS[1]` (freeboard)
  plus the wet-band width in `IslandGroundMaterial.ts` — keep band end <
  freeboard, and freeboard > sea ripple crest (currently 0.027). If someone
  later retunes tier 1 again, they must add the then-current array to the
  migration (or generalize `LEGACY_DEFAULT_TIER_HEIGHTS` to a list of legacy
  arrays) — the exact-match migration only knows about `0.12`.
- **If the sea ripple amplitude changes** (`SeaMaterial.ts` vertex shader), the
  0.035 floor derived here changes with it — the comment on
  `DEFAULT_TIER_HEIGHTS` records the coupling.
- **Reviewer focus**: the `every((v, i) => v === ...)` exact-match in Step 3 —
  it must be exact equality (no epsilon), otherwise near-custom heights get
  clobbered; and Step 2, which must leave v1/v2 rasterization byte-identical
  (the seed island silhouette is the canary — geometry tests cover it
  indirectly).
- **Deferred, deliberately**: `seed.ts:14` assigns `DEFAULT_TIER_HEIGHTS`
  without `.slice()` (shared mutable array reference). Pre-existing and
  harmless today (nothing mutates it), but worth a `.slice()` in a future
  hygiene pass. Out of scope here.
