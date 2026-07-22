# Plan 030: Engine island close-up quality — full-res retina rendering + finer terrain tessellation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Report in the STATUS/STEPS/FILES CHANGED/NOTES
> format; skip `plans/README.md` (the reviewer maintains the index).
>
> **Drift check (run first)** — `<BASE>` = the commit named in your dispatch:
> `git diff --stat <BASE>..HEAD -- src/engine/student-space/Game/State/Performance.js src/engine/student-space/Game/View/islandGeometry.ts test/engine/performance-quality.test.ts test/engine/islandGeometry.test.ts`
> Must be empty; on a mismatch, compare the "Current state" excerpts against
> the live code — any difference is a STOP.

## Status

- **Priority**: P1 (maintainer feedback with screenshot)
- **Effort**: S
- **Risk**: LOW-MED (one heuristic branch + one constant; the tessellation
  bump is a 4× vertex-count increase on a mesh built once per boot)
- **Depends on**: none
- **Category**: direction (visual quality)
- **Planned at**: commit `6a01395`, 2026-07-22

## Why this matters

Maintainer report (with screenshot of the product app at close camera zoom):
the island reads **"pixelated and blocky"** — terrace/cliff edges show a fine
sawtooth of teeth, the sand-to-water silhouette shows hard stair-steps, and
the whole frame looks slightly soft/upscaled.

The island-editor already fixed the field-level sawtooth (plan 028's C1
smooth-bilinear sampler), and that fix **was** ported to the engine — verified
at `6a01395`: `src/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts:183-184`
has the smoothstepped fractions, and `Game/View/Materials/IslandGroundMaterial.ts:169`
has the `uBeachTop` gate. The remaining blockiness in the APP has two
different, verified causes:

1. **Every retina Mac renders the app at 1.5× DPR upscaled to 2×.**
   `selectInitialPerformanceTier` (`Performance.js:84`) classifies
   `dpr >= 2` as tier `medium` regardless of how powerful the machine is
   (an M-series Mac with 8+ cores and `deviceMemory` 8 still lands here
   because the check is an OR). Tier `medium` caps DPR at 1.5
   (`QUALITY_SETTINGS.medium.dprCap`), so the canvas is upscaled — literal
   pixelation. Worse, the runtime promote path can never rescue a 60 Hz
   display: promotion medium→high requires smoothed frame time
   < `FAST_FRAME_MS.medium` = 15.8 ms, but a vsynced 60 Hz frame is ~16.7 ms —
   so even an idle M3 Max stays at medium forever.
2. **Terrain tessellation is too coarse for the app's camera.** The mesh
   samples the (now-smooth) tier field at `SEGMENTS = 256` over a 24-unit
   world → vertex spacing ~0.094 units, 4 segments per grid cell
   (`islandGeometry.ts:31`). At the editor's framing distance that's fine; at
   the app's close-up zoom one vertex step spans ~25–30 screen px, so the
   smooth iso-contours polygonize into visible teeth on terrace lips and hard
   right-angle steps along the shoreline. Doubling to 512 halves the step and
   gives the smooth-bilinear corner rounding (~0.1–0.19 units wide) 2–4
   vertices to actually tessellate.

After this lands: retina Macs boot at tier `high` (native 2× DPR, sharp
frame), and terrace/shore silhouettes read as curves at close zoom.

## Current state (verified at `6a01395`)

- `src/engine/student-space/Game/State/Performance.js` — quality tiers,
  device heuristic, DPR caps, runtime demote/promote.
- `src/engine/student-space/Game/View/islandGeometry.ts` — terrain lattice +
  geometry fill; `SEGMENTS = 256`.
- `test/engine/performance-quality.test.ts` — pins the tier heuristic and DPR
  caps (one case pins the exact behavior this plan changes).
- `test/engine/islandGeometry.test.ts` — geometry invariants; written
  resolution-agnostically (`field.segments`), needs no edits.

### `Performance.js:71-87` — the tier heuristic

