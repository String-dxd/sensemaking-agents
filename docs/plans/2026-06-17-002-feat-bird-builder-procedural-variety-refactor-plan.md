---
title: "feat: Bird Builder V2 — procedural-parametric variety refactor (AC-grade variety without an art team)"
type: feat
status: proposed
date: 2026-06-17
plan_id: 2026-06-17-002
revisits: docs/plans/2026-06-17-001-feat-bird-builder-plan.md
relates_to:
  - docs/plans/2026-06-12-001-feat-pebble5-window-plan.md
  - docs/audit/2026-06-12-asset-provenance-audit.md
---

# Bird Builder V2 — Procedural-Parametric Variety Refactor

> **Status: proposed — awaiting sign-off on the architectural pivot + build scope (see §11).**
> Designed via a 14-agent research/design/judge/stress-test pass; every load-bearing claim
> below was verified against repo source.

## 1. Why this plan exists (the pivot)

The V1 plan (`2026-06-17-001`) deliberately chose an **asset-driven dress-up** runtime and
explicitly rejected a procedural generator, betting that Animal-Crossing-grade fidelity would
arrive via the pebble5 **character-art pipeline** (3–6 months of dedicated 3D art). The runtime
shipped and is genuinely good — undo/redo, URL-as-save-file, export/import, constrained
randomize, toon shading. But the art pipeline has not delivered, so the studio today loads **one
GLB** (`MaskedBower.glb`), tints **two** feather materials (body/accent), and snaps on **four**
procedural placeholder hats. That is the *entire* variety surface. Hence the user's verbatim
complaint: **"everything looks all just for changing colour and nothing advanced."**

That complaint is correct, and it is a direct consequence of the V1 bet. This plan does **not**
discard V1's runtime — it keeps it as an upgrade lane — but it **reverses the bet for the variety
axis**: variety comes from **procedural-parametric generation now**, not from an art pipeline
later.

### The unlock (already in-repo, our own code, provenance-clean)

The product engine already contains a **full parametric procedural bird** the studio never
adopted — `buildStandingBird()` in `src/engine/student-space/Game/View/Kira.js`:

- **Morphology by parameters** — `STANDING_BASE` (L445) + per-species `STANDING_OVERRIDES`
  (L491): ~40 params (body x/y/z, belly, neck, headSize/headScale, beak {length,width,height,
  gape,open}, eye {white,pupil,squash,tilt,lids,ring,lash,shine,brow}, crestScale, wing
  {length,rootW,tipW,feathers}, leg, tail {scaleX/Y/Z}).
- **A discrete part library** — `makeCrest()` (L1830): `pointed | tuft | fan | curve | none`;
  `makeTailGeometry()` (L1881): `long-fan | short-fan | pointed | forked | square`.
- **A 6-zone plumage palette** — `SPECIES` (L385) each carries `{ back, belly, accent, beak,
  legs, eye }` (+ face/lid/ring overrides).
- **A canvas-painted face** — `makeStandingHeadMaterial()` (L1526): eyes/cheeks/brows/lids.
- **6 fully procedural species + 1 GLB**, and the provenance audit
  (`2026-06-12-asset-provenance-audit.md`) confirms **all of it is app-authored = clean for
  MOE-wide student publication.**

So procedural-parametric variety is simultaneously **the fastest path to AC-style variety** and
**the publication-safe path**. The authored-GLB pipeline (pebble5's "long pole", which defers the
species picker until 3+ hero GLBs exist) becomes a strictly-additive **upgrade lane**, not a
prerequisite for variety.

## 2. The goal

A **complete refactor** of `bird-builder/` so it produces a real **variety** of birds "like
Animal Crossing" — many species with distinct silhouettes, and **each individual having distinct
characteristics** — on the renderer we already run, blocked on nothing. Charm bar = silhouette +
palette discipline + toon shading (per the art-bible framing), **not** polycount.

## 3. Decision: Hybrid Layered Genome (procedural substrate + authored upgrade lane)

