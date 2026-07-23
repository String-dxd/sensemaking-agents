# Plan 032: Curved contours at runtime — retune the tier-field sampler (BLUR_PASSES 4, BLUR_MIX 0.85) for the 128-grid island

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md`, report in the
> STATUS/STEPS/FILES CHANGED/NOTES format.

## Status

- **Priority**: P1 (maintainer feedback, third round; parameter choice backed
  by the reviewer's offline contour study)
- **Effort**: M
- **Risk**: MED (retunes the sampler EVERY terrain consumer shares; redefines
  the documented thin-feature invariant — deliberate, see below)
- **Depends on**: plan 031 (`7b65a381` + its rev-2 de-flake commit)
- **Category**: direction (visual quality)
- **Planned at**: `7b65a381` on `advisor/031-curved-coastline`, 2026-07-22

## Why this matters

Plan 031's 128×128 resample fixed the macro shape, but the coastline still
renders as a fine staircase: the runtime sampler
(`sampleTierField`, both `terrainGrid.ts` copies) keeps 60 % of the RAW
binary grid (`BLUR_MIX = 0.4`, `BLUR_PASSES = 2`), and a binary grid's
iso-contour zigzags at cell scale no matter how smooth the underlying shape
is. The reviewer rasterized the actual field math over the committed 128 spec
at four parameter combos (offline, read-only): (2, 0.4) and (3, 0.6) and
(4, 0.7) all still read as hard steps; **(4, 0.85) renders the same data as
gentle scalloped curves**. The nonlinearity is real: steps stay visually hard
until the raw weight drops below roughly 0.2.

**The invariant is redefined, not broken** (rev 1 — corrected with verified
numbers after the executor's STOP; the original statement of the floor was
wrong). At (4, 0.85), measured against the actual sampler math:

- an isolated SINGLE cell samples ≈ 0.43 → terraces to ≈ −0.94, **below sea
  level — it disappears**. This is now EXPECTED and asserted, not guarded
  against.
- a **2×2 tier-2 block** (= the old 64-grid single cell, 0.375 world units)
  samples ≈ 0.71 → terraces to tierHeights[1] (0.05) — **visible land at
  beach height**. This is the preserved world-space floor for visibility.
- a **5×5 tier-2 block** (~0.94 world units) samples ≈ 1.77 → terraces to
  tier 2 (1.0) — the new minimum for a **raised bump**.

The trade: sub-0.4-unit raised detail is no longer authorable. The reviewer
verified the visual payoff on the running app (smooth curved coastline,
scalloped terraces — screenshot in the session scratchpad) and it matches
the recorded island art direction ("few big SMOOTH scalloped masses").
Deliberate trade approved by the plan author — record it in the comments,
don't soften it.

## Current state (verified at `7b65a381`)

Both copies are textually parallel (parity convention):

- `src/engine/student-space/Game/State/islandSpecCore/terrainGrid.ts`
- `island-editor/src/terrain/terrainGrid.ts`

Engine copy (editor copy equivalent):

```ts
/** Corner-rounding strength for the terrace field (knob, 0..0.4). See the WHY
 *  comment in `sampleTierField`. */
export const BLUR_MIX = 0.4
…
/** Blur passes for the terrace field. Two chained 3×3 tent blurs ≈ a 5×5
 *  Gaussian: … */
export const BLUR_PASSES = 2
```

`sampleTierField`'s doc comment documents the old invariant ("an isolated
tier-2 cell samples ≈ 1.31 at its center"). Tests pinning sampler values:
`island-editor/test/terrainGrid.test.ts` and the shared-vector section of
`test/engine/islandSpecCore.test.ts` — both will need numeric expectation
updates (values only, never structure). The golden fixture regenerates via
`pnpm sync:island`.

## Scope

**In scope**:

- Both `terrainGrid.ts` copies: `BLUR_MIX` 0.4 → 0.85, `BLUR_PASSES` 2 → 4,
  and rewrite BOTH doc comments (knob range note, the BLUR_PASSES rationale,
  and the `sampleTierField` invariant paragraph) to state the redefined
  world-space invariant above. Keep the copies textually identical in the
  shared lines.
- `island-editor/test/terrainGrid.test.ts` + `test/engine/islandSpecCore.test.ts`:
  (rev 1) REWRITE the isolated-cell invariant test in both copies to assert
  the corrected floor: single cell → terraced height BELOW seaLevel
  (intentional, commented); 2×2 tier-2 block → terraced height ≥
  tierHeights[1] (visible land); 5×5 tier-2 block → terraced height >
  tierHeights[1] (raised bump; observe the exact value and pin it). Keep the
  two copies' tests structurally parallel. For all OTHER numeric expectations
  pinning sampler outputs: observe → check against the corrected floor →
  pin with a plan-032 comment. STOP only if the 2×2 or 5×5 checks fail.
- Regenerated: `test/engine/fixtures/islandSpecGolden.json`,
  `src/engine/student-space/Game/Data/defaultIslandSpec.json`,
  `fallbackIslandSpec.ts` (via `pnpm sync:island` — the spec data itself
  shouldn't change, only the golden heights; if the committed spec JSON
  churns, report it).

**Out of scope**: the resample script, the saved island data,
`terraceBlend`/`DEFAULT_WALL_WIDTH`, `SEGMENTS`, grassField, shoreField,
Performance.js, any React/engine view code.

## Git workflow

One commit on `advisor/031-curved-coastline` (after the rev-2 de-flake
commit): `feat(island): retune tier-field sampler to 4-pass blur, mix 0.85 — curved contours on the 128 grid`.
Do NOT push.

## Steps

1. Change constants + comments in BOTH `terrainGrid.ts` copies.
   **Verify**: `grep -n "BLUR_MIX = 0.85" && grep -n "BLUR_PASSES = 4"` hit in
   both files.
2. Run the two sampler test files; update pinned numerics per the method
   above (observe → check invariant → pin + comment).
   **Verify**: both files pass; every changed expectation listed in the report
   with old → new value.
3. `pnpm sync:island` → exit 0. Report whether defaultIslandSpec.json changed
   (it should NOT — data untouched; only the golden fixture should differ).
4. Full gates: `pnpm check` → 0; `pnpm test` → plan-030 baseline failure set
   only; `pnpm check:island-editor` → 0.

## Done criteria

- [ ] Constants + rewritten comments in both copies, textually parallel
- [ ] Both gates + sync green; `pnpm test` failure set = plan-030 baseline
- [ ] All pinned-value changes enumerated in the report
- [ ] Committed spec JSON unchanged by step 3 (git diff)

## STOP conditions

- An observed sampler value violates the REDEFINED invariant (single cell no
  longer land at all, or a 3×3 block no longer a raised bump).
- `sync:island` validator disagreement, or the committed spec JSON changes.
- Any test failure outside the two sampler test files and the golden
  fixture regeneration.
- The land silhouette visibly erodes: if the golden fixture's height samples
  show the shoreline receding by more than ~0.4 world units anywhere the old
  fixture had land (spot-check a few boundary samples), report before
  committing.

## Maintenance notes

- The visual arbiter is the maintainer via the running dev server; the
  reviewer's contour study PNGs live in the session scratchpad
  (`contour-*.png`) for reference.
- If the maintainer later wants snappier single-cell editing in the editor,
  the mix can be made resolution-aware (weight by cellSize) instead of
  reverting — note for a future plan.