```js
export function selectInitialPerformanceTier(hints = {})
{
    const dpr = finiteNumber(hints.devicePixelRatio, 1) || 1
    …
    if((memory > 0 && memory <= 2) || (cores > 0 && cores <= 2))
        return 'low'
    if(dpr >= 3 && ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || smallestSide <= 600))
        return 'low'
    if(dpr >= 2 || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4))
        return 'medium'
    return 'high'
}
```

The offending term is the bare `dpr >= 2` in the medium branch. Chrome caps
`navigator.deviceMemory` at 8, so a top-end Mac reports
`{dpr: 2, cores: 8+, memory: 8, width: 1440+}` and still gets `medium`.

### `Performance.js:3-28` — tier settings (context, unchanged)

```js
    high:   { tier: 'high',   dprCap: 2,   antialias: true, … },
    medium: { tier: 'medium', dprCap: 1.5, antialias: true, … },
    low:    { tier: 'low',    dprCap: 1,   antialias: false, … },
```

Do NOT raise `medium.dprCap` — medium must stay a genuinely cheaper tier for
the runtime demote path (`Renderer.js:111-123` re-applies
`selectPixelRatio(viewport.pixelRatio, settings)` whenever the tier changes).

### `islandGeometry.ts:24-31` — the tessellation constant

```ts
// 4 segments per grid cell (256 / GRID_COLS 64). Kept an EVEN multiple of the
// grid so cell centers land exactly on lattice vertices. WHY 4 and not 2: the
// terrace wall's rounded lip/base (terraceBlend's smoothstep, ~0.35 cell ≈
// 0.13 world wide) is finer than a 2-seg/cell step — at 128 the rounding fell
// *between* vertices and corners collapsed to a single hard vertex. At 256 the
// wall spans ~1.4 segments, so the intended lip/base/corner rounding actually
// tessellates. ~66k vertices, built once per boot.
export const SEGMENTS = 256
```

The mesh is built exactly once per boot (`Island.js:113`, KTD-10 — no per-edit
rebuild in the engine, unlike the editor). Committed spec: `worldSize` 24,
grid 64×64 (`src/engine/student-space/Game/Data/defaultIslandSpec.json`).

### `test/engine/performance-quality.test.ts:29-37` — the pinned case to update

```ts
    expect(
      selectInitialPerformanceTier({
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        width: 1440,
        height: 900,
      }),
    ).toBe('medium')
```

This asserts exactly the behavior being fixed — it must flip to `'high'`.

### Conventions

- Engine JS uses Allman braces and 4-space indent (see the excerpts above and
  the rest of `Performance.js`) — match it.
- Tests are Vitest; model any new heuristic cases on the existing
  `selectInitialPerformanceTier` cases at
  `test/engine/performance-quality.test.ts:18-48`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck + lint | `pnpm check` | exit 0 |
| Targeted tests | `pnpm test -- test/engine/performance-quality.test.ts test/engine/islandGeometry.test.ts test/engine/islandSpecCore.test.ts` | all pass |
| Full suite | `pnpm test` | all pass |

## Scope

**In scope** (the only files you may modify):

- `src/engine/student-space/Game/State/Performance.js` (heuristic branch only)
- `src/engine/student-space/Game/View/islandGeometry.ts` (SEGMENTS + comment)
- `test/engine/performance-quality.test.ts` (heuristic expectations)
- `test/engine/islandGeometry.test.ts` (**timeout-only amendment, rev 1**: the
  two vertex-loop tests iterate every vertex with several `expect()` calls
  each — runtime scales with SEGMENTS², and at 512 they exceed Vitest's
  default 5 s per-test timeout under full-suite worker contention. Add an
  explicit per-test timeout of 30 000 ms to those two tests, with a comment
  citing this scaling. NO expectation, loop, or invariant changes.)

**Out of scope** (do NOT touch, even though they look related):

- `QUALITY_SETTINGS` dprCaps, `FAST_FRAME_MS` / `SLOW_FRAME_MS`, the
  demote/promote logic — the 15.8 ms vsync trap is documented in Maintenance
  notes as a deliberate non-fix here.
- `island-editor/**` — the editor keeps `SEGMENTS = 256`; it rebuilds
  geometry on every paint stroke, so 4× vertices there is an editing-perf
  regression. The engine builds once per boot. Divergence is intentional and
  documented in the comment you'll write in Step 2.
