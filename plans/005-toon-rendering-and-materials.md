# Plan 005: Build the toon rendering pipeline and material/texture system (the Pokopia look)

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.3 is this plan's foundation). Follow steps in order, verify each,
> honor STOP conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/materials character-studio/src/studio`
> Confirm: plan-001 stage + placeholder body; plan-002 face rig (unlit face
> planes — you must NOT shade them); plan-004 spec store with `palette` and
> `materials` fields. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED-HIGH (aesthetic gate; shader work)
- **Depends on**: plans/001, 002, 004
- **Category**: direction
- **Recommended executor**: Opus 4.8 (well-precedented shader engineering; Fable 5 if available for the final look-tuning step)
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

"Rendering & texture fidelity to the Pokopia bar" is a hard requirement:
soft, matte, premium "vinyl toy" shading — not flat placeholder, not photoreal
PBR. This plan replaces the placeholder `MeshToonMaterial` with our real
shading model, adds the post-processing stack, palette-driven recoloring
(the mechanism wardrobe and student customization both ride on), and the
designer's material control panel.

## Current state

- Placeholder body uses `MeshToonMaterial` + 3-step gradient (plan 001).
- Spec (`plan 004`) carries `palette` (six named hex slots) and
  `materials` (per-region `{ rampSoftness, rimStrength, shadowTint,
  textureId?, outline? }`).
- Installed: `three@^0.185`, `@react-three/postprocessing@^3`,
  `postprocessing@^6.36`, `n8ao@^1.9` (plan 001).
- **The shading recipe** (researched; plan 000 §2.3 — implement exactly this,
  it is the documented closest analogue to the AC/Pokopia look):
  1. `d = dot(N, L)` per light, remapped with **wrap bias**: `dw = (d + w) / (1 + w)`, `w ≈ 0.35`.
  2. **Soft step** at the terminator: `s = smoothstep(0.5 - softness, 0.5 + softness, dw)`, `softness` = `rampSoftness * 0.5`, default ≈ 0.1.
  3. Color = `mix(albedo * shadowTint, albedo * lightTint, s)` — shadow is a
     **tinted** (slightly cool/violet, e.g. default `#b8a8c8`-weighted) version
     of albedo, never gray/black. Optional 1D ramp texture multiplied in a
     narrow band around the terminator for fake-SSS warmth (`terminatorWarmth`).
  4. **Rim**: `pow(1 - dot(N, V), 3) * rimStrength * lightColor`, masked to the
     lit side (`* s`), added.
  5. Ambient from scene IBL/hemisphere, low intensity — the matte look needs
     high ambient floor (~0.45) so shadows stay pastel.
  - AC has **no outlines**; `outline` flag adds an inverted-hull pass
    (backface-extruded shell, extrude along smoothed normals ~2.5 mm, uniform
    dark-warm color) only when set.
