# Plan 006: Canonical skeleton, archetype bodies, and the socketed anatomy-part system

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.4, §5). Follow steps in order, verify each, honor STOP conditions,
> update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/skeleton character-studio/src/assets`
> Confirm plans 001–005 landed: face rig, spring solver (`SpringChainDef`),
> spec store (anatomy.parts, boneScales), toon material factory with
> skinning+morphs enabled. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L (largest plan in the suite; includes asset authoring)
- **Risk**: HIGH (asset quality + skinning correctness)
- **Depends on**: plans/002, 003, 004, 005
- **Category**: direction
- **Recommended executor**: Opus 4.8, with Blender MCP access strongly recommended (see toolkit)
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

This is where the placeholder capsule becomes real characters: authored,
skinned archetype bodies on the one canonical skeleton, plus the socketed,
morphable anatomy-part library (ears, muzzles, tails, claws, crests) that
gives designers "meaningful variety per type" — and later gives students a
parts picker. Everything Phase 3+ (clips, wardrobe, sculpt) runs on the
meshes and skeleton built here.

## Current state

- Placeholder capsule+sphere body with ad-hoc ear/tail bones (plan 003).
- Canonical skeleton definition exists only as prose (plan 000 §5 — the bone
  list/names there are the contract; re-read it now).
- Spec fields ready: `meta.archetype` (`biped-round | biped-slim | bird`),
  `anatomy.parts` (per-slot `partId` + `morphs` + `boneScales`),
  `anatomy.bodyMorphs`.
- Toon material factory (plan 005) requires meshes with: skin indices/weights,
  morph targets, UV0, and the **channel-packed palette mask** texture
  (R=primary, G=secondary, B=belly, A=accentA) per plan 005 step 1.
- No authored assets exist. This plan authors them (Blender), commits `.glb`
  sources to `character-studio/src/assets/anatomy/`, and defines the asset
  contract in `ASSET-CONTRACT.md` so human artists can replace/extend every
  mesh later without code changes.

## Suggested executor toolkit

- **Blender MCP server** (`mcp__blender__*` tools) is available in this
  environment — use `execute_blender_code` to build the skeleton, model the
  bodies/parts (metaball/subdivision blockouts → sculpt-light cleanup), skin
  with automatic weights + corrective passes, create morph targets (shape
  keys), and export glTF. Author programmatically, iterate visually via
  `get_viewport_screenshot`. If Blender MCP is unavailable in your session,
  see STOP conditions.
- Reference silhouettes: AC villagers are ~2.5–3 heads tall, huge head
  (≈ 40% of height), stubby limbs, mitten hands, big feet. Bird archetype:
  same proportions, wings-as-arms, tail feathers.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/skeleton/{canonical.ts, archetypes.ts, partRegistry.ts, assemble.ts}` (new)
- `character-studio/src/assets/anatomy/**` (authored GLBs + `ASSET-CONTRACT.md`)
- `character-studio/src/studio/panels/AnatomyPanel.tsx` (new)
- `character-studio/src/studio/viewport/CharacterRoot.tsx` (new — replaces `PlaceholderBody.tsx` usage; keep the file, stop mounting it)
- `character-studio/test/core/skeleton/**`
- Small allowed edits: `defaults.ts` (default partIds per archetype), FaceRig anchor config

**Out of scope**:
- Animation clips (007 — but the skeleton you export here is what clips are
  authored on, so its rest pose is contractual: **A-pose-like relaxed arms
  ~30° down, standing**), wardrobe meshes (008), sculpt deltas (009).

## Git workflow

- Branch: `advisor/006-anatomy-archetypes`. Conventional commits. GLBs are
  binary — commit them (repo already commits studio assets); keep each ≤ 5 MB.

## Steps

### Step 1: Canonical skeleton as code (`canonical.ts`)

