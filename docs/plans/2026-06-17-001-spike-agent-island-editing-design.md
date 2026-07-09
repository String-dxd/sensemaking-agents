---
title: Agent-editable island — design spike (op vocabulary, headless runner, binding)
type: spike
status: done — merged via 023eb2d3 (agent-editing design spike)
date: 2026-06-17
written_against_commit: b6dc287d
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 001
---

# Plan 001: Define how an agent edits the island spec (design spike — no shipping ops)

> **Executor instructions**: This is a **design/investigation spike**, NOT a build task. Your
> deliverable is a written design document (and one tiny throwaway proof-of-concept script), not a
> production feature. Do **not** implement the operation library, a CLI the product depends on, or any
> agent/MCP binding — the requester explicitly chose "design spike only." If you find yourself writing
> the real ops module, **STOP** (see STOP conditions). Run every verification command and confirm the
> expected result. When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md`.
>
> **Drift check (run first)**:
> `git diff --stat b6dc287d..HEAD -- island-editor/src/terrain/islandSpec.ts island-editor/src/terrain/brush.ts`
> If `islandSpec.ts` or `brush.ts` changed since this plan was written, re-read them and reconcile the
> "Current state" excerpts below before writing the design. On a material mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1 (the requester's headline ask)
- **Effort**: M (research + writing; no production code)
- **Risk**: LOW (produces a doc; touches no shipped code)
- **Depends on**: none. Stronger if 004 (coastline editing) has landed — its pure helpers are the seed
  op vocabulary — but this spike does not require it.
- **Category**: direction / dx
- **Planned at**: commit `b6dc287d`, 2026-06-17

## Why this matters

The island editor's core (`islandSpec.ts`, `brush.ts`, validators) is already pure and
framework-agnostic, which makes "an agent edits the island" *almost* free — except there is no
**semantic operation layer** an agent can call and no **entry point** to invoke it. Today an agent
would have to hand-author the raw JSON (including a flat array of `resolution²` relief floats) or
reverse-engineer the relief grid-index math. Before anyone builds that layer, we need a deliberate
contract: which operations, what shape, how they validate, and how an agent invokes them. This spike
produces that contract and surfaces the open questions, so the eventual build (a separate plan) is a
straight execution rather than a design-as-you-go.

## Current state

The facts to ground the design in — read these files yourself before writing:

- `island-editor/src/terrain/islandSpec.ts` — the **durable contract**. The spec shape (lines 31–39):
  ```ts
  export interface IslandSpec {
    version: 1
    worldSize: number                 // square world: X,Z each span [-worldSize/2, worldSize/2]
    coastline: Vec2[]                 // ordered control points of a closed Catmull-Rom loop
    heightProfile: HeightProfile      // seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth
    relief: ReliefGrid                // { resolution: N, data: number[] } length N², additive on land
  }
  ```
  Pure functions already present: `sampleCoastline` (44), `isInsidePolygon` (72), `distanceToPolygon`
  (85), `baseHeightAt` (113), `reliefAt` (128), `evaluateHeight` (151), `isInside` (160),
  `seedFromCurrentIsland` (183).
- `island-editor/src/terrain/brush.ts` — `applyBrush(relief, worldSize, cx, cz, p)` (line 38) **mutates
  a relief grid in place** by world coords; modes `raise|lower|smooth|flatten` (`BrushParams`, line 5).
  This is the relief primitive an agent op like `raiseRegion` would wrap.
- `island-editor/src/editor/exportSpec.ts` — `deserializeSpec(json)` (line 43) is the **canonical
  validator** (throws with field-level messages). After plan 002 lands, `validateSpecObject(parsed)`
  will be the reusable object-level validator. An agent's output must pass this.
- `island-editor/src/editor/commandStack.ts` — the editor's undo model: a `Command {do, undo}` stack.
  An immutable-op model (each op returns a *new* spec) maps cleanly onto this (`do`/`undo` swap whole
  specs or coastline/relief slices).
- **Consumption gap (important context, do not try to fix here)**: `grep -rn "IslandSpec\|evaluateHeight"
  src/` at the repo root returns nothing — the product engine (`src/engine/student-space/Game/State/
  Island.js`) still hard-codes terrain (`radius=5.0`, `silhouetteAt`, `heightAt`). So **in-product
  runtime agent editing is blocked** until the engine consumes a spec. Your binding section must say so.

There is **no README** in `island-editor/` and **no headless entry point** (export/import in
`exportSpec.ts:94,111` are browser-only — `Blob`, `FileReader`, `document.createElement`).

## Commands you will need

| Purpose | Command (run from repo root) | Expected on success |
|---|---|---|
| Drift check | `git diff --stat b6dc287d..HEAD -- island-editor/src/terrain/` | shows only expected changes |
| Run PoC (optional step) | `node island-editor/scripts/poc-apply-op.mjs` | prints a valid spec + "VALID ✓" |
| Confirm doc headings | `grep -c '^## ' docs/island-editor-agent-editing-design.md` | ≥ 8 |

## Scope

**In scope** (the only files you may create):
- `docs/island-editor-agent-editing-design.md` — the design document (the deliverable).
- `island-editor/scripts/poc-apply-op.mjs` — an OPTIONAL throwaway proof-of-concept (Step 4). Mark it
  clearly as a throwaway prototype in a header comment; it is not the real runner.

**Out of scope** (do NOT create or modify):
- `island-editor/src/terrain/islandOps.ts` or any production operation module — that is a *future*
  build plan, not this spike.
- Any MCP server, managed-agent prompt (`src/agents/*`), or tool binding.
- Any change to `islandSpec.ts`, `brush.ts`, the engine, or `package.json` scripts.

## Git workflow

- Branch: `advisor/001-agent-island-editing-spike`.
- Commit style: conventional commits (repo convention — e.g. `docs(island-editor): agent-editing design spike`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Draft the design document skeleton

Create `docs/island-editor-agent-editing-design.md` with these exact `##` section headings (the
verification greps for them):

1. `## Goal & non-goals`
2. `## The spec contract` — restate the `IslandSpec` shape (inline from `islandSpec.ts:31`) plus the
   coordinate system (square world centered at origin; `+x`/`+z`; relief grid row-major
   `data[z*res + x]` over the world bounds — confirm against `reliefAt` at `islandSpec.ts:128`).
3. `## Operation vocabulary`
4. `## Immutability & undo model`
5. `## Headless runner design`
6. `## Validation & verification`
7. `## Agent binding options`
8. `## Open questions`

**Verify**: `grep -c '^## ' docs/island-editor-agent-editing-design.md` → ≥ 8.

### Step 2: Fill the operation vocabulary

In `## Operation vocabulary`, produce a table of proposed semantic operations. Each operation is
**pure and immutable**: `(spec, args) => IslandSpec` (returns a new spec; never mutates input). Start
from this table (refine it — it is a seed, not gospel) and for each op name the existing primitive it
reuses:

| Op | Args | Semantics | Reuses |
|---|---|---|---|
| `movePoint` | `{ index, x, z }` | move one coastline control point | array map |
| `insertPointAfter` | `{ index }` | insert a midpoint on edge `(index → index+1)` | `coastlineOps` (plan 004) |
| `deletePoint` | `{ index }` | remove a control point (reject if it would drop below 3) | `coastlineOps` (plan 004) |
| `setHeightProfile` | `Partial<HeightProfile>` | patch profile fields | object spread |
| `raiseRegion` / `lowerRegion` / `smoothRegion` / `flattenRegion` | `{ x, z, radius, strength }` | one relief dab at world `(x,z)` | `applyBrush` (`brush.ts:38`) on a **cloned** grid |
| `clearRelief` | `{}` | zero the relief grid | new zeroed array |
| `scaleIsland` | `{ factor }` | scale coastline (and optionally relief) about origin | array map |
| `resizeWorld` | `{ worldSize }` | change world bounds (note: reinterprets relief coords) | field set |

For each op, note: pre-conditions, what it rejects, and whether it can produce an invalid spec (so the
runner must re-validate). Call out that `raiseRegion` et al. must `.slice()` the relief array before
calling `applyBrush` (which mutates in place) to preserve immutability.

**Verify**: the section contains a table with ≥ 8 ops, each citing a reuse source. (Self-review; no command.)

### Step 3: Specify the headless runner, validation, and binding

- `## Headless runner design`: define an input format — a JSON array of ops, e.g.
  `[{ "op": "movePoint", "index": 3, "x": 4.2, "z": -1.1 }, ...]` — and a function shape
  `applyOps(spec, ops[]) -> { spec, errors[] }` plus a thin CLI wrapper
  (`read spec.json + ops.json → apply → validate → write/print`). Specify how an unknown op or a
  failed precondition is reported (collect into `errors`, do not throw mid-batch).
- `## Validation & verification`: state that every runner output MUST pass `deserializeSpec` /
  `validateSpecObject` (plan 002's canonical validator) before being written. List candidate extra
  checks the validator does NOT cover (e.g. coastline self-intersection, NaN after scale) and
  recommend whether to add them.
- `## Agent binding options`: analyze three paths and give a recommendation:
  (a) **CLI invoked by a coding agent (e.g. Claude Code) today** — works now, no product changes;
  (b) an **MCP tool** wrapping `applyOps`;
  (c) an **in-product managed-agent tool** (e.g. Cartographer) — note this is **blocked on the
  consumption gap** (engine doesn't read `IslandSpec`; see Current state). Recommend (a) as the
  near-term path and say why (b)/(c) are premature.

**Verify**: each of the three `##` sections above is non-empty and the binding section explicitly names
the consumption-gap blocker. (Self-review.)

### Step 4 (OPTIONAL but recommended): a throwaway proof-of-concept

Create `island-editor/scripts/poc-apply-op.mjs` — a ~30-line ESM script (header comment:
`// THROWAWAY PROOF-OF-CONCEPT for plan 001 — not the production runner`) that imports
`seedFromCurrentIsland` and `deserializeSpec`/`serializeSpec` from `../src/terrain/...`, applies ONE
hand-written op inline (e.g. move `coastline[0]` to `{x: 6, z: 0}` by returning a new spec), then
`deserializeSpec(serializeSpec(newSpec))` and prints the result followed by `VALID ✓`. This proves the
read → mutate → re-validate round-trip the runner will formalize.

**Verify**: `node island-editor/scripts/poc-apply-op.mjs` → prints a spec and `VALID ✓`, exits 0.

> Note: `.mjs` + Vite TS source — if the import of `.ts` fails under plain `node`, either (a) point the
> PoC at a tiny inline copy of the one helper it needs, or (b) skip Step 4 and record in the doc that
> the runner will need a TS-aware entry (tsx/vite-node). Do not spend more than ~20 minutes here.

### Step 5: Open questions

In `## Open questions`, capture at least: coastline self-intersection handling; relief legibility for
agents (the dense `192²` grid is hard for an agent to author/diff — cross-reference QUAL-05 in the
overview and the option of a sparse/RLE encoding or a lower default resolution); **how an agent
perceives the current island** to decide edits (does it need a textual summary, an ASCII top-down map,
or a rendered image?); and whether ops should be coordinate-based (`x,z`) or semantic (`"widen the
north bay"`) — and if semantic, what resolves them.

**Verify**: section lists ≥ 4 open questions.

## Test plan

This spike ships no production code, so there are no unit tests. Verification is:
- The document exists with all 8 `##` sections (`grep -c '^## '` ≥ 8).
- The op vocabulary table has ≥ 8 rows, each citing a reuse source.
- The binding section names the consumption-gap blocker.
- (If Step 4 done) the PoC script runs and prints `VALID ✓`.

## Done criteria

ALL must hold:

- [ ] `docs/island-editor-agent-editing-design.md` exists; `grep -c '^## '` returns ≥ 8.
- [ ] Operation vocabulary table present with ≥ 8 ops, each mapped to an existing primitive/helper.
- [ ] Runner input format + `applyOps` shape + validation requirement specified.
- [ ] Binding section recommends the CLI path and names the consumption-gap blocker for in-product binding.
- [ ] Open-questions section lists ≥ 4 items including relief legibility and agent perception.
- [ ] (Optional) `node island-editor/scripts/poc-apply-op.mjs` prints `VALID ✓`.
- [ ] No files modified outside the in-scope list (`git status`).
- [ ] Overview status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- You are about to implement the real operation library, a production CLI, or any agent/MCP binding —
  that is explicitly out of scope for this spike. Note the temptation in the doc and stop.
- `islandSpec.ts` / `brush.ts` have drifted materially from the "Current state" excerpts.
- You discover the engine *now does* consume an `IslandSpec` (grep finds it in `src/`) — that changes
  the binding analysis fundamentally; report it so the spike can be re-scoped.

## Maintenance notes

- The output doc is the input to a future **build** plan ("implement `islandOps.ts` + the headless
  runner"). Keep the op vocabulary aligned with plan 004's `coastlineOps.ts` helper names if 004 has
  landed — they should become the coastline ops verbatim.
- Reviewer should scrutinize: is the op set minimal-yet-sufficient? Does the immutability model truly
  avoid `applyBrush`'s in-place mutation leaking? Is the consumption-gap blocker stated honestly?
- Deferred out of this spike (by the requester's choice): building anything. Revisit binding option (c)
  only after the engine consumes a terrain spec (see overview REMAIN-01).
