---
title: Island editor quality cleanups — unify spec validators + wire a check gate
type: refactor
status: proposed
date: 2026-06-17
written_against_commit: b6dc287d
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 002
---

# Plan 002: Unify the two spec validators and put island-editor behind a check gate

> **Executor instructions**: Follow each step in order; run every verification command and confirm the
> expected result before moving on. If a STOP condition occurs, stop and report — do not improvise.
> When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md`.
>
> **Drift check (run first)**:
> `git diff --stat b6dc287d..HEAD -- island-editor/src/editor/persistence.ts island-editor/src/editor/exportSpec.ts package.json CLAUDE.md`
> If any of these changed since this plan was written, compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (cheap, low-risk, unblocks confidence in 001/003/004)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / dx
- **Planned at**: commit `b6dc287d`, 2026-06-17

## Why this matters

Two hand-rolled validators describe the same `IslandSpec` type with **different strictness**:
`exportSpec.deserializeSpec` enforces `relief.data.length === resolution²`, but
`persistence.isValidSpec` does not. A localStorage spec with a mismatched relief therefore loads as
"valid" through one path and is rejected through the other — and the duplicated logic will keep
drifting. Collapsing both onto one canonical validator removes the divergence and gives plan 001's
agent-editing runner a single function to trust. Separately, the standalone editor is its own isolated
pnpm workspace, so the repo's documented gate (`pnpm check`) never typechecks or tests it — a
regression there ships silently. One small script closes that hole.

## Current state

- `island-editor/src/editor/exportSpec.ts` — `deserializeSpec(json)` (line 43) is the **canonical,
  detailed** validator. Its body parses JSON (throwing `'Invalid island spec: malformed JSON'` on
  failure), then runs field checks that throw specific messages the tests assert (e.g.
  `'Invalid island spec: coastline[2] must be {x: number, z: number}'`). It uses local helpers
  `validateVec2` (15), `validateHeightProfile` (21), `validateRelief` (33 — **this one checks the
  `data.length === resolution²`**). Current shape:
  ```ts
  export function deserializeSpec(json: string): IslandSpec {
    let parsed: unknown
    try { parsed = JSON.parse(json) } catch (e) { throw new Error('Invalid island spec: malformed JSON') }
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid island spec: root must be an object')
    const o = parsed as Record<string, unknown>
    if (o.version !== 1) throw new Error(`Invalid island spec: version must be 1, got ${String(o.version)}`)
    // ...worldSize, coastline (incl. per-index), heightProfile, relief checks...
    return parsed as IslandSpec
  }
  ```
- `island-editor/src/editor/persistence.ts` — `isValidSpec(obj)` (lines 22–48) is a **separate,
  looser** boolean validator (no relief-length check), used only by `loadSpec` (line 50):
  ```ts
  function isValidSpec(obj: unknown): obj is IslandSpec { /* ...no data.length check... */ }
  export function loadSpec(storage?: StorageLike | null): IslandSpec | null {
    try {
      const s = storage !== undefined ? storage : defaultStorage()
      if (!s) return null
      const raw = s.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      if (!isValidSpec(parsed)) return null
      return parsed
    } catch { return null }
  }
  ```
  `isValidSpec` is **not exported** (only `loadSpec`/`saveSpec`/`clearSaved`/`createAutosaver`/
  `STORAGE_KEY`/`StorageLike` are), so removing it breaks no external import.
- `package.json` (repo root) — `"check": "biome check src test && tsc --noEmit"` (scoped to `src test`,
  excludes `island-editor`). No `island-editor` reference anywhere in root scripts.
- `island-editor/package.json` — has `"typecheck": "tsc --noEmit"` and `"test": "vitest run"`.
- `CLAUDE.md` — the `## Commands` section lists repo commands; `pnpm check` is described as
  "Biome + `tsc --noEmit` (run before declaring a change done)".

Repo convention: TS is strict (`island-editor/tsconfig.json` has `strict`, `noUnusedLocals`,
`noUnusedParameters`) — do not leave unused locals/params.

## Commands you will need

| Purpose | Command (run from repo root) | Expected on success |
|---|---|---|
| Typecheck editor | `pnpm --dir island-editor typecheck` | exit 0, no errors |
| Test editor | `pnpm --dir island-editor test` | 43 tests pass (43+ after Step 1) |
| New root gate | `pnpm check:island-editor` | runs both above, exit 0 |
| Old validator gone | `grep -rn "isValidSpec" island-editor/src` | no matches |

## Scope

**In scope** (the only files you may modify/create):
- `island-editor/src/editor/exportSpec.ts` (extract a reusable validator)
- `island-editor/src/editor/persistence.ts` (delete the duplicate, reuse the canonical one)
- `island-editor/test/persistence.test.ts` (add one regression test — Step 1)
- `package.json` (repo root — add one script)
- `CLAUDE.md` (add one Commands bullet)

**Out of scope** (do NOT touch):
- The `IslandSpec` type or any terrain math (`islandSpec.ts`, `brush.ts`) — validation only.
- The detailed error messages in `deserializeSpec` — the export tests assert them verbatim; preserve them.
- The root `check`/`lint`/`format` scripts — add a *new* script, don't fold island-editor into `check`
  (it would slow the main-app loop the team runs constantly).

