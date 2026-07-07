# Plan 012: Procedural-first character architecture + natural animal stance (wave-3 brief)

> **This is a reference document, not an execution plan.** Plans 013–016
> execute it. Read this fully before executing any wave-3 plan — it records
> the decisions, the vocabulary, the parity contract, and the formal
> supersession of two decisions in `plans/000-architecture-and-strategy.md`.

## Status

- **Priority**: — (reference doc)
- **Planned at**: commit `a8f7c8e1`, 2026-07-07
- **Category**: direction / migration

## Operator directive (2026-07-07, verbatim intent)

Refactor the character to be **procedural instead of GLB**, keeping all core
feature parity — animation, changing animals (species), changing clothes
(wardrobe) — and change the stance so the animal is **not standing upright
but posed like a normal animal, Pokopia-style** (quadruped mammals on four
legs; birds in a natural bird stance). Textures are to be **generated with
image generation via the `/codex:rescue` skill (Codex imagegen)**, in the same
style as the sand texture assets used in the island editor
(`island-editor/public/textures/sand-soft-ripples.png`).

## Formal supersession of plan-000 decisions

`plans/000-architecture-and-strategy.md` §3 lists rejected alternatives with
the instruction "do not re-litigate without new evidence." The new evidence is
the operator directive above. Two rows are superseded; the rest stand.

| Plan-000 decision | Status after this brief |
|---|---|
| §3 "**Fully procedural character generation** — the prior attempt's trap. Authored meshes + parametric variety is how the reference games hit the bar." | **SUPERSEDED by operator direction.** Geometry, clips, wardrobe, and patterns become TypeScript-procedural. The *quality lessons* of the authored era are retained as contracts (welded single mesh, fixed topology, AC-proportion benchmarks, deterministic output). |
| §4.3 "Foot IK: authored clips + two-bone IK correction. Procedural layers adjust, never generate, locomotion." | **PARTIALLY SUPERSEDED.** Clips are now *generated* by a TS clip synthesizer (plan 014). The clip state machine, mixer, crossfades, and IK-correction architecture are unchanged — synthesis replaces Blender authoring, not the playback stack. |
| §3 all other rows (Babylon, WebGPU-first, VRM, PBD cloth, Draco, retargeting, photoreal PBR) | **STAND.** Do not touch. |
| Wave-1 rejection of "Pokopia as benchmark" (`advisor-plans/README.md`, findings-rejected) | **STANDS for rendering/teardown purposes** (AC:NH remains the shading/proportion benchmark). Pokopia is reinstated **only as the stance reference**: animals read as animals — quadrupeds walk on four legs, birds perch/waddle naturally. No upright anthro mammals. |

Everything else in plan 000 — canonical-skeleton discipline, spec-driven
authoring, toon recipe, spring/procedural layering, frame order
(animation → physics → procedural → render), meshopt+KTX2 export,
`SEN_companion` extension, `src/core/**` React ban — **stands unchanged**.

## Architecture decisions (D1–D6)

These were made by the advisor from codebase evidence; the operator can
override any of them before execution starts. Each names its rationale.

### D1 — Keep the skinned-mesh architecture; procedural means *generated geometry*, not a rigid part hierarchy

