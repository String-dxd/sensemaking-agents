# Plan 008: Species taxonomy in core — spec v2, class-filtered parts, Core-8 presets

> **Recommended executor model: Sonnet 5** (well-specified schema/registry/data
> work — plan-000 §8 tiering). No Blender, no aesthetics beyond copying the
> tables below.
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`. All commands run from `character-studio/`.
>
> **Drift check (run first)**:
> `git diff --stat c3dc079..HEAD -- character-studio/src/core character-studio/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (spec version bump — migration correctness matters)
- **Depends on**: none
- **Category**: direction (species-first controlled creator, wave 2)
- **Planned at**: commit `c3dc079`, 2026-07-06

## Why this matters

Operator dogfooding verdict (2026-07-06): the studio is "too flexible — the
outcomes are not even close to an animal." Today any part combines with any
body (no species constraint anywhere), and free sliders let every character
drift off-model. This plan adds the **species layer**: a taxonomy
(class → group → species) with curated presets so "pick Shiba" produces a
recognizable shiba with zero slider work. Plans 009 (UI), 010 (bird assets),
011 (mammal assets) all build on the registry and schema field added here.

## Current state

Files (roles):

- `src/core/spec/schema.ts` — versioned CharacterSpec zod model.
  `SPEC_VERSION = 1` (line 26). `MetaSchema` (lines 321–332) has `archetype`
  + `personality` but **no species**. Migration rule comment at top of file
  is binding: *every* schema change bumps `SPEC_VERSION` and adds a
  `MIGRATIONS` entry.
- `src/core/spec/migrate.ts` — `MIGRATIONS: Record<number, Migration>`
  currently `{ 1: (old) => old }` (line 15–19); `migrateSpec` walks
  `startVersion → SPEC_VERSION` then validates.
- `src/core/spec/defaults.ts` — `createDefaultCharacter(archetype,
  personality)` (line 220) builds a schema-valid spec;
  `PERSONALITY_FACE_DEFAULTS` (line 41) maps 관상 personality → face params;
  `DEFAULT_PARTS` per archetype (line 97); `defaultSpringRig` (line 175).
- `src/core/skeleton/partRegistry.ts` — `PART_REGISTRY` (line 74): 14 parts
  across slots ears/muzzle/tail/claws/crest. `PartDef` interface (line 18)
  has **no class/species metadata**. `partsForSlot(slot)` (line 247) returns
  every part of a slot, unfiltered.
- `fixtures/hero-shiba.character.json`, `fixtures/default-dog.character.json`
  — saved v1 specs (regression fixtures for migration).
- Tests live in `test/core/**`, vitest, bare node environment. Mirror the
  structure of existing spec tests (look at `test/core/` for the migrate /
  defaults test files and match their style).

Current `MetaSchema` excerpt (`schema.ts:321-332`):

```ts
const MetaSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(64),
    specVersion: z.literal(SPEC_VERSION),
    archetype: ArchetypeSchema,
    personality: PersonalitySchema.default('gentle'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    author: z.string().min(1).optional(),
  })
  .strict()
```

Current `PartDef` head (`partRegistry.ts:18-27`):

```ts
export interface PartDef {
  slot: PartSlot
  /** Panel display name. */
  label: string
  /** GLB asset URL (Vite-resolved); null for empty parts. */
  url: string | null
  ...
```

Conventions that apply:

- `src/core/**` never imports React or `src/studio/**` (plan-000 §7 hard
  boundary).
- Registry pattern to imitate: `PART_REGISTRY` — `as const satisfies
  Record<string, PartDef>`, derived id union type, helper accessors.
- Every factory that emits a spec must parse its own output through
  `CharacterSpecSchema` (see `createDefaultCharacter`, defaults.ts:270).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify/create):

- `src/core/spec/schema.ts` (add `species`, bump `SPEC_VERSION`)
- `src/core/spec/migrate.ts` (v1→v2 migration)
- `src/core/spec/defaults.ts` (`createDefaultCharacter` sets `species`)
- `src/core/skeleton/partRegistry.ts` (`classes` field + filtered `partsForSlot`)
- `src/core/species/registry.ts` (create)
- `src/core/species/index.ts` (create — barrel, match `src/core/spec/index.ts` style)
- `test/core/**` (new + updated tests)

**Out of scope** (do NOT touch):

- Any file in `src/studio/**` (UI is plan 009), `scripts/blender/**` and
  `src/assets/**` (assets are plans 010/011), `src/core/export/**`,
  `packages/companion-runtime/**`.
- `fixtures/*.character.json` — leave as v1 on disk; they are migration
  regression inputs. Do not regenerate them.
- The root repo (`../`): never add character-studio to the root workspace.

## Git workflow

