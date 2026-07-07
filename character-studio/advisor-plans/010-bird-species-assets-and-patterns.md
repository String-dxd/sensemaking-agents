# Plan 010: Bird species assets — pattern-mask system, hooked beak, duck bill

> **Recommended executor model: Opus 4.8** (heavy but well-precedented 3D /
> Blender-pipeline engineering with visual gates — plan-000 §8 tiering).
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`. All commands run from `character-studio/`.
>
> **Drift check (run first)**:
> `git diff --stat c3dc079..HEAD -- character-studio/scripts/blender character-studio/src/core character-studio/src/studio/viewport/CharacterRoot.tsx`
> Plan 008 MUST already be merged (`src/core/species/registry.ts` exists).
> Other drift vs the excerpts below is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (Blender pipeline + shader-adjacent texture routing; visual gates)
- **Depends on**: advisor-plans/008-species-taxonomy-and-spec-v2.md
- **Category**: direction (species-first controlled creator, wave 2)
- **Planned at**: commit `c3dc079`, 2026-07-06

## Why this matters

Operator directive: species must carry AC:NH-grade **identity details** —
"patterns of the birds, and wing shape (that represent the feathers) and
size/proportion." Wing shape landed in plan 007 (draped wing mass). This plan
adds the two missing pillars for birds: (1) a **pattern-mask variant system**
(per-species body markings — robin breast, owl facial disc, duckling wing
band) riding the existing palette-mask shader with zero schema change, and
(2) the two missing **beak silhouettes** (hooked raptor beak, flat duck bill).
Plan 011 reuses the pattern system for mammals.

## Current state

### How masks work today (the system you are extending)

- Bodies are built as `Shell` primitives whose per-vertex **channel weights**
  (R/G/B/A = primary/secondary/belly/accentA palette slots) are assigned
  analytically, then rasterized into one PNG per body:
  - `scripts/blender/bodies.py:349-371` — `_torso_channels` (belly ellipse,
    back saddle) and `_head_channels` (face patch, head cap; bird gets a
    bolder cap). `CH_PRIMARY, CH_SECONDARY, CH_BELLY, CH_ACCENT = 0,1,2,3`
    (bodies.py:28).
  - `scripts/blender/gen_assets.py:78-79` — after welding:
    `mask = rasterize_mask(shells, size=1024, blur=3)` then
    `write_png(..., f"body-{archetype}.mask.png")`. **The mask is rasterized
    from the pre-weld shells** (the welded mesh keeps shell UVs), so pattern
    variants only need to re-run channel assignment + rasterize — no new GLB.
  - `scripts/blender/meshkit.py:338` — `rasterize_mask(shells, size, blur)`;
    `meshkit.py:47` — `Shell.channel(idx, w)` sets a channel's weights.
- The bird's wing shells are named `armL`/`armR` (bodies.py:216-233); wing-tip
  accent already exists: `wing.channel(CH_ACCENT, smoothstep(0.72,0.95,t)*0.9)`
  (bodies.py:231), where `t = wing.params[:, 1]` is the root→tip parameter.
- Runtime texture routing:
  - `src/studio/viewport/CharacterRoot.tsx:117` — builds the region→mask-URL
    list: `const entries: Array<{ region: Region; url: string }> =
    [{ region: 'body', url: body.maskUrl }]` (parts appended after).
  - `src/core/skeleton/assemble.ts:285-290` — region materials resolve
    textures: `textureId === 'authored' ? (texturesByRegion[region] ?? …) :
    defaultTextureResolver(textureId)`.
  - `src/core/materials/toonMaterial.ts:56-64` — `defaultTextureResolver`
    knows `'debug-spots'`/`'none'`; `TEXTURE_IDS = ['authored','none','debug-spots']`.
  - Spec: `materials.<region>.textureId` is a free string
    (`src/core/spec/schema.ts:239`), so pattern ids need **no schema change**.
- Beak exemplar (`scripts/blender/parts.py:185-192`):

  ```python
  def muzzle_beak_small(skel: dict):
      a = joints(skel)["socket.muzzle"]
      beak = capsule_along("beak", (a[0], a[1] + 0.02, a[2] - 0.03), (a[0], a[1] - 0.012, a[2] + 0.085), 0.046, 0.007, useg=12, vseg=10)
      beak.verts[:, 1] = (a[1] + 0.004) + (beak.verts[:, 1] - (a[1] + 0.004)) * 0.72  # squash vertically
      beak.channel(CH_ACCENT, np.ones(len(beak.verts)))
      shells = [beak]
      return [("muzzle-beak-small", shells, "socket.muzzle", _muzzle_length_key(shells, a))]
  ```

  Builders are registered in `PART_BUILDERS` (parts.py:324-…); gen_assets
  builds every entry (`gen_assets.py:184-187`), enforcing
  `TRI_BUDGET_PART = 2500`. TS-side registration is one `PART_REGISTRY`
  entry (`src/core/skeleton/partRegistry.ts:74` — after plan 008 each entry
  also carries `classes`).
- Species presets (plan 008): `src/core/species/registry.ts` — `robin`,
  `owl`, `duckling` currently have `patternId` unset, owl uses `beak-small`,
  duckling uses `beak-round` (marked as placeholders in registry comments).
- Blender invocation: `pnpm gen:assets` =
  `pnpm gen:skeleton-json && /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/gen_assets.py`
  (package.json). Supports `-- --only id1,id2` and `--no-render`
  (gen_assets.py:161-169).

### Known hazards (recorded by previous executors — advisor-plans/README.md)

1. **UV-seam mask bleed**: `rasterize_mask`'s box blur bleeds
   neighboring-island channels across island boundaries — already visible as
   a thin light stripe down the back centerline. Torso/head UV islands are
   front-centered (`uv_front_center = True`, seam at the BACK). Therefore:
   keep high-contrast pattern boundaries AWAY from the back centerline and
   island edges; front-centered patterns (breast, face disc) are safe.
2. **Part-GLB export nondeterminism**: the 8 part GLBs byte-drift on every
   gen run under Blender 5.1.2 even when untouched. Convention from the
   plan-003/007 executors: regenerate ONLY what you changed (use `--only`),
   and `git checkout --` any part GLBs that drifted without a source change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Regen bird body + its masks | `pnpm gen:assets -- --only body-bird` | prints `[body bird] … tris -> …`, exit 0 |
| Regen one part | `pnpm gen:assets -- --only muzzle-beak-hooked` | `[part muzzle-beak-hooked] … tris` ≤ 2500 |
| Dev server | `pnpm dev` | http://localhost:5190 |

Previews land in `scripts/blender/build/previews/` (front / three-quarter /
side / back PNGs per asset) — your screenshot-gate evidence.

## Scope

**In scope**:

- `scripts/blender/patterns.py` (create — pattern channel functions)
- `scripts/blender/gen_assets.py` (bake pattern mask variants)
- `scripts/blender/parts.py` (two new beak builders + `PART_BUILDERS` entries)
- `src/assets/anatomy/textures/body-bird.pattern-*.mask.png` (generated)
- `src/assets/anatomy/parts/muzzle-beak-hooked.glb`,
  `muzzle-bill-duck.glb` + their `part-*.mask.png` (generated)
- `src/core/materials/patternRegistry.ts` (create)
- `src/core/skeleton/assemble.ts` (pattern ids resolve like `authored`)
- `src/studio/viewport/CharacterRoot.tsx` (body mask URL by patternId)
- `src/core/skeleton/partRegistry.ts` (two new entries)
- `src/core/species/registry.ts` (flip robin/owl/duckling patternId + beaks)
- `test/core/**` (pattern registry + updated species tests)

**Out of scope** (do NOT touch):

- Mammal patterns and `tail-slim-cat` (plan 011). Mammal body GLBs/masks —
  do not regenerate `body-biped-*`.
- `scripts/blender/clips.py`, `wardrobe.py`, `weld.py` internals (you may
  read them; the weld call in gen_assets stays as-is).
- The toon shader itself (`toonMaterial.ts` shader code) — patterns are
  pure mask-texture swaps.
- `src/core/export/**` (exported GLBs keep the authored mask for now — note
  it in Maintenance).
- Fixing the UV-seam blur bleed (separate known issue; see STOP conditions).

## Git workflow

- Branch: `advisor/010-bird-species-assets` off `main` (after 008).
- Commit per step, e.g.
  `feat(character-studio): pattern-mask variant baking (plan 010 step 1)`.
- Do NOT push or merge without operator approval.

## Steps

### Step 1: Pattern channel functions + baking

Create `scripts/blender/patterns.py`:

```python
# Body pattern-mask variants (plan 010). A pattern REASSIGNS palette-mask
# channel weights on the pre-weld body shells, then gen_assets rasterizes a
# variant PNG: body-<archetype>.<pattern_id>.mask.png. Channels never add
# colors — hues stay in the character's palette (species presets pair each
# pattern with its palette). Keep high-contrast boundaries away from the
# BACK centerline (UV wrap seam — mask blur bleeds across islands).

BODY_PATTERNS: dict[str, dict] = {
    # pattern_id -> { "archetypes": [...], "apply": fn(shells, skel, meta) }
}
```

Each `apply` mutates shell channels (same numpy idiom as
`_torso_channels`/`_head_channels` — import `CH_*` and `smoothstep` from
`bodies`/`meshkit`). Implement three bird patterns (shell names: `head`,
`torso`, `armL`, `armR`, `legL`, `legR`, `footL`, `footR`; `meta` carries
`head_center`, `head_r`, `torso` dims — see `bodies.py:317-323`):

1. `pattern-robin` (`archetypes: ["bird"]`) — **red breast + warm cap**:
   - torso: replace the belly ellipse with a LARGER, higher one — belly
     channel `1 - smoothstep(0.75, 1.15, sqrt(du²+dv²))` with `dv` centered
     at `cy + ry*0.15` (breast, not tummy) and `du` over `rx*1.05`, still
     gated by the `front` mask (bodies.py:354 idiom). Belly weight ≥0.9 in
     the core.
   - head: extend the face patch DOWN to meet the breast (chin/throat):
     widen `_head_channels`' face term to `smoothstep(0.1, 0.6, d[:,2]) *
     smoothstep(0.65, -0.35, d[:,1])`.
   - wings (`armL`/`armR`): darken with secondary — `G = 0.85` over
     `t > 0.25` (folded wing reads as the dark back side).
2. `pattern-owl` (`archetypes: ["bird"]`) — **facial disc + speckled chest**:
   - head: facial disc = belly channel as a forward annulus:
     `disc = smoothstep(0.15, 0.55, d[:,2])`, and a *ring* accent
     `A = smoothstep(0.35, 0.6, d[:,2]) * (1 - smoothstep(0.75, 0.95, d[:,2]))
     * 0.7` (the disc outline).
   - torso front: speckle rows — belly channel multiplied by
     `0.75 + 0.25 * np.sin(v[:,1] * 55.0) * np.sin(v[:,0] * 60.0)` clipped
     to [0,1] (soft horizontal barring, NOT hard dots — hard dots alias at
     1024px).
   - wings: `G = 0.9` over `t > 0.2`.
3. `pattern-duckling` (`archetypes: ["bird"]`) — **crown cap + wing band**:
   - head: crown cap secondary `G = smoothstep(0.25, 0.7, d[:,1]) * 0.95`
     (replaces the default bird cap).
   - wings: speculum band — `A = smoothstep(0.5, 0.6, t) *
     (1 - smoothstep(0.78, 0.88, t))` (a clean band before the existing tip
     accent, which this pattern overwrites).
   - torso: keep the default belly, but raise its weight to 1.0.

In `gen_assets.py` `build_body`, after the base mask write (line 78-79):

```python
import patterns
for pid, pdef in patterns.BODY_PATTERNS.items():
    if archetype not in pdef["archetypes"]:
        continue
    pshells, pmeta = bodies.build_body_shells(archetype, skel, fillet=False)
    pdef["apply"](pshells, skel, pmeta)
    pmask = rasterize_mask(pshells, size=1024, blur=3)
    write_png(os.path.join(TEX_DIR, f"body-{archetype}.{pid}.mask.png"), pmask)
```

(Rebuild the shells fresh per pattern — `apply` mutates channels; do NOT
reuse the welded shells' state across patterns.)

**Verify**: `pnpm gen:assets -- --only body-bird --no-render` → exit 0;
`ls src/assets/anatomy/textures/ | grep body-bird` → base +
`body-bird.pattern-robin.mask.png`, `…pattern-owl…`, `…pattern-duckling…`.
Then `git status` → confirm NO changes under `src/assets/anatomy/parts/`
(if part GLBs drifted, `git checkout -- src/assets/anatomy/parts`).
Open each new PNG and confirm: robin = big front blob reaching the chin;
owl = forward disc + banded front; duckling = dark crown + wing band.
Confirm the bird body GLB byte-changed or not — either is fine (shells are
rebuilt identically; if `body-bird.glb` drifted, `git checkout --` it too:
this step is mask-only).

### Step 2: TS pattern registry + routing

Create `src/core/materials/patternRegistry.ts` (follow `partRegistry.ts`'s
URL idiom):

```ts
import type { Archetype } from '../spec/schema'

const tex = (file: string) => new URL(`../../assets/anatomy/textures/${file}`, import.meta.url).href

export interface PatternDef {
  label: string
  /** Archetypes this pattern has a baked body mask for. */
  masks: Partial<Record<Archetype, string>>
}