- `src/engine/student-space/Game/State/islandSpecCore/**` — the sampler is
  correct (plan 028 already ported); changing it breaks the golden parity
  fixture (`test/engine/fixtures/islandSpecGolden.json`).
- `Renderer.js`, `Island.js`, shadow map sizes, `BLUR_MIX` / `blurTiers`.
- `src/engine/student-space/Game/State/IslandSnapshotBridge.js` — has
  uncommitted local changes unrelated to this plan; leave it alone.

## Git workflow

- Branch: `advisor/030-island-closeup-quality` off the tip named in your
  dispatch.
- One commit, conventional style (repo examples: `perf(realtime): …`,
  `feat(engine): …`):
  `feat(engine): sharp retina DPR tier + 512-segment island tessellation`
- Do NOT push or open a PR.

## Steps

### Step 1: Stop demoting strong retina machines to tier `medium`

In `Performance.js`, replace the medium branch (line 84) so `dpr >= 2` only
counts when paired with a weak signal, keeping the existing weak-signal terms:

```js
    // dpr >= 2 alone is not a weakness signal: every retina Mac reports it,
    // and tier medium's 1.5 dprCap upscales the canvas (reads as pixelation).
    // Demote high-dpr devices only when cores/memory/viewport also look weak;
    // the runtime demote path still catches anything the heuristic misses.
    const weak = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)
    if(weak || (dpr >= 2 && smallestSide > 0 && smallestSide <= 600))
        return 'medium'
    return 'high'
```

Keep the `low` branches above it byte-identical. Note the semantics this
produces (they are the intent): unknown cores/memory (0) with any dpr on a
desktop-sized viewport → `high`; a 4-core/4 GB device → `medium` regardless
of dpr; a high-dpr small-screen device (phone/tablet that dodged the `low`
branches) → `medium`.

**Verify**: `pnpm test -- test/engine/performance-quality.test.ts` → exactly
one failure, the `devicePixelRatio: 2 … toBe('medium')` case at line 29-37.

### Step 2: Update and extend the heuristic tests

In `test/engine/performance-quality.test.ts`, inside the
`chooses an initial tier from device hints` case:

1. Flip the line-37 expectation to `.toBe('high')` and add a brief comment:
   `// plan 030: retina alone no longer demotes — medium's 1.5 dprCap read as pixelation`.
2. Add two expectations pinning the new boundary:
   - `{devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 8, width: 1440, height: 900}` → `'medium'` (weak cores still demote)
   - `{devicePixelRatio: 2, hardwareConcurrency: 8, deviceMemory: 8, width: 900, height: 590}` → `'medium'` (high-dpr small screen)

**Verify**: `pnpm test -- test/engine/performance-quality.test.ts` → all pass.

### Step 3: Double the engine terrain tessellation

In `src/engine/student-space/Game/View/islandGeometry.ts`, set
`SEGMENTS = 512` and rewrite the comment block above it to carry the new
rationale (keep the existing lip/base history, then add):

- 8 segments per grid cell (512 / GRID_COLS 64), still an even multiple.
- WHY 8 in the engine: the app camera zooms close to the character; at 256
  the ~0.094-unit vertex step spans ~25–30 screen px, polygonizing the smooth
  tier-field contours into sawtooth terrace lips and stair-stepped shorelines
  (maintainer screenshot, plan 030). At 512 the smooth-bilinear corner
  rounding (~0.1–0.19 world units) spans 2–4 vertices and reads as a curve.
- ~263k vertices, built ONCE per boot (KTD-10) — this is why the engine can
  afford it while the editor (per-edit rebuilds) deliberately stays at 256.

**Verify**:
`pnpm test -- test/engine/islandGeometry.test.ts test/engine/islandSpecCore.test.ts test/engine/Island.spec-api.test.ts`
→ all pass with no expectation edits (the geometry tests derive everything
from `field.segments`; cell centers still land on lattice vertices because
512 is an even multiple of 64).

### Step 4: Full gate

