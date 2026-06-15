---
title: Island Editor — layout export, committed default & decorOffsets uuid re-key
type: feat
status: proposed
date: 2026-06-15
revised: 2026-06-15 (post design-review — offset re-key promoted to in-scope; two artifacts)
written_against_commit: 22856862
part_of: 2026-06-15-000-feat-island-editor-engine-overview.md
plan_index: 004
depends_on: [001, 003]
---

# Island Editor — layout export → committed default (+ offset re-key)

## Overview

Close the loop for the **placement** artifact: **export** the edited `IslandLayout` to JSON, ship it
as the committed **`defaultIslandLayout.json`** the app boots from (repointing 001's base), and
**re-key the per-student `decorOffsets` from index → stable uuid** so a student's moved objects survive
a designer adding/removing/reordering the defaults. (The **species palette** artifact + its export are
plan 005 — separate file, independent.)

> Read `…-000-…-overview.md`; confirm 001 + 003 merged. Locked: dev tool + committed file; **two
> separate artifacts**; **offset re-key is in-scope** (not optional) because full add/remove makes the
> index desync real; **uuid ids**.

---

## Preconditions / drift check (DO FIRST)

1. **001 + 003 merged.** `IslandLayout` has `serialize/setLayout/revertToDefault/list`; objects carry
   **stable uuid** ids; `Game/Data/islandLayout.js` exports `defaultIslandLayout()` +
   `defaultIslandLayoutFromConstants()`; `IslandEditorPanel.tsx` exists.
2. Anchors: `Persistence._exportJson:153`/`_importJson:168` (Blob download / file-input reload pattern);
   `Sprouts.decorOffsets:100` (index-keyed `{trees,flowers,fruits,mailbox,telescope}`),
   `getDecorOffset:282`/`setDecorOffset:263`/`serialize:490`/`hydrate:424`; `View/Sprouts.js:618-681`
   (applies by index); each view record carries its layout `id` (001 U5/U6); `IslandSnapshotBridge.js`
   (`{v,sprouts}` POST); `schema.ts:583` (`vipsIslandSnapshots`, free-form `payload_json`).
3. **STOP and report** if `decorOffsets` is already id-keyed, or the editor panel/layout APIs are absent.

---

## Requirements Trace

- **R1.** Editor **Export layout** (download the live `IslandLayout` JSON) + **Import layout** (load →
  `setLayout`), reusing the `Persistence` export/import idiom.
- **R2.** A committed **`defaultIslandLayout.json`** exists; `defaultIslandLayout()` returns it (merged
  through `mergeIslandLayout`), falling back to `defaultIslandLayoutFromConstants()` if empty/invalid.
- **R3.** Replacing the committed JSON with an exported edit changes the island every user boots, with
  no other code change; equal to the seed → visual no-op.
- **R4.** **`decorOffsets` re-keyed index → stable layout uuid**, with a one-time hydrate migration;
  the shipped pick-and-plant keeps working; `Sprouts.pickPlant.test.ts` + `IslandSnapshotBridge.test.ts`
  stay green; offsets whose object was deleted are dropped.
- **R5.** Tests cover export round-trip, default-from-JSON, parity guard, and the offset migration.
  `pnpm check`+`pnpm test`+`pnpm build` pass.
- **R6. (Deferred / forward-looking, not built here):** the server snapshot payload *may* later carry
  the layout (`{v,sprouts,islandLayout}`) — documented, not implemented (committed file + local working
  copy meet the dev-tool goal).

---

## Scope Boundaries

**In:** layout export/import; committed `defaultIslandLayout.json` + load + parity guard; the
`decorOffsets` uuid re-key migration.
**Not in:** the species palette artifact/export (005); a server authoring API; per-student authored
layouts as a feature; asset import; terrain.

---

## Key Technical Decisions

1. **Authored default = committed file; per-student edits = local/server override layer.** Reviewed,
   versioned code artifact — appropriate for something that defines the island for every student.
2. **Export is layout-only** (`{v,objects}`); import calls `setLayout` live (no reload).
3. **Parity guard, not equality.** Committed JSON starts equal to `defaultIslandLayoutFromConstants()`
   (verified once, then the seed-equality assertion is `it.skip`-guarded so an intentional edit passes);
   the ongoing test asserts the JSON is a **valid, non-empty** layout containing `mailbox-0` +
   `telescope-0` and ≥1 of each editable kind, so a corrupt/empty file fails.
4. **Offset re-key is in-scope** (locked): change `decorOffsets` to a flat **id-keyed** map; migrate
   legacy index-keyed snapshots once on hydrate. Keeps the authored-base (layout) and per-student-override
   (`decorOffsets`) **layers separate** — only the override's *addressing* changes (index → uuid).

---

## Implementation Units

### U1 — Export / Import layout JSON
**Files:** `IslandEditorPanel.tsx` (+ optional `src/lib/student-space/island-layout-io.ts`).
**Export:** `state.islandLayout.serialize()` → `JSON.stringify(…, null, 2)` → download
`island-layout-<stamp>.json` (Blob/`<a download>` recipe from `Persistence._exportJson`). **Import:**
file input → `FileReader` → `JSON.parse` → `state.islandLayout.setLayout(parsed)` (slice's
`mergeIslandLayout` validates; `layoutReplaced` triggers the 003 reconcile — no reload). Two buttons in
the panel header (sit alongside 005's palette export/import).

### U2 — Committed default + load + parity guard
**Files:** create `Game/Data/defaultIslandLayout.json` (seed = serialized
`defaultIslandLayoutFromConstants()` — generate via a one-off test/script and paste; its uuids become
the **frozen** default ids); modify `Game/Data/islandLayout.js`:
```js
import committed from './defaultIslandLayout.json'
import { mergeIslandLayout } from '../State/schema.js'
export function defaultIslandLayout() {
  const m = mergeIslandLayout(committed)
  return (m && m.objects.length > 0) ? m : defaultIslandLayoutFromConstants()
}
```
Create `test/engine/defaultIslandLayout.json.test.ts`: valid + non-empty + contains `mailbox-0`/
`telescope-0` + ≥1 per editable kind; a seed-parity assertion (`it.skip`-guarded, with a comment) that
the committed JSON deep-equals `defaultIslandLayoutFromConstants()` at seed time.
**Done:** boots identically from the JSON (no-op vs 001); replacing it with an exported edit changes the
boot island with no other code change. **Escape hatch:** if Vite doesn't bundle the JSON import in prod,
switch to a `.js` module exporting the object; verify with `pnpm build`.

### U3 — `decorOffsets` re-key (index → uuid) + migration  *(in-scope; HIGH-touch)*
**Files:** `State/Sprouts.js` (`decorOffsets` shape + `get/setDecorOffset` + `serialize` + `hydrate`
migration), `State/schema.js` (offset merge), `View/Sprouts.js:618-681` (apply by id).
- Change `decorOffsets` from `{ trees:{0:{x,z}} }` to flat `{ 'tree-0':{x,z}, 'flower-11':{x,z} }`
  (layout uuid). `setDecorOffset(id,pos)`/`getDecorOffset(id)`.
- **Migration in `Sprouts.hydrate`:** detect the legacy `{trees:…}` shape and convert
  `{kind}[index] → the layout id for that (kind,index)` (the default's frozen id, e.g.
  `tree-${index}`). Drop entries whose object no longer exists. Keep a one-release read of the legacy
  shape as a safety net.
- `View/Sprouts.js`: when applying offsets (`_installDecorHitTargets` / `_applyDecorMove`), look up each
  entry's layout `id` (carried from 001) and read/write by id.
- The snapshot payload now carries id-keyed offsets — backward-compatible because the server stores it
  opaquely and the migration handles old reads.
**Escape hatch:** if the re-key ripples beyond these files, or `Sprouts.pickPlant.test.ts` can't stay
green with a contained change, **STOP** — ship 004 without U3 (index model keeps working until a
*default* object is removed/reordered in a shipped layout) and document the limitation in the overview;
U3 becomes its own plan.
**Tests:** legacy index-keyed snapshot migrates to id-keyed; a moved object stays put after the layout
adds another of the same kind; existing pick-and-plant scenarios pass re-keyed.

### U4 — Tests + gates
**Files:** `test/engine/IslandLayout.export.test.ts`, `defaultIslandLayout.json.test.ts` (U2), U3 tests.
**Verify:**
```bash
pnpm test test/engine/IslandLayout.export.test.ts test/engine/defaultIslandLayout.json.test.ts
pnpm test     # Sprouts.pickPlant.test.ts + IslandSnapshotBridge.test.ts MUST stay green
pnpm check ; pnpm build
pnpm dev      # /#editor: edit → Export → replace defaultIslandLayout.json → reload (no #editor) → new island boots
```
Patterns: `test/engine/Sprouts.test.ts`, `IslandSnapshotBridge.test.ts`.

---

## System-Wide Impact

- **Boot default** comes from the committed JSON; a bad/empty file falls back to the constants seed
  (never boots empty).
- **Pick-and-plant** continues working; offsets are now uuid-keyed and survive default add/remove/reorder.
- **Snapshot** payload now carries id-keyed offsets (opaque to the server; migration handles old reads).
- **Provenance/release gate:** no assets added; ambient-visual rebuild untouched.

## Risks
| Risk | Mitigation |
|---|---|
| Committed JSON corrupt/empty | U2 fallback + validity guard; review JSON like code |
| U3 breaks shipped pick-and-plant | U3 escape hatch → ship 004 without U3; keep `Sprouts.pickPlant`/`IslandSnapshotBridge` green |
| JSON not bundled in prod | U2 escape hatch (`.js` module); `pnpm build` check |

## Done Criteria
1. `pnpm check`+`pnpm test`+`pnpm build` green; new tests pass; `Sprouts.*`/`IslandSnapshotBridge.*`
   green. 2. Export downloads a valid layout; Import live-updates. 3. Replacing `defaultIslandLayout.json`
   with an exported edit changes the boot island (verified in `pnpm dev`, no `#editor`), no other code
   changed. 4. A legacy snapshot migrates and a moved object survives an add of the same kind (or, if U3
   deferred, the limitation is documented in the overview).

## Sources
Overview/001/003. Export/import `Persistence.js:153/168`. Default module `Game/Data/islandLayout.js`;
merge `schema.js`. `decorOffsets` `Sprouts.js:100/263/282/490/424`; apply `View/Sprouts.js:618-681`.
Snapshot `IslandSnapshotBridge.js`, `island-snapshot.handler.server.ts`, `schema.ts:583`,
`function-schemas.ts`. Tests `test/engine/Sprouts.test.ts`, `IslandSnapshotBridge.test.ts`.
