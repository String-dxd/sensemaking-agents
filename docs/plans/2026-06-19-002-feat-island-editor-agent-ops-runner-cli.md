---
title: Island editor — agent op-runner (applyOps) + CLI
type: feat
status: proposed
date: 2026-06-19
written_against_commit: dda45ec1
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 2026-06-19-002
addresses: REMAIN-03 (binding option a — CLI; option c remains blocked on plan 003)
---

# Plan 002: Build the agent op-runner and a CLI, importing the real pure core

> **Executor instructions**: Follow steps in order. Steps 1–3 (types + runner + tests) are pure and the
> CI gate — get them green before the CLI in step 4. Run every verification command. If a STOP condition
> occurs, stop and report. When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md` (Phase-2 table) — unless a reviewer
> dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dda45ec1..HEAD -- island-editor/src/terrain/coastlineOps.ts island-editor/src/terrain/brush.ts island-editor/src/terrain/islandSpec.ts island-editor/src/editor/exportSpec.ts island-editor/docs island-editor/scripts/poc-apply-op.mjs docs/island-editor-agent-editing-design.md`
> If any changed, compare the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2 (turns the agent-editing design doc into working, testable code; unblocks CLI-based agent edits today)
- **Effort**: M
- **Risk**: LOW (all new files in `island-editor/`; reuses existing pure helpers; no product-engine changes)
- **Depends on**: none to build. **Coordinate with plan 001**: import the shared `serializeSpec`/`deserializeSpec`/`validateSpecObject` (do NOT reimplement) so the runner inherits the v2 sparse format automatically.
- **Category**: feature / agent-editability
- **Planned at**: commit `dda45ec1`, 2026-06-19

## Why this matters

`docs/island-editor-agent-editing-design.md` specifies an op vocabulary and an `applyOps(spec, ops)` runner
so an agent can edit an island deterministically (read spec → emit ops → get a validated spec back).
Today only a **throwaway PoC** exists (`island-editor/scripts/poc-apply-op.mjs`) that inlines one op to
prove the clone-then-validate loop. The design doc's "binding option (a) — CLI invoked by a coding agent"
is **buildable now, with zero product changes** (option (c), the in-product managed-agent tool, stays
blocked on the engine consuming a spec — plan 003). This plan builds the real runner against the real
pure core (`coastlineOps.ts`, `brush.ts`, `islandSpec.ts`) plus a thin CLI.

## Current state

- `island-editor/src/terrain/coastlineOps.ts` (full, 28 lines): `insertPointAfter(points, index)`,
  `deletePoint(points, index)` (no-op below 3 points), `movePointTo(points, index, next)` — all pure,
  immutable. **The runner's coastline ops MUST call these, not reimplement.**
