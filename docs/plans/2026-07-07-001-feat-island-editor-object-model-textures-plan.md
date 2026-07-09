# Plan 2026-07-07-001: Texture + reshape the island-editor object models (trees, bushes, rocks)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat e8be34c6..HEAD -- island-editor/src/models island-editor/src/scene island-editor/test/buildObjectModel.test.ts island-editor/public/textures`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (visual work + external image-generation step)
- **Depends on**: none
- **Category**: direction (visual quality)
- **Planned at**: commit `e8be34c6`, 2026-07-07
- **Status**: DONE — executed via `improve execute` on worktree branch
  `worktree-agent-af4c6f016f8fe9b6b` (based on `main` @ `847f64ff`; in-scope code
  byte-identical to plan base `e8be34c6`). Two commits: `3b448663` (3 texture
  PNGs) + `45ad84a3` (`textures.ts` + `buildObjectModel.ts` + 2 new tests).
  **Advisor-reviewed & APPROVED**: typecheck exit 0; 128 tests green (incl. 2 new,
  now 7 in `buildObjectModel.test.ts`); scope clean (only the 6 in-scope files);
  no `Math.random`/`Date`; determinism + watertight `lumpy()` verified. One
  documented plan-premise correction confirmed sound (see note below). Browser
  visual render/tint check is **OPERATOR-PENDING** (headless executor). **Not
  merged, not pushed — pending operator look sign-off + merge.**
- **Executor deviation (approved)**: the plan stated `IcosahedronGeometry(r,1)`
  is indexed so shared vertices displace together — it is **NOT** (verified in
  three@0.171: `index === null`, 240 positions). `lumpy()` was reimplemented to
  key displacement off the quantized vertex position (one seeded salt from the
  passed `rand`), keeping the mesh watertight and deterministic. `flat()` was
  removed (no remaining caller; `noUnusedLocals` would fail). Base tints lightened
  per the plan's explicit allowance; exact values are operator-pending visual tuning.

## Why this matters

The island editor's placed objects (fruit tree, pine, palm, bush, rock) are
solid-color three.js primitives. The terrain they sit on is textured with soft
hand-painted maps (`sand-soft-ripples.png`, `cliff-soft-strata.png`), so the
objects read as untextured placeholders next to a finished ground. This plan
(a) generates a small set of matching hand-painted tileable textures using the
**Codex CLI's image generation**, (b) applies them to the object materials, and
(c) upgrades the procedural geometry so the set has its own identity — inspired
by Animal Crossing / Pokopia (chunky, rounded, soft) but deliberately **not** a
clone: our signature is seeded organic lumpiness, sun-lightened canopy tips, and
mossy rocks.

## Current state

Files (all paths relative to the repo root):

- `island-editor/src/models/buildObjectModel.ts` — the ONLY model builder.
  Exports `buildObjectModel(kind, seed): THREE.Group`. Five builders
  (`fruitTree`, `pine`, `palm`, `bush`, `rock`) assemble `MeshStandardMaterial`
  primitives. Two material helpers today:
  ```ts
  // buildObjectModel.ts:28-35
  function flat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, metalness: 0 }) }
  function soft(color) { return new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.95, metalness: 0 }) }
  ```
  Foliage blobs are `IcosahedronGeometry(r, 1)` via `blob()` (line 47). The
  exported function grounds the model by shifting **children** so the bbox min
  sits at y=0 (lines 239-241) — preserve that mechanism.
- `island-editor/src/models/rand.ts` — `mulberry32(seed)` PRNG and
  `hashString`. **The seeded PRNG is the only allowed entropy source** — no
  `Math.random`, no `Date`.
- `island-editor/src/scene/PlacedObjects.tsx` — renders placed objects;
  `disposeModel()` (lines 14-22) disposes each mesh's geometry **and
  material** on unmount. Materials are per-model, so this is safe — but any
  texture you share across models must NOT be disposed here
  (`material.dispose()` does not dispose `material.map`, so a module-level
  texture cache survives; do not add texture disposal).
- `island-editor/src/scene/ModelGallery.tsx`, `PlaceGhost.tsx` — also call
  `buildObjectModel`; they get textures for free if the builder owns them.
- `island-editor/src/scene/IslandTerrain.tsx:26-49` — the texture-loading
  convention to copy: `THREE.TextureLoader`, `SRGBColorSpace`,
  `RepeatWrapping`, linear mipmaps.
- `island-editor/public/textures/` — served at `/textures/*.png`. Existing:
  `sand-soft-ripples.png`, `cliff-soft-strata.png`, two water maps. The sand
  map is the style reference: 1024×1024, soft painterly low-contrast forms,
  pastel warm tones, sparse tiny speckle dots, seamlessly tileable.
