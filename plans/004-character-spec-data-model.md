# Plan 004: Define the CharacterSpec data model, validation, and versioned persistence

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§5 skeleton names, §6 spec sketch). Follow steps in order, verify
> each, honor STOP conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/spec character-studio/src/core/motion/springTypes.ts character-studio/src/core/face/atlas.ts`
> `src/core/spec/` must contain only `index.ts`. If plans 002/003 landed,
> `face/atlas.ts` (cell maps) and `motion/springTypes.ts` (SpringChainDef)
> exist — import their types rather than redefining. If they don't exist yet,
> STOP (this plan depends on their vocabularies).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (schema mistakes propagate into every later plan)
- **Depends on**: plans/002-drawn-face-system.md, plans/003-spring-motion-system.md
- **Category**: direction
- **Recommended executor**: Sonnet 5
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

Every studio panel edits, every save/load round-trips, and every export
compiles the same document: the `CharacterSpec`. Getting it right now — typed,
zod-validated, versioned with migrations from day one — is what lets designer
authoring today and student customization later share one model (the brief's
explicit future-proofing requirement). Plans 005–012 all consume this schema;
it must land before them.

## Current state

- `character-studio/` exists (plan 001); `src/core/spec/` is an empty `index.ts`.
- `src/core/face/atlas.ts` exports `EYE_CELLS`, `MOUTH_CELLS`, `BROW_CELLS`
  (plan 002). `src/core/motion/springTypes.ts` exports `SpringJointParams`,
  `SpringChainDef`, `SphereCollider` (plan 003).
- `zod` and `zustand` are installed (plan 001 package.json).
- The authoritative spec shape is plan 000 §6, reproduced with full field
  detail in step 1 below. Canonical skeleton bone names (plan 000 §5) are the
  only legal values for bone-referencing fields.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `character-studio/src/core/spec/**` (schema, defaults, migrate, io)
- `character-studio/src/studio/state/characterStore.ts` (new — zustand store)
- `character-studio/test/core/spec/**`

**Out of scope**:
- Any UI panels (each feature plan builds its own), GLB export (011), roster
  browsing UI (012 — but the JSON file format defined here is what 012 lists),
  server/database persistence (the studio is local-first: JSON files +
  IndexedDB autosave live in 012).

## Git workflow

- Branch: `advisor/004-character-spec`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Zod schema (`src/core/spec/schema.ts`)

Define zod schemas + inferred TS types for the full spec. Field-level detail
(names are contractual — later plans and the export extension use them):

```ts
export const SPEC_VERSION = 1;
CharacterSpec = {
  meta: { id: uuid, name: string(1..64), specVersion: literal(1),
          archetype: enum['biped-round','biped-slim','bird'],
          personality: enum['gentle','cheerful','proud','gruff','calm','mischievous'] (default 'gentle'),
          createdAt: ISO string, updatedAt: ISO string, author?: string },
  anatomy: {
    parts: partial record of PartSlot → { partId: string,
             morphs: record<string, number 0..1>,
             boneScales?: record<BoneName, { x,y,z: number 0.25..4 }> },
    bodyMorphs: record<string, number 0..1>,
    sculptDelta?: { baseMeshId: string, baseMeshVersion: number, /* payload in plan 009 */ }
  },
  face: { atlasId: string, expression: string (default 'neutral'),
          eyes: { pupilScale: number 0.5..1.5, irisColor: hexColor },
          blink: { meanIntervalS: 0.5..15, enabled: boolean },
          gaze: { mode: enum['idle','camera','target'], intensity: 0..1 } },
  palette: record<PaletteSlot, hexColor>,      // PaletteSlot = 'primary'|'secondary'|'belly'|'accentA'|'accentB'|'padsNose'
  materials: partial record<Region, MaterialAssign>,  // Region = 'body'|'ears'|'muzzle'|'tail'|'claws'
                                               // MaterialAssign = { rampSoftness:0..1, rimStrength:0..1,
                                               //   shadowTint: hexColor, textureId?: string, outline?: boolean }
  wardrobe: array of { slot: WearSlot, itemId: string,
             paletteOverrides?: record<string, hexColor>,
             earMode?: enum['through','under','replace'] },   // headwear only; AC hat-ears pattern
  motion: { clipSetId: string (default 'core-v1'),
            springRig: SpringChainDef[] (import zod-ify from springTypes),
            procedural: { breathAmpl: 0..1, swayAmpl: 0..1, blinkEnabled: boolean, gazeEnabled: boolean } },
  studioLook?: { /* plan 010 fills; keep passthrough z.unknown() for now */ }
}
```
`WearSlot = 'headwear'|'eyewear'|'top'|'bottom'|'outfit'|'neck'|'back'|'handheldL'|'handheldR'`.
`PartSlot = 'ears'|'muzzle'|'tail'|'brows'|'claws'|'crest'`.
`BoneName` = zod enum of the exact plan-000 §5 names.
Use `.strict()` on every object (unknown keys are errors — protects the
export contract), except `studioLook`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Defaults + factory (`src/core/spec/defaults.ts`)

`createDefaultCharacter(archetype, personality = 'gentle')` returning a valid
spec (parse it through the schema in the function — construction must never
emit an invalid spec). Sensible defaults: neutral expression, `core-v1` clips,
per-archetype default spring rig (biped-round: earL/R + tail chains with
plan-003's tuned params — read the actual values from `PlaceholderBody.tsx`
and inline them here; bird: tail-feather chain only).

**관상/gwansang defaults (plan 000 §2.1b — read that table now):** add
`PERSONALITY_FACE_DEFAULTS: Record<Personality, { atlasId, pupilScale,
blinkMeanIntervalS, gazeIntensity, defaultExpression }>` in `defaults.ts`,
applied by the factory from `personality` (e.g. `gentle`: atlasId
`face-gentle`, pupilScale 1.25, blink 4.5 s, gaze 0.5, expression `happy`;
`gruff`: atlasId `face-gruff`, pupilScale 0.75, blink 7 s, gaze 0.9,
expression `neutral`). Until plan 006 authors the personality atlas variants,
every `atlasId` value resolves to the single existing v1 atlas via an
`ATLAS_FALLBACK` alias map — the *spec* carries the real intent from day one;
the art catches up. Every value is a default, freely overridable per character.

**Verify**: `pnpm test` (after step 5 tests exist) — for now `pnpm typecheck`.

### Step 3: Versioned migration (`src/core/spec/migrate.ts`)

`migrateSpec(raw: unknown): CharacterSpec` — reads `meta.specVersion`,
applies a `MIGRATIONS: Record<number, (old) => unknown>` chain up to
`SPEC_VERSION`, then validates. v1→v1 is identity today, but the machinery,
its tests, and the "every schema change bumps SPEC_VERSION and adds a
migration" rule (add this rule as a comment atop `schema.ts` AND a note in
`character-studio/README.md`) must exist now — retrofitting migrations after
designers have saved rosters is how tools corrupt work.

### Step 4: IO helpers (`src/core/spec/io.ts`)

`serializeSpec(spec): string` (stable key order — sort keys recursively, so
git diffs of saved characters are readable) and `parseSpec(json: string)`
(→ `migrateSpec`). File extension contract: `<name>.character.json`.

### Step 5: Studio state store (`src/studio/state/characterStore.ts`)

Zustand store: `{ spec, setSpec, patch(path-free updater fn), dirty flag,
undo/redo hooks reserved }` — mutation goes through `patch((draft) => …)`
implemented as shallow-copy-on-write (no immer dependency unless already
present; it is not — write a small typed helper). Every `patch` validates the
result against the schema in dev mode (`import.meta.env.DEV`) and throws on
invalid — panels can never persist a corrupt spec. Wire `PlaceholderBody`/
`FaceRig`/spring rig to read from the store where trivially possible (face
expression + spring params); deeper integration belongs to later plans.

### Step 6: Tests

`test/core/spec/`: `schema.test.ts` (default spec for each archetype parses;
unknown key rejected; out-of-range morph weight rejected; bad bone name in
boneScales rejected), `migrate.test.ts` (unknown version throws with a clear
message; a synthetic v0→v1 migration registered in the test runs and
validates), `io.test.ts` (round-trip `parse(serialize(spec))` deep-equals;
serialized output is key-sorted — serialize twice, byte-equal).

**Verify**: `pnpm test` → all pass.

## Test plan

As step 6 — three files, ≥ 9 cases, modeled on existing `test/core/*` files.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0
- [ ] `createDefaultCharacter('biped-round' | 'biped-slim' | 'bird')` all validate
- [ ] Round-trip serialize/parse is lossless and deterministic (test proves it)
- [ ] `grep -rn "from 'react'" character-studio/src/core/spec/` → no matches
- [ ] Changing face expression via the store visibly updates the plan-002 face rig in dev
- [ ] `plans/README.md` updated

## STOP conditions

- Plans 002/003 vocabularies (`atlas.ts` cell maps, `springTypes.ts`) absent
  or renamed — this plan must import, not fork, them.
- You need a field the sketch doesn't cover and can't add it without changing
  plan-000 §5/§6 vocabulary (e.g. new bone names) — report instead of inventing.

## Maintenance notes

- Every subsequent plan that adds spec fields (009 sculptDelta payload, 010
  studioLook) must bump nothing if the field was reserved here as passthrough,
  but MUST add schema + migration if shape changes. Reviewer: check
  `.strict()` is on every object and the store's dev-mode validation isn't
  accidentally enabled in production builds (perf).
- The student-customization future lives here: part ids, morphs, palette,
  wardrobe are all leaf values — a future picker UI is a constrained editor
  over this same document. Do not add designer-only concepts to those fields.
