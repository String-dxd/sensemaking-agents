---
title: Wire the editor's IslandSpec terrain into the product engine (silhouette-first)
type: feat
status: proposed — DECISION REQUIRED before execution
date: 2026-06-19
written_against_commit: dda45ec1
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 2026-06-19-003
addresses: REMAIN-01 (and unblocks REMAIN-03 option c)
---

# Plan 003: Make the engine consume an IslandSpec, starting with the coastline silhouette

> **⚠️ DECISION REQUIRED — do not dispatch an executor on this plan without maintainer sign-off.**
> Unlike plans 001/002 (isolated to `island-editor/`), this plan modifies the **shipping product engine**
> (`src/engine/student-space/`). Two facts make it a judgment call, not a mechanical task:
> (1) **perf** — the engine calls `heightAt` ~87K times at boot (the 256² terrain texture dominates), and
> `evaluateHeight` is ~50–100× heavier per call because it re-densifies the coastline every time; and
> (2) **relief semantics differ** — the engine adds hills *everywhere on the plateau* (`_patch` + `_detail`),
> while the spec's relief is an additive sculpt layer applied only on land. The **silhouette-only first
> slice below is a visual no-op** and is the safe way to prove the contract; full relief consumption is a
> larger, ambient-rebuild-entangled effort that should be a separate decision.

> **Drift check (run first, once approved)**:
> `git diff --stat dda45ec1..HEAD -- src/engine/student-space/Game/State/Island.js src/engine/student-space/Game/View/Island.js src/engine/student-space/Game/Data island-editor/src/terrain/islandSpec.ts`

## Status

- **Priority**: P3 (keystone — it's the editor's reason to exist — but entangled; sequence after 001/002)
- **Effort**: L
- **Risk**: MED–HIGH (touches the shipping engine; perf + relief-semantics divergence)
- **Depends on**: 001 (so the engine reads the v2 format), 002 (so the in-product agent tool has a runner to call once unblocked). Neither is a hard build blocker for the silhouette slice.
- **Category**: feature / architecture
- **Planned at**: commit `dda45ec1`, 2026-06-19

## Why this matters

The standalone editor's whole purpose is to author terrain that ships — but
`grep -rn "IslandSpec\|evaluateHeight" src/` returns **zero**: the product engine hard-codes terrain in
`src/engine/student-space/Game/State/Island.js` (`radius = 5.0`, its own `silhouetteAt`/`heightAt`), and
`seedFromCurrentIsland` only *reproduces* that silhouette in the editor. Until the engine reads a spec,
no editor edit (and no agent edit — see plan 002) can change what a student sees. This plan closes the
consumption gap with the smallest provable slice and documents the path to full consumption.

## The ambient-rebuild collision — go/no-go

`docs/plans/2026-06-15-000-feat-island-editor-engine-overview.md` defers "island shape editing" because
it "collides with [the ambient-visual rebuild]." Reading that doc precisely: the **ambient visuals**
(grass/sky/rain/water/aurora) must be rebuilt before public release and the editor "must not touch them."
**Static silhouette consumption is orthogonal to ambient visuals** — it replaces the hard-coded coastline
math with spec-driven coastline math that produces the *same* shape (the seed already mirrors the engine's
harmonics, `islandSpec.ts:171-180` ≡ `State/Island.js:31-39`). **Go** for the silhouette slice (visual
no-op). **No-go (defer)** on consuming the spec's *relief* until the ambient rebuild settles, because the
engine's plateau hills (`_patch`/`_detail`) overlap conceptually with spec relief and reconciling them is
part of the visual rebuild, not this plan.

## Current state

- `src/engine/student-space/Game/State/Island.js` (full, 139 lines):
  - Constants: `radius = 5.0`, `sandOuterRadius = 8.2`, `plateauTopY = 1.0`, `sandTopY = 0.18`,
    `cliffHeight = 0.55`, `noiseAmp = 0.22`, `detailAmp = 0.035` (lines 20-28).
  - `silhouetteAt(theta)` (31-39) — 5 sine harmonics; `radiusAtTheta(theta, base)` (41-44);
    `radiusAt(x,z,base)` (46-49) via `atan2`.
  - `heightAt(x,z)` (74-92) — polar: ocean/beach outside `plateauR`, rim-falloff + `_patch` + `_detail` inside.
  - `isOnPlateau` (100-103), `isPlaceable` (112-115), `normalAt` (122-137, central-diff of `heightAt`).
- Call sites (from a repo-wide grep — confirm before editing): terrain mesh + texture build in
  `Game/View/Island.js` (per-vertex `heightAt`, ~10K mesh verts + 65K texture samples), grass placement
  (`Grass.js` via `isOnPlateau`), object snap-to-ground (`Tree/Flowers/Fruits/Mailbox/Telescope`, ~31
  calls), runtime (`Kira.js`, `Particles.js`, `Fireflies.js`, `Sprouts.js`, `WorldInteractions.tsx`).
- `island-editor/src/terrain/islandSpec.ts`: pure, **no three imports** (confirmed) — `IslandSpec` is plain
  JSON. `sampleCoastline`, `isInsidePolygon`, `distanceToPolygon`, `baseHeightAt`, `reliefAt`,
  `evaluateHeight`, `seedFromCurrentIsland`. `evaluateHeight` calls `sampleCoastline` **every invocation**
  (line 152) — the perf hazard.