Encode plan 000 §5 exactly: ordered bone list with name, parent, rest
position/rotation for a 1.0-unit-tall reference character. Export
`buildSkeleton(): { bones, skeleton, boneByName }` and `SOCKETS` (the
`socket.*` subset). `archetypes.ts`: per-archetype proportion table —
per-bone length/scale multipliers + overall height (biped-round 0.9,
biped-slim 1.05, bird 0.8) applied at build time. Unit tests: every plan-000
bone present, names exact, hierarchy parents correct, sockets present, no
extra bones.

**Verify**: `pnpm test` → skeleton tests pass.

### Step 2: Author the three archetype bodies (Blender)

For each archetype, author a body mesh (head+torso+limbs, **no** ears/muzzle/
tail — those are parts): ≤ 18k triangles, quad-dominant, smooth-shaded,
UV-unwrapped (head front gets generous UV space), skinned to the canonical
skeleton (import it from a small Blender-side builder script mirroring
`canonical.ts` — keep bone names byte-identical), with **body morph targets**:
`bellyRound`, `chubby`, `slim`, `headBig`, `headSmall` (0–1 shape keys).
Author the grayscale albedo + palette-mask texture per plan 005's channel
contract (1024²). Export `body-<archetype>.glb` (glTF: +Y up, meters,
skins+morphs, no lights/cameras baked).

Write `ASSET-CONTRACT.md` capturing ALL of the above as requirements for
human artists (tri budget, bone names, rest pose, morph list, mask channels,
export settings).

**Verify**: each GLB loads in a scratch three.js test (write
`test/core/skeleton/assets.test.ts` using `GLTFLoader` in vitest with a
node-friendly loader path — if loader-in-node is painful, validate structure
via `gltf-transform` inspect API instead: bone names match `canonical.ts`,
morph names present, tri counts within budget).

### Step 3: Author the anatomy part library (Blender)

Parts per slot, each a separate GLB in `src/assets/anatomy/parts/`,
rigid-or-skinned to the bones of its slot:

- `ears`: `upright-pointy`, `floppy-long`, `round-bear`, `bunny-tall` (skinned to `earL/R.1-.2`)
- `muzzle`: `short-cat`, `boxy-dog`, `beak-small`, `beak-round` (parented to `socket.muzzle`; beaks used by bird)
- `tail`: `curl-shiba`, `fluff-fox`, `stub-round`, `feather-fan` (skinned to `tail.1-.4`)
- `claws`: `mitten-none`, `stub-claws` (parented to hand/foot bones)
- `crest`: `none`, `feather-tuft` (head socket)

Each part: ≤ 2.5k tris, own morphs where meaningful (`length`, `width` on
ears/tails), palette-mask texture reusing body slots. `partRegistry.ts`:
typed registry `{ partId → { slot, url, morphs: string[], springProfile? } }` —
`springProfile` marks parts whose bones should get spring chains and with
what default params (floppy ears springier than upright).

**Verify**: `assets.test.ts` extended: every registry entry's GLB exists,
slot bones/sockets referenced exist in `canonical.ts`, tri budgets hold.

### Step 3b: Personality face-atlas variants (관상 grammar)

Author the face-atlas library that makes personality legible (plan 000 §2.1b
table is the spec — read it now): for each of `gentle, cheerful, proud,
gruff` (minimum set; `calm`/`mischievous` may alias until authored), produce
eye/mouth/brow/pupil atlas PNGs in the **same 4×4 cell contract** as the v1
atlas (`src/core/face/atlas.ts` cell maps are immutable), varying exactly the
grammar axes: eye aperture, pupil/iris size, brow weight/angle, stroke
weight, default mouth character. Extend the plan-002 generator
(`scripts/generate-face-atlas.ts`) with per-personality parameter sets rather
than hand-editing pixels — the generator's SDF parameters ARE the grammar,
which keeps variants consistent and lets designers add personalities by
adding a parameter block. Register in an `ATLAS_REGISTRY: Record<atlasId,
urls>` consumed by assembly; remove plan-004's `ATLAS_FALLBACK` aliases for
the authored ids. Side-by-side visual check: the four variants at neutral
expression must be tellable apart at a glance AND each must still read
correctly across all 9 expression presets (a gruff face doing `happy` should
read as a gruff character being happy — not switch personalities).