- Branch: `advisor/008-species-taxonomy` off `main`.
- Commit per step; message style matches repo, e.g.
  `feat(character-studio): species registry + spec v2 (plan 008 step 3)`.
- Do NOT push or merge without operator approval.

## Steps

### Step 1: Spec v2 — `meta.species`

In `src/core/spec/schema.ts`:

1. `export const SPEC_VERSION = 2`.
2. Add to `MetaSchema` after `personality`:
   ```ts
   /** Species preset id (src/core/species/registry.ts) or 'custom'.
    * Plain string, not an enum: adding a species must not require a spec
    * migration; unknown ids degrade to custom (registry lookup miss). */
   species: z.string().min(1).default('custom'),
   ```

In `src/core/spec/migrate.ts`, replace the `MIGRATIONS` body:

```ts
export const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: meta gains `species` (default 'custom' — no v1 spec ever
  // recorded a species) and specVersion advances.
  1: (old) => {
    const spec = old as { meta: Record<string, unknown> }
    return { ...spec, meta: { ...spec.meta, species: 'custom', specVersion: 2 } }
  },
}
```

In `src/core/spec/defaults.ts`, `createDefaultCharacter`: add
`species: 'custom',` to the `meta` literal (after `archetype`).

Some existing tests/fixture loaders assert v1 behavior — update tests that
hardcode `specVersion: 1` in constructed specs to use `SPEC_VERSION`, and
keep (or add) a test that the two `fixtures/*.character.json` files, run
through `migrateSpec`, validate and come out with
`meta.species === 'custom'` and `meta.specVersion === 2`.

**Verify**: `pnpm typecheck && pnpm test` → exit 0, all pass.

### Step 2: Class metadata on parts

In `src/core/skeleton/partRegistry.ts`:

1. Add near the top:
   ```ts
   /** Taxonomy classes a part is anatomically legal for (species wave). */
   export const ANIMAL_CLASSES = ['mammal', 'bird'] as const
   export type AnimalClass = (typeof ANIMAL_CLASSES)[number]
   ```
   (This lives here, not in `species/registry.ts`, so the registry can import
   part vocabulary without a cycle; `species/registry.ts` re-exports it.)
2. Add to `PartDef`: `classes: readonly AnimalClass[]`.
3. Tag every entry:

   | Part id | classes |
   |---|---|
   | `upright-pointy`, `floppy-long`, `round-bear`, `bunny-tall` (ears) | `['mammal']` |
   | `short-cat`, `boxy-dog` (muzzles) | `['mammal']` |
   | `beak-small`, `beak-round` (beaks) | `['bird']` |
   | `curl-shiba`, `fluff-fox`, `stub-round` (tails) | `['mammal']` |
   | `feather-fan` (tail) | `['bird']` |
   | `mitten-none`, `stub-claws` | `['mammal', 'bird']` |
   | `none` (crest) | `['mammal', 'bird']` |
   | `feather-tuft` (crest) | `['bird']` |

4. Extend the accessor (keep it backward-compatible — existing callers pass
   one argument):
   ```ts
   export function partsForSlot(slot: PartSlot, animalClass?: AnimalClass): PartId[] {
     return PART_IDS.filter(
       (id) =>
         PART_REGISTRY[id].slot === slot &&
         (animalClass === undefined || PART_REGISTRY[id].classes.includes(animalClass)),
     )
   }
   ```

**Verify**: `pnpm typecheck && pnpm test` → exit 0.

### Step 3: Species registry + Core-8 presets

Create `src/core/species/registry.ts`. Shape:

```ts
import type { AnimalClass } from '../skeleton/partRegistry'
import type { Archetype, BoneName, BoneScale, CharacterSpec, Personality } from '../spec/schema'

export type { AnimalClass }
export { ANIMAL_CLASSES } from '../skeleton/partRegistry'

/** 2nd-level filter (operator's "bird of prey / ostrich" tier). */
export const SPECIES_GROUPS = [
  'canine', 'feline', 'lagomorph', 'ursid',      // mammal
  'songbird', 'raptor', 'waterfowl',             // bird
] as const
export type SpeciesGroup = (typeof SPECIES_GROUPS)[number]

export interface SpeciesDef {
  id: string
  label: string
  class: AnimalClass
  group: SpeciesGroup
  archetype: Archetype
  /** Per-slot part loadout (same shape as CharacterSpec anatomy.parts values). */
  parts: CharacterSpec['anatomy']['parts']
  bodyMorphs: Record<string, number>
  /** Optional curated bone scales, keyed like PartEntry.boneScales — attach
   * to the part entry of the slot named in `boneScaleSlot`. */
  boneScales?: Partial<Record<BoneName, BoneScale>>
  boneScaleSlot?: 'muzzle' | 'ears' | 'tail' | 'claws'
  palette: CharacterSpec['palette']
  /** Body pattern-mask id (plans 010/011 supply the assets); undefined = plain authored mask. */
  patternId?: string
  personality: Personality
}
```

