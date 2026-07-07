# Plan 002: Draw the face on the head mesh surface (kill the floating planes)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1fd7413..HEAD -- character-studio/src/core/face/ character-studio/src/core/materials/ character-studio/src/studio/viewport/FaceRig.tsx character-studio/src/studio/viewport/CharacterRoot.tsx character-studio/src/core/skeleton/partRegistry.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (001 recommended first — it's the fast dogfooding win)
- **Category**: tech-debt (architecture; fixes the floating-mouth defect class)
- **Planned at**: commit `1fd7413`, 2026-07-06

All commands run from the `character-studio/` directory.

## Why this matters

Today the eyes/brows/mouth are **separate curved plane meshes hovering off an
analytic sphere**: base hover 1.5 mm (`facePlane.ts:13`), mounted at
`headRadius * 1.07` (`CharacterRoot.tsx:435` — ~1.5 cm of real hover on the
0.22 m biped-round cranium), and muzzle parts shove the mouth a further
0.09–0.14 m outward (`partRegistry.ts:126,136`) hoping it lands "on the
muzzle front". The result users see: a mouth floating in mid-air beside the
muzzle from any non-frontal angle, and the whole face parallaxing off the
head at grazing angles. Sculpting or morphing the head widens the gap further
because the planes track the analytic sphere, not the mesh.

The benchmark (Animal Crossing: New Horizons, confirmed by community
teardowns) renders faces as **texture swaps in the head mesh's own UV
space** — no separate face geometry exists, so floating/parallax/z-fighting
are structurally impossible. This plan adopts that technique: composite the
existing atlas cells into a per-character face overlay texture sampled by the
head's own material, in the head's own UVs. The face then follows every
deformation (morphs, sculpt, bone scales) for free. The atlas art, expression
presets, blink machine, gaze easing, and talk-viseme systems are all kept —
only the *rendering target* changes.

## Current state

Files and roles:

- `src/core/face/atlas.ts` — 4×4 atlas cell contract (`EYE_CELLS`,
  `MOUTH_CELLS`, `BROW_CELLS`, `PUPIL_CELLS`, `cellUvOffset`). PERMANENT
  CONTRACT — do not change cell meanings.
- `src/core/face/facePlane.ts` — sphere-projected plane geometry + unlit
  atlas materials (`makeFacePlaneGeometry`, `makeAtlasMaterial`,
  `makePupilMaterial`, `setCell`, `setGaze`). This rendering path is what
  gets replaced.
- `src/core/face/faceRig.ts` — expression/blink/gaze state machine
  (`createFaceRig`); currently *creates plane meshes* via `addPlane`
  (lines 159–216) and mutates their materials. The state machinery is kept;
  its output target changes.
- `src/core/face/atlasRegistry.ts` — atlasId → texture URLs (관상 variants).
- `src/studio/viewport/FaceRig.tsx` — React mount: loads atlas textures,
  creates the rig on the face anchor, registers the `procedural` update,
  publishes the rig handle via `useFaceRigStore` (FacePanel + talk driver
  drive it through this handle).
- `src/studio/viewport/CharacterRoot.tsx` — mounts `<FaceRig>` into
  `assembled.faceAnchor` via `createPortal` with `headRadius * 1.07`
  (lines 421–437).
- `src/core/materials/toonMaterial.ts` — the toon shader all body/part
  meshes use (built with `onBeforeCompile` injection; live uniforms in
  `material.userData.toonUniforms`).
- `src/core/skeleton/assemble.ts` — computes `hideMouth` and
  `mouthRadialOffset` from equipped muzzle parts (lines 217–226, 296–301).
- `scripts/blender/bodies.py` — head UV island: `UV_HEAD = (0.0, 0.45,
  0.55, 1.0)` (line 17), **front-centered** (`uv_front_center = True`,
  line 164 area) — azimuth 0 (the +Z face direction) maps to u = 0.5 of the
  island. Head shell: `ellipsoid(..., useg=32, vseg=22)` with param mapping
  azimuth u∈[0,1], polar v∈[0,1] bottom-up (`meshkit.py:53-86`).