- `island-editor/test/buildObjectModel.test.ts` — the contract tests:
  named group per kind, deterministic per seed, seed-varied, base ≈ y=0,
  footprint within ±1.2 units. These must keep passing.
- `island-editor/` is an **isolated pnpm workspace root** (own lockfile,
  `three@0.171`). Run its commands from inside that directory. It is NOT
  covered by root `pnpm check`.

Documented constraints to honor (from `CLAUDE.md` and the file header of
`buildObjectModel.ts`):

- "Deterministic given a seed so previews are stable and placement re-derives
  the same variety on reload."
- Scene lighting is ambient 0.6 + directional 1.15 at [18,20,10]
  (`Backdrop.tsx`) — judge colors under that, not in isolation.
- Asset provenance matters in this repo (`docs/plans/2026-06-12-asset-provenance-audit.md`):
  generated textures must come from a tool whose terms grant output ownership
  (OpenAI image generation via Codex qualifies). Never download textures from
  texture sites.

## Commands you will need

| Purpose | Command (run from `island-editor/`) | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck + tests | `cd .. && pnpm check:island-editor` | exit 0 |
| Tests only | `pnpm vitest run` | all pass |
| Dev server | `pnpm dev` | serves at `http://localhost:5180` |
| Codex imagegen | `codex exec "<prompt>"` (see Step 1) | PNG written to the given path |

## Scope

**In scope** (the only files you may modify/create):

- `island-editor/src/models/buildObjectModel.ts`
- `island-editor/src/models/textures.ts` (create — shared texture cache)
- `island-editor/test/buildObjectModel.test.ts` (extend)
- `island-editor/public/textures/bark-soft-streaks.png` (create)
- `island-editor/public/textures/leaf-soft-tufts.png` (create)
- `island-editor/public/textures/rock-soft-speckle.png` (create)

**Out of scope** (do NOT touch):

- `island-editor/src/scene/materials/IslandGroundMaterial.ts` and the terrain
  shader — the ground already looks right.
- `PlacedObjects.tsx` / `ModelGallery.tsx` / `PlaceGhost.tsx` — the
  `buildObjectModel` signature is a contract ("Plans B + C consume it"); keep
  all changes inside the builder so consumers are untouched.
- The product app (`src/`), `bird-builder/`, existing textures
  (`sand-soft-ripples.png` etc.).
- Any new npm dependency.

## Git workflow

- Branch from `main`: `feat/island-editor-object-textures`.
- Commit style (from `git log`): `feat(island-editor): <summary>` /
  `fix(island-editor): <summary>`. Commit Step 1 (assets) and Steps 2–4 (code)
  separately.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Generate three tileable textures with Codex imagegen

Use the locally installed Codex CLI (`codex --version` → 0.142.x). Ask Codex
to use its image-generation tool and write each file directly, e.g.:

```
codex exec "Use your image generation tool to create a seamlessly tileable
1024x1024 hand-painted game texture and save it to
island-editor/public/textures/bark-soft-streaks.png. Style: match a soft
painterly Animal-Crossing-like sand texture — low contrast, gentle shapes, a
few tiny speckle dots, no photorealism, no hard outlines. Subject: warm brown
tree bark with gentle vertical streaks and subtle rounded ridges. It must tile
seamlessly on both axes."
```

Repeat for the other two, changing only subject + filename:

- `leaf-soft-tufts.png` — "light spring-green foliage made of soft overlapping
  rounded leaf tufts, painterly, low contrast". Generate it **light and only
  mildly saturated** — the code tints it per-lobe via `material.color`, so a
  dark or highly saturated map would double-darken.
- `rock-soft-speckle.png` — "warm light-grey stone with soft speckles and very
  faint horizontal strata, painterly, low contrast" (kin to
  `cliff-soft-strata.png`).

After each generation, verify:

**Verify (per file)**:
`file island-editor/public/textures/<name>.png` → `PNG image data, 1024 x 1024`
(any square size ≥ 512 is acceptable; regenerate if smaller).

**Verify tiling**: open each PNG and inspect a 2×2 repeat, e.g.
`magick <name>.png -virtual-pixel tile -set option:distort:viewport 2048x2048 -distort SRT 0 tiled.png`
(or just view the texture repeated in the running editor at Step 4) → no
visible seams. If a seam is obvious, re-prompt Codex asking it to fix
seamless tiling.

### Step 2: Add a shared texture cache — `island-editor/src/models/textures.ts`