`SPECIES_REGISTRY` — `as const`-style record (imitate `PART_REGISTRY`),
`SpeciesId` union, `SPECIES_IDS`, and:

```ts
export function getSpecies(id: string): SpeciesDef | null
export function speciesForClass(klass: AnimalClass): SpeciesId[]
```

The Core-8 preset data (copy these values exactly; they encode the AC:NH
benchmark decisions — do not re-derive or "improve" them):

| id | label | class/group | archetype | personality |
|---|---|---|---|---|
| `shiba` | Shiba | mammal/canine | biped-round | cheerful |
| `tabby-cat` | Tabby Cat | mammal/feline | biped-slim | calm |
| `rabbit` | Rabbit | mammal/lagomorph | biped-slim | gentle |
| `bear-cub` | Bear Cub | mammal/ursid | biped-round | calm |
| `fox` | Fox | mammal/canine | biped-slim | mischievous |
| `robin` | Robin | bird/songbird | bird | cheerful |
| `owl` | Owl | bird/raptor | bird | proud |
| `duckling` | Duckling | bird/waterfowl | bird | cheerful |

Parts + morphs (morph values are 0–1 slider positions on the part's
`length`/`width` morphs; omit a slot only for birds' `ears`, matching
`DEFAULT_PARTS.bird` in defaults.ts:112):

| id | ears | muzzle | tail | claws | crest |
|---|---|---|---|---|---|
| `shiba` | upright-pointy {length:.35,width:.45} | boxy-dog {length:.4} | curl-shiba {} | mitten-none | none |
| `tabby-cat` | upright-pointy {length:.25,width:.35} | short-cat {length:.25} | fluff-fox {length:.35,width:.1} | mitten-none | none |
| `rabbit` | bunny-tall {length:.5,width:.3} | short-cat {length:.05} | stub-round {width:.3} | mitten-none | none |
| `bear-cub` | round-bear {width:.5} | boxy-dog {length:.15} | stub-round {} | mitten-none | none |
| `fox` | upright-pointy {length:.45,width:.25} | short-cat {length:.5} | fluff-fox {length:.4,width:.6} | mitten-none | none |
| `robin` | — | beak-small {length:.3} | feather-fan {length:.3} | mitten-none | none |
| `owl` | — | beak-small {length:.2} | feather-fan {length:.15} | mitten-none | feather-tuft |
| `duckling` | — | beak-round {length:.35} | feather-fan {length:.1} | mitten-none | none |

(The tabby's fox tail at width .1 is a declared placeholder — plan 011 ships
`tail-slim-cat` and updates the row. The owl/duckling beaks upgrade to
`beak-hooked`/`bill-duck` in plan 010. Note both facts in a comment on the
registry rows.)

Body morphs + bone scales:

| id | bodyMorphs | boneScales (slot) |
|---|---|---|
| `shiba` | bellyRound .35, chubby .25 | — |
| `tabby-cat` | slim .3 | — |
| `rabbit` | headBig .2 | — |
| `bear-cub` | chubby .5, bellyRound .4 | head {1.05,1.05,1.05} (muzzle) |
| `fox` | slim .35 | — |
| `robin` | bellyRound .3 | — |
| `owl` | chubby .4, headBig .35 | — |
| `duckling` | bellyRound .45 | — |

Palettes (6-digit hex, slots per `PaletteSchema` order primary / secondary /
belly / accentA / accentB / padsNose):

| id | primary | secondary | belly | accentA | accentB | padsNose |
|---|---|---|---|---|---|---|
| `shiba` | `#e8a15c` | `#d98f4a` | `#fdf1e0` | `#8a5a34` | `#3a2a20` | `#4a3328` |
| `tabby-cat` | `#e2954f` | `#c97a3a` | `#f7ead8` | `#9c5a28` | `#3a2a20` | `#d98a80` |
| `rabbit` | `#efe6da` | `#dccbb8` | `#fdf8f0` | `#cf9f8f` | `#8a7a68` | `#e0958f` |
| `bear-cub` | `#8a5f3f` | `#7a5236` | `#d9b98f` | `#5f3f28` | `#3a2a20` | `#3a2a20` |
| `fox` | `#e07b39` | `#c9662c` | `#fbf3e6` | `#3d2c22` | `#f7efe2` | `#2e2019` |
| `robin` | `#8a6f5a` | `#6f5847` | `#e2653f` | `#e8b23a` | `#4a3a2e` | `#5a4636` |
| `owl` | `#a08363` | `#7d6248` | `#ead9bd` | `#c9a23a` | `#55422f` | `#5a4636` |
| `duckling` | `#f2d349` | `#e8c53e` | `#faeaa8` | `#e8973a` | `#c9a23a` | `#b8742a` |