Key excerpts as of `1fd7413`:

`CharacterRoot.tsx:431-437` (the ×1.07 hover mount):

```tsx
{createPortal(
  // head shells are drawn slightly wider than the cranium sphere
  // (head_wide 1.02–1.06 in the body builder) — pad the face-plane
  // radius so eyes/brows float just off the widest surface.
  <FaceRig headRadius={assembled.headRadius * 1.07} placement={placement} hideMouth={assembled.hideMouth} />,
  assembled.faceAnchor,
)}
```

`faceRig.ts:208-216` (the seven hover planes):

```ts
addPlane('eyeWhiteL', eyeWhiteMatL, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, false, 1)
addPlane('eyeWhiteR', eyeWhiteMatR, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, base, true, 1)
const pupilL = addPlane('pupilL', pupilMatL, -p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, false, 2)
const pupilR = addPlane('pupilR', pupilMatR, p.eyeAzimuth, p.eyeElevation, p.eyeWidth, p.eyeHeight, above, true, 2)
addPlane('browL', browMatL, -p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, false, 1)
addPlane('browR', browMatR, p.eyeAzimuth, p.eyeElevation + p.browLift, p.browWidth, p.browHeight, base, true, 1)
addPlane('mouth', mouthMat, 0, p.mouthElevation, p.mouthWidth, p.mouthHeight, base + p.mouthRadialOffset, false, 1)
```

`faceRig.ts:81-93` (angular placement — the SOURCE OF TRUTH for where parts
sit; this plan converts these angles to head-UV rectangles):

```ts
export const DEFAULT_PLACEMENT: FacePlacement = {
  eyeAzimuth: 20 * DEG, eyeElevation: 5 * DEG,
  eyeWidth: 26 * DEG, eyeHeight: 30 * DEG,
  browLift: 18 * DEG, browWidth: 24 * DEG, browHeight: 16 * DEG,
  mouthElevation: -18 * DEG, mouthWidth: 32 * DEG, mouthHeight: 24 * DEG,
  mouthRadialOffset: 0,
}
```

Face-rendering constraints already documented in the code (honor them):

- `facePlane.ts:5-7`: "Face materials are ALWAYS unlit — drawn faces must not
  pick up scene shading (plan 005 must not toon-shade these)."
- `facePlane.ts:107`: `material.toneMapped = false // print-crisp colors`.
- `atlas.ts` pupil/gaze contract: pupil offset by gaze within the eye-white
  alpha mask (Wind Waker mechanic), `GAZE_MAX = 0.06` cell fractions.
- Existing tests: `test/core/face/atlas.test.ts`, `facePlane.test.ts`,
  `faceRig.test.ts` — `faceRig.test.ts` exercises expressions/blink/gaze
  through the public `FaceRig` interface; that interface must survive.

### Head-UV mapping math (derived from `meshkit.py:53-86` + `bodies.py:17`)

The head shell is a `sphere_shell` with params `u = azimuth-fraction`
(azimuth 0 = +Z, increasing toward +X, i.e. **viewer-left when facing the
character is −u**... use the sign convention below and verify visually),
`v = polar-fraction` (0 = bottom pole, 1 = top). `shell_loop_uvs` maps
params into `UV_HEAD = (u0,v0,u1,v1) = (0.0, 0.45, 0.55, 1.0)` with
front-center shift `us = (us + 0.5) % 1`.

For a face feature at azimuth `θ` (radians, + toward +X) and elevation `φ`
(radians, + up) on the head sphere:

- azimuth fraction `a = θ / (2π)`; island u = `u0 + ((a + 0.5) % 1) * (u1 - u0)`
- polar angle from bottom = `π/2 + φ`, so v-fraction `pv = (π/2 + φ) / π`;
  island v = `v0 + pv * (v1 - v0)`

