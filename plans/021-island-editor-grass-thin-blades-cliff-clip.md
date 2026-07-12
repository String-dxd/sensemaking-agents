# Plan 021: Island editor — thinner, denser grass blades + cliff-face clip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> any STOP condition occurs, stop and report — do not improvise. Skip the
> `plans/README.md` update if your reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat 1ae1ce7..HEAD -- island-editor/src/terrain/grassField.ts island-editor/src/scene/GrassLayer.tsx island-editor/test/grassField.test.ts`
> Must be empty; on a mismatch, STOP.

## Status

- **Priority**: P1 (direct maintainer feedback with screenshot)
- **Effort**: S
- **Risk**: LOW (two knobs + one pure-function clip rule)
- **Depends on**: plan 020 (merged to `feat/island-editor-v2` @ 1ae1ce7)
- **Category**: direction (visual tuning)
- **Planned at**: commit `1ae1ce7`, 2026-07-12

## Why this matters

Maintainer feedback on the shipped plan-020 meadow (screenshot provided):

1. **Blades are much too wide.** The card is `BLADE_W = 0.045` world units vs
   blade heights of 0.10–0.24 — an aspect ratio of ~4, reading as leek stalks,
   not grass.
2. **Blades are too far apart.** With thinner blades the meadow needs tighter
   packing — density doubles (`BLADES_PER_CELL` 24 → 48). GrassLayer's buffer
   capacity derives from the constant (`cols × rows × BLADES_PER_CELL`), so no
   other change is needed; worst-case full grid becomes ~196k blades, well
   within what the trivial gradient shader was designed for (the plan-020
   material deliberately has no lights/shadow chunks for exactly this).
3. **Blades appear on cliff faces.** `grassBlades` jitters positions ±0.575 ×
   cellSize past the painted cell's edge; the only rejection rule is
   `y <= seaLevel + 0.01`. When a painted cell borders a LOWER TIER, spilled
   blades land on the terrace wall (still above sea level) and hang on the
   cliff — exactly what the screenshot shows.

Mechanism facts (verified at `1ae1ce7`):

- Terrain is terraced (`terraceHeight` in `src/terrain/terrainGrid.ts`):
  plateau interiors sit EXACTLY at `tierHeights[tier]` (smoothstep `s` is 0
  or 1 away from walls); the wall roll-off spans `DEFAULT_WALL_WIDTH` in
  tier-field space. `DEFAULT_TIER_HEIGHTS = [-1.2, 0.05, 1.0, 1.65, 2.3]` —
  the smallest inter-tier step is 0.65. So "blade fell off the plateau" is
  detectable as a height deviation from the CELL CENTER's height that is
  tiny for plateau blades and ≥ a large fraction of 0.65 for wall blades.

## Current state (at `1ae1ce7`)

- `island-editor/src/scene/GrassLayer.tsx:22`: `const BLADE_W = 0.045`
- `island-editor/src/terrain/grassField.ts`, inside `grassBlades`'s per-blade
  loop:

```ts
        const y = evaluateHeight(spec, x, z, blurred)
        if (y <= seaLevel + 0.01) continue // edge blades must not stand in water
        out.push({ x, y, z, yaw, height, shade, phase })
```

  The cell center height is already computed per cell as
  `cellCenter(...)` → but `evaluateHeight` at the center is NOT currently
  called — only per-blade. Gate: `pnpm check:island-editor` (repo root),
  green at 197 tests on `1ae1ce7`.

## Scope

**In scope**: `island-editor/src/scene/GrassLayer.tsx` (BLADE_W only),
`island-editor/src/terrain/grassField.ts` (clip rule + BLADES_PER_CELL),
`island-editor/test/grassField.test.ts` (new case + touch-ups).
**Out of scope**: everything else — no shader, material, pipeline, spec, or
App changes; do not change blade heights or the jitter radius.

## Git workflow

Branch `advisor/021-grass-thin-cliff` off `feat/island-editor-v2` (@
`1ae1ce7`). Commit: `fix(island-editor): thinner grass blades, clipped off
cliff faces`. Do NOT push.

## Steps

### Step 1: Thinner card

`GrassLayer.tsx`: `BLADE_W = 0.045` → **`0.018`**, and update its comment to
say the width was retuned per maintainer feedback (0.045 read as stalks).
The mid-vertex taper (`±BLADE_W/3`) scales with it — no other geometry edits.

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 2: Double the density

`grassField.ts`: `BLADES_PER_CELL = 24` → **`48`**; update its trailing
comment (density knob; ~196k blades worst-case full grid) and note the
retune (thinner blades need tighter packing — maintainer feedback).
GrassLayer's capacity and the "exactly BLADES_PER_CELL" test both derive
from the constant — no other edits for this step.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Cliff clip in `grassBlades`

In `grassField.ts`, per painted cell compute the cell's own ground height
once: `const yCell = evaluateHeight(spec, cx, cz, blurred)`. In the blade
loop, after the existing sea clip, add:

```ts
        if (Math.abs(y - yCell) > CLIFF_DROP) continue // spilled onto a terrace wall
```

with a module constant `const CLIFF_DROP = 0.05` (doc comment: plateau
interiors are flat, so any deviation beyond the lip's rounding means the
blade left its cell's plateau for a terrace wall — the smallest tier step is
0.65, so 0.05 cleanly separates "on the plateau" from "on the cliff", both
downhill and uphill spills). Keep the rand-draws-before-clip ordering
(stream stability) and the row-major determinism contract unchanged.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Tests

`test/grassField.test.ts`:

1. New case "clips blades that spill onto a terrace wall": build a grid with
   the 3×3 neighborhood at tier 2 EXCEPT one full adjacent side (e.g. the
   three cells at `c+1` column) left at tier 1; paint the center cell. Assert
   `blades.length` is `> 0` and `< BLADES_PER_CELL` (some spilled blades got
   clipped), and every returned blade satisfies
   `Math.abs(b.y - yCell) <= 0.05` where `yCell = evaluateHeight` at the
   painted cell's center.
2. The existing "exactly BLADES_PER_CELL" case (full 3×3 raised) must still
   pass unchanged — the clip must not fire on a flat plateau.

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 5: Gate

`pnpm check:island-editor` (repo root) → exit 0. Report exact test count.

## Done criteria

- [ ] `grep -n "BLADE_W = 0.018" island-editor/src/scene/GrassLayer.tsx` → hit
- [ ] `grep -n "BLADES_PER_CELL = 48" island-editor/src/terrain/grassField.ts` → hit
- [ ] `grep -n "CLIFF_DROP" island-editor/src/terrain/grassField.ts` → const + use
- [ ] `pnpm check:island-editor` exits 0
- [ ] `git status` — no files outside the in-scope list

## STOP conditions

- The flat-plateau test starts failing with the 0.05 threshold (would mean
  plateau heights are not as uniform as the terracing math says — report
  observed deviations rather than loosening the constant past 0.08).
- You find yourself touching the shader, jitter radius, or spec code.

## Maintenance notes

- `CLIFF_DROP` and `BLADE_W` are look knobs; tune before anything structural.
- If a future feature paints grass on deliberate slopes (non-terraced
  terrain), the |Δy| rule needs rethinking — it assumes plateaus.
