# Plan 011: Mammal species assets — fur patterns, slim cat tail

> **Recommended executor model: Opus 4.8** (Blender-pipeline work with visual
> gates — plan-000 §8 tiering).
>
> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`. All commands run from `character-studio/`.
>
> **Drift check (run first)**:
> `git diff --stat c3dc079..HEAD -- character-studio/scripts/blender character-studio/src/core`
> Plans 008 AND 010 MUST already be merged: this plan uses 010's
> `scripts/blender/patterns.py` + `src/core/materials/patternRegistry.ts`
> infrastructure verbatim. Read plan 010's "Current state" section first —
> everything there about masks/channels/rasterization applies here and is
> not repeated.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED (Blender geometry + visual gates)
- **Depends on**: advisor-plans/008-species-taxonomy-and-spec-v2.md,
  advisor-plans/010-bird-species-assets-and-patterns.md
- **Category**: direction (species-first controlled creator, wave 2)
- **Planned at**: commit `c3dc079`, 2026-07-06

## Why this matters

The five mammal presets (shiba, tabby cat, rabbit, bear cub, fox — plan 008)
assemble the right parts but wear only the generic belly/saddle mask, so a
shiba and a fox differ mainly by palette. AC:NH villagers are recognizable
because of **markings**: the shiba's cream points, the tabby's stripes, the
fox's dark socks. This plan bakes those as pattern-mask variants (plan 010's
system) and closes the one silhouette gap: the cat currently borrows the fox
tail (declared placeholder in the plan-008 registry).

## Current state

- Pattern infra (from plan 010): `scripts/blender/patterns.py` with
  `BODY_PATTERNS: dict[str, {archetypes, apply}]`; `gen_assets.py` bakes
  `body-<archetype>.<pattern_id>.mask.png` per matching archetype;
  `src/core/materials/patternRegistry.ts` maps `patternId → masks per
  archetype`; species presets carry `patternId` →
  `materials.body.textureId`; `assemble.ts` resolves pattern ids through the
  authored-texture path.
- Channel semantics (`scripts/blender/bodies.py:28`):
  `CH_PRIMARY, CH_SECONDARY, CH_BELLY, CH_ACCENT = 0,1,2,3` → palette slots
  primary/secondary/belly/accentA. Body shell names: `head`, `torso`,
  `armL/R`, `handL/R`, `legL/R`, `footL/R` (bipeds have separate hand
  shells; the bird does not).
- Default mammal channels: belly ellipse + back saddle
  (`_torso_channels`, bodies.py:349-359), face patch + head cap
  (`_head_channels`, bodies.py:362-371), hands/feet accent 0.85
  (bodies.py:270, 310).
- Tail exemplar to model `tail-slim-cat` on (`parts.py:230-241`):

  ```python
  def tail_fluff_fox(skel: dict):
      root, _ = _tail_chain(skel)
      L = 0.36
      tail = capsule_along("tail", tuple(root), tuple(root + np.array([0, L, 0])), 0.052, 0.032, useg=16, vseg=18, bulge=0.07, fullness=0.35)
      t = tail.params[:, 1]
      path = [root, root + np.array([0, 0.015, -0.12]), root + np.array([0, 0.06, -0.24]), root + np.array([0, 0.15, -0.335])]
      tail.verts = bend_chain(tail.verts, root, L, smooth_path(path, 36))
      _chain_weights(tail, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.1)
      tail.channel(CH_BELLY, smoothstep(0.68, 0.92, t))
      keys = _length_width_keys([tail], root, path[-1])
      return [("tail-fluff-fox", [tail], None, keys)]
  ```

- Part registry entry exemplar: `'fluff-fox'` in
  `src/core/skeleton/partRegistry.ts:170-179` (skinned to `TAIL_BONES`,
  `springProfile: spring(0.22, 26, 0.12)`, `morphs: ['length','width']`,
  and — post plan 008 — `classes: ['mammal']`).
- Species presets: `src/core/species/registry.ts` — the five mammal rows
  have `patternId` unset; `tabby-cat` tail row is
  `fluff-fox {length:.35,width:.1}` with a placeholder comment.
- Known hazards: same two as plan 010 (UV back-seam blur bleed — keep
  high-contrast boundaries off the back centerline; part-GLB export
  nondeterminism — regenerate only what you changed via `--only`, revert
  incidental part-GLB drift).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck / tests | `pnpm typecheck && pnpm test` | exit 0 |
| Regen mammal bodies' masks | `pnpm gen:assets -- --only body-biped-round,body-biped-slim --no-render` | exit 0, new pattern PNGs |
| Regen the new tail | `pnpm gen:assets -- --only tail-slim-cat` | `[part tail-slim-cat] … tris` ≤ 2500 |
| Dev server | `pnpm dev` | http://localhost:5190 |

## Scope

**In scope**:

- `scripts/blender/patterns.py` (5 mammal patterns)
- `scripts/blender/parts.py` (`tail_slim_cat` builder + `PART_BUILDERS` entry)
- Generated: `src/assets/anatomy/textures/body-biped-round.pattern-*.mask.png`,
  `body-biped-slim.pattern-*.mask.png`,
  `src/assets/anatomy/parts/tail-slim-cat.glb` + its mask
- `src/core/materials/patternRegistry.ts` (5 rows)
- `src/core/skeleton/partRegistry.ts` (`slim-cat` tail entry)
- `src/core/species/registry.ts` (mammal patternIds + tabby tail swap)
- `test/core/**` (extend the pattern/species assertions)

**Out of scope** (do NOT touch):

- Bird assets (`body-bird*`), beaks, plan-010 patterns.
- Ear/muzzle part meshes — the existing set covers the five mammals
  (operator-approved scope). If a species reads wrong because of a missing
  part mesh, that's a STOP-and-report, not a new part.
- Rabbit inner-ear pink / any PART-mask pattern variants — the pattern
  system is body-only for now (part masks are shared across species;
  per-species part masks are a follow-up).
- `meshkit.py` (no blur/gutter fixes), export pipeline, shaders.

## Git workflow

- Branch: `advisor/011-mammal-species-assets` off `main` (after 008 + 010).
- Commit per step, e.g.
  `feat(character-studio): mammal fur patterns (plan 011 step 1)`.
- Do NOT push or merge without operator approval.

## Steps

### Step 1: Five mammal patterns in `patterns.py`

Add to `BODY_PATTERNS` (same `apply(shells, skel, meta)` contract as plan
010; `d` below = head-local normalized coords as in `_head_channels`
(bodies.py:363): `d = (head.verts - center) / r`; torso locals as in
`_torso_channels`):

1. `pattern-shiba` (`archetypes: ["biped-round"]`) — **cream points (urajiro)**:
   - head: widen the face patch to cover muzzle + cheeks + brow dots:
     face term `smoothstep(0.15, 0.6, d[:,2]) * smoothstep(0.6, -0.3, d[:,1])`,
     PLUS two brow dots: belly channel `0.9 *` gaussian blobs at
     `d ≈ (±0.28, 0.45, 0.72)` with radius 0.16 (use
     `np.exp(-((d - c)**2).sum(1) / (2*0.16**2))`, clipped).
   - torso: extend the belly ellipse up the chest (center `cy + ry*0.05`,
     radius scale ×1.15).
   - arms/legs: belly channel on the FRONT-INNER faces — `B = 0.85 *
     smoothstep(0.1, 0.5, verts_z_local)` where `verts_z_local` is each
     shell's verts z minus its centroid z, normalized by its half-depth
     (front of the limb goes cream, the AC-shiba read).
2. `pattern-tabby` (`archetypes: ["biped-slim"]`) — **stripes + belly**:
   - torso: back stripes — secondary channel
     `G = back_gate * (0.55 + 0.45*np.sin(v[:,1]*70.0))` clipped [0,1],
     where `back_gate = smoothstep(0.1, 0.6, -v[:,2]/rx)` (soft horizontal
     bars on the back only; the front stays clean so the seam-safe rule
     holds — stripes fade before the back centerline seam? NOTE: the wrap
     seam is AT the back centerline; sine bars run horizontally so they are
     continuous across it — acceptable; verify in the gate).
   - head: cap `G` extended down the forehead with an M-notch: multiply the
     cap by `0.75 + 0.25*np.sin(d[:,0]*9.0)`.
   - tail (part is separate — skip; the tail keeps its own mask).
3. `pattern-fox` (`archetypes: ["biped-slim"]`) — **mask + dark socks**:
   - head: cheek flares — belly channel
     `smoothstep(0.05, 0.5, d[:,2]) * smoothstep(0.5, -0.4, d[:,1])`
     widened at the cheeks (`* (1 + 0.4*smoothstep(0.1, 0.5, np.abs(d[:,0])))`,
     clipped).
   - arms + hands, legs + feet: accent channel → 1.0 over the OUTER half of
     each limb's length (`A = smoothstep(0.45, 0.7, t)` with `t =
     shell.params[:,1]`; for hand/foot ellipsoids just `A = 1.0`) — dark
     socks via accentA `#3d2c22` in the fox palette.
4. `pattern-bear` (`archetypes: ["biped-round"]`) — **muzzle patch + chest crescent**:
   - head: tight muzzle oval only — REPLACE the default face patch with
     `smoothstep(0.45, 0.8, d[:,2]) * smoothstep(0.25, -0.35, d[:,1])`.
   - torso: small chest crescent — belly ellipse shrunk (radius scale ×0.55,
     centered `cy + ry*0.2`).
5. `pattern-rabbit` (`archetypes: ["biped-slim"]`) — **soft underside**:
   - torso: belly ellipse widened ×1.2 and weight 1.0.
   - head: face patch extended to a full muzzle-to-chest blaze
     (`smoothstep(0.2, 0.55, d[:,2])`, no vertical gate below the eye line).
   - feet: belly channel 0.6 on `footL/footR` (pale paws).

**Verify**:
`pnpm gen:assets -- --only body-biped-round,body-biped-slim --no-render` →
exit 0; `ls src/assets/anatomy/textures | grep pattern` shows
`body-biped-round.pattern-shiba…`, `…pattern-bear…`,
`body-biped-slim.pattern-tabby…`, `…pattern-fox…`, `…pattern-rabbit…` (plus
plan 010's bird three). `git status`: no part-GLB drift kept (revert
incidental), `body-biped-*.glb` reverted too if byte-drifted (mask-only
step). Open each PNG: patterns visibly match the descriptions.

### Step 2: `tail-slim-cat`

In `scripts/blender/parts.py`, add `tail_slim_cat` modeled on
`tail_fluff_fox` (excerpt above) with: `L = 0.34`, radii `0.026 → 0.02`
(slim, near-constant), `useg=12, vseg=18, bulge=0.0, fullness=0.5`, path
giving the classic upright S-curve:
`[root, root+(0,0.02,-0.10), root+(0,0.10,-0.16), root+(0,0.22,-0.14), root+(0,0.30,-0.07)]`,
`_chain_weights(tail, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.1)`, tail-tip
darkening `tail.channel(CH_ACCENT, smoothstep(0.8, 0.95, t) * 0.9)`,
`_length_width_keys`. Register as `"tail-slim-cat": tail_slim_cat` in
`PART_BUILDERS`.

`PART_REGISTRY` entry `'slim-cat'` (copy `'fluff-fox'`'s shape): label
`Slim cat`, url `tail-slim-cat.glb`, mask `part-tail-slim-cat.mask.png`,
`skinnedTo: TAIL_BONES`, `morphs: ['length','width']`,
`springProfile: spring(0.3, 18, 0.1)` (a slim tail sways more than a curl,
less than fox fluff), `classes: ['mammal']`.

**Verify**: `pnpm gen:assets -- --only tail-slim-cat` → ≤2500 tris, GLB +
mask + previews written. `pnpm typecheck && pnpm test` → exit 0. Preview
`part-tail-slim-cat-side.png`: slim S-curve, no kinks (if `bend_chain`
kinks, add intermediate path points rather than changing bend_chain).

### Step 3: Wire the mammal presets

`src/core/materials/patternRegistry.ts`: add the five rows (masks keyed by
the archetype each pattern was baked for, per Step 1).

`src/core/species/registry.ts`:

- `shiba`: `patternId: 'pattern-shiba'`
- `tabby-cat`: `patternId: 'pattern-tabby'`, tail →
  `slim-cat {length:.4,width:.2}` (delete the placeholder comment)
- `rabbit`: `patternId: 'pattern-rabbit'`
- `bear-cub`: `patternId: 'pattern-bear'`
- `fox`: `patternId: 'pattern-fox'`

Tests: the plan-010 pattern assertions (pattern exists + mask file on disk
for the species' archetype) must now cover all 8 species — if that test
loops over `SPECIES_IDS` it passes automatically; otherwise extend it.

**Verify**: `pnpm typecheck && pnpm test` → all pass.

### Step 4: Visual gate

`pnpm dev`; apply each mammal species (plan 009 cards, or via store console
as in plan 010 step 5). Front + three-quarter screenshots. Criteria:

- **Shiba**: cream muzzle/cheeks/brow-dots/chest/inner-limbs against tan;
  reads "shiba" not "generic dog".
- **Tabby**: soft bars visible on the back at three-quarter; bars continuous
  across the back seam (no hard discontinuity beyond the known thin
  stripe); forehead M hinted; slim S-curve tail present and swaying (spring).
- **Fox**: dark lower limbs ("socks"), pale cheek flares, bushy tail with
  pale tip (existing part mask).
- **Bear cub**: tan muzzle oval + small chest crescent, everything else
  solid brown; round-bear ears.
- **Rabbit**: pale blaze + wide belly, bunny-tall ears upright, stub tail.
- All five blink/breathe; ears and tails spring on the shake debug move
  (enable Advanced → motion debug if plan 009 landed).

If you cannot render screenshots, say so in your report (plan-000 §9).

**Verify**: screenshots captured + honest per-criterion assessment in your
report; `pnpm typecheck && pnpm test` green.

## Done criteria

- [ ] `pnpm typecheck` and `pnpm test` exit 0
- [ ] 5 new mammal pattern PNGs exist; bird assets untouched (`git status`)
- [ ] `tail-slim-cat.glb` + mask + registry entry exist; tabby preset uses it
- [ ] All 5 mammal presets carry their patternId; pattern-existence test
      covers all 8 species
- [ ] Visual gate evidence captured and assessed
- [ ] Only in-scope files modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Plan 010's `patterns.py` / `patternRegistry.ts` infrastructure differs
  from what "Current state" assumes.
- The tabby back stripes produce a hard vertical artifact at the back UV
  seam that the "horizontal bars are continuous across it" argument fails
  to save — report with a screenshot; do not attempt a meshkit gutter fix.
- A species still doesn't read as its animal after the pattern lands and
  the cause is a missing part MESH (e.g. bear needs a dedicated round
  muzzle) — report the specific gap; new part meshes beyond `tail-slim-cat`
  are out of scope.
- Limb-shell local-coordinate assumptions in `pattern-shiba`/`pattern-fox`
  don't hold (e.g. `params[:,1]` isn't root→tip on arm shells — check
  `capsule_along` in `meshkit.py:121` first): report rather than guessing
  the parameterization.

## Maintenance notes

- The tabby is the pattern most likely to need iteration (stripe frequency
  70.0/9.0 are first-guess constants) — reviewer should judge the gate
  screenshots hardest there; tuning the constants is in scope for review
  revisions.
- `sculptDelta` payloads reference `meshVersion`, and this plan does NOT
  regenerate body GLBs (mask-only) — saved sculpts stay valid. Keep it that
  way: if a future pattern needs geometry, it's a new plan.
- Per-species PART masks (rabbit inner-ear pink, shiba tail underside) are
  the natural next increment on this system — deferred.