- Engine data-loading pattern to mirror: `src/engine/student-space/Game/Data/islandLayout.js`
  (`defaultIslandLayout()` imports `defaultIslandLayout.json`, validates via `mergeIslandLayout`, falls back
  to constants) with a companion `islandLayout.d.ts`. A spec loader should follow this exact shape.

## The cross-package + cross-three boundary

The spec math lives in `island-editor/` (three@0.171); the engine is the root app (three@0.149). The spec
functions have **no three deps**, so they *could* be imported — but cross-package import from the engine
into `island-editor/src` is the same boundary problem plan 004 documents (no path alias, separate package).
**Pragmatic path for the slice:** port the handful of pure functions the engine needs
(`sampleCoastline`, `isInsidePolygon`, `distanceToPolygon`) into a committed engine module (JS), exactly as
`seedFromCurrentIsland` already *copies* `silhouetteAt`. Document the duplication. (A shared workspace
package for the pure core is the longer-term fix — out of scope; note it.)

## Recommended first slice (visual no-op): spec-driven silhouette

1. **Artifact**: generate `src/engine/student-space/Game/Data/defaultIslandSpec.json` from
   `seedFromCurrentIsland()` (worldSize 24, the 24-point silhouette, zero relief). Add `defaultIslandSpec.js`
   (importing the JSON + a JS validator/decoder mirroring `validateSpecObject` + plan 001's `decodeRelief`)
   and `defaultIslandSpec.d.ts`, mirroring `islandLayout.js`/`.d.ts`.
2. **Port pure helpers**: add `src/engine/student-space/Game/State/islandSpecMath.js` with JS ports of
   `sampleCoastline`/`isInsidePolygon`/`distanceToPolygon` (and `baseHeightAt` for a later slice). Unit-test
   them against the editor's TS outputs for identical results on a sample grid.
3. **Bind silhouette only**: in `State/Island.js`, load the spec; precompute the densified polygon **once**
   (`const poly = sampleCoastline(spec.coastline)`); replace the *containment/silhouette* decisions
   (`radiusAtTheta`/`isOnPlateau` boundary) with `isInsidePolygon(poly, x, z)` + `distanceToPolygon`. Keep
   `heightAt`'s interior math (`_patch`/`_detail`) unchanged — only the **boundary** becomes spec-driven.
4. **Verify visual parity**: the rendered island, grass coverage, and object snapping must be
   indistinguishable from before (the spec reproduces the silhouette). Capture before/after screenshots.

**Perf rule:** never call `evaluateHeight`/`sampleCoastline` per-vertex — precompute the polygon once at
load and reuse it. With that, boot cost is bounded; without it, the 65K-sample texture build regresses ~50×.

## Commands you will need

| Purpose | Command (from repo root) | Expected |
|---|---|---|
| App typecheck + lint | `pnpm check` | exit 0 |
| App tests | `pnpm test` | all pass |
| Editor gates | `pnpm check:island-editor` | exit 0 |
| Run the app | `pnpm dev` → http://localhost:3000 | island renders identically |

## Scope

**In scope** (first slice): `src/engine/student-space/Game/Data/defaultIslandSpec.{json,js,d.ts}` (create),
`src/engine/student-space/Game/State/islandSpecMath.js` (create) + its test, `src/engine/student-space/Game/State/Island.js` (silhouette/containment only).

**Out of scope**: the engine's interior height math (`_patch`/`_detail`), relief consumption, the ambient
visuals (grass/sky/water/aurora), any editor file, `View/Island.js`'s mesh-build *structure* (only the
height *source* may change, and only if visual parity holds).

## Steps, Test plan, Done criteria

Because this plan is gated on a decision, the steps above are the design. On approval, expand each into
ordered steps with per-step `pnpm check` / screenshot-parity verifications, following the plan-template
structure used by plans 001/002. **Done = the app renders a pixel-comparable island from
`defaultIslandSpec.json`, all gates green, no relief-semantics change.**

## REMAIN-03 option (c), unblocked by this plan (forward sketch only)

Once `State/Island.js` reads a spec at runtime, an in-product managed-agent tool could: load the live spec
→ call `applyOps` (plan 002) with agent-emitted ops → re-validate → hot-swap the engine's spec and rebuild
terrain. That is the design doc's blocked option (c). **Not in scope here** — listed so the sequencing is
clear: 002 builds the runner, 003 opens the consumption path, a future plan wires the tool.

## STOP conditions

- Visual parity fails (silhouette, grass coverage, or object snapping shifts) — STOP; the coordinate
  mapping (polar engine ↔ Cartesian spec) is off. Do not "tune until close."
- Boot time regresses noticeably — you're calling `sampleCoastline`/`evaluateHeight` per-vertex instead of
  precomputing the polygon once. STOP and fix the precompute before proceeding.
- The slice appears to require touching the ambient visuals or the interior `_patch`/`_detail` math — that's
  the deferred relief work, not this slice. STOP and report.

## Maintenance notes

- The pure-core port (`islandSpecMath.js`) duplicates editor TS — like `seedFromCurrentIsland`'s silhouette
  copy. A shared workspace package would remove both duplications; track it as the real fix.
- Relief consumption is deliberately deferred (ambient-rebuild entanglement + `_patch`/`_detail` overlap).
- Reviewer should scrutinize: visual parity evidence (screenshots), boot-time numbers, and that no relief
  path was silently changed.
</content>