Four end-to-end architectures were designed and scored by three independent judge lenses
(product/art, engineering, pragmatist). Consensus winner: a **Hybrid Layered Genome** —
the maximal procedural-parametric variety surface (species silhouettes + crest/tail/beak parts +
sparse per-individual morph deltas + 6-zone plumage + eye archetypes + patterns + identity),
rendered entirely on the **existing WebGLRenderer + `MeshToonMaterial`**, with patterns painted
via the **`CanvasTexture` mechanism the face painter already proves** — and a single tagged-union
`base` so procedural and GLB lanes never collide.

### Two forks, resolved

1. **Per-individual body morphology — SHIP IT (sequenced after the first reveal).** Two flame
   bowers can differ in *proportion*, not just hue, via **sparse `morph` deltas** over the
   species base. This is the literal answer to "nothing advanced." It is also the riskiest tail
   (see §7), so it lands in **P2**, *after* the P1 species/parts/palette reveal already proves
   "it's not just colour." Exposed only behind chip rows in a collapsed "Advanced" drawer —
   children never see a 40-slider soup.
2. **Pattern tech — `CanvasTexture`, NOT WebGPU/TSL (settled, not a user decision).** The face
   painter already uses `document.createElement('canvas')` → `CanvasTexture` in production.
   Patterns reuse that exact path on the existing WebGLRenderer. WebGPU/TSL `MeshToonNodeMaterial`
   is removed from the critical path entirely (it would force a renderer swap + an unverified drei
   `<Outlines>` second pass, and would not run in the `node` test env). Parked as far-future
   optional polish, never a dependency.

**Why not the alternatives:** *Species-asset-library* (literal AC) freezes silhouette at 6 and
bets the marquee promise on the one resource we don't have (an art team) — rejected as the
headline, but its **SpeciesManifest "rig card"** idea is grafted as the GLB lane spec.
*Modular-parts kitbash* needs authored parts to mix — but its **chip-first UX** and **per-part
fit offset** are grafted wholesale.

## 4. The genome (new data model)

```ts
// bird-builder/src/bird/genome.ts
// PURE. No three/r3f/DOM imports — headless-testable (the repo's enforced boundary).

export type SpeciesId    = 'flame' | 'regent' | 'emerald' | 'satin' | 'twilight' | 'lilac'
export type GlbSpeciesId = 'masked'                       // GLB-backed; grows as hero art lands
export type CrestType = 'pointed' | 'tuft' | 'fan' | 'curve' | 'none'   // verbatim makeCrest()
export type TailType  = 'long-fan' | 'short-fan' | 'pointed' | 'forked' | 'square' // makeTailGeometry()
export type BeakType  = 'slender' | 'stout' | 'hooked' | 'short'        // NET-NEW geometry (§5)
export type EyeArchetype = 'button' | 'sweet' | 'sharp' | 'sleepy' | 'wide' | 'star' | 'angular' | 'half-lid'
export type Personality  = 'bright' | 'bold' | 'gentle' | 'grumpy' | 'sporty' | 'quirky'
export type PatternType  = 'none' | 'stripe' | 'speckle' | 'gradient' | 'chevron'

// 6 semantic zones keyed by NAME, never material index. Matches Kira SPECIES.palette
// exactly so species defaults seed directly. null-meaningful overrides ported faithfully
// (eyeRingColor: null = draw no ring).
export interface PlumagePalette {
  back: string; belly: string; accent: string; beak: string; legs: string; eye: string
  faceColor?: string | null; lidColor?: string | null; eyeRingColor?: string | null
}

// SPARSE deltas only — every key optional, omitted = species default (keeps the hash tiny).
// CRITICAL: the resolver's nested-merge MUST mirror getCharacter()'s exact set
// ['body','belly','headScale','beak','wing','leg','tail'] (Kira.js L607) or a delta silently
// clobbers a sub-object. Pinned by the resolveCharacter unit test (the real P2 gate).
export interface MorphDelta {
  scale?: number
  body?: Partial<{ x: number; y: number; z: number }>; bodyY?: number
  headSize?: number; headScale?: Partial<{ x: number; y: number; z: number }>; headY?: number
  neckH?: number
  beak?: Partial<{ length: number; width: number; height: number; gape: number; open: number }>
  crestScale?: number
  wing?: Partial<{ length: number; rootW: number; tipW: number; rest: number; feathers: number }>
  tail?: Partial<{ scaleX: number; scaleY: number; scaleZ: number }>
  leg?: Partial<{ len: number }>
}

export interface FaceSpec {           // enum archetype + bounded deltas (advanced drawer only)
  eye: EyeArchetype
  browAngle?: number; lidAperture?: number; cheekMark?: 'none' | 'dot' | 'swirl'
}

export interface PatternSpec {        // CanvasTexture overlay, object-space (no swimming)
  type: PatternType; zone: 'back' | 'belly' | 'wing'; scale: number; color: string
}

// Single tagged union — procedural & GLB vocabularies never collide.
export interface ProceduralBase {
  kind: 'procedural'
  species: SpeciesId
  parts: { crest: CrestType; tail: TailType; beak: BeakType }
  morph: MorphDelta                   // sparse; the within-species variation axis
  palette: PlumagePalette
  face: FaceSpec
  pattern: PatternSpec | null
}
export interface GlbBase {
  kind: 'glb'
  species: GlbSpeciesId
  glbUrl: string                      // routing key (~30 bytes), NOT embedded payload
  palette: PlumagePalette             // generalized recolor (was the 2-channel featherPalette)
}

export interface BirdGenome {
  version: 2
  base: ProceduralBase | GlbBase
  identity: { name: string /* validator-capped 24 chars */; personality: Personality }
  slots: Record<string, SlotState>    // body | head | held — reused verbatim from V1
}
```

