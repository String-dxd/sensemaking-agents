# Plan 011: Export pipeline and the companion-runtime package — the handoff contract

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.5). Follow steps in order, verify each, honor STOP conditions,
> update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/export character-studio/packages`
> Confirm plans 002–009 landed (this plan compiles their outputs): assembly,
> dressing, sculpt deltas, clips GLB, spring types, palette/materials, face
> atlas system. `packages/` contains only `.gitkeep`. On mismatch, STOP.

## Status

- **Priority**: P1 (the product payoff — but executes last)
- **Effort**: L
- **Risk**: MED-HIGH (fidelity across the boundary is the whole point)
- **Depends on**: plans/004, 005, 006, 007, 008, 009 (010's studioLook is a passthrough record)
- **Category**: direction
- **Recommended executor**: Opus 4.8
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

The roster only matters if characters survive the trip: geometry, materials,
textures, rig, clips, spring parameters, and face state must load in the
product web app and *move exactly like they did in the studio*. This plan
defines the export format (compiled GLB + vendor extension), builds the
compiler, and ships `companion-runtime` — the small library the product app
uses to load and animate companions.

## Current state

- Studio-side character = `CharacterSpec` JSON + assets; runtime must not
  need the studio (no registry lookups, no Blender assets — the GLB is
  self-sufficient).
- **Researched format decisions** (plan 000 §2.5, §3):
  - Container: **glTF 2.0 GLB** assembled with **gltf-transform**
    (`Document`/`NodeIO`; supports skins, morph targets, multiple animations,
    KTX2 via `uastc`/`etc1s`, meshopt).
  - Compression: **meshopt (EXT_meshopt_compression)**, not Draco (faster
    decode; also compresses morphs + animation). Textures: **KTX2** (UASTC
    for palette masks — they need channel fidelity; ETC1S acceptable for
    albedo luminance).
  - Non-standard data: **versioned vendor extension `SEN_companion`** at
    document level (the Hubs `MOZ_hubs_components` precedent: schema'd
    extension, not `extras`). VRM was rejected (humanoid-only) but our spring
    params already speak `VRMC_springBone` vocabulary, easing any future
    interop.
- Product app runs pinned `three@0.149` (repo CLAUDE.md). `companion-runtime`
  must therefore be **three-version-agnostic**: `three` as a peer dependency,
  restrict usage to long-stable APIs (`GLTFLoader` via the app's own three
  examples path is NOT importable cross-version — see step 4 for the loader
  strategy), and run our own spring solver/procedural code on plain
  Object3D/Bone math (all long-stable). Where 0.149-vs-0.185 API drift bites
  (e.g. `sRGBEncoding` → `colorSpace`), isolate in a tiny compat module.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Studio gates | `cd character-studio && pnpm typecheck && pnpm test` | exit 0 |
| Runtime pkg gates | `cd character-studio/packages/companion-runtime && pnpm typecheck && pnpm test` | exit 0 |
| Export CLI | `cd character-studio && pnpm export:character -- <file>.character.json` | writes `<file>.companion.glb` |

## Scope

**In scope**:
- `character-studio/src/core/export/{compile.ts, senCompanion.ts, textures.ts}` (new)
- `character-studio/scripts/export-character.ts` + `package.json` script `export:character` (new)
- `character-studio/packages/companion-runtime/**` (new package: `package.json`, `src/`, `test/`)
- `character-studio/src/studio/panels/ExportPanel.tsx` (new, minimal: export button + report)
- `character-studio/test/core/export/**`
- `docs/companion-handoff.md` (new — the contract doc for product-app engineers)

**Out of scope**:
- Product-app integration itself (the runtime package + handoff doc are the
  deliverable; wiring into `src/engine/` is a separate product task by the
  product team — do NOT touch `src/`), CDN/storage decisions, student-picker
  UI, DB schemas.

## Git workflow

- Branch: `advisor/011-export-runtime`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: `SEN_companion` extension schema (`senCompanion.ts`)

Versioned document-level extension JSON (zod-schema'd, `extVersion: 1`):

```ts
SEN_companion = {
  extVersion: 1,
  character: { id, name, archetype },            // provenance
  springRig: SpringChainDef[],                   // VRMC_springBone-vocabulary params,
                                                 //   boneNames reference glTF node indices via a name map
  colliders: SphereCollider[],
  face: { planeNodeIndices: Record<FacePart, number>,  // which glTF nodes are face planes
          atlasTextureIndices: Record<FacePart, number>,
          cellMaps: { eye, mouth, brow },        // the plan-002 cell tables, embedded
          defaultExpression: string,
          gazeMaxOffset: number },
  procedural: ProceduralParams,                  // breath/sway/blink/gaze
  palette: Record<PaletteSlot, hex>,             // for product-side recolor later
  materialsMeta: Record<Region, MaterialAssign>, // ramp params (runtime rebuilds toon materials)
  clips: { setId, names: string[] },
  studioLook: StudioLook | null,                 // record-only; runtime ignores
  editSpec?: string                              // OPTIONAL gzipped CharacterSpec JSON for re-edit round-trip
}
```
Rule (document in the file header): **standard glTF carries everything a
generic viewer needs** (a naive GLTFLoader user sees a textured, skinned,
animated character — unlit-ish via KHR_materials_unlit on face planes and
standard PBR-ish body fallback material); `SEN_companion` carries what makes
it *alive*. Test: schema validates a hand-built minimal instance; unknown
extVersion rejected with clear error.

### Step 2: Compiler (`compile.ts`, `textures.ts`)

`compileCharacter(spec, loadedAssets) → Uint8Array (GLB)` using gltf-transform:
1. Assemble via plan-006 `assemble.ts` + plan-008 `dress.ts` (worn items
   merged, skinned to the one skeleton), **sculpt deltas baked** into
   positions (plan 009 note), morph weights: applied statically? NO —
   keep morph targets + current weights as node defaults (future student
   sliders need the targets; meshopt compresses them well).
2. Build the glTF Document: meshes/skins/joints from the canonical skeleton
   (bone name map preserved), animations from `clips-core-v1.glb` filtered to
   the contract clip list, face planes as unlit (`KHR_materials_unlit`)
   nodes with atlas textures, body materials as `pbrMetallicRoughness`
   fallback (baseColor = palette-resolved albedo baked to a small texture)
   PLUS `materialsMeta` for the real toon rebuild.
3. Textures → KTX2 (UASTC masks/atlases, ETC1S luminance), geometry+morphs+
   animation → meshopt. Face atlases must stay **uncropped/unresized** (UV
   cell math depends on the 4×4 grid).
4. Attach `SEN_companion`; validate the whole Document (gltf-transform
   `validate`-equivalent: inspect round-trip) before writing.
`scripts/export-character.ts`: CLI wrapper (node) — loads a
`.character.json`, resolves assets from the studio registries, writes
`.companion.glb` + prints a size/stats report (tri counts, texture MBs,
clip list, compressed size; warn if > 8 MB total).

**Verify**: `pnpm export:character -- <default-dog>.character.json` (create
the fixture via `createDefaultCharacter` in a small fixture script) → GLB
written; `pnpm test` export suite passes (step 5 tests).

### Step 3: ExportPanel

Button in the studio → runs the compiler in-browser (gltf-transform WebIO;
KTX2 encode in-browser is heavy — acceptable: run encode in a worker, show
progress; if the `ktx` wasm encoder can't run in-browser reliably, fall back
to PNG textures in-browser export + note "CLI export for production
compression" in the panel) → downloads `.companion.glb` + shows the stats
report.

### Step 4: `companion-runtime` package

`character-studio/packages/companion-runtime/` (workspace member of the
studio root — plan 001 already listed `packages/*`):
- `package.json`: name `@sensemaking/companion-runtime`, peer dep
  `three >= 0.149`, zero hard runtime deps besides `zod` (schema validation)
  — **no drei/r3f/react** (must work in the vanilla-JS product engine).
- Loader strategy for cross-version three: the package does NOT import
  `GLTFLoader` (example-path imports aren't stable across 0.149↔0.185).
  Instead `loadCompanion(gltf: LoadedGLTF, THREE: ThreeNamespace)` takes the
  **already-parsed** GLTFLoader result + the host's `three` namespace
  (dependency injection — the host app owns loading with ITS loader +
  meshopt/KTX2 decoders; document decoder setup in the handoff doc).
- Wires up: `SEN_companion` parse (extVersion check), face-plane cell/gaze/
  blink control (port `faceRig` core — shared source via a small
  `core-shared` extraction if clean, else duplicate with a sync test — see
  STOP conditions), spring solver (port of plan-003 solver — pure math,
  version-agnostic), procedural idle, clip state machine, talk driver.
- API: `const companion = loadCompanion(gltf, THREE); companion.update(dt);
  companion.setState('walk'); companion.playGesture('wave');
  companion.setExpression('happy'); companion.say(amplitudeSource);
  companion.setGaze(x, y); companion.dispose()`.
- Toon material rebuild is **host-optional**: `companion.applyToonMaterials
  (factory?)` — default keeps the GLB's fallback materials (works in 0.149);
  the studio-grade toon factory is exported for hosts on modern three.
- Package tests run against **three 0.149 AND 0.185** (devDeps aliases:
  `three-149`/`three-185`, a small matrix in vitest) — this is the
  version-agnostic proof.

### Step 5: Round-trip conformance suite (`test/core/export/`)

The fidelity gate, headless:
- Export the fixture dog → parse GLB with gltf-transform → assert: node/bone
  names intact, all 11 clips present with durations ±1 frame, morph target
  names intact, `SEN_companion` validates, face atlas textures byte-preserved
  (UASTC lossless mode or PNG-in-KTX2 check), sculpt deltas baked (vertex
  positions ≠ base where sculpted).
- Load into `companion-runtime` (three 0.185 path) → step 2 s of simulated
  frames → spring chains moved and settled (reuse plan-003 test assertions),
  blink fired, no NaN transforms.
- Size budget: fixture GLB ≤ 8 MB compressed.

Also write `docs/companion-handoff.md`: format spec, decoder setup for the
product app (0.149: which meshopt/KTX2 decoder versions work), the runtime
API, the update-loop contract (call `update(dt)` after your mixer if you
drive your own, else let the runtime own it), and versioning policy
(`extVersion` bumps).

**Verify**: full suite green in both packages; handoff doc reviewed against
the actual API (no drift).

## Test plan

As steps 1/2/5 plus runtime-package tests (solver parity: same seed/config
produces same settle trajectory as the studio solver — export a small JSON
trace fixture from the studio test and assert against it in the runtime
package; three-version matrix). ≥ 15 new cases total across both packages.

## Done criteria

- [ ] Both packages: `pnpm typecheck && pnpm test` exit 0
- [ ] CLI export produces a ≤ 8 MB GLB passing the conformance suite
- [ ] Runtime tests pass against three 0.149 and 0.185
- [ ] `companion-runtime` has no react/drei/r3f/studio imports (`grep` gate in a test)
- [ ] A generic three.js GLTFLoader (no runtime lib) still shows a textured animated character (document the check)
- [ ] `docs/companion-handoff.md` exists and matches the API
- [ ] `plans/README.md` updated

## STOP conditions

- gltf-transform cannot express something the studio needs (e.g. per-node
  unlit + skinned combination edge case) — report the exact limitation.
- three 0.149 incompatibility in the runtime that can't be isolated in the
  compat module (report the API; the fallback — runtime requires ≥ 0.160 and
  the product upgrades — is an operator decision).
- Face-atlas KTX2 encoding visibly degrades the drawn face (blocky
  strokes) — ship face atlases as PNG inside the GLB (allowed by glTF) and
  note the size cost.
- Sharing `core/` source with the runtime package creates a circular or
  studio-tainted dependency — duplicate the ~3 pure modules and add a
  checksum-sync test instead; report the tradeoff.

## Maintenance notes

- `SEN_companion.extVersion` is the compatibility contract with every shipped
  roster character — additive changes only within a version; breaking shape
  = bump + runtime support for N and N−1.
- Future student customization: the product can re-run `compileCharacter`
  server-side from an edited spec — the compiler is pure TS with injected
  assets by design; keep it node-compatible (no DOM).
- Reviewer: the injected-THREE typing (keep a minimal structural type, not
  `typeof import('three')` which pins a version), worker KTX2 encode memory,
  clip filtering (don't ship debug clips).