(Palette-slot semantics, from the mask channels in
`scripts/blender/bodies.py` `_torso_channels`/`_head_channels` and the part
masks: primary = base coat; secondary = back saddle + head cap; belly = front
belly + face patch — this is why the robin's "red breast" is its `belly`
slot; accentA = hands/feet/wing-tips; accentB/padsNose = part accents.)

`patternId`: leave **unset** on every preset in this plan; plans 010/011 set
them when the mask assets exist.

Face defaults come from `personality` via the existing
`PERSONALITY_FACE_DEFAULTS` — the registry stores only the personality.

Also create `src/core/species/index.ts` re-exporting the registry (match
`src/core/spec/index.ts` barrel style).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: `createCharacterFromSpecies`

In `src/core/species/registry.ts` (or a sibling `factory.ts` if you prefer
one export per concern — either is acceptable):

```ts
export function createCharacterFromSpecies(id: SpeciesId, name?: string): CharacterSpec
```

Implementation contract:

1. Start from `createDefaultCharacter(def.archetype, def.personality)`
   (import from `../spec/defaults`).
2. Overlay: `meta.species = id`; `meta.name = name ?? def.label`;
   `anatomy.parts = structuredClone(def.parts)` (then attach
   `def.boneScales` to the `def.boneScaleSlot` entry when present);
   `anatomy.bodyMorphs = { ...def.bodyMorphs }`; `palette = { ...def.palette }`;
   when `def.patternId` is set, set `materials.body.textureId = def.patternId`
   (plans 010/011 make that id resolvable; harmless string until then — but
   since no preset sets it in this plan, this branch is dormant).
3. Parse the result through `CharacterSpecSchema` before returning (same
   fail-loud rule as `createDefaultCharacter`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Tests

New file `test/core/species/registry.test.ts` (mirror the structure/style of
the existing `test/core` spec tests):

1. Every `SPECIES_IDS` entry: `createCharacterFromSpecies(id)` returns a
   spec that parses (no throw) and has `meta.species === id`.
2. Every preset's part ids exist in `PART_REGISTRY`, the part's `slot`
   matches the slot it occupies, and the part's `classes` includes the
   species' `class` (this is the anatomically-legal gate — a bird species
   referencing a mammal ear must fail the suite).
3. `partsForSlot('muzzle', 'bird')` returns only beak ids;
   `partsForSlot('muzzle', 'mammal')` returns only non-beak muzzles;
   `partsForSlot('muzzle')` returns all four (backward compat).
4. Migration: read both `fixtures/*.character.json` from disk, run
   `migrateSpec`, assert `meta.specVersion === 2` and
   `meta.species === 'custom'`.
5. `speciesForClass('mammal')` → the 5 mammal ids; `'bird'` → the 3 bird ids.

**Verify**: `pnpm test` → all pass including the new suite.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `test/core/species/registry.test.ts` exists with
      the 5 cases above
- [ ] `SPEC_VERSION === 2` and `MIGRATIONS[1]` produces `species: 'custom'`
- [ ] `grep -n "classes" src/core/skeleton/partRegistry.ts` shows every
      part entry tagged
- [ ] Fixtures on disk are byte-identical to before (`git status` shows no
      change under `fixtures/`)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift).
- Existing tests parse the fixtures **directly** through
  `CharacterSpecSchema` (not `migrateSpec`) and fail after the version bump
  in a way that suggests a runtime load path skips migration — that would
  mean saved rosters break on load; report which call site.
- You find another spec-construction site besides `createDefaultCharacter`
  that hand-builds `meta` (grep `specVersion:`); if updating it requires
  touching an out-of-scope file (e.g. `scripts/make-fixture.ts` breaks the
  build), report instead of editing.
- Any preset fails the class-compatibility test because of a fact in the
  tables above (a table error is an advisor bug — report it, don't retag
  parts to make it pass).

## Maintenance notes

- Adding a species later = one registry entry + (optionally) a pattern
  asset. No schema change — `meta.species` is a plain string by design.
- Reviewer should scrutinize: the migration (run it against both fixtures),
  and that `partsForSlot`'s one-arg form is untouched behavior (UI still
  compiles unfiltered until plan 009).
- Deferred on purpose: `tail-slim-cat` (plan 011), hooked/duck beaks +
  `patternId` values (plan 010), tall-bird archetype for ostrich (operator
  deferred, future plan), reptile class (no parts exist).