- Implementation route: extend `MeshStandardMaterial`-free — use
  `THREE.ShaderMaterial` is allowed but you lose shadows/skinning for free;
  **preferred: `MeshToonMaterial` (or `MeshLambertMaterial`) via
  `onBeforeCompile`**, injecting the ramp/rim math into the lighting chunks so
  shadow-map receiving, skinning, and morph targets keep working. Wrap the
  whole thing in a factory so the choice is swappable.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/materials/{toonMaterial.ts, palette.ts, outline.ts, ramp.ts}` (new)
- `character-studio/src/studio/viewport/{PostFX.tsx (new), Stage.tsx (integrate), PlaceholderBody.tsx (swap material)}`
- `character-studio/src/studio/panels/MaterialPanel.tsx` (new)
- `character-studio/test/core/materials/**`

**Out of scope**:
- Face planes stay **unlit** (plan 002 contract) — do not touch `core/face`.
- KTX2 compression (export-time, plan 011), real body textures (006 authors
  meshes/UVs; here you support `textureId` but test with a generated checker/
  spot texture), lighting rig UI (010), WebGPU/TSL (rejected for v1).

## Git workflow

- Branch: `advisor/005-toon-rendering`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: Palette + recolor masks (`palette.ts`)

Recolor mechanism: body textures are authored as **grayscale luminance + a
palette-mask texture** whose R/G/B/A channel weights select palette slots
(channel-packed masks: R=primary, G=secondary, B=belly, A=accentA; accentB
and padsNose ride a second mask if needed later — v1: one mask, four slots).
`resolvePalette(spec.palette)` → uniforms `{ uPaletteColors: vec3[6] }`;
shader computes `albedo = luminance * Σ maskChannel_i * palette_i` (+
unmasked remainder uses `primary`). Provide `makeDebugMaskTexture()`
(procedural spots/belly gradient on the placeholder UVs) so the system is
demonstrable before authored art (006) exists.

**Verify**: unit tests — palette resolution maps slots to uniform indices
stably; hex → linear-srgb conversion correct for two known values.

### Step 2: Toon material factory (`toonMaterial.ts`)

`createToonMaterial(assign: MaterialAssign, palette, opts)` implementing the
full recipe from "Current state" via `onBeforeCompile` injection, with
uniforms for `rampSoftness, rimStrength, shadowTint, terminatorWarmth,
uPaletteColors`, and defines toggling mask/texture paths. Must keep:
`skinning` (006 needs it), `morphTargets` (006), shadow receive/cast. Cache
compiled variants by a key of the boolean defines (material explosion
control). Update `MaterialAssign` handling to read every field from the spec.

**Verify**: `pnpm dev` → placeholder body renders with the new shading: soft
pastel core shadow, subtle rim; sliders in panel (step 5) change it live.

### Step 3: Inverted-hull outline (`outline.ts`)

`addOutline(mesh, { thickness = 0.0025, color = '#3a2e2a' })` — clone
geometry, `BackSide`, vertex shader pushes along **smoothed** normals
(precompute angle-weighted smoothed normals into an attribute — hard edges
tear otherwise), unlit color, `renderOrder` before body. Off by default.

**Verify**: toggling `outline` in the panel adds a clean, even contour with
no gaps at the sphere/capsule seam.

### Step 4: Post stack (`PostFX.tsx`)

`@react-three/postprocessing` `EffectComposer`: **N8AO** (quality preset
"performance", radius tuned to character scale ~0.4, intensity gentle ~1.5 —
AO here is for soft contact grounding, not gritty realism), **Bloom**
(luminance threshold high, only catches highlights/catchlights), **SMAA**.
ACES filmic tone mapping stays on the renderer. Cap: exactly these three
(plan 000 §9 budget). `?fx=0` query param disables the composer entirely
(perf A/B).

**Verify**: `pnpm dev` with `?stats=1` → 60fps with composer on (report the
delta with `?fx=0`); character sits into the pedestal shadow contact softly.

### Step 5: Material panel (`MaterialPanel.tsx`)

Per-region controls bound to the spec store (plan 004 `patch`): palette slot
color pickers (native `<input type=color>` fine for now), rampSoftness /
rimStrength / terminatorWarmth sliders, shadowTint picker, outline toggle,
texture picker stub (lists `debug-spots`, `none`). All changes live-update
the viewport through the store subscription — no "apply" buttons.

**Verify**: recoloring `primary` changes body coat color while `belly` stays;
material params update in real time; `pnpm typecheck && pnpm test` pass.

### Step 6: The look gate (do not skip)

Judge against references (AC:NH villager screenshots for shading language;
Pokopia reviews describe "clean, colourful, toy-like"):
- Shadow side reads **pastel/tinted**, never gray or dirty.
- Terminator is soft but present (not Lambert-smooth, not hard cel unless
  softness → 0 — the slider should sweep between those extremes usefully).
- Rim gives the "toy pop" without looking like Tron.
- Face planes remain print-crisp and unshaded under all of it.
- 60fps holds.

Iterate defaults until all hold; write the final defaults into
`createDefaultCharacter` (plan 004's `defaults.ts` — this is an allowed
cross-file edit; note it in your report). If you cannot view the scene,
report DONE-pending-visual with operator steps.

## Test plan

`test/core/materials/`: `palette.test.ts` (slot mapping, color conversion,
mask-channel weights sum handling), `toonMaterial.test.ts` (factory returns
material with expected uniforms/defines for each MaterialAssign permutation;
variant cache hits for identical defines), `outline.test.ts` (outline
geometry has same vertex count, normals attribute present, BackSide set).
`pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0 (3 new test files)
- [ ] Skinning + morph-target defines verified present on the factory material (test asserts)
- [ ] Palette recolor demonstrably region-masked in dev (spots/belly demo)
- [ ] Post stack = N8AO + Bloom + SMAA exactly; `?fx=0` works; 60fps reported
- [ ] Face planes unaffected (`git diff --name-only character-studio/src/core/face/` empty)
- [ ] Step-6 look gate passed or reported pending-visual
- [ ] `plans/README.md` updated

## STOP conditions

- `onBeforeCompile` injection points have drifted in three r185+ such that
  the lighting chunk names in your three version don't match what you expect —
  report the actual chunk source rather than fighting it blind.
- N8AO incompatible with the installed postprocessing version after one
  version-alignment attempt.
- Any change wants to touch `core/face` materials.

## Maintenance notes

- Plan 006's authored meshes must ship the channel-packed palette masks
  defined in step 1 — that authoring contract lives in 006 and must match
  `palette.ts` exactly. Plan 011 serializes MaterialAssign into the export
  extension; renaming uniforms is fine, renaming spec fields is not.
- Reviewer: check the variant cache key covers every define (stale-variant
  bugs are subtle), and that dev-mode spec validation (004) doesn't run per
  slider-drag frame (throttle patches or validate on commit).
- Deferred: KTX2 (011), designer-uploaded textures (post-v1), WebGPU/TSL port
  (contained inside `toonMaterial.ts` factory boundary by design).