An angular width `w` maps to island-u width `(w / 2π) * (u1 - u0)` **at the
equator**; at elevation φ the same angular width covers `1/cos(φ)` more
azimuth — for the small elevations used here (≤ 23°) apply the `1/cos(φ)`
factor and verify visually. Angular height `h` maps to island-v height
`(h / π) * (v1 - v0)`.

Write these formulas into a pure helper (`facePlacementToUvRect` in the new
composite module) with unit tests pinning known values (e.g. azimuth 0,
elevation 0 → island center u = u0 + 0.5·(u1−u0) = 0.275, v = v0 + 0.5·(v1−v0)
= 0.725).

## Commands you will need

| Purpose   | Command (in `character-studio/`) | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                 | exit 0              |
| Tests     | `pnpm test`                      | all pass            |
| Dev serve | `pnpm dev`                       | Vite on :5190       |

## Suggested executor toolkit

- If the `verify` skill is available, use it after Step 7 to drive the dev
  server and screenshot the face from front/three-quarter/side angles.

## Scope

**In scope**:

- `src/core/face/faceComposite.ts` (create — canvas compositor + UV math)
- `src/core/face/faceRig.ts` (rendering target swap; state machine kept)
- `src/core/face/facePlane.ts` (gutted last — see Step 8)
- `src/core/face/index.ts`
- `src/core/materials/toonMaterial.ts` (add `faceMap` overlay uniform)
- `src/studio/viewport/FaceRig.tsx`
- `src/studio/viewport/CharacterRoot.tsx` (mount changes)
- `src/core/skeleton/assemble.ts` (only the `mouthRadialOffset` plumbing removal)
- `src/core/skeleton/partRegistry.ts` (only `mouthOffset` field removal)
- `test/core/face/faceComposite.test.ts` (create), `test/core/face/faceRig.test.ts` (update)

**Out of scope** (do NOT touch):

- `src/core/face/atlas.ts` — the cell layout is a PERMANENT CONTRACT.
- `scripts/generate-face-atlas.ts` and the atlas PNGs — art is unchanged.
- `scripts/blender/bodies.py` / regenerating body GLBs — the head UVs already
  reserve a generous front-centered island; no asset changes.
- The muzzle-on-mesh mouth (drawing the mouth onto an equipped muzzle's own
  UVs) — **deferred**, see Step 9 for the interim behavior and Maintenance
  notes for the follow-up.
- `src/core/motion/talkDriver.ts` — it drives the mouth through
  `FaceRig.setMouthOverride`, which this plan preserves.

## Git workflow

