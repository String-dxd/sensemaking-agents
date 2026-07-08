---
title: Island spec — sparse relief encoding at the serialization boundary (v2 format)
type: perf
status: done — merged via #75; relief encoding later retired to legacy/ by the #76 tile-grid rewrite
date: 2026-06-19
written_against_commit: dda45ec1
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 2026-06-19-001
addresses: QUAL-05
---

# Plan 001: Encode relief sparsely on disk (v2) without touching the in-memory hot path

> **Executor instructions**: Follow steps in order. Step 1 (the codec) is pure and unit-tested — get it
> green before wiring it into serialization. Run every verification command and confirm the expected
> result before the next step. If a STOP condition occurs, stop and report — do not improvise. When done,
> update this plan's row in `docs/plans/2026-06-17-000-island-editor-improvements-overview.md` (Phase-2
> table) — unless a reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dda45ec1..HEAD -- island-editor/src/terrain/islandSpec.ts island-editor/src/editor/exportSpec.ts island-editor/src/editor/persistence.ts island-editor/src/App.tsx island-editor/test/exportSpec.test.ts island-editor/test/persistence.test.ts`
> If any changed, compare the "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3 (modest standalone value; foundational for agent-diffable specs and lower undo memory)
- **Effort**: M
- **Risk**: MED (touches the validator + persistence everything relies on — but the in-memory contract is unchanged and the path is well-tested)
- **Depends on**: none. Synergistic with 002 (agent CLI) and 003 (engine binding): both round-trip specs, so landing the format first means they build against v2.
- **Category**: perf / tech-debt
- **Planned at**: commit `dda45ec1`, 2026-06-19

## Why this matters

`IslandSpec.relief` is a dense `192² = 36,864`-float grid. It is serialized **whole** on every autosave
(`persistence.ts:25`) and export, and **every brush stroke stores two full copies** of it in the undo
stack (`App.tsx:168` `strokeBefore`, `:179` `after` — each a `data.slice()`). A real island is almost
always **mostly zero** (the brush paints a small fraction). The cost is threefold: (1) undo memory —
200 strokes × two 36,864-float arrays; (2) localStorage churn — the whole grid re-serialized every
400 ms while painting; (3) **agent-hostility** — a 36,864-entry array is impossible to diff or author by
hand, which blocks the agent-editing direction (see plan 002 and `docs/island-editor-agent-editing-design.md`).

**Key design choice (do not deviate):** the relief stays **dense in memory** — `ReliefGrid.data` remains
a `number[]` of length `resolution²`, and `brush.ts`, `reliefAt`, `evaluateHeight`,
`buildTerrainGeometry.ts`, and `App.tsx`'s `reliefRef` are **untouched**. Sparseness is purely a
**serialization concern**: we encode sparse on the way to JSON and decode back to dense on the way in.
This keeps the brush write path (`applyBrush` mutates `data[i]` in place) and the bilinear read path
(`reliefAt`, four `data[...]` index lookups) at full speed and zero blast radius.

## Current state

- `island-editor/src/terrain/islandSpec.ts`:
  - `ReliefGrid` (lines 24-29): `{ resolution: number; data: number[] }` — `data.length === resolution²`.
  - `IslandSpec` (lines 31-39): `version: 1`, `worldSize`, `coastline`, `heightProfile`, `relief`.
  - `reliefAt` (lines 128-148): bilinear sample — `data[z0*res+x0]`, `data[z0*res+x1]`, `data[z1*res+x0]`,
    `data[z1*res+x1]`. **This must keep O(1) `data[i]` access — do not make it read a Map.**
  - `seedFromCurrentIsland` (lines 183-206): returns `version: 1`, `relief.data = new Array(192*192).fill(0)`.
- `island-editor/src/editor/exportSpec.ts`:
  - `serializeSpec` (lines 5-7): `return JSON.stringify(spec, null, 2)` — writes the whole dense grid.
  - `validateRelief` (lines 33-41): requires `data` is an array with `data.length === resolution²`.
  - `validateSpecObject` (lines 44-84): rejects `version !== 1` (line 51); validates `relief` via
    `validateRelief` (line 77); returns `parsed as IslandSpec`.
  - `deserializeSpec` (lines 86-94): `JSON.parse` then `validateSpecObject`.
- `island-editor/src/editor/persistence.ts`:
  - `saveSpec` (lines 17-26): validates, then `s.setItem(STORAGE_KEY, JSON.stringify(spec))` — **bypasses
    `serializeSpec`; this is why autosave never benefits from any encoding unless we change it here.**
  - `loadSpec` (lines 28-38): `validateSpecObject(JSON.parse(raw))`.
  - `STORAGE_KEY = 'island-editor:spec:v1'` (line 10).
- `island-editor/src/App.tsx`:
  - The `spec` memo (lines 66-75) hardcodes `version: 1`.
- Tests to keep green: `island-editor/test/exportSpec.test.ts`, `island-editor/test/persistence.test.ts`
  (13 + 14 cases). Read them — some assert `version === 1` and dense round-trips; you will extend, not break, them.

Repo convention: strict TS (`strict: true`), immutable update style, Vitest with files under `test/`.
The pure core has **no three imports** — keep `reliefCodec.ts` framework-free and headless-testable.

## Commands you will need

| Purpose | Command (from repo root) | Expected |
|---|---|---|
| Typecheck | `pnpm --filter island-editor typecheck` | exit 0 |
| Tests | `pnpm --filter island-editor test` | all pass (53 existing + new `reliefCodec` cases) |
| Both gates | `pnpm check:island-editor` | exit 0 |

## Scope

**In scope** (create/modify):
- `island-editor/src/editor/reliefCodec.ts` (create — pure encode/decode + the on-disk sparse type)
- `island-editor/test/reliefCodec.test.ts` (create — round-trip + threshold tests)
- `island-editor/src/terrain/islandSpec.ts` (bump `version` literal `1`→`2`; `seedFromCurrentIsland` emits `version: 2`)
- `island-editor/src/editor/exportSpec.ts` (`serializeSpec` encodes; `validateSpecObject` accepts v1+v2 and **decodes relief to dense**; extend `validateRelief`)
- `island-editor/src/editor/persistence.ts` (`saveSpec` uses `serializeSpec`, not raw `JSON.stringify`)
- `island-editor/src/App.tsx` (the `spec` memo `version: 1`→`2` — one line)
- `island-editor/test/exportSpec.test.ts`, `island-editor/test/persistence.test.ts` (extend for v2/sparse + legacy-v1 load)

**Out of scope** (do NOT touch):
- `island-editor/src/terrain/brush.ts`, `reliefAt`/`evaluateHeight` in `islandSpec.ts`,
  `buildTerrainGeometry.ts`, `App.tsx`'s `reliefRef`/`paint`/undo wiring — relief stays **dense in memory**.
- The undo stack's per-stroke `data.slice()` — reducing that is a possible follow-up (see Maintenance), not this plan.
- `scripts/poc-apply-op.mjs` — throwaway; ignore.

## Git workflow

- Branch: `advisor/2026-06-19-001-sparse-relief`.
- Commit per step; conventional commits (e.g. `perf(island-editor): sparse relief codec`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pure relief codec + tests

Create `island-editor/src/editor/reliefCodec.ts`:

```ts
import type { ReliefGrid } from '../terrain/islandSpec'