export const PATTERN_REGISTRY = {
  'pattern-robin':    { label: 'Robin',    masks: { bird: tex('body-bird.pattern-robin.mask.png') } },
  'pattern-owl':      { label: 'Owl',      masks: { bird: tex('body-bird.pattern-owl.mask.png') } },
  'pattern-duckling': { label: 'Duckling', masks: { bird: tex('body-bird.pattern-duckling.mask.png') } },
} as const satisfies Record<string, PatternDef>

export type PatternId = keyof typeof PATTERN_REGISTRY
export function getPattern(id: string): PatternDef | null { … }
export function patternMaskUrl(id: string | undefined, archetype: Archetype): string | null { … }
```

Routing (two small edits):

1. `CharacterRoot.tsx:117` — the body entry picks the pattern mask when the
   spec's body material names one:
   ```ts
   const bodyTextureId = spec.materials.body?.textureId   // read via the store selector pattern used nearby
   const bodyMaskUrl = patternMaskUrl(bodyTextureId, spec.meta.archetype) ?? body.maskUrl
   const entries: Array<{ region: Region; url: string }> = [{ region: 'body', url: bodyMaskUrl }]
   ```
   (Match the component's existing memo/selector structure — the entries
   list is inside a `useMemo`; add the textureId + archetype to its deps.)
2. `assemble.ts:287-290` — pattern ids resolve through the authored path:
   ```ts
   const resolveTexture: TextureResolver = (textureId) =>
     textureId === 'authored' || getPattern(textureId)
       ? (texturesByRegion[region] ?? EMPTY)          // keep the file's actual fallback expression
       : defaultTextureResolver(textureId)
   ```
   (Keep whatever the current authored-branch expression is — the excerpt
   at "Current state" is abbreviated; only the condition widens.)

**Verify**: `pnpm typecheck` → exit 0. `pnpm dev` → in the browser console:
switch a bird character's `materials.body.textureId` to `pattern-robin` via
the Materials panel is NOT available (panel lists fixed TEXTURE_IDS) — so
verify via Step 4's preset wiring instead; for now confirm no regression:
default characters render identically to before (visual check).

### Step 3: Hooked beak + duck bill parts

In `scripts/blender/parts.py`, model closely on `muzzle_beak_small`
(excerpt above) and `muzzle_beak_round` (parts.py:195-203):

1. `muzzle_beak_hooked` — raptor beak, id `muzzle-beak-hooked`:
   - Upper: `capsule_along("beakU", (a[0], a[1]+0.03, a[2]-0.03),
     (a[0], a[1]-0.005, a[2]+0.075), 0.05, 0.014, useg=12, vseg=10,
     bulge=0.006)`.
   - Hook: bend the tip DOWN — for verts with `t = params[:,1] > 0.65`,
     `y -= (t-0.65)**2 * 0.16` and pull slightly back
     `z -= (t-0.65)**2 * 0.03` (smooth curl, no crease).
   - Lower mandible: small ellipsoid tucked under,
     `("beakL", (a[0], a[1]-0.022, a[2]+0.008), (0.034, 0.016, 0.03))`.
   - `CH_ACCENT = 1` on all beak verts; return with `socket.muzzle` attach +
     `_muzzle_length_key`.
2. `muzzle_bill_duck` — flat wide bill, id `muzzle-bill-duck`:
   - `capsule_along("bill", (a[0], a[1]+0.012, a[2]-0.02),
     (a[0], a[1]-0.006, a[2]+0.095), 0.05, 0.03, useg=14, vseg=10)`, then
     `verts[:,0] *= 1.5` about `a[0]` (wide) and squash y by 0.42 about
     `a[1]` (flat), plus a subtle tip upturn: `y += smoothstep(0.7,1.0,t)*0.008`.
   - `CH_ACCENT = 1`; same return shape.

Register both in `PART_BUILDERS`. Then two `PART_REGISTRY` entries in
`src/core/skeleton/partRegistry.ts` (copy the `beak-small` entry shape:
`region: 'muzzle'`, `attachTo: ['socket.muzzle']`, `morphs: ['length']`,
`hidesMouth: true`, `classes: ['bird']`), ids `beak-hooked` / `bill-duck`,
labels `Hooked beak` / `Duck bill`, urls
`muzzle-beak-hooked.glb` / `muzzle-bill-duck.glb` + matching maskUrls.

**Verify**:
`pnpm gen:assets -- --only muzzle-beak-hooked,muzzle-bill-duck` → both under
2500 tris, GLBs + masks + previews written; `git checkout --` any OTHER
drifted part GLBs. `pnpm typecheck && pnpm test` → exit 0 (plan 008's
class-compatibility suite must accept the new bird-only parts). Inspect
`scripts/blender/build/previews/part-muzzle-beak-hooked-side.png` — the hook
must read as a smooth downward curl; `part-muzzle-bill-duck-front.png` —
clearly wider than tall.

### Step 4: Wire the bird presets

In `src/core/species/registry.ts`:

- `robin`: `patternId: 'pattern-robin'`
- `owl`: `patternId: 'pattern-owl'`, muzzle → `beak-hooked {length:.3}`
- `duckling`: `patternId: 'pattern-duckling'`, muzzle → `bill-duck {length:.4}`
- Remove the "placeholder beak" comments this resolves.

`createCharacterFromSpecies` (plan 008 step 4) already routes `patternId` →
`materials.body.textureId`.

New test in `test/core/` (extend the plan-008 species suite): every
`patternId` used by any species exists in `PATTERN_REGISTRY` AND has a mask
for that species' archetype; every pattern mask URL's file exists on disk
(resolve the URL to a path the same way existing asset tests do — see
`test/core/*assets*` for the established pattern of checking generated GLBs).

**Verify**: `pnpm typecheck && pnpm test` → all pass.

### Step 5: Visual gate (screenshot evidence, honest comparison)

`pnpm dev`, create each bird species (requires plan 009's cards if merged;
otherwise apply via console:
`createCharacterFromSpecies('robin')` through the store, or temporarily load
it as the default — do not commit that temp change). Capture front +
three-quarter screenshots per species. Criteria (all must hold):

- **Robin**: warm orange-red breast patch covering chin→belly, clearly
  bounded, no visible stripe artifact down the back centerline worse than
  the pre-existing one; brown back/wings; yellow-ish beak (accentA).
- **Owl**: pale facial disc reads at three-quarter view; chest barring
  visible but soft; ear tufts (crest) present; hooked beak silhouette
  visible from the side.
- **Duckling**: yellow body, darker crown cap, orange bill wider than tall,
  wing band visible when the wing is in view.
- All three still blink/breathe (no regression in face or motion systems).

If you cannot render screenshots in your environment, say so explicitly in
your report rather than skipping (plan-000 §9).

**Verify**: screenshots saved to your scratch dir and referenced in your
report; `pnpm typecheck && pnpm test` still green.

## Done criteria

- [ ] `pnpm typecheck` and `pnpm test` exit 0
- [ ] 3 new `body-bird.pattern-*.mask.png` files exist; no mammal body asset
      changed (`git status`)
- [ ] `muzzle-beak-hooked.glb` + `muzzle-bill-duck.glb` + masks exist; both
      ≤ 2500 tris (gen output)
- [ ] `PATTERN_REGISTRY` has the 3 patterns; species tests assert
      pattern-mask existence and pass
- [ ] robin/owl/duckling presets carry patternId + correct beaks
- [ ] Visual gate evidence captured and honestly assessed in your report
- [ ] Only in-scope files modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Blender is not at `/Applications/Blender.app/Contents/MacOS/Blender` or
  `pnpm gen:assets` fails before your changes (environment problem, not
  yours to fix).
- A pattern's visual gate fails because of the **UV-seam blur bleed** (a
  bright island-bleed stripe cutting through the pattern): do NOT attempt
  the gutter/edge-dilation fix in `meshkit.py` — that is a separate known
  issue (advisor README). Report which pattern hits it.
- `rasterize_mask` output for the SAME unchanged shells differs from the
  committed base mask (would mean mask baking is nondeterministic like the
  GLB export — the plan assumes masks are deterministic).
- The hook/bill geometry cannot stay under the 2500-tri budget with the
  given segment counts (they should be well under; if not, something else
  is wrong).
- Plan 008's registry shape differs from what Step 4 expects.

## Maintenance notes

- **Export path**: `.companion.glb` export (`src/core/export/compile.ts`)
  still bakes the authored (pattern-less) mask. When plan 005/011-export
  work resumes, `compile.ts` must route `materials.body.textureId` through
  `patternMaskUrl` the same way CharacterRoot does. Deferred deliberately.
- Adding a mammal pattern (plan 011) = one `BODY_PATTERNS` entry with
  `archetypes: ["biped-round"]` (or slim), one bake, one
  `PATTERN_REGISTRY` row, one preset field. No routing changes.
- Reviewer: check Step 2's `assemble.ts` condition change doesn't reroute
  non-body regions (parts) — `texturesByRegion` is keyed per region, and
  only the body entry URL changed in CharacterRoot.
- The MaterialPanel does not expose patterns (TEXTURE_IDS untouched);
  designers get patterns only via species presets for now. Candidate
  follow-up: pattern picker in the Materials tab.