- Branch: `advisor/002-face-drawn-on-mesh`
- Commit per step; style `feat(character-studio): ...` / `refactor(character-studio): ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the face compositor (pure, testable core)

Create `src/core/face/faceComposite.ts`:

- `facePlacementToUvRect(placement-part, headIslandRect)` — the UV math from
  "Current state", returning `{u, v, w, h}` island rects for eyeL, eyeR,
  browL, browR, mouth. Head island rect is a parameter (default
  `[0.0, 0.45, 0.55, 1.0]` = `UV_HEAD`), not a hardcoded constant.
- `createFaceCompositor(config)` where config carries the four atlas
  `HTMLImageElement | ImageBitmap | CanvasImageSource` sources, the placement,
  and a canvas size (default 1024 — the head island is 55% × 55% of it).
  Returns:

```ts
interface FaceCompositor {
  /** The composited overlay texture (THREE.CanvasTexture), flipY=true, sRGB. */
  texture: THREE.CanvasTexture
  /** Redraw with the given cells + gaze. Cheap: a clear + ≤7 drawImage calls. */
  draw(state: {
    eyeL: EyeCellName; eyeR: EyeCellName; brow: BrowCellName
    mouth: MouthCellName | null            // null = mouth hidden (beak parts)
    pupil: PupilCellName; pupilsVisible: boolean
    gaze: { x: number; y: number }         // cell fractions, ±GAZE_MAX
  }): void
  dispose(): void
}
```

Drawing rules (2D canvas):

- For each part, `drawImage` the source atlas sub-rect for the cell
  (cell → pixel rect via `cellUvOffset` × atlas image size) into the part's
  island rect (UV rect × canvas size; canvas y is 1−v).
- Mirror the right eye/brow horizontally (`ctx.scale(-1, 1)` around the part
  rect) — same convention as the old `mirrorU` (art authored for the
  viewer-left eye, `faceRig.ts:184-185`).
- Pupils: draw the pupil cell offset by `gaze` (in part-rect fractions),
  clipped by the eye-white alpha. Implement the mask with an offscreen
  scratch canvas per eye: draw pupil (gaze-offset), set
  `globalCompositeOperation = 'destination-in'`, draw the eye-white cell,
  then composite the scratch onto the main canvas. Skip pupils when
  `pupilsVisible` is false.
- After drawing set `texture.needsUpdate = true`.

**Verify**: `pnpm typecheck` → exit 0. New unit tests in Step 2 pass.

### Step 2: Unit-test the compositor

Create `test/core/face/faceComposite.test.ts` (environment: happy-dom is
already the vitest environment — 2D canvas is available; if
`getContext('2d')` returns null under happy-dom, STOP and report — the test
will need the `canvas` npm package or a node-canvas shim, which is a
dependency decision for the operator).

Cases:

1. `facePlacementToUvRect` pins: default placement mouth center →
   u ≈ 0.275 (azimuth 0 → island mid-u), v < 0.725 (below equator);
   eyeL/eyeR u symmetric about 0.275.
2. `draw()` with `mouth: 'smile'` produces non-transparent pixels inside the
   mouth rect (read back via `ctx.getImageData`) and fully transparent pixels
   in an untouched corner region.
3. `draw()` with `mouth: null` leaves the mouth rect transparent.
4. Gaze `x = +GAZE_MAX` shifts the pupil blob's centroid toward +u vs
   gaze 0 (compare centroids of non-transparent pixels in the eye rect).

**Verify**: `pnpm test -- faceComposite` → 4 tests pass.

### Step 3: Add the unlit face overlay to the toon material

In `src/core/materials/toonMaterial.ts`, add optional uniforms
`uFaceMap` (texture) + `uFaceMapEnabled` (0/1) to the `onBeforeCompile`
injection, and composite **after all lighting/tone work** so the face stays
print-crisp (the invariant from `facePlane.ts:5-7`):

```glsl
// face overlay: unlit drawn face in the mesh's own UVs (advisor plan 002)
#ifdef USE_FACE_MAP
  vec4 faceTexel = texture2D(uFaceMap, vUv);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, faceTexel.rgb, faceTexel.a);
#endif
```

Follow the file's existing injection mechanism exactly (it already rewrites
shader chunks and exposes `material.userData.toonUniforms` — add the new
uniforms there; look at how `uTerminatorWarmth` is threaded through, since
`CharacterRoot.tsx:411-419` updates it live). Gate with a define so
non-face materials compile unchanged. Add
`setFaceMap(material, texture | null)` helper that sets the uniform +
toggles the define + `material.needsUpdate` on define change.

Note on tone mapping: the old planes set `toneMapped = false`. The overlay
is inside the head material, so tone mapping applies to the final fragment.
Compensate by compositing after the shader's tonemapping/colorspace chunks
if the injection point allows; if the toon material's fragment ends before
`tonemapping_fragment`, inject the mix into `#include <dithering_fragment>`'s
predecessor slot — find where the existing injection anchors and place the
face mix as the LAST modification of `gl_FragColor.rgb`. Verify visually in
Step 7 that face colors match the atlas PNGs (crisp black outlines, pure
whites); if they look washed out, STOP and report which injection point was
used.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → existing
`test/core/materials/*` pass unchanged.

### Step 4: Retarget the face rig

In `src/core/face/faceRig.ts`:

