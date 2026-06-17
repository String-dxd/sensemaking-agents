# How an agent edits the island spec — design spike

> Status: design spike (Plan 001), planned at `b6dc287d`, 2026-06-17.
> This is a **contract**, not an implementation. It defines which semantic operations an
> agent could call to edit an `IslandSpec`, their shape, how they validate, and how an agent
> invokes them. No production operation library, CLI, or agent/MCP binding is shipped here.
>
> Source of truth read while writing this: `island-editor/src/terrain/islandSpec.ts`,
> `island-editor/src/terrain/brush.ts`, `island-editor/src/editor/exportSpec.ts`,
> `island-editor/src/editor/commandStack.ts` (all unchanged since `b6dc287d`).

## Goal & non-goals

**Goal.** Define a deliberate, reviewable contract for *agent-driven island editing*: a small set
of **pure, immutable** semantic operations `(spec, args) => IslandSpec`, a **headless runner**
(`applyOps`) that applies a batch of them and re-validates, and a recommendation for how an agent
**invokes** that runner today. Each operation must map onto an existing pure primitive in the
editor core so the eventual build is "wrap, don't reinvent."

The editor core is already the right shape for this:
- `islandSpec.ts` is pure and framework-agnostic (no `three`/r3f imports) — the durable contract.
- `brush.ts#applyBrush` is the relief primitive, headless-testable.
- `exportSpec.ts#deserializeSpec` is the canonical field-level validator (throws on bad input).
- `commandStack.ts` already models `{ do, undo }`, so an immutable-op model drops in cleanly.