The in-repo procedural exemplar (`bird-builder/src/rig/buildBird.ts`, ported
from the engine's `Kira.js`) assembles rigid `THREE.Group` primitives with no
skeleton. **We do NOT copy that shortcut.** The studio's entire downstream
stack — clip state machine, spring solver, foot IK, sculpt deltas, wardrobe
deformation, the export compiler, `companion-runtime` — consumes
`SkinnedMesh` + `Skeleton`. `assembleCharacter` (`src/core/skeleton/assemble.ts:167`)
and `compileCharacter` (`src/core/export/compile.ts:123`) take **pre-loaded
THREE scenes** and never ask where they came from:

```ts
// src/core/skeleton/assemble.ts:30-37
export interface LoadedAssets {
  /** Pristine body GLB scene (rig + skinned meshes). Cloned by assembly. */
  bodyScene: THREE.Object3D
  /** Pristine part GLB scenes per slot (absent for empty parts). */
  partScenes: Partial<Record<PartSlot, THREE.Object3D>>
  /** Authored palette-mask/albedo textures per region ('authored' textureId). */
  texturesByRegion?: Partial<Record<Region, ResolvedTextures>>
}
```

So the refactor substitutes at this boundary: TypeScript builders produce
scenes shaped exactly like the loaded GLBs (canonical skeleton +
`SkinnedMesh`es bound to it, morph targets, UVs), and assembly/export stay
byte-for-byte identical. bird-builder remains a *vocabulary* reference
(genome-style params, toon zones, silhouette variety), not an architecture
reference.

### D2 — Registries grow a `source` union; GLB lane survives until parity gates pass, then dies

`BODY_REGISTRY` / `PART_REGISTRY` (`src/core/skeleton/partRegistry.ts`) and
`WARDROBE_REGISTRY` (`src/core/wardrobe/itemRegistry.ts`) each expose `url`
as the only asset handle today. Each def gains
`source: { kind: 'procedural'; build: (ctx: BuildContext) => THREE.Object3D } | { kind: 'glb'; url: string }`
(exact shape in plan 013). The only two runtime GLB loaders route per-def:
`src/studio/viewport/CharacterRoot.tsx` (drei `useGLTF`) and
`src/studio/roster/companionExport.ts` (`loadBrowserAssets`, raw
`GLTFLoader.loadAsync`) — note the second lives under `src/studio/roster/`,
NOT `src/core/export/`. `meshVersion` semantics are retained, and the first
procedural build of every body/part **bumps its meshVersion** (topology
changed → saved sculpt deltas refuse loudly — existing behavior). When all
defs are procedural and gates pass, the GLB assets and their package-script
entries are deleted per plan (013 bodies/parts, 014 clips, 016 wardrobe);
the `scripts/blender/*.py` files are deleted **once, in plan 016's final
sweep** — they cross-import each other (`clips.py` imports `bodies`,
`gen_assets.py` drives `patterns.py`, everything uses `meshkit.py`/
`blender_io.py`), so per-plan deletion would leave broken orphans. Each
deletion step is gated on operator approval.

### D3 — Natural stance via a `stance` axis; the 38 canonical bone names are reused, front legs ride the arm chain

The single hardest coupling is the canonical skeleton:
`BONE_NAMES` is a `.strict()` zod enum (`src/core/spec/schema.ts:48-87`, 38
bones) wired into specs, springs, clips, IK, sockets, and export. We do
**not** add or rename bones. Instead:

- New vocabulary: `stance: 'quadruped' | 'biped'` per archetype.
- **Quadruped rest pose** (new `W_QUADRUPED` table in `canonical.ts`, plan
  014): spine chain runs horizontally (+Z toward the head), `shoulderL/R →
  upperArmL/R → foreArmL/R → handL/R` become the **front legs** (hands are
  front feet on the ground), `upperLeg → lowerLeg → foot → toes` are the hind
  legs. Head rises from the chest on the neck bone. Tail chain exits
  horizontally. Sockets keep their names; `socket.torso` sits on the back
  (saddle position), `socket.hat` on the head as before.
- **Bird archetype keeps a biped stance** — that IS the natural bird — with
  the existing wing-arms. Its rest pose is re-proportioned toward a real
  bird (horizontal body axis, head forward) rather than a standing anthro.
- Archetype ids migrate: `biped-round → quad-round`, `biped-slim → quad-slim`,
  `bird → bird` (spec v3 migration, plan 014). Species presets in
  `src/core/species/registry.ts` re-map accordingly (all 5 mammal species
  become quadrupeds).
- Rest local rotations stay **identity** (positions carry the pose) — this
  invariant (`canonical.ts:14-17`) is what keeps `boneScales` world-aligned
  and must survive the re-pose.

### D4 — Animation parity via procedural clip *synthesis* feeding the unchanged clip machine

`createClipMachine` takes `(mixer, clips, options)` and validates
`REQUIRED_CLIPS` = idle, walk, run, sitIdle, talkIdle, sitDown, standUp, 4
gestures (`src/core/motion/clipStateMachine.ts:41-55`). A new
`src/core/motion/clipSynth/` module generates that exact clip set as
`THREE.AnimationClip`s per stance — quadruped gaits (4-beat walk, trot for
run), natural sit (haunches), head-led talk and gestures. PlayMode drops
`useGLTF(clipsUrl)`; export gains a converter that bakes the generated clips
into the gltf-transform `Document` that `compile.ts` already consumes
(`CompileAssets.clipsDocument`, `compile.ts:82-83`). Foot IK extends from 2
to 4 chains by treating the arm chain as a second two-bone pair. Springs,
procedural idle, talk driver, frame order: unchanged.

### D5 — Textures: imagegen albedo grain + TS-rasterized pattern masks

Two texture lanes, both procedural:

1. **Tileable albedo detail** (NEW, plan 015): grayscale fur/feather grain
   maps generated by **Codex imagegen via the `/codex:rescue` skill**, in the
   island-editor sand-texture style — 1024×1024, seamless, soft painterly,
   with the same texture config as
   `island-editor/src/scene/IslandTerrain.tsx:26-48` (`RepeatWrapping`,
   mipmaps; color space decided by A/B in plan 015). They plug into the toon
   material's `ResolvedTextures.map` slot (`toonMaterial.ts:39-44`) — which
   is already LIVE: `createToonMaterial` keeps a 1×1 white `DataTexture`
   there so `USE_MAP` stays compiled and `<map_fragment>` multiplies
   `diffuseColor` every frame. The grain swap replaces white with texture;
   no shader work. `materials.<region>.textureId` is a free string in the
   schema (`schema.ts:239`), so grain ids need no spec change.
2. **Pattern masks** (plan 015): the channel-packed palette masks
   (R/G/B/A → primary/secondary/belly/accentA) are per-vertex analytic
   *fields* evaluated on the body (that is how `scripts/blender/patterns.py`
   actually works), rasterized to UV space. Plan 015 ports both halves to
   TS: field evaluation on the plan-013 procedural body (via its
   `ProcBodyData` channels/meta) and a barycentric UV rasterizer (port of
   `meshkit.py::rasterize_mask`) with island-aware gutters. Required anyway
   because procedural meshes define new UVs. `patternRegistry.ts` keeps its
   id vocabulary and the `resolvesAuthored()` contract
   (`src/core/materials/patternRegistry.ts:57-59`).

Provenance: every imagegen output is recorded in an asset manifest (id,
prompt, generator, date) following the concern in
`docs/plans/2026-06-12-asset-provenance-audit.md` — AI-generated, we own the
output, no third-party texture sites.

### D6 — Migration is parallel-lane, parity-gated, and staged biped-first

Order of operations de-risks the two big changes by never doing both at once:

1. **Plan 013** builds the procedural mesh kit and regenerates the three
   *existing* archetype bodies + all 12 anatomy parts procedurally, still in
   the current upright stance — so the entire existing test suite, clip set,
   and visual baseline verify geometry parity in isolation.
2. **Plan 014** then changes stance (skeleton rest tables, archetypes v2,
   spec v3, clip synthesis) on top of proven procedural geometry.
3. **Plan 015** (textures) and **plan 016** (wardrobe) follow the same
   pattern: procedural lane in, parity gate, old lane out.

`sculptDelta` payloads are keyed to `assetId + meshVersion + vertexCount`
(`src/core/spec/schema.ts:145-170`) and are doubly invalidated: plan 013
bumps every body/part `meshVersion` (new topology), and plan 014's
archetype rename changes the derived sculpt assetIds
(`` `body-${archetype}` ``, `CharacterRoot.tsx:215`). The v3 migration
drops sculpt with a console warning; the loud-refusal machinery covers
anything that slips through. **Operator should confirm no roster
character's sculpt is precious before 013 lands.**

## Parity contract (every wave-3 plan is gated on this)

The studio at `a8f7c8e1` passes 484 tests (`cd character-studio && pnpm
typecheck && pnpm test`). After each plan lands, ALL of the following still
hold (each plan's Done criteria enumerate its slice):

1. **Species switching** — Animal tab class chips → Core-8 species cards +
   Custom; one click applies proportions/parts/palette/pattern/face; one ⌘Z
   undoes the whole apply (`src/studio/panels/SpeciesSection.tsx`).
2. **Part swapping** — class-filtered part pickers (`partsForSlot`), skinned
   and rigid attachment, per-part morph sliders, boneScales.
3. **Wardrobe** — all 10 items wearable, ear modes, hideBodyRegions,
   item spring chains, palette overrides, redress on change.
4. **Play Mode** — idle/walk/run/sit/talk + 4 gestures through
   `createClipMachine`, locomotion drive, foot-IK ground contact, spring
   secondary motion, breath-only idle during walk.
5. **Face** — drawn in the head mesh's own UVs at edit time (composited
   `uFaceMap`), blink/gaze/talk, 관상 personality atlases.
6. **Sculpt** — brushes + lattice still operate on the (procedural)
   `BufferGeometry`; deltas persist and reload for the new meshVersions.
7. **Roster & autosave** — IndexedDB save/load round-trips spec v3.
8. **Export** — RosterView/ExportPanel compile a conformant
   `.companion.glb` (meshopt, `SEN_companion`), loadable by
   `packages/companion-runtime` on three 0.149 and 0.185.
9. **Rendering** — toon recipe, palette recolor, outlines, lighting studio.

## Shared vocabulary for wave-3 plans

- **Mesh kit** — `src/core/procgen/` (new): deterministic TS geometry
  builders. Deterministic = same params → same topology, same vertex order,
  same UVs (morph targets are re-evaluations of the kit at different params;
  sculpt deltas and morphs both require stable vertex indexing).
- **Stance** — `'quadruped' | 'biped'`, an `ArchetypeDef` field.
- **BuildContext** — `{ archetype, skeleton: BuiltSkeleton, rng: SeededRng }`
  passed to every `build()`. No `Math.random` in core (plan-000 rule stands).
- **Grain map** — the imagegen grayscale tileable albedo (plan 015).
- **Pattern mask** — channel-packed palette mask (existing term).

## Plan map

| Plan | Title | Executor model | Depends on |
|------|-------|----------------|------------|
| 013 | Procedural mesh kit: bodies + anatomy parts (biped parity) | **Fable 5** (novel geometry algorithms + silhouette judgment) | 012 |
| 014 | Natural stance + procedural clip synthesis | **Fable 5** (gait feel is aesthetic-gated) | 013 |
| 015 | Imagegen grain textures + TS pattern masks | Sonnet 5 (well-specified wiring; imagegen prompts provided) | 013 |
| 016 | Procedural wardrobe | Opus 4.8 (precedented garment fitting, machine-checkable gates) | 013, 014 |

Wave-1/2 lessons every executor must carry (from `advisor-plans/README.md`):
bodies must be **one welded continuous mesh** (overlapping shells tear —
that's why wave-1 plan 003 exists); faces are drawn **in the head's own UVs**
(no floating planes at edit time); mask rasterization needs island gutters
(the UV-seam back-stripe bug); `resolvesAuthored(textureId)` — never a bare
`=== 'authored'` check; part morph defaults must be neutralized/zeroed.

## Open questions the operator can settle before execution (defaults chosen)

1. Sculpt deltas on saved rosters are dropped by the v3 migration (loudly).
   Default: acceptable — confirmed sculpts can be re-done on procedural
   meshes. Override = a re-projection tool, which is a plan of its own.
2. The tall-bird (ostrich) archetype and reptile class stay deferred
   (wave-2 operator decision). Wave 3 does not add species.
3. Blender stays installed for nothing after wave 3 — the `scripts/blender/`
   lane is deleted. Default: delete; git history preserves it.