/** On-disk sparse form: only nonzero cells, as {index, height} pairs (agent-diffable). */
export interface SparseRelief {
  resolution: number
  encoding: 'sparse'
  entries: { i: number; h: number }[]
}

/** A serialized relief is either the legacy dense grid or the sparse form. */
export type SerializedRelief = ReliefGrid | SparseRelief

export function isSparseRelief(r: unknown): r is SparseRelief {
  return typeof r === 'object' && r !== null && (r as { encoding?: unknown }).encoding === 'sparse'
}

/**
 * Encode a dense grid for storage. Returns the sparse form ONLY when it is a
 * clear win — nonzero cells × 3 < resolution² (each {i,h} pair costs ~3× a bare
 * dense number in JSON, so this guarantees the sparse form is smaller). Otherwise
 * returns the dense grid unchanged. Lossless either way.
 */
export function encodeRelief(grid: ReliefGrid): SerializedRelief {
  const entries: { i: number; h: number }[] = []
  for (let i = 0; i < grid.data.length; i++) {
    if (grid.data[i] !== 0) entries.push({ i, h: grid.data[i] })
  }
  if (entries.length * 3 < grid.resolution * grid.resolution) {
    return { resolution: grid.resolution, encoding: 'sparse', entries }
  }
  return { resolution: grid.resolution, data: grid.data.slice() }
}

