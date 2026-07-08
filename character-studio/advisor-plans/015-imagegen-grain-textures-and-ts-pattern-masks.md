# Plan 015: Imagegen grain textures (island-editor sand style) + TypeScript pattern-mask rasterizer

> **Executor instructions**: This plan runs after plan 013 has merged (its
> README row DONE and `src/core/procgen/` exists with `UV_ATLAS` and
> `ProcBodyData`); if not, STOP. It may run in parallel with plan 014 — it
> must not touch stance/motion files. Follow steps in order; run every
> verification. Read `advisor-plans/012-procedural-first-architecture.md`
> (decision D5) first. When done, update your row in
> `advisor-plans/README.md` (Wave 3).
>
> **Drift check (run first)**: find the 013 merge SHA (`git log --oneline
> -20`, record it), then `git diff --stat <SHA>..HEAD --
> character-studio/src/core/materials character-studio/src/core/procgen
> character-studio/src/core/skeleton/partRegistry.ts
> character-studio/src/assets/anatomy/textures
> character-studio/src/studio/viewport/CharacterRoot.tsx
> character-studio/src/studio/roster/companionExport.ts`
> Mismatch with "Current state" excerpts = STOP. Line numbers are as of
> `a8f7c8e1`; match by content after 013.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED (external generation dependency; the 3D→UV rasterization
  bridge is the technical crux)
- **Depends on**: 013 (hard — `UV_ATLAS` + `ProcBodyData`); parallel-safe
  with 014
- **Category**: migration / direction
- **Planned at**: commit `a8f7c8e1`, 2026-07-07
- **Recommended executor**: Sonnet 5 (wiring is fully specified below;
  escalate style judgment to the reviewer via screenshots)

## Why this matters

Character surfaces today are flat palette color, and all markings (robin
breast, shiba points, tabby stripes…) come from Blender-baked palette-mask
PNGs whose baking lane dies with the GLB migration. The operator wants
generated textures — fur/feather grain in the soft painterly style of the
island editor's sand textures — produced with **Codex imagegen via the
`/codex:rescue` skill**. This plan (a) generates a small library of tileable
grayscale grain maps and wires them into the toon material's albedo `map`
slot, and (b) replaces the Blender pattern baker with a TypeScript
rasterizer that evaluates the same analytic per-vertex pattern fields on the
plan-013 procedural body and bakes them to mask textures.

## Current state

### Toon material — the `map` slot is LIVE, not dormant

```ts
// src/core/materials/toonMaterial.ts:39-44 (TextureResolver at :46)
export interface ResolvedTextures {
  /** Grayscale luminance (authored albedo). Null → flat white. */
  map: THREE.Texture | null
  /** Channel-packed palette mask (R/G/B/A → slots). Null → unmasked path. */
  maskMap: THREE.Texture | null
}
```

**Load-bearing fact**: `createToonMaterial` always assigns
`material.map = textures.map ?? getWhiteTexture()` (toonMaterial.ts:238,
also in `applyTextureId` :280); `getWhiteTexture()` (:201-210) is a 1×1
white `DataTexture` kept alive specifically so `USE_MAP`/`vMapUv` stay
compiled, and the fragment includes `<map_fragment>` — the map already
multiplies `diffuseColor` every frame. So you are NOT waking a dormant
seam: you are swapping a white 1×1 for a real texture. Build the resolver
around that (return a texture, never restructure the null/white fallback),
and don't disturb `customProgramCacheKey` (:247) — program-key stability
depends on the map slot staying occupied.

`defaultTextureResolver` (:56-62) knows `'debug-spots'`; `TEXTURE_IDS =
['authored', 'none', 'debug-spots']` (:64) is a **const array, not a schema
enum** — `materials.<region>.textureId` is a free string
(`schema.ts:239: textureId: z.string().min(1).optional()`), so **grain ids
need NO schema change and NO spec-version coordination with plan 014**.

### Pattern registry & mask consumers

- `src/core/materials/patternRegistry.ts` — `PATTERN_REGISTRY` (:18-42)
  maps 8 pattern ids → baked PNG URLs per archetype; `patternMaskUrl`
  (:51-54); `resolvesAuthored(textureId)` (:57-59) — the shared predicate
  the wave-2 handoff warns must never be replaced by a bare
  `=== 'authored'` check.
- `src/studio/viewport/CharacterRoot.tsx:118-126` — `maskEntries` swaps the
  body mask URL for `patternMaskUrl(bodyTextureId, archetype) ?? body.maskUrl`
  and loads via `useTexture`; masks configured `flipY=false`, `NoColorSpace`
  (`configureMask`).