Create a small module that lazily loads and caches the three textures once,
configured exactly like `IslandTerrain.tsx`'s loader (SRGB, RepeatWrapping,
linear mipmaps, `generateMipmaps = true`). Shape:

```ts
import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

/** Lazily load a model texture from /textures. Cached for the app's lifetime —
 *  callers must NOT dispose these (PlacedObjects disposes materials only). */
export function modelTexture(name: 'bark-soft-streaks' | 'leaf-soft-tufts' | 'rock-soft-speckle'): THREE.Texture {
  let tex = cache.get(name)
  if (!tex) {
    tex = new THREE.TextureLoader().load(`/textures/${name}.png`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    cache.set(name, tex)
  }
  return tex
}
```

Important for tests: `TextureLoader.load` touches the DOM/network. Vitest runs
in a node environment, so **`buildObjectModel` must not call `modelTexture`
at module load time**, and the call site must tolerate a jsdom-less
environment. Guard inside `modelTexture`'s caller instead: in
`buildObjectModel.ts` wrap the lookup as
`typeof document === 'undefined' ? null : modelTexture(...)` and pass
`map: tex ?? undefined` (see Step 3). This keeps the existing tests running
unchanged in node.

**Verify**: `cd island-editor && pnpm vitest run` → all existing tests still
pass (nothing imports the new module yet, but this catches syntax/TS errors
via the vitest TS pipeline). Exit 0.

### Step 3: Apply textures in `buildObjectModel.ts`

Modify only the material helpers; builders keep their structure:

- `flat(color)` → add `map` = bark texture for trunks and rock texture for
  stones. Concretely, split it: `bark()` (TRUNK color tint + bark map) and
  keep `flat(color)` untextured for anything else.
- `tinted(base, rand, amount)` (foliage) → add the leaf map:
  `new THREE.MeshStandardMaterial({ color: c, map: leafTex ?? undefined, roughness: 0.95 })`.
  The per-lobe HSL jitter stays — it now tints the shared map, which is why
  Step 1 generates the leaf texture light.
- `rock()`'s `tinted(ROCK, ...)` → use the rock texture with the ROCK tint.
- Because the maps are mid-tone, tints will darken the result; after wiring,
  lighten the base constants if needed to keep today's on-screen brightness
  (e.g. `LEAF` from `0x77b84e` toward `0x8fd062` — judge in the browser at
  Step 4, under the scene's real lighting).
- Set a small `repeat` on cloned texture settings ONLY via UV scale in
  geometry or `tex.repeat` — but note the texture objects are **shared**, so
  never mutate `tex.repeat` per material. If a builder needs different
  tiling density, scale the geometry's UVs or accept the default (default is
  fine at these object sizes; icosphere/cylinder built-in UVs are acceptable
  at this stylization level — minor seams are hidden by lobe rotation).

Apples, flowers, coconuts, and the palm hub stay untextured `soft()` color —
they're accents and read better clean.

**Verify**: `cd island-editor && pnpm vitest run` → all pass.
**Verify**: `cd .. && pnpm check:island-editor` → exit 0.

### Step 4: Procedural upgrades — our own identity, not an AC clone

All changes stay inside `buildObjectModel.ts`, keep the seeded `rand` as the
only entropy, and keep every kind within the tested bounds (base y≈0 handled
by the existing grounding pass; horizontal extent < ±1.2).

Add one shared helper, then apply per-builder tweaks:

1. **`lumpy(geo, rand, amount)` helper** — displace each vertex of an
   icosphere along its normal by `(rand() - 0.5) * amount`, then
   `geo.computeVertexNormals()`. **Weld/average by position first is NOT
   needed for `IcosahedronGeometry` detail 1** (it's indexed, so shared
   vertices displace together). This gives seeded organic lumpiness — our
   signature, distinct from AC's clean spheres. Use `amount ≈ 0.12 * r` so
   silhouettes stay rounded.
2. **Canopy sun-tips (fruit tree + bush)** — for each foliage lobe, add a
   30–40%-scale smooth lobe of a lighter tint (`offsetHSL(0, 0, +0.10)`)
   nestled on its upper-sun side (offset toward normalized [18,20,10], i.e.
   roughly `+x, +y` by ~0.6·r). Reads as sun-kissed highlights — a painted
   look neither AC nor Pokopia uses.
3. **Fruit tree trunk** — replace the plain cylinder with a 2-segment trunk:
   base cylinder plus a slightly narrower, slightly tilted upper segment
   (`rotation.z ≈ (rand()-0.5)*0.15`), and a squashed sphere at the foot as a
   root flare (`scale.y ≈ 0.4`). Both use the bark material.