/** Expand any serialized relief back to a dense grid. Dense input is cloned through. */
export function decodeRelief(serialized: SerializedRelief): ReliefGrid {
  if (isSparseRelief(serialized)) {
    const data = new Array(serialized.resolution * serialized.resolution).fill(0)
    for (const { i, h } of serialized.entries) {
      if (i >= 0 && i < data.length) data[i] = h
    }
    return { resolution: serialized.resolution, data }
  }
  return { resolution: serialized.resolution, data: serialized.data.slice() }
}
```

Create `island-editor/test/reliefCodec.test.ts` (pattern: `test/coastlineOps.test.ts` / `test/brush.test.ts`). Cover:
- Round-trip: a mostly-zero grid → `decodeRelief(encodeRelief(g))` deep-equals the original `data`.
- Round-trip on a fully-dense (no zeros) grid → encode returns the **dense** branch (`'data' in result`), decode restores it.
- `encodeRelief` chooses sparse when few nonzeros (assert `isSparseRelief` true; `entries.length` correct).
- `encodeRelief` chooses dense when >⅓ filled (assert `'data' in result`).
- `decodeRelief` clamps/ignores out-of-range indices without throwing.
- Float identity preserved (e.g. `h = 0.37` survives round-trip exactly).

**Verify**: `pnpm --filter island-editor test` → all pass incl. new file; `pnpm --filter island-editor typecheck` → exit 0.

### Step 2: Bump the version literal to 2

In `island-editor/src/terrain/islandSpec.ts`: change `IslandSpec.version` from `version: 1` to `version: 2`
(line 32), and in `seedFromCurrentIsland` change the returned `version: 1` to `version: 2` (line 191).
In `island-editor/src/App.tsx`, the `spec` memo (line 68) `version: 1` → `version: 2`.

**Verify**: `pnpm --filter island-editor typecheck` → exit 0 (expect type errors only where `version: 1`
literals remain — fix those; do NOT widen the type to `1 | 2` in the interface, the in-memory current
version is 2).

### Step 3: Encode on serialize, decode + accept v1/v2 on validate

In `island-editor/src/editor/exportSpec.ts`:

- `serializeSpec`:
  ```ts
  import { encodeRelief } from './reliefCodec'
  export function serializeSpec(spec: IslandSpec): string {
    return JSON.stringify({ ...spec, version: 2, relief: encodeRelief(spec.relief) }, null, 2)
  }
  ```
- Extend `validateRelief` to accept the sparse shape too (resolution finite; if `encoding === 'sparse'`,
  `entries` is an array of `{ i: finite int in [0, resolution²), h: finite number }`; else the existing
  dense check).
- In `validateSpecObject`: accept `o.version === 1 || o.version === 2` (line 51). After all field checks
  pass, **decode relief to dense and normalize version** before returning, so callers always get a dense
  in-memory spec:
  ```ts
  import { decodeRelief } from './reliefCodec'
  // ...after validation:
  return { ...(parsed as object), version: 2, relief: decodeRelief(o.relief as SerializedRelief) } as IslandSpec
  ```
  (Legacy v1 files have dense `relief`; `decodeRelief` clones them through — a safe no-op.)

**Verify**: `pnpm --filter island-editor typecheck` → exit 0; existing `test/exportSpec.test.ts` — run it,
update any assertion that pinned `version === 1` or expected `serializeSpec` to emit a dense `data` array
for a mostly-zero grid. Add a case: `deserializeSpec(serializeSpec(seed))` deep-equals the seed's dense relief.

### Step 4: Make autosave use the encoder

In `island-editor/src/editor/persistence.ts`, `saveSpec` (line 25): replace
`s.setItem(STORAGE_KEY, JSON.stringify(spec))` with `s.setItem(STORAGE_KEY, serializeSpec(spec))`
(import `serializeSpec` from `./exportSpec`). `loadSpec` already routes through `validateSpecObject`,
which now decodes — no change needed there beyond confirming it returns dense.

**Verify**: `pnpm --filter island-editor test` → `test/persistence.test.ts` passes; add a case: save a
mostly-zero spec, read the raw `localStorage` string, assert it contains `"encoding": "sparse"` and is
**shorter** than `JSON.stringify(spec)`; then `loadSpec()` returns a spec whose `relief.data` deep-equals
the original. Add a **legacy** case: hand-write a `version: 1` dense spec into storage, `loadSpec()` returns
it correctly (migration path).

## Test plan

- New `test/reliefCodec.test.ts`: round-trip (sparse + dense branches), threshold selection, float
  identity, out-of-range tolerance. Pattern: `test/coastlineOps.test.ts`.
- Extend `test/exportSpec.test.ts`: v2 serialize emits sparse for mostly-zero; `deserializeSpec` of both a
  v1 dense file and a v2 sparse file yields identical dense relief; round-trip identity.
- Extend `test/persistence.test.ts`: autosave writes sparse + shorter; legacy v1 load still works.
- Verification: `pnpm check:island-editor` → exit 0; total test count rises from 53.

## Done criteria

ALL must hold:

- [ ] `reliefCodec.ts` exists; `encodeRelief`/`decodeRelief` are pure, lossless, and never mutate input.
- [ ] `pnpm --filter island-editor typecheck` exits 0.
- [ ] `pnpm --filter island-editor test` exits 0 with new `reliefCodec.test.ts` and the extended export/persistence cases passing.
- [ ] A mostly-zero spec serializes to JSON containing `"encoding": "sparse"` and shorter than the dense form.
- [ ] A legacy `version: 1` dense spec still loads (round-trips to identical dense relief).
- [ ] `grep -n "data\[" island-editor/src/terrain/islandSpec.ts island-editor/src/terrain/brush.ts` is unchanged — the in-memory hot path was not touched.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview Phase-2 status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- Making relief sparse would require changing `reliefAt`, `applyBrush`, `evaluateHeight`, or
  `buildTerrainGeometry` — that means you've put sparseness in memory instead of at the boundary; the
  design says **dense in memory**. Re-read "Why this matters."
- `validateSpecObject` decoding breaks a caller that mutated `relief.data` expecting a particular identity
  (search usages of the validator's return value).
- The drift check shows `exportSpec.ts`/`persistence.ts`/`islandSpec.ts` already grew version-2 handling.

## Maintenance notes

- The undo stack still stores **dense** per-stroke snapshots (`App.tsx:168,179`). Shrinking *that*
  (e.g. store only the dirtied cell-range or a sparse diff per stroke) is a deliberate follow-up — it
  changes the undo wiring, not the format, so it was kept out of this plan.
- `version: 2` is now the only emitted format; v1 is read-only (legacy). If a third format is ever needed,
  keep the same pattern: accept all past versions on input, decode to dense, emit the latest.
- Reviewer should scrutinize: losslessness (float identity), the encode threshold (no silent precision
  loss), and that legacy v1 specs in real users' localStorage still load.
</content>
</invoke>