## Git workflow

- Branch: `advisor/002-island-editor-quality-cleanups`.
- Commit style: conventional commits (e.g. `refactor(island-editor): unify spec validators`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extract `validateSpecObject` and reuse it in `loadSpec`

In `island-editor/src/editor/exportSpec.ts`, split `deserializeSpec` so the **object-level** checks
live in a new exported function and `deserializeSpec` only does the JSON parse:

```ts
/** Validate an already-parsed value as an IslandSpec; throws with a field-level message on failure. */
export function validateSpecObject(parsed: unknown): IslandSpec {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid island spec: root must be an object')
  }
  const o = parsed as Record<string, unknown>
  // ↓ move every existing check here UNCHANGED (version, worldSize, coastline + per-index,
  //   heightProfile, relief) — same messages, same order.
  // ...
  return parsed as IslandSpec
}

export function deserializeSpec(json: string): IslandSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid island spec: malformed JSON')
  }
  return validateSpecObject(parsed)
}
```

Then in `island-editor/src/editor/persistence.ts`: **delete** `isValidSpec` (lines 22–48), import the
canonical validator, and rewrite `loadSpec` to use it:

```ts
import { validateSpecObject } from './exportSpec'
// ...
export function loadSpec(storage?: StorageLike | null): IslandSpec | null {
  try {
    const s = storage !== undefined ? storage : defaultStorage()
    if (!s) return null
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return null
    return validateSpecObject(JSON.parse(raw))
  } catch {
    return null
  }
}
```

(There is no circular import: `exportSpec.ts` imports only types from `../terrain/islandSpec`;
`persistence.ts` may import from `./exportSpec` freely.)

Add one regression test to `island-editor/test/persistence.test.ts` (follow the existing
`loadSpec returns null when ...` cases as the pattern) proving the strictness is now shared:

```ts
it('loadSpec returns null when relief.data length != resolution²', () => {
  const storage = makeStorage()
  const spec = { ...seedFromCurrentIsland(), relief: { resolution: 4, data: [0, 1, 2] } }
  storage.setItem(STORAGE_KEY, JSON.stringify(spec))
  expect(loadSpec(storage)).toBeNull()
})
```

**Verify**:
- `pnpm --dir island-editor test` → all pass (44 now, incl. the new case).
- `pnpm --dir island-editor typecheck` → exit 0.
- `grep -rn "isValidSpec" island-editor/src` → no matches.

### Step 2: Add a root check gate for the standalone editor

In the repo-root `package.json` `scripts`, add:

```json
"check:island-editor": "pnpm --dir island-editor typecheck && pnpm --dir island-editor test",
```

In `CLAUDE.md`, in the `## Commands` block, add one bullet immediately after the `pnpm check` line,
matching the existing bullet style:

```
- `pnpm check:island-editor` — typecheck + tests for the standalone island editor (its own isolated workspace; **not** covered by `pnpm check`)
```

**Verify**: `pnpm check:island-editor` (from repo root) → runs typecheck then tests, exit 0.

> Escape hatch: if `pnpm --dir island-editor ...` errors with a workspace/install issue (the editor is a
> separate pnpm workspace root, see `island-editor/pnpm-workspace.yaml`), confirm
> `island-editor/node_modules` exists; if not, run `pnpm --dir island-editor install` once. If it still
> fails, STOP and report — do not restructure the workspaces.

## Test plan

- New test in `island-editor/test/persistence.test.ts`: a wrong-length relief in storage now loads as
  `null` (proves persistence shares export's strictness). Pattern: the existing
  `loadSpec returns null when relief.data is not an array` test.
- All existing export/persistence tests must stay green (the detailed-message assertions in
  `exportSpec.test.ts` confirm `validateSpecObject` preserved every message).
- Verification: `pnpm --dir island-editor test` → all pass including the new case.

## Done criteria

ALL must hold:

- [ ] `validateSpecObject` is exported from `exportSpec.ts`; `deserializeSpec` delegates to it.
- [ ] `grep -rn "isValidSpec" island-editor/src` → no matches.
- [ ] `pnpm --dir island-editor typecheck` exits 0.
- [ ] `pnpm --dir island-editor test` exits 0 with the new relief-length test present and passing.
- [ ] `pnpm check:island-editor` exists in root `package.json` and runs both, exit 0.
- [ ] `CLAUDE.md` `## Commands` has the new `pnpm check:island-editor` bullet.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- Any `exportSpec.test.ts` message assertion fails after the extract — it means a message changed;
  the extract must be byte-for-byte identical, only relocated.
- The drift check shows `persistence.ts` or `exportSpec.ts` already refactored.
- `pnpm --dir island-editor ...` cannot run after the install escape hatch.

## Maintenance notes

- `validateSpecObject` is now the single source of truth for "is this a valid `IslandSpec`?" — plan
  001's agent-editing runner and any future import path should call it, not re-implement checks.
- If the `IslandSpec` shape gains a field (e.g. a `name` or a sparse relief encoding from QUAL-05),
  update `validateSpecObject` once and both paths inherit it.
- Reviewer should confirm the relocated checks are identical and that `loadSpec` still swallows errors
  to `null` (never throws into the editor boot path at `App.tsx:22`).
