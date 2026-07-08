---
title: Island Editor — species palette (data model, live recolor, editing UI, export)
type: feat
status: done — merged via #74; superseded in part by the #76 tile-grid rewrite
date: 2026-06-15
written_against_commit: 22856862
part_of: 2026-06-15-000-feat-island-editor-engine-overview.md
plan_index: 005
depends_on: [001, 003]
---

# Island Editor — species palette

## Overview

The second authored artifact (parallel to placement): make each species' **colors** data-driven and
editable in the dev editor — the oak/cherry two-tone leaves, the 6 flower palettes
(petal/centre/face), and the 6 fruit colors — applied **live** to materials, persisted as a
**working copy** over a committed **`defaultSpeciesPalette.json`** base, with its editing controls in
the 003 panel and its own export.

**v1 = recolor existing species only.** No new species, no geometry, no per-instance color (those are
deferred). This mirrors 001's data-model + 003's panel + 004's export pattern, applied to appearance.

> Read `…-000-…-overview.md`; confirm 001 + 003 merged. Locked: **colors of existing species only**;
> separate committed artifact; same working-copy/divergence/revert model as the layout.

---

## Preconditions / drift check (DO FIRST)

1. **001 + 003 merged** (slice idiom + working-copy/divergence pattern; the `IslandEditorPanel`).
2. Confirm the color anchors + material types (all live-mutable):
   - **Trees** `Tree.js:50-53` `OAK_COLOR_A=0x3A7D2A`,`OAK_COLOR_B=0x8AAA35`,`CHERRY_COLOR_A=0xFF66A3`,
     `CHERRY_COLOR_B=0xFFCC66`; `makeLeavesMaterial:246` → `ShaderMaterial` uniforms `uColorA`/`uColorB`
     (set live via `material.uniforms.uColorA.value.set(hex)`).
   - **Flowers** `Flowers.js:20-27` `SPECIES` (`daisy{petal,centre}`,`tulip{petal}`,`rose{petal}`,
     `lily{petal,centre}`,`pansy{petal,face}`,`hyacinth{petal}`); blooms built per-flower via
     `SHAPE_BUILDERS`/`lambert(color)`. **Recolor = re-skin** (precedent: `setFirstSpeciesForEmotion:435`
     rebuilds flower 0's bloom).
   - **Fruits** `Fruits.js:23-32` `FRUIT_SPECIES` (`apple:0xD64242`…`berry:0xB02A5E`); per-species shared
     `_berryMats[id]` `MeshLambertMaterial` (recolor live via `_berryMats[id].color.set(hex)`).
3. **STOP and report** if a `SpeciesPalette` slice / `defaultSpeciesPalette*` already exists, or the
   color constants moved.

---

## Requirements Trace

- **R1.** Typed serializable `SpeciesPalette` `{ v, tree:{oak,cherry}, flower:{…}, fruit:{…} }` where each
  species maps to its colors (tree `{colorA,colorB}`; flower `{petal,centre?,face?}`; fruit `{color}`).
  `defaultSpeciesPalette()` reproduces today's constants exactly.
- **R2.** A `SpeciesPalette` slice (same working-copy-over-committed-base model as 001):
  `get(kind,species)`, `setColor(kind,species,colors)`, `list()`, `revertToDefault()`, `isDiverged()`,
  `subscribe`, `hydrate`, `serialize`; fans `paletteChanged`.
- **R3.** Views read species colors from the slice at build; on `paletteChanged`, recolor **live** —
  fruits via `material.color`, trees via shader uniforms, flowers via bloom re-skin.
- **R4.** Palette editing controls mount in the 003 `IslandEditorPanel`: a color field per
  species/slot, a "diverged" badge + revert, and Export/Import of the palette JSON.
- **R5.** A committed **`defaultSpeciesPalette.json`**; `defaultSpeciesPalette()` returns it (merged),
  falling back to the constants seed.
- **R6.** Lifecycle/dispose clean; dev-gated (rides the 003 panel's `#editor` gate). Tests cover model,
  default parity, slice + divergence/revert, live apply per kind, export round-trip. `pnpm check`+
  `pnpm test`+`pnpm build` pass.

---

## Scope Boundaries

**In:** colors of existing species (tree/flower/fruit) — model, slice, live apply, editing UI, committed
artifact + export.
**Not in:** new species / geometry; per-instance color (palette is per-species/shared); mailbox/
telescope colors (one-offs, out of v1); non-color params (scale defaults, bloom size — deferred);
ambient visuals (grass/sky — provenance rebuild, untouched).

---

## Key Technical Decisions

1. **Per-species (shared), not per-instance** (locked B). Editing oak's colorA recolors all oaks. Stored
   in the palette artifact, separate from the placement layout.
2. **Colors are live-mutable** — fruits trivial (`_berryMats[id].color.set`), trees easy (uniform
   `.value.set`), flowers via re-skin (generalize `setFirstSpeciesForEmotion`).
3. **Same working-copy/divergence/revert + committed-file model as 001/004** — consistency; a dev's
   recolors survive reload; Export writes `defaultSpeciesPalette.json`.
4. **Mirrors the slice ceremony** (slice · schema merger · State construct/hydrate · Persistence
   KEY/SLICES · Game.dispose · `.d.ts`).

---

## Implementation Units

### U1 — Data model + default
**Files:** create `Game/Data/speciesPalette.js` (+ `.d.ts`). `defaultSpeciesPalette()` built from the
constants (R1 anchors). Export the constants from the view modules (or re-declare + parity test, as in
001 U1). Colors as `#rrggbb` strings (convert from the `0x` numbers).

### U2 — Schema merger
**Files:** `State/schema.js`. `mergeSpeciesPalette(raw)` — lenient: known kinds/species, color strings
validated (`#rrggbb`), unknown dropped with `warn`; missing → default. Mirror `mergeSprout`/
`mergeIslandLayout`.

### U3 — `SpeciesPalette` slice (working-copy model)
**Files:** create `Game/State/SpeciesPalette.js` (+ `.d.ts`). Mirror 001's slice: base =
`defaultSpeciesPalette()`; working copy in localStorage; `get/setColor/list/isDiverged/revertToDefault/
subscribe/hydrate/serialize/_persist`; `setColor` fans `{type:'paletteChanged', kind, species, colors}`.

### U4 — Persistence/State/dispose/types + live apply
**Files:** `Persistence.js` (`speciesPalette` in `KEY`/`SLICES`/`empty`); `State.js` (construct + hydrate
`this.speciesPalette`); `Game.js` dispose; `SpeciesPalette.d.ts`. **Live apply** in the views:
- Build: each view reads its species colors from `state.speciesPalette.get(kind, species)` instead of
  the constant (constant becomes the default seed).
- On `paletteChanged`: **Fruits** `_berryMats[species].color.set(hex)`; **Trees** find the species' leaf
  `ShaderMaterial` → `uniforms.uColorA/uColorB.value.set(hex)`; **Flowers** re-skin blooms of that
  species (generalize `setFirstSpeciesForEmotion`'s dispose+rebuild to all flowers whose
  `species.id === changed`).
- Subscribe in each view's constructor; unsubscribe in dispose.
**Escape hatch (flowers):** if live re-skin of all flowers of a species is too invasive, apply flower
recolors on next reload (the palette persists; the build path reads it) and report — trees/fruits stay
live. Do not block on flowers.

### U5 — Palette editing UI (in the 003 panel)
**Files:** `src/components/student-space/editor/IslandEditorPanel.tsx` (add a "Palette" section) or a
sibling `SpeciesPaletteControls.tsx` it renders. A grouped list (tree/flower/fruit → species → color
field(s)) bound to `useEngineSliceVersion(state.speciesPalette)`; change → `setColor` (+ undo command via
002's stack); a "diverged" badge + "Revert palette"; Export/Import buttons (download/load
`species-palette-<stamp>.json` → `setLayout`-equivalent on the palette slice). Use Base UI / local
`ui/*` (no shadcn).

### U6 — Committed default + tests + gates
**Files:** create `Game/Data/defaultSpeciesPalette.json` (seed = serialized
`defaultSpeciesPaletteFromConstants()`); repoint `defaultSpeciesPalette()` to load it with the
const-fallback + validity guard (mirror 004 U2). Tests: `test/engine/SpeciesPalette.test.ts` (default
parity vs constants; `setColor` + `paletteChanged`; divergence/revert; serialize round-trip; working-copy
hydrate), `test/engine/SpeciesPalette.apply.test.ts` (fruit `_berryMats` color updates; tree uniform
updates; flower re-skin — or the reload fallback), `defaultSpeciesPalette.json.test.ts` (valid+non-empty).
**Verify:**
```bash
pnpm test test/engine/SpeciesPalette.test.ts test/engine/SpeciesPalette.apply.test.ts test/engine/defaultSpeciesPalette.json.test.ts
pnpm test ; pnpm check ; pnpm build
pnpm dev   # /#editor: recolor a fruit/tree/flower live; Export → commit defaultSpeciesPalette.json → reload → new colors boot
```
Patterns: `test/engine/Sprouts.test.ts` (slice), `IslandLayout.test.ts` (working-copy, from 001).

---

## System-Wide Impact

- **Two committed artifacts now** (layout from 004 + palette here); the panel's Export writes both. Each
  loads independently with its own fallback.
- **Provenance:** the recolored materials (tree foliage MIT; flowers/fruits own) are release-clean; the
  palette does not touch the must-rebuild ambient shaders.
- **Persistence:** one more working-copy slice (~small JSON).

## Risks
| Risk | Mitigation |
|---|---|
| Flower live re-skin invasive | U4 escape hatch (reload fallback for flowers; trees/fruits live) |
| Import cycle (palette ↔ view consts) | re-declare + parity test (as 001) |
| JSON not bundled in prod | `.js` module fallback; `pnpm build` check |

## Done Criteria
1. `pnpm check`+`pnpm test`+`pnpm build` green; new tests pass; prior suites unaffected.
2. `defaultSpeciesPalette()` reproduces today's colors (no-op). 3. `/#editor`: recoloring a tree/fruit
   (and flower, or via reload fallback) updates the island live; Export → committed JSON → reload boots
   the new colors. 4. Divergence badge + revert behave; palette is DEV-only.

## Sources
Overview/001/003/004. Colors: `Tree.js:50-53/246`, `Flowers.js:20-27/435`, `Fruits.js:23-32` (`_berryMats`).
Slice idiom + working-copy: `Sprouts.js`, plan 001 `IslandLayout`. Persistence `Persistence.js:33/47/234`.
Panel `IslandEditorPanel.tsx` (003). Export `Persistence.js:153/168`. Tests `test/engine/Sprouts.test.ts`,
`IslandLayout.test.ts`. CLAUDE.md (Base UI, no shadcn).