- `createFaceRig(head, config)` keeps its signature and public interface
  (`setExpression`, `setMouthOverride`, `setGaze`, `blink`,
  `setBlinkMeanInterval`, `update`, `getState`, `dispose`) — FacePanel, the
  talk driver, and `faceRig.test.ts` depend on it.
- Replace the plane construction (`addPlane`, the seven meshes, the
  materials) with a `FaceCompositor` + a dirty flag: every state change that
  used to call `setCell`/`setMaskCell`/`setGaze` now sets `dirty = true`;
  `update(dt)` runs the existing blink/gaze easing and, when dirty (or when
  gaze moved more than ~1e-4 since last draw), calls `compositor.draw(...)`
  once and clears the flag. This keeps redraws to blink edges, expression
  changes, visemes, and active gaze easing — not every frame at rest.
- Config changes: `createFaceRig` now needs the head **mesh material** to
  attach the overlay to, not a parent Object3D for planes. Change config to
  accept `applyTexture: (texture: THREE.Texture | null) => void` (the React
  layer binds it to `setFaceMap(headMaterial, ...)`) — keeps the core
  three-pure and testable.
- `hideMouth` moves INTO the rig state (config flag): when true, `draw` is
  called with `mouth: null` (replaces the `mouthPlane.visible` toggle in
  `FaceRig.tsx:57-60`).

Update `test/core/face/faceRig.test.ts`: the tests that asserted material
offsets/plane visibility should now assert the rig's `getState()` +
that a spy `applyTexture`/compositor `draw` was invoked with the right cells
(inject a stub compositor if the test environment lacks canvas — design the
rig to accept an injected compositor factory for exactly this reason).

**Verify**: `pnpm test -- faceRig` → suite passes (updated).

### Step 5: Rewire the React mount

- `src/studio/viewport/FaceRig.tsx`: keep the texture loading + atlasId
  logic; instead of creating plane geometry under a portal group, obtain the
  head/body material and wire `applyTexture` → `setFaceMap`. The body
  material is `assembled.regionMaterials.body` — pass it (or the assembled
  handle) down from `CharacterRoot` as a prop instead of `headRadius`.
  IMPORTANT: face art must only appear on the head UV island — since the
  island `(0, 0.45, 0.55, 1)` is exclusive to the head shell within the body
  UV atlas (`bodies.py:17-26`), other body parts sample transparent overlay
  texels; no extra masking needed.
- `src/studio/viewport/CharacterRoot.tsx`: delete the `createPortal` +
  `faceAnchor` mount (lines 421–437) and render `<FaceRig ...>` as a plain
  child with the assembled handle. Keep `assembled.hideMouth` (beaks still
  hide the drawn mouth) — pass it through.
- Textures: atlas textures now feed a canvas, so they need `Image` access —
  `useTexture` yields `THREE.Texture` whose `.image` is an
  `HTMLImageElement`; pass `texture.image` into the compositor config.

**Verify**: `pnpm typecheck` → exit 0; `pnpm dev` renders a face on the head
surface (visual check in Step 7).

### Step 6: Remove the mouth-offset plumbing

Now dead:

- `partRegistry.ts`: `mouthOffset?: number` field (line ~45) and the
  `mouthOffset: 0.09` / `0.14` values on the cat/dog muzzles.
- `assemble.ts`: `mouthRadialOffset` computation and the
  `AssembledCharacter.mouthRadialOffset` field (lines 47–48, 218, 226, 314).
- `faceRig.ts`: `FacePlacement.mouthRadialOffset`.
- `CharacterRoot.tsx`: the `placement` memo (lines 421–424).

Keep `hidesMouth` (beaks) — it maps to `mouth: null`.

**Verify**: `pnpm typecheck` → exit 0;
`grep -rn "mouthRadialOffset\|mouthOffset" src/` → no matches.

### Step 7: Visual acceptance pass

`pnpm dev`, then for EACH archetype (biped-round, biped-slim, bird) and for
the dog-muzzle + cat-muzzle bipeds:

1. Front, three-quarter, side, and low camera angles: **no face element
   floats off the surface**; eyes/brows/mouth read as painted on.
2. Expressions cycle (FacePanel presets): cells swap correctly, blink runs.
3. `headBig` morph slider at max and a head sculpt stroke: the face follows
   the deformed surface (this is the payoff the planes could never do).
4. Muzzle equipped: mouth no longer floats in mid-air (interim: it draws on
   the head surface at the muzzle root — acceptable; the on-muzzle mouth is
   the deferred follow-up).
5. Talk state in Play mode: visemes animate on-surface.

Capture screenshots for the PR.

**Verify**: all five observations hold on all archetypes.

### Step 8: Gut facePlane.ts

Delete `makeFacePlaneGeometry`, `makeAtlasMaterial`, `makePupilMaterial`,
`setCell`, `setMaskCell`, `setGaze` and their tests
(`test/core/face/facePlane.test.ts`) IF nothing else imports them
(`grep -rn "facePlane" src/ test/`). Keep exporting `GAZE_MAX` (imported by
`PlayMode.tsx:20`) — move it to `faceComposite.ts` and update importers.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass;
`grep -rn "makeFacePlaneGeometry\|makeAtlasMaterial" src/ test/` → no matches.

## Test plan

- New: `test/core/face/faceComposite.test.ts` (UV-math pins, draw coverage,
  hidden mouth, gaze shift) — Step 2.
- Updated: `test/core/face/faceRig.test.ts` — same behavioral coverage
  (expressions, blink sequence, mouth override, gaze easing) against the
  compositor-backed rig via an injected stub compositor.
- Removed with its subject: `test/core/face/facePlane.test.ts` (Step 8).
- Untouched: `test/core/face/atlas.test.ts` must pass unchanged (contract).
- Verification: `pnpm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `grep -rn "mouthRadialOffset\|mouthOffset" src/` → no matches
- [ ] `grep -rn "FACE_LAYER_RADIAL_OFFSET\|headRadius \* 1.07" src/` → no matches
- [ ] `test/core/face/faceComposite.test.ts` exists and passes
- [ ] Visual pass (Step 7) completed on all 3 archetypes + 2 muzzles,
      screenshots captured
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- happy-dom's 2D canvas cannot support `drawImage` +
  `globalCompositeOperation` + `getImageData` (Step 2) — the test strategy
  needs an operator decision (node-canvas dep vs stub-only testing).
- The toon material's `onBeforeCompile` structure has no safe injection point
  after lighting (Step 3) — report the shader chunk layout you found.
- Face colors are visibly tone-mapped/washed out after Step 3's mitigation.
- The head UV island is NOT exclusive to the head shell (some other body
  faces map into `(0, 0.45, 0.55, 1)`) — check `bodies.py` UV rects; overlay
  would bleed onto other parts.
- `faceRig.test.ts` behavioral tests cannot be preserved without weakening
  what they assert.

## Maintenance notes

- **Deferred follow-up (next plan candidate): mouth on the muzzle.** Muzzle
  parts have their own UVs and toon materials
  (`assemble.ts` region `muzzle`); drawing the mouth into the muzzle's
  material via the same `setFaceMap` mechanism needs a muzzle-UV placement
  table authored in `scripts/blender/parts.py`. Until then the mouth draws on
  the head at the muzzle root.
- Compositor redraw frequency: gaze easing during talk redraws per frame
  (~1 MB texture upload at 1024²). If profiling shows cost, move gaze back
  to a shader uniform pair and keep the canvas for cell changes only — the
  compositor's `draw` signature already isolates this decision.
- Reviewer scrutiny: the injection point in `toonMaterial.ts` (must not
  break the existing palette/ramp/rim pipeline or the outline pass), and the
  rig's dirty-flag logic (a missed dirty → frozen face).
- Plan 003 regenerates body GLBs; it does not touch UV islands, so this
  plan's UV math is unaffected — but re-run the Step 7 visual pass after 003
  lands.