4. **Pine** — keep the tier stack but let each tier "droop": scale tiers to
   `scale.y = 0.6` and push every other tier's rotation.y offset; add a few
   (2–3) tiny lighter-green tip-bumps (radius ~0.06) perched on tier rims
   using `rand`-chosen angles. Keep the total height ≤ current (~1.5).
5. **Rock** — apply `lumpy()` to stones; add a moss cap: a very flattened
   (`scale.y ≈ 0.25`) small icosphere in leaf material, tinted darker
   (`offsetHSL(0, 0, -0.05)`), sitting on the upper surface of the biggest
   stone, present with probability `rand() < 0.5`. Optionally 1–2 pebbles
   (radius 0.05–0.08, rock material) beside the boulder.
6. **Bush** — apply `lumpy()` to lobes; keep flowers, but raise flower count
   variety to 2..6 and give each flower a tiny cream center dot
   (radius 0.02 sphere) so blooms read at gallery scale.
7. **Palm** — keep structure; add a subtle two-tone: alternate fronds between
   `LEAF` and a slightly deeper tint; give the trunk 2–3 faint ring bumps
   (thin squashed torus or short wider cylinder slices in bark material).

Consume `rand()` in a **fixed order** within each builder (as today) so
determinism holds; never branch the *number* of `rand()` calls on anything
but earlier `rand()` results.

Visual check: `pnpm dev` in `island-editor/`, open `http://localhost:5180`,
open the model panel/gallery, place several of each kind on sand and grass.
Judge: silhouettes rounded, textures visible but subtle, palette sits with
the terrain, no z-fighting, no floating parts.

**Verify**: `cd island-editor && pnpm vitest run` → all pass.

### Step 5: Extend the contract tests

Add to `island-editor/test/buildObjectModel.test.ts` (model after the existing
tests' style):

- "foliage and trunk materials carry texture maps in a DOM environment OR
  null-map gracefully in node": in node/vitest, assert building every kind
  still succeeds and every `MeshStandardMaterial` has `map` either `null` or
  a `THREE.Texture` (i.e. the guard from Step 2 doesn't throw).
- Determinism test already covers child counts/positions; add a stronger
  variant: serialize all children's `position` arrays for seed 7 twice and
  `expect(a).toEqual(b)` per kind (catches any `Math.random` sneaking in via
  `lumpy`). Note: `lumpy` must therefore use the passed `rand`, never a new
  PRNG.
- Bounds tests must keep passing unchanged — if a new part breaks the ±1.2
  footprint, shrink the part, don't loosen the test.

**Verify**: `cd island-editor && pnpm vitest run` → all pass including the new
tests. Then `cd .. && pnpm check:island-editor` → exit 0.

## Done criteria

ALL must hold:

- [ ] Three new PNGs exist in `island-editor/public/textures/`, each square,
      ≥512px, and visually seam-free when tiled.
- [ ] `pnpm check:island-editor` (repo root) exits 0.
- [ ] `cd island-editor && pnpm vitest run` exits 0, including ≥2 new tests in
      `buildObjectModel.test.ts`.
- [ ] `grep -n "Math.random\|new Date\|Date.now" island-editor/src/models/*.ts`
      → no matches.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] In the running editor (`pnpm dev`), all five kinds render textured and
      grounded on both sand and grass tiers.

## STOP conditions

Stop and report back (do not improvise) if:

- `codex exec` cannot generate images (no image tool available, auth failure,
  or it refuses). Do NOT substitute textures from the web or another service —
  provenance is a repo policy. Report so the operator can generate assets.
- The generated textures can't be made tileable after 3 prompt attempts.
- Any existing test in `buildObjectModel.test.ts` fails and the fix would
  require loosening a bound or changing the `buildObjectModel` signature.
- Texture loading breaks vitest (jsdom/node errors) and the
  `typeof document` guard doesn't resolve it.
- The excerpts in "Current state" don't match the live code (drift).

## Maintenance notes

- The texture cache in `models/textures.ts` is intentionally never disposed;
  if a future change gives models per-instance textures, revisit
  `disposeModel()` in `PlacedObjects.tsx`.
- If the app-side island ever consumes these models (engine binding plan),
  the `/textures/` URL root is editor-specific — the loader path would need
  parameterizing.
- Reviewer focus: determinism (fixed `rand()` call order), no shared-texture
  mutation (`tex.repeat` must stay untouched), and that the leaf map is light
  enough that HSL-jittered tints don't muddy.
- Deferred: triplanar mapping for seam-free blobs, wind sway animation, and a
  palette-variation pass (autumn/sakura) — out of scope here.