**Serialization & URL-hash budget (verified safe).** Stays JSON → UTF-8 base64 in `urlHash.ts`.
A fully-specified procedural genome ≈ 0.9–1.5 KB JSON → ~2 KB base64 ≈ **25% of the 8192 cap**,
*even without* omit-defaults; sparse `MorphDelta` is the key lever. The omit-defaults + 2-decimal
quantize codec is **optional polish, not a budget necessity** — but the **encode-side guard is a
P1 must** (today `MAX_HASH_LEN` is checked on *decode only*, `urlHash.ts` L31, so an over-cap
genome silently fails to round-trip and the share link breaks with no error).

**Migration v1 → v2 (single chokepoint, free undo/export).** Add `migrate(parsed)` *before*
`configError`/`isValidConfig` (every entry path already gates through it). `version === 1` with
`baseId === 'masked'` → `{ kind:'glb', species:'masked', glbUrl:'/birds/MaskedBower.glb',
palette }`, folding the 2-channel `featherPalette` into the 6-zone palette (`body→back`,
`accent→accent`, derive a lighter `belly`, seed `beak/legs/eye` from masked `SPECIES.palette`);
carry `slots` verbatim; seed `identity` defaults. Run `migrate()` **inside `loadConfig`** so a
stale v1 autosave upgrades in place (don't bump `STORAGE_KEY`). The three version-pinning canary
tests **flip** (v1-upgrades-to-v2 instead of v2-rejected) — re-point, don't delete. Undo/redo,
export, autosave are **model-agnostic and free** (command stack snapshots whole configs).

## 5. Runtime architecture

Preserves the repo's enforced **pure (`bird/`) vs browser (`rig/`)** split:

- **`bird/` (PURE, vitest-`node`-safe):** `genome.ts` (interfaces + `defaultGenome` +
  `configError`), `morphology.ts` (verbatim port of `SPECIES`, `STANDING_BASE`,
  `STANDING_OVERRIDES`, `getCharacter`, `lerpColor`, `getFriendlyBeakColor` + new
  `resolveCharacter(base)` replicating the exact nested-key list), `migrate.ts`,
  `palettes.ts` (per-zone curated swatches), `eyeArchetypes.ts` (8-entry param **table** — the
  painter reads it), `randomize.ts` (extended), `slots.ts` (per-lane attach vocab).
- **`rig/` (BROWSER, owns DOM canvas + geometry):** `buildProceduralBird.ts` (ports
  `buildStandingBird` + `makeCrest`/`makeTailGeometry`/`makeStandingWing`/`makeStandingLeg`/
  `makeStandingBeak` + new `makeBeakGeometry` + the canvas face painter), `plumagePattern.ts`
  (CanvasTexture patterns), `toon.ts` (**generalized** `toonMat` factory — see §7), `loadBird.ts`
  (GLB clone/rebind, unchanged), `buildItem.ts` (placeholder garments + `fit`).
- **`scene/`:** `Bird.tsx` branches on `base.kind`; `Clothing.tsx` portal generalized to per-lane
  attach nodes; `Backdrop.tsx` unchanged.
- **`editor/`:** unchanged except `urlHash.ts` (encode guard + optional codec), `persistence.ts`
  (migrate-on-load), `birdConfig.ts`/`genome.ts` validator boundary.

**Assembly.** `Bird.tsx` branches: `'procedural'` → `buildProceduralBird(resolveCharacter(base),
gradient)` returns `{ root: THREE.Group, attach: { head, held }, dispose() }`, rendered via
`<primitive object={root} />`; accessories portal into the **re-derived procedural `attach`
nodes** (the GLB bone names `MB_Head`/`Wing.R` in `slots.ts` L24-25 don't exist on a procedural
bird — reusing them drops hats to the scene root). `'glb'` → existing `useGLTF` + `prepareBase` +
`applyToonMaterials` path, **untouched**; `recolorZones()` generalizes the 2-channel
`recolorFeathers` to the 6-zone map.

## 6. Ported vs written-new

**Ported** from `Kira.js` (copied into the standalone workspace — never cross-imported; touched
APIs are version-stable across three 0.149→0.171): `SPECIES`, `STANDING_BASE`,
`STANDING_OVERRIDES`, `getCharacter` (incl. the exact nested-merge list), `lerpColor`,
`getFriendlyBeakColor`; `buildStandingBird`, `makeCrest` (5-way), `makeTailGeometry` (5-way),
`makeStandingWing` (incl. the `scale.z = -1` right-side mirror), `makeStandingLeg`,
`makeStandingBeak`, the canvas face painter. **Discarded:** all engine-singleton animation/wander
glue and `MB_*` bone glue. **Reused verbatim from V1:** `commandStack`, `exportConfig`,
`makeToonGradient` + shared `gradientMap`, `buildItem` `fit`, `loadBird` clone/rebind,
`Clothing.tsx` portal, `App.tsx` commit/undo/keyboard/autosave, `Backdrop.tsx`. **Written new:**
`migrate.ts`, `eyeArchetypes.ts`, `plumagePattern.ts`, `makeBeakGeometry` (4-way — **net-new**;
Kira only has a *parameterized* `makeStandingBeak`, no discrete beak geometry library), the
`resolveCharacter` merge + pinning test, the `urlHash` encode guard, personality bias tables, the
procedural `attach`-node re-derivation, the layered `ToolPanel`.

## 7. Five port-bugs the implementer MUST fix (folded in from the stress-test)

These would silently bite a naive port; they are P0/P1 acceptance items, not afterthoughts:

| # | Bug | Fix |
|---|---|---|
| 1 | **`toonMat` factory is too narrow.** `rig/buildItem.ts`'s `toonMat(gradient,color,name)` sets no `vertexColors`/`map`/`side`. But `makeStandingWing` uses `MeshLambertMaterial({ vertexColors:true, side:DoubleSide })` (bakes the back→accent feather gradient) and the head uses `{ map:canvasTexture, color:0xffffff }`. A naive swap → **flat wings + broken face.** | Generalize to `toonMat({ color, gradientMap, map?, vertexColors?, side? })` **before P1 port**. P1 acceptance: "wing shows back→accent gradient banding, not flat fill." |
| 2 | **vitest env is `node`, not jsdom** (`vite.config.ts` L15). The canvas face painter, `buildProceduralBird`, and any "golden-image snapshot" **cannot run** (`document`/WebGL throw). | The **runnable gate is the pure `resolveCharacter` nested-merge test** (node-safe). For rig-layer visual regressions, either add a second jsdom+canvas-stub vitest project **or** make it a manual/Playwright QA grid — **decide in P0**, and stop citing golden-image as the automated gate. |
| 3 | **CanvasTexture colorSpace.** three r171 flipped default color management (engine source is r149). A ported map renders washed-out/dark unless `texture.colorSpace = THREE.SRGBColorSpace`. | Set `colorSpace = SRGBColorSpace` on the ported CanvasTexture; **verify the face reads correctly under r171 in P2**, not just that it compiles. |
| 4 | **Texture/material disposal.** `buildProceduralBird` is `useMemo`'d and rebuilds the whole Group + a fresh 1024×512 CanvasTexture (~2 MB GPU) on every species/face change. Nothing disposes the old one → GPU leak over an edit session. | Return `dispose()` (geometries + materials + CanvasTexture); call it in the `useMemo`/`useEffect` cleanup. |
| 5 | **drei `<Outlines>` on procedural geometry.** ~11 separate meshes = 11 hulls; thin flat fans (wing/tail) can produce broken/doubled hulls. | Apply `<Outlines>` **selectively** (body/head/beak; skip flat fans); validate visually in P3. Don't assume one `<Outlines>` wraps the Group. |

## 8. UX — presets-first, chips-second, sliders-behind-a-drawer

`ToolPanel` becomes a stepper down the genome (the convergent Sims-CAS / Mii lesson):

1. **SPECIES** — card grid w/ silhouette thumbnails. 6 procedural species **live**; GLB hero
   species render **greyed "soon" cards** (matches the deferred pebble5 picker). One pick = one
   `commit` of that species' morph + palette + part + face defaults. *This is the visible answer
   to "it's just colour."*
2. **IDENTITY** — name (24-char cap) + 6 personality chips. Personality drives the
   **constrained-randomize bias table** (brow/lid/saturation/accessory ranges) so "Surprise me"
   reads intentional, never deformed. Personality is **not** an independent render axis.
3. **PARTS** — **chip rows** (never sliders): crest (5) · tail (5) · beak (4), each with a small
   silhouette icon.
4. **COLOURS** — the 6 zones as labeled curated-swatch rows; **only zones this species exposes**
   (a penguin shows fewer wells than a peacock). Coherence hints (belly auto-suggests a lighter
   tint of back).
5. **FACE** — 8 eye-archetype thumbnails; brow/lid/cheek bounded sliders behind a disclosure.
6. **PATTERN** — type · zone · scale · color.
7. **ADVANCED MORPHOLOGY** — collapsed drawer behind the part chips: ~8 highest-impact bounded
   sliders (bodyX/Y, headSize, beakLength, neckH, tailScale, wingLength, crestScale) as deltas off
   the species base.

Every control = one `commit(nextGenome)`. Randomize / undo / redo / reset / copy-link /
screenshot / export / import **stay exactly where they are** — all free.

> **Gallery-thumbnail rule (P1, not P4):** never render N live 1024×512 CanvasTextures
> simultaneously. Ship galleries as **flat SVG/CSS silhouette icons** from the start; a shared
> low-res offscreen render is an optional later optimization.

## 9. Phasing (each milestone independently shippable)

- **P0 — Prelude (~0.5 day).** Generalize the `toonMat` factory (bug #1). Decide the rig-layer
  test harness (jsdom+canvas-stub vitest project **or** manual/Playwright QA) (bug #2). These
  unblock everything and the plan assumes them.
- **P1 — Procedural core, no renderer change (~1 week, highest leverage).** Port `morphology.ts`
  (pure) + `buildProceduralBird.ts` (Lambert→shared `toonMat`, solid zones, `dispose()`).
  `BirdGenome` v2 + tagged-union base + `migrate(v1→v2)` + re-pointed canaries + **encode-side
  hash guard**. `Bird.tsx` branches procedural/glb; re-derive procedural attach nodes. Species
  picker (6 live + "soon" greyed, **SVG silhouette icons**) + 6-zone palette + crest/tail/beak
  chip rows (incl. **new `makeBeakGeometry`**). Constrained randomize (species + curated zones).
  **Demo:** click between 6 distinctly-shaped birds, recolor 6 zones, share the URL — with full
  undo/share/export intact.
- **P2 — Individual identity (~3 days).** Canvas face painter wired to `FaceSpec` (8 eye
  archetypes; **set `SRGBColorSpace`**, verify under r171 — bug #3). Bounded `morph` jitter in
  randomize + the Advanced morphology drawer; personality bias table. **Gate the morph drawer
  behind the runnable `resolveCharacter` pinning test.** **Demo:** two flame bowers with visibly
  different proportions *and* faces — the AC within-species unlock.
- **P3 — Pattern + outline (~3 days).** `plumagePattern.ts` (CanvasTexture stripe/speckle/
  gradient/chevron, object-space) + selective `drei <Outlines>` on WebGL (bug #5). **Demo:** a
  striped emerald with a clean toon outline. *No renderer risk.*
- **P4 — Polish (~2 days).** Optional genomeCodec (omit-defaults + quantize); idle breath/blink
  `useFrame`; optional shared low-res thumbnail render.

**Cut to a follow-up plan (per stress-test):** the **SpeciesManifest "rig card" + load-time GLB
validator + un-greying machinery**. There is exactly one GLB today (below-bar, uniform-baked), the
pebble5 picker is already deferred to 3+ hero GLBs, and building validator infra for a lane with
zero conforming assets is infrastructure for an explicitly-deferred future. **Keep only** the
cheap `glbUrl` routing in `migrate()` so v1 masked birds still load. The "rig card" spec is
written down here for when hero art lands; it is not built now.

## 10. Risks & the GLB upgrade lane

| Risk (verified) | Mitigation |
|---|---|
| `getCharacter` nested-merge (`body/belly/headScale/beak/wing/leg/tail`, L607) — a sparse delta omitting the same handling clobbers a sub-object. | `resolveCharacter` pinning test on **every nested field**, a **P2 gate** (runnable in `node`). |
| Wing `scale.z=-1` mirror, hardcoded belly-X, `beakKeepsDark`, null-meaningful color fields — silent asymmetry/wrong-beak bugs. | Carry helpers verbatim; validator allows `null`/optional; rig-layer QA grid (P0 harness decision). |
| Morph jitter envelope too wide → deformed birds. | Bounded per-param ranges; constrained randomize (species → bounded jitter → enum parts → curated zones); keep injected `rand()` for the 100-seed determinism test. |
| Part-on-frame clipping (fan crest on a flat-head). | Per-part `fit` offset in socket-local space (mirrors `buildItem.fit`). |
| GPU memory from live thumbnails / undisposed face textures. | SVG icons for galleries (P1); `dispose()` on rebuild (bug #4). |
| URL-hash encode footgun. | Encode-side guard (P1). |

**The upgrade lane (spec, not built now).** The procedural lane is the **floor** (ships now,
audit-clean, zero art dependency). The GLB lane is the **ceiling** (strictly additive). When hero
art lands, each GLB species becomes one **SpeciesManifest "rig card"** row declaring `glbUrl`,
`zoneMaterials` (the ASSET-CONTRACT's named feather channels → semantic zones), `bones`
(`Head`/`Held.R` for accessory attach), and `status: 'live' | 'soon'`. A GLB authored to
`ASSET-CONTRACT.md` drops into `/birds/`, its row flips `soon → live`, and it appears in the
picker with full 6-zone recolor + working accessories — zero code change. Art makes the studio
*better* over time; it is never a prerequisite for shipping variety.

## 11. Decisions needed before build

1. **Endorse the pivot?** Adopt procedural-parametric variety as the V2 spine (this plan),
   keeping V1's asset-driven runtime as the upgrade lane — vs staying asset-driven and waiting on
   the art pipeline.
2. **Build scope this pass?** P0+P1 (the "not just colour" reveal: 6 species, parts, 6-zone
   palette, share) — vs P0–P2 (adds per-individual face + morphology, the AC within-species
   unlock) — vs P0–P3 (adds patterns + outlines).
3. **Rig-layer test harness (P0):** jsdom + canvas-stub vitest project vs manual/Playwright QA
   grid. (The pure `resolveCharacter` gate runs under `node` either way.)

---

**Provenance footnote.** Every shipped pixel in the procedural lane is our own primitives + our
own canvas + our own toon ramp — confirmed app-authored by the
`2026-06-12-asset-provenance-audit.md`. This refactor *strengthens* the MOE-publication posture
relative to the GLB-dependent V1 path.