- `island-editor/src/terrain/brush.ts`: `applyBrush(relief, worldSize, cx, cz, params)` — **mutates
  `relief.data` in place** (lines 38-97). `BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'`,
  `BrushParams = { radius, strength, mode }`. The runner must **clone `relief.data` first**, then call
  `applyBrush` on the clone (the PoC's key rule — `scripts/poc-apply-op.mjs:32-38`).
- `island-editor/src/terrain/islandSpec.ts`: `IslandSpec`, `Vec2`, `HeightProfile`, `ReliefGrid` types.
  `seedFromCurrentIsland()` for test fixtures.
- `island-editor/src/editor/exportSpec.ts`: `serializeSpec(spec)`, `deserializeSpec(json)`,
  `validateSpecObject(parsed)` (throws on invalid). **Re-validate the final spec through
  `validateSpecObject` and serialize/deserialize through these — do not roll your own.**
- `island-editor/scripts/poc-apply-op.mjs` (full, 57 lines): the throwaway reference. Note its header:
  "The real runner must import the actual pure core (islandSpec.ts/brush.ts via tsx)." This plan delivers that.
- Op vocabulary from `docs/island-editor-agent-editing-design.md` (lines ~87-157): `movePoint`,
  `insertPointAfter`, `deletePoint`, `setHeightProfile`, `raiseRegion`, `lowerRegion`, `smoothRegion`,
  `flattenRegion`, `clearRelief`, `scaleIsland`, `resizeWorld`. **This plan implements all EXCEPT
  `scaleIsland` and `resizeWorld`** (they reinterpret coordinates and warrant their own slice — note them
  as deferred). The runner design (lines ~206-237): fold ops, never throw mid-batch, collect errors, skip
  bad ops, re-validate at the end.

Repo convention: strict TS, immutable updates, Vitest under `test/`, framework-free pure core.

## Commands you will need

| Purpose | Command (from repo root) | Expected |
|---|---|---|
| Typecheck | `pnpm --filter island-editor typecheck` | exit 0 |
| Tests | `pnpm --filter island-editor test` | all pass (existing + new `applyOps` cases) |
| Both gates | `pnpm check:island-editor` | exit 0 |
| CLI smoke (step 4) | `pnpm --filter island-editor apply-ops <spec.json> <ops.json>` | prints a valid spec to stdout |

## Scope

**In scope** (create):
- `island-editor/src/agent/ops.ts` (op type union)
- `island-editor/src/agent/applyOps.ts` (the runner)
- `island-editor/test/applyOps.test.ts` (unit tests)
- `island-editor/scripts/apply-ops.mjs` (CLI wrapper)
- `island-editor/package.json` (add an `apply-ops` script; add `tsx` to devDependencies **only if absent**)

**Out of scope** (do NOT touch):
- `coastlineOps.ts`, `brush.ts`, `islandSpec.ts`, `exportSpec.ts` — import them; do not modify.
- `scripts/poc-apply-op.mjs` — leave as-is (now superseded; deletion is the maintainer's call).
- `scaleIsland` / `resizeWorld` ops — deferred to a follow-up slice.
- Anything under `src/` (the product engine) — option (c) is blocked on plan 003.

## Git workflow

- Branch: `advisor/2026-06-19-002-agent-ops-cli`.
- Commit per step; conventional commits (e.g. `feat(island-editor): applyOps runner`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Op type union

Create `island-editor/src/agent/ops.ts`:

```ts
import type { HeightProfile } from '../terrain/islandSpec'

export type Op =
  | { op: 'movePoint'; index: number; x: number; z: number }
  | { op: 'insertPointAfter'; index: number }
  | { op: 'deletePoint'; index: number }
  | { op: 'setHeightProfile'; profile: Partial<HeightProfile> }
  | { op: 'raiseRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'lowerRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'smoothRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'flattenRegion'; x: number; z: number; radius: number; strength: number }
  | { op: 'clearRelief' }

export interface OpError {
  index: number // position in the ops array
  op: string
  message: string
}
```

**Verify**: `pnpm --filter island-editor typecheck` → exit 0.

### Step 2: The runner

Create `island-editor/src/agent/applyOps.ts`. It folds ops over the spec immutably, never throws
mid-batch, collects errors, skips bad ops, and re-validates the final spec.

```ts
import { applyBrush, type BrushMode } from '../terrain/brush'
import { deletePoint, insertPointAfter, movePointTo } from '../terrain/coastlineOps'
import type { IslandSpec } from '../terrain/islandSpec'
import { validateSpecObject } from '../editor/exportSpec'
import type { Op, OpError } from './ops'

const RELIEF_MODES: Record<string, BrushMode> = {
  raiseRegion: 'raise', lowerRegion: 'lower', smoothRegion: 'smooth', flattenRegion: 'flatten',
}

function applyOne(spec: IslandSpec, op: Op): IslandSpec {
  switch (op.op) {
    case 'movePoint':
      return { ...spec, coastline: movePointTo(spec.coastline, op.index, { x: op.x, z: op.z }) }
    case 'insertPointAfter':
      return { ...spec, coastline: insertPointAfter(spec.coastline, op.index) }
    case 'deletePoint': {
      const next = deletePoint(spec.coastline, op.index)
      if (next.length === spec.coastline.length) throw new Error('cannot delete below 3 points')
      return { ...spec, coastline: next }
    }
    case 'setHeightProfile':
      return { ...spec, heightProfile: { ...spec.heightProfile, ...op.profile } }
    case 'clearRelief':
      return { ...spec, relief: { resolution: spec.relief.resolution, data: new Array(spec.relief.data.length).fill(0) } }
    case 'raiseRegion':
    case 'lowerRegion':
    case 'smoothRegion':
    case 'flattenRegion': {
      const data = spec.relief.data.slice() // clone BEFORE the in-place brush
      const relief = { resolution: spec.relief.resolution, data }
      applyBrush(relief, spec.worldSize, op.x, op.z, { radius: op.radius, strength: op.strength, mode: RELIEF_MODES[op.op] })
      return { ...spec, relief }
    }
  }
}

/** Fold ops over a spec. Never throws mid-batch; bad ops are skipped and recorded. */
export function applyOps(spec: IslandSpec, ops: Op[]): { spec: IslandSpec; errors: OpError[] } {
  let current = spec
  const errors: OpError[] = []
  ops.forEach((op, index) => {
    try {
      current = applyOne(current, op)
    } catch (e) {
      errors.push({ index, op: (op as { op?: string }).op ?? 'unknown', message: e instanceof Error ? e.message : String(e) })
    }
  })
  try {
    validateSpecObject(current) // final gate; throws if the batch produced an invalid spec
  } catch (e) {
    errors.push({ index: -1, op: 'validate', message: e instanceof Error ? e.message : String(e) })
  }
  return { spec: current, errors }
}
```

**Verify**: `pnpm --filter island-editor typecheck` → exit 0.

### Step 3: Unit tests

Create `island-editor/test/applyOps.test.ts` (pattern: `test/coastlineOps.test.ts`, fixture from
`seedFromCurrentIsland()`). Cover:
- `movePoint` updates one point; input spec untouched (immutability).
- `insertPointAfter` grows the coastline by 1; `deletePoint` shrinks by 1.
- `deletePoint` at 3 points records an `OpError` (index set), spec unchanged, **batch continues**.
- `setHeightProfile` merges partial fields, leaving others intact.
- `raiseRegion` makes `reliefAt(spec, x, z)` increase at the center while the **input spec's relief stays
  all-zero** (clone-before-brush).
- `clearRelief` zeroes the grid.
- A batch with one bad op + several good ops: good ops apply, error is collected, final spec validates.
- The returned spec passes `validateSpecObject` (no throw).

**Verify**: `pnpm --filter island-editor test` → all pass; `pnpm check:island-editor` → exit 0.

### Step 4: CLI wrapper

First check `island-editor/package.json`: if `tsx` is not in `devDependencies`, add it
(`pnpm --filter island-editor add -D tsx`). Add a script: `"apply-ops": "tsx scripts/apply-ops.mjs"`.

Create `island-editor/scripts/apply-ops.mjs`:
- `import { readFileSync, writeFileSync } from 'node:fs'`
- Read `process.argv[2]` (spec path) and `process.argv[3]` (ops path); if missing, print usage to stderr, `process.exit(1)`.
- `import { deserializeSpec, serializeSpec } from '../src/editor/exportSpec'` and
  `import { applyOps } from '../src/agent/applyOps'` (tsx resolves the TS).
- `const { spec, errors } = applyOps(deserializeSpec(readFileSync(specPath,'utf8')), JSON.parse(readFileSync(opsPath,'utf8')))`
- If `errors.length`, print them to stderr. Write/print `serializeSpec(spec)`: if `process.argv[4]` is an
  output path, `writeFileSync` it; else print to stdout. Exit `1` if any error, else `0`.

**Verify** (manual smoke): create a tmp `spec.json` (from `seedFromCurrentIsland`, or export one from the
editor) and a tmp `ops.json` like `[{"op":"raiseRegion","x":0,"z":0,"radius":4,"strength":0.5}]`, then
`pnpm --filter island-editor apply-ops /tmp/spec.json /tmp/ops.json` → prints a valid spec with raised
relief; exit 0. A bad op (e.g. `deletePoint` to <3) → error on stderr, exit 1.

## Test plan

- New `test/applyOps.test.ts`: per-op behavior, immutability, error collection, batch-continues-after-error,
  final validation. Pattern: `test/coastlineOps.test.ts`.
- CLI is covered by the manual smoke above (it is a thin I/O wrapper; the logic is in `applyOps`, which is
  unit-tested). Do not add a test that shells out.
- Verification: `pnpm check:island-editor` → exit 0; total test count rises.

## Done criteria

ALL must hold:

- [ ] `applyOps(spec, ops)` returns `{ spec, errors }`, never throws, and re-validates the final spec.
- [ ] Coastline ops call `coastlineOps.ts`; relief ops clone then call `applyBrush` (input spec never mutated).
- [ ] `pnpm --filter island-editor typecheck` exits 0; `pnpm --filter island-editor test` exits 0 with new `applyOps.test.ts` passing.
- [ ] `pnpm --filter island-editor apply-ops <spec> <ops>` prints a valid spec; bad-op batch exits 1 with stderr errors.
- [ ] `grep -rn "scaleIsland\|resizeWorld" island-editor/src/agent/` returns nothing (deferred, not stubbed).
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview Phase-2 status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- The CLI cannot import the TS core (tsx missing and `pnpm add -D tsx` fails) — report; do not inline the
  core into the CLI as the PoC did (that defeats the plan).
- Re-validation after a normal batch fails for a reason other than a deliberately-bad test op — the op
  semantics may have drifted from the pure helpers; STOP and report.
- The drift check shows `coastlineOps.ts`/`brush.ts` signatures changed from the excerpts above.

## Maintenance notes

- `scaleIsland` and `resizeWorld` are deferred — they reinterpret coordinates (and `resizeWorld` rescales
  the relief grid's world bounds); add them as a second slice with their own tests.
- This is binding option (a) (CLI). Option (c) — an in-product managed-agent tool — stays blocked until the
  engine consumes a spec (plan 003). When 003 lands, `applyOps` is the runner that tool would call.
- Keep `applyOps` importing the shared `validateSpecObject`/`serializeSpec`/`deserializeSpec` so it tracks
  the v2 sparse format from plan 001 automatically.
- Reviewer should scrutinize: immutability (no input mutation across any op), and that the runner truly
  never throws mid-batch (every op path is inside the try).
</content>