- Mask URL **ownership**: body masks live on `BODY_REGISTRY` entries and
  part masks on `PartDef.maskUrl` — both in
  `src/core/skeleton/partRegistry.ts` (fields at :29 and :321; instances
  throughout). Removing baked masks means editing that file — it is in
  scope here.
- Export byte-sourcing: `CompileAssets.maskPngsByRegion` is only *declared*
  in `src/core/export/compile.ts:87`; it is **built** in
  `src/studio/roster/companionExport.ts:34-48`, which `fetchBytes(...)`es
  the baked PNG URLs. That file (note the path — `src/studio/roster/`) is
  where the byte-sourcing edit happens.
- **Wardrobe item masks survive this plan** — `itemRegistry.ts` maskUrls
  and `src/assets/wardrobe/` textures are plan 016's. Only
  `src/assets/anatomy/textures/*.mask.png` dies here.

### How patterns actually work (port source: `scripts/blender/patterns.py` — inlined below; the file dies in plan 016)

Patterns are NOT 2D drawings. Each is a function assigning **per-vertex
channel weights in 3D body space** on the body shells, using shell vertex
positions `v`, normalized head coords `d = (verts − headCenter)/headR`,
torso metrics `{cy, ry, rx}`, and limb chain params `t` — then the mask PNG
is produced by rasterizing per-vertex channels into UV space. Plan 013's
`ProcBodyData` was specified to carry exactly this substrate: `channels`
(the default palette fields), `meta.torso`, `meta.headCenter/headRadius`,
`meta.shellRanges`, `meta.limbParams`. **Port = re-evaluate the field
functions on the procedural body's vertices, then rasterize.** If
`ProcBodyData` lacks any of these, that's a STOP (coordination with 013's
landed shape), not something to improvise around.

**The rasterizer algorithm** (port of `meshkit.py::rasterize_mask`,
:338-353): allocate size²×RGBA float image, initialize R=1 (full primary);
for every triangle, fetch its three corners' UVs and per-vertex RGBA
channel values; barycentric-fill the triangle in pixel space (inside test
with ε≈0.001 slack), interpolating channels. The Python version then
box-blurs by 2px — which is the cause of the known "seam stripe down the
back" bug (blur bleeds across adjacent UV islands). Replace the naive blur
with: per-island edge dilation (grow each island's coverage ~4px into
empty space first), THEN blur, so no pixel inside one island ever reads
another island's channels. Output both a `THREE.CanvasTexture`-compatible
canvas (viewport) and PNG bytes (export). Bodies 1024², parts 256²
(ASSET-CONTRACT sizes).

**The 8 pattern fields** (constants verbatim from patterns.py — keep them):

| Pattern (archetype) | Field summary |
|---|---|
| robin (bird) | torso BELLY = breast ellipse, center `cy + 0.15·ry`, radii `(1.05·rx, 0.62·ry)`, front-gated, edge `smoothstep(0.75→1.15)`; head BELLY = face patch extended down (chin/throat): `smoothstep(0.1,0.6,dz)·smoothstep(0.65,−0.35,dy)·0.9`; wings SECONDARY `smoothstep(0.22,0.28,t)·0.85` |
| owl (bird) | head BELLY = facial disc `smoothstep(0.15,0.55,dz)`; head ACCENT = disc outline ring `smoothstep(0.35,0.6,dz)·(1−smoothstep(0.75,0.95,dz))·0.7`; torso BELLY ×= horizontal barring `0.75 + 0.25·sin(55y)·sin(60x)` (soft bars, never hard dots — they alias); wings SECONDARY `smoothstep(0.17,0.23,t)·0.9` |
| duckling (bird) | head SECONDARY = crown `smoothstep(0.25,0.7,dy)·0.95`; torso BELLY ×1.2 clamped; wings ACCENT = speculum band `smoothstep(0.5,0.6,t)·(1−smoothstep(0.78,0.88,t))` |
| shiba (quad-round) | head BELLY = wide face patch + two brow dots (gaussians at `(±0.28, 0.45, 0.72)`, σ=0.16, ×0.9); torso BELLY = belly ellipse raised (`cy + 0.05·ry`) and widened ÷1.15; limbs BELLY = front-face cream `0.85·smoothstep(0.1,0.5, zc/half)` |
| tabby (quad-slim) | torso SECONDARY = back-gated horizontal bars `backGate·(0.55 + 0.45·sin(70y))` — bars run horizontally so they cross the back-centerline wrap seam continuously; head SECONDARY = forehead cap with M-notch `cap·(0.75 + 0.25·sin(9·dx))·0.9`. Known polish: secondary `#c97a3a` too close to primary — raise stripe amplitude (0.45→~0.6) while porting |
| fox (quad-slim) | head BELLY = cheek flares `smoothstep(0.05,0.5,dz)·smoothstep(0.5,−0.4,dy)·(1 + 0.4·smoothstep(0.1,0.5,|dx|))`; limbs ACCENT = socks `smoothstep(0.45,0.7,t)`; hands/feet ACCENT = 1.0 |
| bear (quad-round) | head BELLY = tight muzzle oval `smoothstep(0.45,0.8,dz)·smoothstep(0.25,−0.35,dy)`; torso BELLY = small chest crescent (ellipse ÷0.55, center `cy + 0.2·ry`) |
| rabbit (quad-slim) | torso BELLY = wide belly ÷1.2 full weight; head BELLY = muzzle-to-chest blaze `smoothstep(0.2,0.55,dz)` (no vertical gate); feet BELLY = 0.6 |

