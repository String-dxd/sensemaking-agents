# Plan 009: Species-first builder UI — class chips, species cards, Advanced demotion

> **Recommended executor model: Sonnet 5** (well-specified React panel work on
> existing patterns — plan-000 §8 tiering).
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`. All commands run from `character-studio/`.
>
> **Drift check (run first)**:
> `git diff --stat c3dc079..HEAD -- character-studio/src/studio character-studio/src/core/species`
> Plan 008 MUST already be merged (this plan imports
> `src/core/species/registry.ts`). Other drift in the excerpted files below
> is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (UI recomposition; core untouched)
- **Depends on**: advisor-plans/008-species-taxonomy-and-spec-v2.md
- **Category**: direction (species-first controlled creator, wave 2)
- **Planned at**: commit `c3dc079`, 2026-07-06

## Why this matters

Operator verdict: the current flow starts with an abstract archetype dropdown
and drowns the designer in sliders, producing non-animals. After this plan the
first question is "**which animal?**" — class chips (Mammal / Bird) → species
cards → one click applies a complete curated preset — and every raw control
(morphs, bone scales, archetype override, motion debug) is demoted to a
collapsed **Advanced** disclosure for end-stage micro-tweaks only. Part
pickers only offer anatomically legal parts for the character's class.

## Current state

Files (roles):

- `src/studio/panels/AnatomyPanel.tsx` — exports `AnatomyArchetypeSection`
  (line 125: archetype `<select>` + personality `<select>`, the "Animal" tab)
  and `AnatomyPanel` (line 182: slot select, part thumbnails via
  `partsForSlot(slot)` at line 246, body-morph sliders, bone-scale sliders).
  Both write through `useRafPatch()` (line 79 — one store patch per animation
  frame; keep using it).
- `src/studio/shell/ModeTabs.tsx` — `ModePanel` renders per tab: `'animal'` →
  `<AnatomyArchetypeSection /> + <FacePanel />` (lines 95–101), `'anatomy'` →
  `<AnatomyPanel />` (line 103).
- `src/studio/shell/Shell.tsx` — line 193: `{playing ? null :
  <MotionDebugPanel />}` renders the motion-debug card unconditionally in
  studio mode.
- `src/studio/shell/PanelSection.tsx` — shared card wrapper (title + optional
  `actions` slot). Presentation-only, no collapse support today.
- `src/studio/state/characterStore.ts` — zustand store; `patch(updater)` is
  the incremental write path and `setSpec(spec)` replaces the whole spec
  (validated in dev mode). **Undo correction (plan amended 2026-07-06 after
  executor preflight)**: `characterStore.undo()/redo()` are no-op stubs. The
  real ⌘Z/⇧⌘Z history is the studio-wide command stack:
  `studioCommands` in `src/studio/state/commandStore.ts` (backed by
  `src/core/commands/commandStack.ts`, `Command` interface in
  `src/core/commands/types.ts` — `{ label, do(), undo(), tryCoalesce(next) }`).
  Today only SculptTool/latticeStore push commands; plain `patch` calls are
  NOT undoable. Species-apply must therefore go through `studioCommands`
  (see amended Step 2).
- From plan 008 (must exist): `src/core/species/registry.ts` —
  `SPECIES_REGISTRY`, `SpeciesId`, `SPECIES_IDS`, `getSpecies`,
  `speciesForClass`, `createCharacterFromSpecies`, `ANIMAL_CLASSES`,
  `AnimalClass`; `partsForSlot(slot, animalClass?)` in
  `src/core/skeleton/partRegistry.ts`.

Key excerpt — the archetype switch this plan replaces
(`AnatomyPanel.tsx:130-137`):

```ts
const setArchetype = (next: Archetype) => {
  rafPatch((draft) => {
    draft.meta = { ...draft.meta, archetype: next }
    // coherent swap: default part loadout + spring rig for the new body
    draft.anatomy = { ...draft.anatomy, parts: defaultAnatomyParts(next), bodyMorphs: { ...draft.anatomy.bodyMorphs } }
    draft.motion = { ...draft.motion, springRig: defaultSpringRig(next) }
  })
}
```

Conventions:

- Inline `React.CSSProperties` style objects + a few `cs-*` classes in
  `src/styles.css` (grep `cs-panel-section` there). Match whichever the
  surrounding code uses; do not add a styling library.
- Panels never import from `src/studio/shell/Shell.tsx` (import-cycle rule
  documented in `PanelSection.tsx` header).
- State stores: small zustand `create()` stores per concern
  (`src/studio/state/studioStores.ts` has exemplars).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Dev server| `pnpm dev`       | studio at http://localhost:5190 |

## Scope

**In scope**:

- `src/studio/panels/SpeciesSection.tsx` (create)
- `src/studio/panels/AnatomyPanel.tsx` (filter parts; move sliders under Advanced)
- `src/studio/shell/ModeTabs.tsx` (mount SpeciesSection on the Animal tab)
- `src/studio/shell/Shell.tsx` (gate MotionDebugPanel behind advanced mode)
- `src/studio/shell/PanelSection.tsx` (optional `collapsible` prop) — or a
  small local `AdvancedDisclosure` component inside AnatomyPanel; pick one,
  don't build both
- `src/studio/state/studioStores.ts` (add `useAdvancedMode` store)
- `src/styles.css` (only if you add `cs-*` classes for chips/cards)
- `test/studio/**` (new test)

**Out of scope** (do NOT touch):

- `src/core/**` (all core changes landed in plan 008), `scripts/**`,
  `src/assets/**`, `FacePanel.tsx` (personality/face controls stay as-is),
  wardrobe/materials/sculpt/lighting panels, `PlayControls`.
- Do not remove `AnatomyArchetypeSection`'s archetype-switch *logic* — it
  moves into Advanced, it does not die.

## Git workflow

- Branch: `advisor/009-species-first-ui` off `main` (after 008 is merged).
- Commit per step; e.g. `feat(character-studio): species cards on the Animal tab (plan 009 step 2)`.
- Do NOT push or merge without operator approval.

## Steps

### Step 1: `useAdvancedMode` store

In `src/studio/state/studioStores.ts` add (matching the file's existing
store style):

```ts
export const useAdvancedMode = create<{ advanced: boolean; setAdvanced(v: boolean): void }>((set) => ({
  advanced: false,
  setAdvanced: (advanced) => set({ advanced }),
}))
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: SpeciesSection (the new Animal tab lead)

Create `src/studio/panels/SpeciesSection.tsx` exporting `SpeciesSection`:

- **Class chips** row: `All | Mammal | Bird` (local `useState`, default
  `All`), rendered as toggle buttons (reuse the thumb-button styling idiom
  from `AnatomyPanel.tsx:41`).
- **Species cards** grid: `speciesForClass(...)` (or all ids for `All`) plus
  a final **Custom** card. Card = button with the species `label` (text
  cards are fine — part-GLB thumbnails don't compose a whole animal;
  a follow-up can add roster-style thumbnails). Active card = the one
  matching `spec.meta.species` (highlight style from `thumbButton(active)`).
- **Click a species card** → apply the preset as ONE `Command` on
  `studioCommands` (`src/studio/state/commandStore.ts`) so ⌘Z reverses it in
  a single step — this is the first non-sculpt panel to migrate onto the
  stack, which the `commandStack.ts` header names as the planned follow-up.
  Build the next spec from `createCharacterFromSpecies(id)`, keep the
  identity fields the designer already owns, and snapshot before/after:

  ```ts
  const { spec, setSpec } = useCharacterStore.getState()
  const preset = createCharacterFromSpecies(id)
  const before = spec
  const after: CharacterSpec = {
    ...preset,
    meta: { ...preset.meta, id: spec.meta.id, name: spec.meta.name,
      createdAt: spec.meta.createdAt, updatedAt: spec.meta.updatedAt },
    // wardrobe + studioLook survive a species switch (designer's own);
    // sculptDelta intentionally dropped: it was sculpted against the old body
    wardrobe: spec.wardrobe,
    studioLook: spec.studioLook,
  }
  studioCommands.execute({
    label: `Species: ${preset.meta.name}`,
    do: () => useCharacterStore.getState().setSpec(after),
    undo: () => useCharacterStore.getState().setSpec(before),
    tryCoalesce: () => false,
  })
  ```

  (Specs are never mutated in place — `patch` is copy-on-write and `setSpec`
  replaces — so holding the `before`/`after` references is safe; no deep
  clone needed. Note: `setSpec` also resets the store's `dirty` flag
  semantics for "loading a file" — check its implementation; if it clears
  dirty, follow with the store's existing mechanism for marking divergence
  or accept the behavior and note it in your report.)
- **Click Custom** → `patch` only `draft.meta.species = 'custom'` (nothing
  else changes — it just unlocks the unfiltered picker; plain patch, not a
  command, consistent with the panel's other non-undoable edits today).
- Personality select: MOVE the existing personality `<select>` +
  `setPersonality` handler from `AnatomyArchetypeSection` into
  `SpeciesSection` below the cards (identity belongs to the Animal step).
  Note: picking a species also sets personality (via preset `face` +
  `meta.personality`); the select lets the designer re-skin afterwards.

In `ModeTabs.tsx` case `'animal'`: render `<SpeciesSection />` +
`<FacePanel />`. `AnatomyArchetypeSection` is no longer mounted there
(step 4 relocates its archetype select).

**Verify**: `pnpm typecheck` → exit 0. `pnpm dev` → Animal tab shows chips +
8 species cards + Custom; clicking Shiba visibly rebuilds the character
(round body, pointy ears, curled tail, tan palette); one Cmd/Ctrl-Z restores
the previous character.

### Step 3: Class-filtered part picker

In `AnatomyPanel.tsx`:

- Read `species` from the store: `const speciesId = useCharacterStore((s) =>
  s.spec.meta.species)`; resolve `const klass = getSpecies(speciesId)?.class`
  (undefined for `'custom'` / unknown → unfiltered).
- Line 246: `partsForSlot(slot)` → `partsForSlot(slot, klass)`.
- When the designer picks a part, ALSO nothing else changes — parts remain
  free choice within the legal set.

**Verify**: `pnpm dev` → with Robin active, muzzle slot shows only the two
beaks; with Shiba, no beaks. With Custom, all four muzzles. `pnpm typecheck`
→ exit 0.

### Step 4: Advanced demotion

- Add a collapsed-by-default **Advanced** area at the bottom of
  `AnatomyPanel`, gated on `useAdvancedMode().advanced` with a small toggle
  header (a `<button>` in `PanelSection`'s `actions` slot labeled
  `Advanced ▸ / ▾` is sufficient; or add a `collapsible` prop to
  `PanelSection` — one mechanism only).
- Move INTO it, unchanged in logic: body-morph sliders
  (`AnatomyPanel.tsx:272-289`), bone-scale group sliders (lines 291–311),
  and the archetype `<select>` + `setArchetype` handler (from the old
  `AnatomyArchetypeSection`; switching archetype should also set
  `draft.meta.species = 'custom'` — an archetype override means the preset
  no longer applies).
- Part picker + part-morph sliders (ear length etc.) stay OUTSIDE Advanced —
  they are the curated controls.
- `Shell.tsx:193`: render `<MotionDebugPanel />` only when
  `useAdvancedMode().advanced` (import the store; Shell may import state
  stores — it already imports `usePlayStore` via ModeTabs pattern; verify no
  cycle: `studioStores.ts` must not import from shell — it doesn't).
- Delete the now-empty `AnatomyArchetypeSection` export once nothing imports
  it (`grep -rn "AnatomyArchetypeSection" src/` → only its definition).

**Verify**: `pnpm typecheck && pnpm test` → exit 0. `pnpm dev` → Anatomy tab
shows picker + part morphs only; Advanced toggle reveals body morphs, bone
scales, archetype; motion-debug card appears only when Advanced is on.

### Step 5: Test

New `test/studio/speciesSection.test.ts` (follow the pattern of the existing
`test/studio/*` store-level tests — the vitest environment is bare node, so
test the store logic, not DOM):

1. Applying a species preset via the step-2 command recipe on a fresh store:
   `meta.species` updates, `meta.id`/`createdAt` survive, `wardrobe`
   survives (seed one worn item first), `anatomy.parts` equals the preset's.
2. `studioCommands.undo()` after a species apply restores the exact previous
   spec (deep-equal), and `redo()` re-applies; `studioCommands.depth()`
   increased by exactly 1 for the apply (use a fresh stack or record the
   starting depth — `studioCommands` is a module singleton).
3. Applying Custom changes only `meta.species`.
4. Archetype override sets `meta.species` to `'custom'`.

(If `test/studio/` doesn't exist or existing studio tests import React
components, model after whichever `test/studio/*.test.ts` file exists;
if none exists, put the store-level assertions in
`test/studio/speciesSection.test.ts` exercising `useCharacterStore`
directly — `characterStore` is importable without a DOM.)

**Verify**: `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0 with the new suite
- [ ] Animal tab = class chips + species cards + Custom + personality select
- [ ] `grep -n "partsForSlot(slot)" src/studio/panels/AnatomyPanel.tsx` → no
      match (filtered call in use)
- [ ] Body morphs / bone scales / archetype select render only inside the
      Advanced disclosure; `MotionDebugPanel` renders only in advanced mode
- [ ] One undo step reverses a species application
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Plan 008's exports are missing or shaped differently than listed above.
- `studioCommands`/`Command`/`setSpec` differ from the shapes quoted in
  "Current state" (RESOLVED AMENDMENT 2026-07-06: the original plan wrongly
  assumed `patch` was undoable; species-apply now goes through
  `studioCommands` per Step 2 — this bullet only triggers if THAT machinery
  doesn't match either).
- Preserving `wardrobe` across a species switch breaks assembly (e.g. a worn
  item assumes an archetype) — report, don't silently drop wardrobe.
- Gating `MotionDebugPanel` creates an import cycle Shell → studioStores →
  … → Shell.

## Maintenance notes

- Species cards are text-only; a follow-up can render roster-style
  thumbnails (see `src/studio/roster/thumbnails.ts`) per species preset.
- If plan 010/011 add patternIds, no UI change is needed — presets carry
  them through `materials.body.textureId`.
- Reviewer: check the species-apply patch keeps ONE undo step, and that
  switching species with wardrobe on produces no console errors from
  `dress.ts` re-fitting.