**Verify**: `pnpm check` → exit 0; `pnpm test` → all pass (report the exact
count). Note in your report the wall-clock of the islandGeometry test file
before/after Step 3 if it moved by more than ~2× (proxy for boot-time build
cost — see STOP conditions).

## Test plan

- No new test files. Changes live in
  `test/engine/performance-quality.test.ts`: one flipped expectation + two
  new boundary expectations (Step 2), modeled on the existing hint-object
  cases in the same test.
- Everything else is covered by existing resolution-agnostic tests
  (`islandGeometry.test.ts`) and the golden parity suite
  (`islandSpecCore.test.ts`), which must pass unmodified.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0; `performance-quality.test.ts` contains the two new
      boundary expectations
- [ ] `grep -n "SEGMENTS = 512" src/engine/student-space/Game/View/islandGeometry.ts` → hit
- [ ] `grep -n "dpr >= 2 ||" src/engine/student-space/Game/State/Performance.js` → no hit
- [ ] `test/engine/islandSpecCore.test.ts` unmodified (`git status`);
      `test/engine/islandGeometry.test.ts` diff contains ONLY added per-test
      timeouts + comment (rev 1 amendment — no expectation changes)
- [ ] `git status` shows only the four in-scope files changed (plus the
      pre-existing `IslandSnapshotBridge.js` modification, untouched)

## STOP conditions

Stop and report back (do not improvise) if:

- The `Performance.js` or `islandGeometry.ts` excerpts in "Current state"
  don't match the live code.
- Any test OTHER than the line-29-37 heuristic case fails after Step 1 — the
  heuristic change leaked wider than intended.
- Any `islandGeometry` / `islandSpecCore` / `Island.spec-api` test fails
  after Step 3 for any reason OTHER than the known Vitest per-test timeout in
  `islandGeometry.test.ts` (rev 1: fixed by the in-scope 30 s timeout
  amendment) — an assertion/invariant failure means the tessellation bump was
  not invariant-free; do not edit those expectations.
- The islandGeometry test file's runtime grows past ~10× its baseline after
  Step 3 — the once-per-boot build may be slower than modeled; report the
  numbers instead of optimizing.
- You find yourself wanting to touch `QUALITY_SETTINGS`, the editor, the
  sampler, or the golden fixture — all out of scope by design.

## Maintenance notes

- **Residual blockiness is authored shape, not rendering.** After this lands,
  any remaining stepping in the coastline at cell scale (~0.375 units) is the
  64×64 binary tier grid itself showing through the C1-smoothed field. That's
  an authoring/spec decision (re-author in the editor, or revisit
  `BLUR_MIX`/blur radius against the thin-feature invariant documented on
  `sampleTierField`) — a maintainer call, not a follow-up patch.
- **Deliberate non-fix: the 60 Hz promote trap.** `FAST_FRAME_MS.medium` =
  15.8 ms is below a vsynced 60 Hz frame (~16.7 ms), so a device that boots
  or demotes into `medium` can never promote to `high` on a 60 Hz display.
  Step 1 makes this mostly moot for strong machines (they boot at `high`),
  but if a demoted machine "sticking" at medium is ever reported, the fix is
  a promote threshold that tolerates vsync (e.g. compare against the display
  refresh interval), in `Performance.js` — with hysteresis re-tested.
- **Reviewer browser pass** (needs `DATABASE_URL` via embedded-postgres and a
  dev server on an explicit port — port 3000 may be squatted): on a retina
  display confirm the boot tier is `high` and the canvas backing store is 2×
  CSS pixels; zoom close to the shoreline and a terrace edge and compare
  against the maintainer's screenshot — teeth and stair-steps should read as
  curves. Watch the FPS at tier `high` on a mid-tier laptop: the 4× vertex
  mesh is static, but it casts and receives shadows, so verify no demote loop
  triggers at idle.
- **Editor/engine divergence**: `SEGMENTS` is now 512 (engine) vs 256
  (editor). Height sampling parity is untouched (same sampler, golden
  fixture), but silhouettes are slightly crisper in the app — expected during
  the pending side-by-side acceptance of the world port.