(Archetype ids shown post-014-rename; if 014 hasn't landed when you run,
they are `biped-round`/`biped-slim` — use whatever `ARCHETYPES` currently
says.) The **plain (non-pattern) authored masks** are the default channel
fields plan 013's kit already computes (`kit/channels.ts`) — this plan's
rasterizer bakes those for every body/part too, replacing every
`*.mask.png`.

### Style reference for grain (the operator's explicit benchmark)

`island-editor/public/textures/sand-soft-ripples.png` — 1024×1024 8-bit RGB,
seamless-tiling, soft painterly. Its loader config
(`island-editor/src/scene/IslandTerrain.tsx:26-48`): `SRGBColorSpace` (it's
a color map), `RepeatWrapping` both axes, linear mipmaps. Companion set in
the same dir: `cliff-soft-strata.png`, `water-foam-cells.png`,
`water-short-bubbles.png`.

### Test-environment fact

character-studio vitest runs bare node; canvas work in tests uses
`@napi-rs/canvas` (already a devDependency) behind an injectable factory —
model after `src/core/face/faceComposite.ts`: config field
`createCanvas?: (width, height) => CanvasLike` (:222-223) defaulting to the
DOM implementation (:252).

### Provenance context

`docs/plans/2026-06-12-asset-provenance-audit.md` tracks texture origins.
Every generated asset must be logged (step 5). Never commit third-party
texture-site downloads.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck && pnpm test` | exit 0 |
| One file | `pnpm test -- test/core/materials/patternRaster.test.ts` | pass |
| Dev | `pnpm dev` | :5190 |
| Grain validate (new) | `pnpm gen:grain` | validates/normalizes PNGs + manifest, exit 0 |
| PNG dims (macOS) | `sips -g pixelWidth -g pixelHeight <png>` | 1024×1024 |

## Suggested executor toolkit

- **`/codex:rescue` skill (Codex plugin)** — the operator-mandated
  generator. Invoke the `codex:rescue` skill (or dispatch the
  `codex:codex-rescue` subagent via the Agent tool) with an explicit
  imagegen task, e.g.:

  > Use your image generation (imagegen) tool to create a seamless,
  > tileable 1024×1024 texture: soft painterly stylized SHORT FUR grain,
  > subtle low-contrast strokes, no lighting bake, no vignette, uniform
  > mid-gray tonality, suitable as a grayscale luminance map under flat
  > toon colors — the same gentle hand-painted style as a stylized "sand
  > with soft wind ripples" game ground texture (Animal Crossing-adjacent).
  > Save it to `<absolute repo path>/character-studio/src/assets/anatomy/textures/grain-fur-short.png`.

  Reference `island-editor/public/textures/sand-soft-ripples.png` as the
  style exemplar if the tool accepts input images. If Codex or its imagegen
  tool is unavailable (`/codex:setup` unauthenticated, no image tool), STOP
  condition applies — see below.

## Scope

**In scope**:
- `src/core/materials/patternRaster.ts` + `grainRegistry.ts` (new),
  `patternRegistry.ts` (resolve via rasterizer), `toonMaterial.ts`
  (resolver additions ONLY — shader recipe untouched)
- `src/core/skeleton/partRegistry.ts` (remove `maskUrl` fields at the end —
  masks come from the rasterizer)
- `src/studio/viewport/CharacterRoot.tsx` (mask sourcing),
  `src/studio/roster/companionExport.ts` (mask PNG bytes from rasterizer)
- `src/assets/anatomy/textures/grain-*.png` (new, generated) +
  `src/assets/anatomy/textures/MANIFEST.md` (provenance)
- `scripts/generate-grain.ts` (new; `gen:grain` package entry — validation
  + normalization + tiling check of staged imagegen output)
- `test/core/materials/**`
- Deletion at the end: all `src/assets/anatomy/textures/*.mask.png`.

**Out of scope**:
- Toon GLSL beyond the existing map/mask sampling paths.
- `scripts/blender/patterns.py` deletion (016 sweeps all `.py`).
- Stance, motion, clips (014). Wardrobe masks + `itemRegistry.ts` (016).
- Face atlas system (`src/core/face/**`).
- `src/core/spec/schema.ts` — textureId is a free string; no change needed.
- KTX2 conversion — export handles embedding; keep PNGs.

## Git workflow

Branch `advisor/015-imagegen-textures` off post-013 main; per-step commits
`feat(character-studio): <step>`; no push/PR without operator.

## Steps

### Step 1: Pattern fields + rasterizer

`src/core/materials/patternRaster.ts`:

1. `evaluatePatternChannels(patternId, body: ProcBodyData): Float32Array` —
   start from a copy of `body.channels` (the default authored fields) and
   apply the pattern's field function from the inlined table (each needs
   only `verts`, `meta.torso`, `meta.headCenter/headRadius`,
   `meta.shellRanges`, `meta.limbParams`).
2. `rasterizeChannels(geometry, channels, size, createCanvas?): { canvas, pngBytes() }`
   — the barycentric UV fill + island-aware dilation + blur described in
   Current state. Injectable canvas factory (faceComposite pattern);
   deterministic output.
3. Plain-mask path: `rasterizeChannels(body.geometry, body.channels, 1024)`
   replaces `body-<archetype>.mask.png`; same per part at 256².

**Verify**: `pnpm test -- test/core/materials/patternRaster.test.ts` →
channel decode at probe UVs matches expected slots per pattern (model after
wave-2's numeric mask-decode tests), determinism, and the gutter test: for
each island boundary, pixels within 4px outside the island carry that
island's channels, not a neighbor's.

### Step 2: Swap mask resolution to the rasterizer

`patternRegistry.ts`: `PatternDef.masks` URL table → rasterizer-backed
resolution (keep ids, labels, and `resolvesAuthored()` semantics IDENTICAL —
the wave-2 regression warning). `CharacterRoot.tsx`: replace `useTexture`
mask loading for body/parts with memoized `CanvasTexture`s from the
rasterizer, configured exactly like `configureMask` does today
(`flipY=false`, `NoColorSpace`). `companionExport.ts` (:34-48 area): build
`maskPngsByRegion` from `pngBytes()` instead of `fetchBytes(maskUrl)`.

**Verify**: `pnpm test` green; dev: all 8 species show their markings;
export a robin → pattern present in the compiled GLB (runtime screenshot).
Check the back centerline specifically — the historical seam stripe must
be gone (this plan's dilation fixes the known wave-1 issue).

### Step 3: Grain registry + material wiring

`src/core/materials/grainRegistry.ts`: `GRAIN_REGISTRY` mapping grain ids →
`{ label, url, repeat: [u, v] }`: `grain-fur-short`, `grain-fur-fluffy`,
`grain-feather-soft`, `grain-none`. Resolve through `ResolvedTextures.map`
(the currently-white slot): texture config `RepeatWrapping` + mipmaps like
the island-editor loader. **Color space is an explicit A/B**: the map
multiplies `diffuseColor` via `<map_fragment>`; try `SRGBColorSpace` (like
the sand color maps) vs `NoColorSpace` on a mid-gray flat, pick whichever
keeps a 0.5-gray grain visually neutral under the palette, screenshot both,
and record the choice + rationale in MANIFEST.md.

Surface selection reuses `materials.<region>.textureId` (free string):
resolver composes `{ map: grain, maskMap: pattern-or-authored }` when the
id names a grain; extend `resolvesAuthored` (never bypass it) so patterns
and grain compose. Species presets pick defaults (mammals → fur, birds →
feather).

**Verify**: `pnpm typecheck && pnpm test`; dev: grain on shiba shows subtle
fur tooth under palette color; palette recolor still works; toggling grain
does not recompile-flash other characters (program-key stability).

### Step 4: Generate the grain library via /codex:rescue imagegen

For each grain id, invoke `codex:rescue` with the prompt template (adjusted
per material: short fur / fluffy fur / soft feather barbs), staging outputs
under `src/assets/anatomy/textures/`. Write `scripts/generate-grain.ts`
(`gen:grain`) to validate + normalize each PNG: 1024×1024; grayscale
conversion; levels normalized to mid-gray mean with bounded contrast (so
palette stays dominant); **tiling check** — max wrapped-edge discontinuity
under a threshold; on failure ask Codex to regenerate "make it seamlessly
tileable" and/or apply a small cross-fade wrap fix in the script.

**Screenshot gate**: each grain applied on a species next to the flat
version + a crop of `sand-soft-ripples.png` for style adjacency; the
reviewer judges "same soft painterly family."

**Verify**: `pnpm gen:grain` → exit 0, all PNGs pass; manifest updated.

### Step 5: Provenance manifest + delete the baked masks

`src/assets/anatomy/textures/MANIFEST.md`: one row per generated file — id,
generator ("Codex imagegen via /codex:rescue"), prompt, date,
post-processing, ownership note (AI-generated for this project) — plus the
grain color-space decision. Then delete every
`src/assets/anatomy/textures/*.mask.png` and remove `maskUrl` fields +
plumbing from `partRegistry.ts` (`BodyDef.maskUrl`, `PartDef.maskUrl`, the
`maskUrl()` helper) and their consumers in CharacterRoot/companionExport.
(`patterns.py` and wardrobe masks are untouched — 016.)

**Verify**: `pnpm typecheck && pnpm test` green;
`ls src/assets/anatomy/textures/` → only `grain-*.png` + `MANIFEST.md`;
`git grep -n "maskUrl" -- src/core/skeleton src/studio/viewport` → no
matches (wardrobe maskUrl remains, in `itemRegistry.ts`/wardrobe code only).

## Test plan

- `test/core/materials/patternRaster.test.ts` — per-pattern channel probes
  (numeric-decode style, per wave-2), island-gutter integrity, determinism,
  PNG round-trip (bytes decode to the same channels) — `@napi-rs/canvas`
  via the injectable factory.
- `test/core/materials/grainRegistry.test.ts` — registry completeness,
  resolver composes map+maskMap, `resolvesAuthored` extended cases (pattern
  id + grain id together still resolve the authored-mask path).
- Existing `palette.test.ts` / toonMaterial tests green untouched.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0
- [ ] All 8 species markings render via the rasterizer (screenshots), back
      seam clean
- [ ] ≥3 grain maps generated, tiling-validated, style-gated (screenshots
      incl. sand-texture adjacency crop); color-space decision recorded
- [ ] No `*.mask.png` under `src/assets/anatomy/textures/`; `MANIFEST.md`
      complete; `scripts/blender/` untouched (`git status`)
- [ ] Export: patterned + grained character compiles; pattern AND grain
      survive in the `.companion.glb` (runtime screenshot)
- [ ] No secret values in scripts or manifest
- [ ] `advisor-plans/README.md` wave-3 row updated

## STOP conditions

- Plan 013 not merged, or its landed `ProcBodyData`/`UV_ATLAS` lacks any
  field the pattern port needs (channels, torso meta, head center/radius,
  shellRanges, limbParams) or uses different names — reconcile with 013's
  actual shape and report the delta; do NOT invent a parallel substrate.
- A pattern field cannot be re-expressed on the procedural body after one
  honest attempt — report which and why (likely a shellRanges/limbParams
  gap).
- **Codex/imagegen unavailable**: STOP after completing steps 1–3 and
  report; do NOT substitute another generation service without operator
  approval, and do NOT hand-paint placeholders silently. Steps 1–3 landing
  without the grain library is a valid partial outcome.
- A grain map can't reach the sand-style family after three generation
  attempts — deliver the best three candidates and stop.
- The resolver work seems to require restructuring `getWhiteTexture`/
  `customProgramCacheKey` or editing shader chunks.

## Maintenance notes

- Adding a species pattern is now: one field function + a registry row + a
  probe test — no Blender. Fields are expressed in body-space coordinates
  from `ProcBodyData.meta`, so plan-014 stance re-parameterization degrades
  gracefully (the meta moves with the body).
- Grain maps are shared library assets; add a new grain only for a new
  material family (scales, for the deferred reptile class).
- Wave-2 polish items (tabby stripe contrast, owl disc subtlety) are
  addressed in the port constants — note in the wave-3 README what was
  changed.
- Reviewer scrutiny: color-space A/B evidence; grain never overpowering
  palette identity (AC characters read flat at distance); rasterizer
  determinism (export twice → identical bytes); the seam-stripe fix.
