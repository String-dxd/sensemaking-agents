# Handoff: Character Studio — species-first creator (wave 2)

_2026-07-07, merged to main at `d16abbf`. All gates green: `pnpm typecheck` +
`pnpm test` → 484/484 from `character-studio/`._

## What this is

The studio was rebuilt from a free-form parameter editor into a **controlled,
species-first character creator** (operator decision after dogfooding: full
flexibility produced non-animals). The flow is now:

1. **Animal tab** — class chips (Mammal / Bird) → 8 species cards
   (Shiba, Tabby Cat, Rabbit, Bear Cub, Fox, Robin, Owl, Duckling) + Custom.
   One click applies a complete curated preset (proportions, parts, palette,
   body pattern, 관상 personality face). One ⌘Z undoes the whole apply.
2. **Anatomy tab** — part pickers filtered to class-legal parts (birds see
   beaks, mammals see muzzles). Raw controls (body morphs, bone scales,
   archetype override) and the motion-debug card live behind a collapsed
   **Advanced ▸** disclosure.

## Run it

```
cd character-studio && pnpm install && pnpm dev   # http://localhost:5190
pnpm typecheck && pnpm test                        # the gates (484 tests)
```

Best demo: Animal tab → Bird chip → Robin (red breast pattern, small beak) →
⌘Z → Fox (dark socks, slim-cat-adjacent silhouette, mischievous face).

## Where things live

| Concern | Files |
|---|---|
| Species taxonomy + Core-8 presets | `src/core/species/registry.ts` (`createCharacterFromSpecies`) |
| Spec v2 (`meta.species`, migration) | `src/core/spec/schema.ts`, `migrate.ts` — **read the migration rule at the top of schema.ts before any schema change** |
| Class-tagged parts | `src/core/skeleton/partRegistry.ts` (`classes`, `partsForSlot(slot, class?)`) |
| Body pattern masks (robin breast, fox socks, …) | `src/core/materials/patternRegistry.ts` (TS) + `scripts/blender/patterns.py` (bake); baked PNGs in `src/assets/anatomy/textures/body-*.pattern-*.mask.png` |
| Species-first UI | `src/studio/panels/SpeciesSection.tsx`; Advanced demotion in `AnatomyPanel.tsx`, `Shell.tsx` |
| Undo integration | species-apply is a `Command` on `studioCommands` (`src/studio/state/commandStore.ts`) — the first non-sculpt panel on the stack |
| New parts | hooked raptor beak, duck bill, slim cat tail (`scripts/blender/parts.py` + registry entries + GLBs) |

Full design + execution record: `advisor-plans/README.md` (status index) and
`advisor-plans/008…011-*.md` (self-contained plans, including the AC:NH
benchmark preset tables). Regenerating assets needs Blender at
`/Applications/Blender.app` — `pnpm gen:assets -- --only <ids>`.

## Sharp edges / gotchas

- **Adding a pattern id to both resolvers is solved** — use
  `resolvesAuthored(textureId)` from `patternRegistry.ts`; never re-introduce
  a bare `textureId === 'authored'` check (that exact drift shipped a bug
  where no pattern rendered — fixed in `ad2ce03`).
- Part GLBs **byte-drift on every `gen:assets` run** under Blender 5.1.2 even
  when untouched — regenerate with `--only` and revert incidental GLB drift.
- `test/core/sculpt/brushes.test.ts` has an 8 ms perf gate that fails on a
  loaded machine (false alarm) — re-run on a quiet machine before believing it.
- `setSpec` clears the store's `dirty` flag, so a species apply reads as
  "clean" until the next edit (autosave caveat, known).
- The `.companion.glb` **export path does not bake patterns yet** —
  `src/core/export/compile.ts` must route through `patternMaskUrl` when
  export work resumes (recorded in plan 010's maintenance notes).

## Open polish items (ranked)

1. Tabby stripe / forehead-M contrast is low (secondary `#c97a3a` too close to
   primary `#e2954f`) — punchier secondary or stronger stripe amplitude in
   `patterns.py::_apply_tabby`.
2. Owl facial-disc / duckling crown read subtle for the same palette-adjacency
   reason.
3. Deferred by operator decision: tall-bird archetype (ostrich), reptile
   class, per-part pattern masks (rabbit inner-ear pink), species-card
   thumbnails (cards are text-only).