**Non-goals (explicitly out of scope for the build this spike feeds, and for this spike itself):**
- No production `islandOps.ts` operation module. The op table below is a *specification*, not code.
- No MCP server, managed-agent prompt, or tool binding wired up.
- No change to `islandSpec.ts`, `brush.ts`, the engine, or any `package.json`.
- **No in-product runtime agent editing.** The student-space engine does **not** consume an
  `IslandSpec` yet (see [Agent binding options](#agent-binding-options) — the *consumption gap*),
  so an agent editing the live island in-product is blocked regardless of this contract.
- Not designing the *coastline-helper* primitives (`insertPointAfter`/`deletePoint` math). That is a
  separate future plan (referred to here as "plan 004"); this spike only reserves their op slots.

## The spec contract

The durable artifact an agent reads and writes is the `IslandSpec`, restated inline from
`islandSpec.ts` (lines 31-39):

```ts
export interface IslandSpec {
  version: 1
  worldSize: number                 // square world: X,Z each span [-worldSize/2, +worldSize/2]
  coastline: Vec2[]                 // ordered control points of a closed Catmull-Rom loop
  heightProfile: HeightProfile      // seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth
  relief: ReliefGrid                // { resolution: N, data: number[] } length N², additive on land
}

interface Vec2 { x: number; z: number }

interface HeightProfile {
  seaLevel: number       // world Y of the waterline
  plateauHeight: number  // world Y of the island interior, far from coast
  coastFalloff: number   // horizontal distance over which land rises seaLevel → plateauHeight
  cliffSteepness: number // 0..1 — higher = sharper rise near coast (cliff); lower = gentle beach
  seafloorDepth: number  // world Y the terrain sinks to offshore
}

interface ReliefGrid {
  resolution: number     // N — grid is N×N samples across the world bounds
  data: number[]         // length resolution²; additive displacement applied on land
}
```

**Coordinate system** (confirmed against `reliefAt`, lines 128-148, and `applyBrush`, lines 49-53):

- The world is a **square centered at the origin**. X and Z each span `[-worldSize/2, +worldSize/2]`.
  `seedFromCurrentIsland` defaults `worldSize = 24`, so the bounds are `[-12, +12]` on each axis.
- Coastline control points are world `Vec2`s in those bounds (the seed places them on a radius-~5
  silhouette circle). The closed loop is densified by `sampleCoastline` (Catmull-Rom, 12 samples/span)
  before any geometry query.
- **Relief grid is row-major, `z` outer / `x` inner: `data[z * resolution + x]`.** Confirmed by
  `reliefAt` (lines 141-144: `data[z0 * resolution + x0]`, etc.) and by `applyBrush`
  (line 78: `const i = iz * res + ix`). Cell `(ix, iz)` maps to world
  `(-half + ix*cellW, -half + iz*cellW)` where `cellW = worldSize / (resolution - 1)` and
  `half = worldSize / 2`. So the grid samples the **full world bounds**, corner-aligned: index `0`
  sits at `-half`, index `resolution-1` at `+half`. `reliefAt` bilinearly interpolates and returns
  `0` outside the bounds; relief is added to base height **only on land** (`evaluateHeight`, line 156).
- Final height: `evaluateHeight(spec, x, z) = baseHeightAt(profile, inside, distToCoast)` plus
  `reliefAt` when `inside` (lines 151-157). Base alone defines the silhouette + cliff; relief is the
  additive sculpt layer on top of land.

This is the **only** shape ops produce. Every op returns a value that must round-trip through
`deserializeSpec` unchanged in structure.

## Operation vocabulary

Each op is **pure and immutable**: signature `(spec: IslandSpec, args) => IslandSpec`. It returns a
**new** spec and must **never** mutate its input (nor any nested array/object shared with the input).
Ops never throw for *domain* rejections — they either return a corrected spec, or the runner records
an error and skips the op (see [Headless runner design](#headless-runner-design)). Ops only assume
their input is already a valid spec; the runner re-validates the *output*.

| Op | Args | Semantics | Reuses (existing primitive) |
|---|---|---|---|
| `movePoint` | `{ index, x, z }` | Set coastline control point `index` to world `(x, z)`. | `coastline.map` (immutable array copy); bounds-sanity via `worldSize`. |
| `insertPointAfter` | `{ index, x?, z? }` | Insert a control point after `index` (on edge `index → index+1`); default to that edge's midpoint when `x/z` omitted. | array splice-copy + midpoint of two `Vec2`s; **proper curve-aware insert deferred to plan 004's coastline helpers.** |
| `deletePoint` | `{ index }` | Remove control point `index`. | `coastline.filter` (immutable copy); guard reuses `deserializeSpec`'s "≥ 3 points" rule (line 65). |
| `setHeightProfile` | `Partial<HeightProfile>` | Patch named profile fields, leave the rest. | object spread `{ ...spec.heightProfile, ...patch }`; field set validated by `validateHeightProfile` (lines 21-31). |
| `raiseRegion` | `{ x, z, radius, strength }` | One **raise** relief dab centered at world `(x, z)`. | `applyBrush(cloned, worldSize, x, z, { mode:'raise', radius, strength })` — **on a `.slice()`d grid** (see immutability note). |
| `lowerRegion` | `{ x, z, radius, strength }` | One **lower** relief dab. | `applyBrush` with `mode:'lower'` on a cloned grid. |
| `smoothRegion` | `{ x, z, radius, strength }` | One **smooth** relief dab (local averaging). | `applyBrush` with `mode:'smooth'` on a cloned grid. |
| `flattenRegion` | `{ x, z, radius, strength }` | One **flatten** relief dab (pull toward center value). | `applyBrush` with `mode:'flatten'` on a cloned grid. |
| `clearRelief` | `{}` | Zero the entire relief grid (keep `resolution`). | `new Array(res*res).fill(0)` — same construction `seedFromCurrentIsland` uses (line 203). |
| `scaleIsland` | `{ factor, scaleRelief? }` | Scale the coastline about the origin by `factor`; optionally scale relief magnitudes too (`scaleRelief`, default `false`). | `coastline.map` (multiply `x,z`); relief magnitude `data.map(v => v*factor)` when opted in. |
| `resizeWorld` | `{ worldSize }` | Change the square world bounds. **Reinterprets** relief/coastline coords (does not re-grid). | field set `{ ...spec, worldSize }`; documented coordinate-reinterpretation caveat below. |

That is **11 ops**, each citing a reuse source (≥ 8 required). Per-op contract notes:

- **`movePoint`** — *Pre*: `0 ≤ index < coastline.length`. *Rejects*: out-of-range index; non-finite
  `x/z`. *Can produce invalid spec?* Not structurally (still a `Vec2[]`), but can produce a
  **self-intersecting** coastline — `deserializeSpec` does **not** catch that (see
  [Validation & verification](#validation--verification)). Runner should re-validate and (future)
  optionally check self-intersection.
- **`insertPointAfter`** — *Pre*: valid `index`. *Rejects*: out-of-range index. *Invalid?* Structurally
  fine; the *midpoint* default is a placeholder — a curve-aware insert that preserves silhouette is
  plan 004's job. A naïve midpoint can subtly change the Catmull-Rom curve; flagged in open questions.
- **`deletePoint`** — *Pre*: `coastline.length > 3`. **Rejects when the result would drop below 3**
  points (mirrors `deserializeSpec` line 65, which throws for `< 3`). *Invalid?* No, given the guard.
- **`setHeightProfile`** — *Pre*: every provided field is a finite number. *Rejects*: non-finite values;
  unknown keys (ignore or reject — recommend **reject** so typos surface). *Invalid?* No (guarded), but
  note semantic foot-guns: `coastFalloff ≤ 0` divides in `baseHeightAt`/`cliffEase`; `cliffSteepness`
  outside `0..1` is accepted by the validator but distorts `cliffEase`. These are *semantic* checks the
  field-level validator misses — candidates for an extra check (below).
- **`raiseRegion` / `lowerRegion` / `smoothRegion` / `flattenRegion`** — *Pre*: finite `x,z`;
  `radius > 0`; finite `strength`. *Rejects*: non-positive radius; non-finite args. *Invalid?* No —
  `applyBrush` only writes finite deltas and is a no-op when the grid is degenerate
  (`res < 2`, line 47) or the dab falls entirely outside the bounds.
  **IMMUTABILITY (critical):** `applyBrush` **mutates `relief.data` in place** (docstring lines 33-37;
  writes at line 78+). To stay pure, the op MUST clone first:
  ```ts
  const data = spec.relief.data.slice()                 // copy BEFORE mutating
  const relief = { resolution: spec.relief.resolution, data }
  applyBrush(relief, spec.worldSize, x, z, params)      // mutates the copy only
  return { ...spec, relief }
  ```
  Cloning only `relief` (and `relief.data`) is sufficient — `worldSize` and `coastline` are untouched
  and may be shared by reference. The PoC in `island-editor/scripts/poc-apply-op.mjs` demonstrates
  exactly this clone-then-brush pattern and asserts the input grid is unchanged.
- **`clearRelief`** — *Pre*: none. *Rejects*: nothing. *Invalid?* No — a zeroed array of the right
  length is always valid.
- **`scaleIsland`** — *Pre*: `factor` finite and `> 0`. *Rejects*: `factor ≤ 0` or non-finite.
  *Invalid?* Can push points outside `worldSize` bounds (visually clipped, not a structural error) and,
  in pathological cases, produce non-finite values if `factor` is huge — runner must re-validate
  (the validator's `isFinite` checks catch NaN/Infinity).
- **`resizeWorld`** — *Pre*: `worldSize` finite and `> 0`. *Rejects*: `≤ 0` or non-finite. *Invalid?* No
  structurally. **Semantic caveat:** because relief and coastline coords are absolute world units,
  changing `worldSize` **reinterprets** them — the relief grid now samples a different physical area
  (`cellW` changes), and coastline points keep their absolute coordinates (so a shrink can push them
  out of bounds). This op is "change the frame," not "rescale the contents"; `scaleIsland` is the
  content-rescale. Documented so an agent picks the right one.

**Minimality.** This set is intentionally small: point edits (move/insert/delete), profile patch,
the four relief dabs (1:1 with `BrushMode`), a relief reset, and two world-frame transforms. It covers
every field of `IslandSpec` and reuses every pure primitive the editor already has. `insertPointAfter`
/`deletePoint` are the only ops that lean on not-yet-written helpers (plan 004); everything else wraps
shipped code.

## Immutability & undo model

**Immutable ops.** Every op returns a new spec; the previous spec object is never mutated. This makes
ops trivially composable (`reduce` a list of ops over a spec) and trivially undoable (keep the prior
reference).

**Undo via the existing stack.** `commandStack.ts` already models `Command { do, undo }` and *records
already-applied* commands (`push` does **not** call `do`; comment lines 2-5). An immutable op maps onto
it directly. Given `next = op(prev, args)` and a setter `setSpec`:

```ts
setSpec(next)
stack.push({
  label: 'raiseRegion',
  do:   () => setSpec(next),   // redo: re-point state at the new spec
  undo: () => setSpec(prev),   // undo: re-point state at the old spec
})
```

Because specs are immutable, `do`/`undo` are just reference swaps — no inverse-operation math, no
re-running the brush. (Contrast today's in-place `applyBrush`, which would need a captured grid
snapshot to undo; the immutable model sidesteps that entirely.)

**Batch undo.** The headless runner (below) applies a *list* of ops as one logical edit. For
interactive use that batch should push **one** command whose `undo` restores the pre-batch spec, so a
single Ctrl-Z reverts the whole agent turn rather than one dab at a time. (The headless CLI doesn't use
the stack at all — it just writes the final spec.)

## Headless runner design

> **Specification only.** The shapes below are the contract for a future build, not shipped code.

**Op input format.** A JSON array of tagged ops — the wire format an agent emits:

```json
[
  { "op": "movePoint", "index": 3, "x": 4.2, "z": -1.1 },
  { "op": "raiseRegion", "x": 0, "z": 0, "radius": 3, "strength": 0.4 },
  { "op": "setHeightProfile", "cliffSteepness": 0.6 },
  { "op": "clearRelief" }
]
```

Each object has a required `op` discriminator; remaining keys are that op's args (for
`setHeightProfile` the args ARE the partial profile, minus `op`).

**Core function shape:**

```ts
function applyOps(
  spec: IslandSpec,
  ops: OpInput[],
): { spec: IslandSpec; errors: OpError[] }
```

- Folds the ops over the spec: `result = ops.reduce(apply, spec)`.
- **Never throws mid-batch.** An unknown `op` name or a failed precondition is **collected into
  `errors`** (`{ index, op, message }`) and that op is **skipped** — the fold continues from the last
  good spec. This lets an agent see *all* problems in one round-trip instead of one-at-a-time.
- After the fold, the result spec is **re-validated** (see below). A validation failure is appended to
  `errors`; the caller decides whether to write a spec that has errors (the CLI refuses — below).
- The returned `spec` is always a valid-by-construction object when `errors` is empty.

**Thin CLI wrapper** (the near-term agent entry point — see [Agent binding options](#agent-binding-options)):

```
applyOps <spec.json> <ops.json> [--out out.json]
  1. read + deserializeSpec(spec.json)   → starting spec (throws → exit 2, "bad input spec")
  2. JSON.parse(ops.json)                → op list
  3. { spec, errors } = applyOps(spec, ops)
  4. if errors.length → print each to stderr, exit 1, write NOTHING
  5. validateSpecObject(spec)            → re-validate output (belt-and-braces; applyOps already did)
  6. write serializeSpec(spec) to --out (or stdout)
```

The CLI is the only place that touches the filesystem, so `applyOps` and the ops stay pure and
unit-testable. It is a **wrapper around the existing core**, not a new engine.

**Headless entry-point caveat.** `exportSpec.ts`'s download/import helpers are **browser-only**
(`Blob`, `FileReader`, `document.createElement`, lines 94-131). A Node CLI must NOT import those — it
reads files with `node:fs` and reuses only the pure `deserializeSpec`/`serializeSpec`. Separately, the
core is authored in **TypeScript**; a plain-`node` entry needs a TS-aware loader (`tsx` / `vite-node`)
or a build step. The PoC works around this by inlining the one helper it needs (see its header). The
build plan should pick `tsx` (already in the `island-editor` workspace's toolchain family) for the real
runner rather than duplicating logic.

## Validation & verification

**Hard requirement.** Every spec the runner emits MUST pass the canonical validator before it is
written. Today that is `deserializeSpec(json)` in `exportSpec.ts` (throws field-level messages, lines
43-90). The plan notes a sibling refactor may extract `validateSpecObject(parsed)` as the reusable
*object-level* check (so we don't re-`JSON.parse`); the runner should call **whichever exists** —
`validateSpecObject(obj)` if present, else `deserializeSpec(JSON.stringify(obj))`.

**What `deserializeSpec` already checks** (so we don't duplicate it): `version === 1`; `worldSize`
finite; `coastline` is an array of **≥ 3** valid `{x,z}` finite `Vec2`s; `heightProfile` has all five
finite numeric fields; `relief.resolution` finite, `relief.data` an array of numbers with
length **exactly** `resolution²`.

**What it does NOT check** (candidate extra checks):

| Candidate check | Caught today? | Recommendation |
|---|---|---|
| Coastline **self-intersection** (a `movePoint`/`insertPointAfter`/`scaleIsland` can fold the loop) | No | **Add** — but as a **warning**, not a hard reject (a slightly self-crossing loop still renders via even-odd `isInsidePolygon`). Cheap segment-segment test on the control polygon. Belongs in the build, not this spike. |
| **NaN/Infinity after scale** (huge `factor`, `coastFalloff → 0`) | **Partly** — `isFinite` in the validator catches NaN/Infinity *fields*; it does not catch a *degenerate-but-finite* profile like `coastFalloff === 0` | **Add** a small semantic check: `coastFalloff > 0`, `cliffSteepness ∈ [0,1]`, `radius > 0`. These prevent silent divide-oddities in `cliffEase`/`baseHeightAt`. |
| Coastline points **within `worldSize` bounds** | No | **Don't hard-reject** — out-of-bounds points are visually clipped, not corrupt; surface as a warning at most. |
| `relief.resolution` is a **positive integer ≥ 2** | Length is checked; integer-ness / `≥ 2` is not (`reliefAt` no-ops below 2) | **Add** a cheap `Number.isInteger(resolution) && resolution >= 2` guard. |

Recommendation: keep the **canonical validator as the hard gate** (structure), and add the small
**semantic/warning layer** above *in the build*, surfaced through `errors`/`warnings` on `applyOps`.
Do **not** widen `deserializeSpec` itself in this spike (out of scope).

**Verification (this spike).** `node island-editor/scripts/poc-apply-op.mjs` applies one op, round-trips
through validation, and prints `VALID ✓` — a smoke test that the clone-then-brush + validate loop holds.
The PoC runs under **plain `node` with no deps**: importing the `.ts` core directly needs a TS-aware
loader (`tsx`/`vite-node`) that this fresh worktree has no `node_modules` for, so the PoC **inlines** the
two helpers it exercises (a raise dab and a structural check). This is exactly the "the runner needs a
TS-aware entry" finding called out in [Headless runner design](#headless-runner-design) — the real
runner should import the actual pure core via `tsx` rather than inline anything.

## Agent binding options

How does an agent actually *invoke* `applyOps`? Three options, analyzed:

**(a) CLI invoked by a coding agent (e.g. Claude Code) — RECOMMENDED, near-term.**
A coding agent reads `spec.json`, writes an `ops.json` (or the runner accepts inline ops), runs the
CLI wrapper, and reads back the validated spec (or the `errors`). **Works today with zero product
changes**: the editor core is already pure and headless-capable, the agent already has shell + file
access, and the output is a plain JSON artifact the standalone `island-editor` designer can load. This
is the lowest-risk path to "an agent edits the island" and the right first build. The only prerequisite
is a TS-aware entry (`tsx`) — no engine, server, or schema work.

**(b) MCP tool wrapping `applyOps` — PREMATURE.**
An MCP server could expose `applyOps` (and a `describeIsland` read tool) so any MCP-capable agent edits
the spec without shell access. Technically clean (it's the same pure core behind a tool schema), but
**premature**: it adds a server to build, host, and version before we've validated the op vocabulary
through real use via (a). Build it only once the CLI has proven the op set and an actual consumer wants
tool-based access. No new capability over (a) for the current need — just a different transport.

**(c) In-product managed-agent tool — BLOCKED.**
Wiring an in-product agent tool (Connector/Cartographer-style, per `src/agents/*`) so the *live*
student-space island responds to agent edits is **blocked on the consumption gap** and is the most
premature of the three.

> **CONSUMPTION-GAP BLOCKER (named explicitly).** `grep -rn "IslandSpec\|evaluateHeight" src/` at the
> repo root returns **nothing** — the product engine does not consume an `IslandSpec`. The live terrain
> is still **hard-coded** in `src/engine/student-space/Game/State/Island.js` (`radius = 5.0`, its own
> `silhouetteAt` / `heightAt`). `seedFromCurrentIsland` only *reproduces* that silhouette in the editor;
> the engine never reads the spec back. **Until the engine consumes an `IslandSpec` at runtime, no
> in-product agent edit can affect what a student sees.** This blocker is independent of the op contract:
> even a perfect `applyOps` changes only a JSON file the engine ignores. (Verified during this spike; if
> a future grep finds `IslandSpec` in `src/`, this section must be revisited — that would unblock (c).)

**Recommendation:** ship the **CLI path (a)** first. Defer **(b)** until the op vocabulary is proven and
a tool-based consumer exists. Treat **(c)** as gated behind a separate "engine consumes the spec" plan;
it cannot proceed until the consumption gap closes.

## Open questions

1. **Coastline self-intersection handling.** `movePoint` / `insertPointAfter` / `scaleIsland` can fold
   the loop on itself. Even-odd `isInsidePolygon` still produces *a* result, so it's not fatal — but the
   silhouette gets weird. Reject, warn, or auto-repair (e.g. drop the crossing)? Recommend **warn-only**
   initially; revisit if agents produce tangled coasts in practice.
2. **Relief legibility for agents.** The seed relief grid is **192² = 36,864 floats**
   (`seedFromCurrentIsland(..., 192)`). That is far too dense for an agent to author or diff directly,
   and a full grid in an op payload is enormous. Options to explore: (i) keep agents to the
   `raise/lower/smooth/flatten` **region ops** (they emit `(x,z,radius,strength)`, not raw grids) and
   never hand-author `data`; (ii) a **sparse / RLE** relief representation for diffs and transport;
   (iii) a **lower-resolution** authoring grid upsampled on import. Region-ops-only (i) is the natural
   default and reinforces why the op vocabulary exists.
3. **How does an agent *perceive* the current island to decide edits?** It needs to read state before
   writing ops. Candidates: (i) a **textual summary** (worldSize, point count, profile values, relief
   min/max/extent); (ii) an **ASCII / coarse height map** of `evaluateHeight` sampled on a small grid;
   (iii) a **rendered image** (only available once something renders headlessly — not today). A
   `describeIsland(spec) → text` read-side companion to `applyOps` is likely the first thing the build
   needs, and pairs with binding option (b)'s read tool.
4. **Coordinate-based vs. semantic ops.** The proposed set is **coordinate-based** (`raiseRegion` at
   `(x,z)`). Agents may reason better in **semantic** terms ("add a bay on the north shore", "raise the
   central plateau"). Do we layer a semantic vocabulary that *compiles down* to coordinate ops (needs
   the perception layer in Q3 to resolve "north shore" → coords), or keep agents purely coordinate-based
   and let the LLM do the spatial mapping? Affects both the op surface and the perception design.
5. **Op batch atomicity & partial application.** When some ops in a batch fail, the current design
   **skips** the bad ones and applies the rest (collecting `errors`). Is "apply the good ones" or
   "all-or-nothing (reject the whole batch on any error)" the right default for an agent turn? All-or-
   nothing is safer for state integrity; partial-apply is friendlier for iterative agents. Likely a CLI
   flag (`--atomic`), but the default needs a decision.
6. **`insertPointAfter` curve fidelity.** A naïve edge-midpoint insert changes the Catmull-Rom curve
   (the tangents at neighbours shift), so "insert a point" can subtly move the coastline even where the
   agent didn't intend. The plan-004 coastline helpers should provide a *curve-preserving* insert; until
   then, document the midpoint behaviour as approximate.