### Step 4: Character assembly (`assemble.ts` + `CharacterRoot.tsx`)

`assembleCharacter(spec, registry, loadedAssets)` → `{ root, skeleton,
faceAnchor, springChains }`: builds skeleton (archetype proportions +
spec.boneScales), attaches body mesh, mounts each spec'd part on its
bones/socket, applies morph weights from spec, builds `SpringChainDef[]` by
merging archetype defaults + part `springProfile`s, applies toon materials
(plan 005 factory) with spec palette/material assigns, returns `faceAnchor`
(head-forward transform) for the plan-002 face rig.

`CharacterRoot.tsx` replaces the placeholder in the Stage: loads assets
(drei `useGLTF` per part URL), runs assembly, registers spring rig + face rig
+ idle layer, re-assembles reactively on spec changes (dispose properly —
test for leaked geometries via `renderer.info` in dev).

**Verify**: `pnpm dev` → a real biped-round character stands on the pedestal
with drawn face, breathing, springy authored ears/tail. Switching archetype
to `bird` in the panel swaps the whole body coherently.

### Step 5: Anatomy panel

`AnatomyPanel.tsx`: archetype selector; per-slot part picker (thumbnail grid —
generate thumbnails lazily by rendering each part to an offscreen canvas
once); morph sliders for the selected part + body morphs; boneScale sliders
for a curated safe set (head, ears, tail, limbs — clamped per plan-004
schema). All through the spec store.

**Verify**: assembling `floppy-long` ears + `boxy-dog` muzzle + `curl-shiba`
tail on biped-round reads as *a dog*; `beak-round` + `feather-fan` on bird
reads as *a bird*; morphs/boneScales visibly reshape parts live; springs
re-attach after every swap (shake test from plan 003's debug panel).

## Test plan

`test/core/skeleton/`: `canonical.test.ts` (bone contract), `archetypes.test.ts`
(proportion application, height targets), `partRegistry.test.ts` (registry
completeness, slot/bone validity), `assets.test.ts` (GLB structural
validation), `assemble.test.ts` (assembly with a stub registry: morphs
applied, spring defs merged, disposal releases geometries). `pnpm test` → all
pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0 (≥ 5 new test files)
- [ ] 3 archetype bodies + ≥ 14 parts committed, all within tri budgets (test-enforced)
- [ ] ≥ 4 personality face-atlas variants registered and visually distinct per the 000 §2.1b grammar (step 3b)
- [ ] `ASSET-CONTRACT.md` documents the full artist contract
- [ ] Dev: dog-like and bird-like characters assemblable via panel, alive (face + springs + breath) after every swap
- [ ] No geometry leaks on reassembly (report `renderer.info.memory` before/after 20 swaps)
- [ ] `plans/README.md` updated

## STOP conditions

- Blender MCP unavailable AND no local Blender scripting path exists: build
  steps 1, 4, 5 against **procedurally generated stand-in bodies/parts**
  (lathe/capsule compositions honoring the same contract), commit those, and
  mark the plan `BLOCKED (authored assets pending)` — the code contract is
  the deliverable; do not ship the stand-ins as final.
- Skinning quality unachievable programmatically (candy-wrapper elbows, ear
  root tearing) after two corrective passes — commit best attempt, list the
  specific weight-painting fixes a human artist must do in `ASSET-CONTRACT.md`,
  and say so in your report.
- Any pressure to rename canonical bones — that's a plan-000 change; STOP.

## Maintenance notes

- The rest pose exported here is what plan 007's clips are authored against —
  changing it after 007 lands means re-exporting every clip.
- Plan 008 mounts wardrobe on the same sockets; plan 009 sculpts these
  meshes' vertices (fixed topology contract — artists must never change vertex
  count of a shipped mesh version without bumping `baseMeshVersion`).
- Reviewer: bone-name byte-equality between Blender export and `canonical.ts`
  (glTF exporters mangle names — dots are usually safe, but verify);
  disposal on reassembly.
