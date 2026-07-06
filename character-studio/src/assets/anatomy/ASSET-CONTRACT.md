# Anatomy asset contract (plan 006)

The rules every archetype body and anatomy part must satisfy so a human
artist can replace or extend any mesh **without code changes**. The current
GLBs are programmatically authored first passes (regenerable — see
"Regenerating" below); they define the contract, not the ceiling. Replace
them with better art freely, as long as everything here still holds.

## Coordinate + unit conventions

- glTF 2.0 binary (`.glb`), **+Y up, character faces +Z, meters**.
- No lights, no cameras, no animations in asset GLBs.
- Each GLB ≤ 5 MB. PNG textures during authoring (KTX2 happens at export,
  plan 011).

## The canonical skeleton (bodies)

- Source of truth: `src/core/skeleton/canonical.ts` (plan 000 §5). Regenerate
  the Blender-consumable JSON with `pnpm gen:skeleton-json` →
  `scripts/blender/build/skeleton.json`.
- All **38 bones**, names **byte-identical** and case-sensitive (`earL.1`,
  `socket.muzzle`, …). Never rename, never re-parent, never add or remove
  bones — that is a plan-000 contract change.
- **Rest pose is translation-only**: every joint exports identity rotation
  and unit scale (in Blender: every edit bone points +Z-in-Blender/+Y-in-glTF
  with zero roll). `test/core/skeleton/assets.test.ts` enforces this and
  compares every joint translation against `buildArchetypeSkeleton()` within
  1e-4.
- Rest pose is **standing, A-pose-like, arms ~30° below horizontal**. This is
  contractual for plan 007 — changing it re-exports every animation clip.
- Loader note (already handled in code): three's `GLTFLoader` strips dots
  from node names; `assembleCharacter` restores canonical names on its
  clones. Keep authoring with dots.

## Archetype bodies (`body-<archetype>.glb`)

- One skinned mesh (multiple primitives OK), head + torso + limbs only —
  **no ears, muzzle, or tail** (those are parts).
- ≤ **18,000 triangles**, quad-dominant source topology, smooth-shaded.
- Attributes per primitive: `POSITION, NORMAL, TEXCOORD_0, JOINTS_0,
  WEIGHTS_0` (≤ 4 influences, normalized).
- UV0: single atlas, **head front gets generous space** (~½ of UV area,
  front-centered island). Keep island seams on the back of each shell — the
  torso belly and face masks must not cross a seam.
- **Body morph targets (shape keys), exactly these five**, 0–1, with
  `targetNames` exported: `bellyRound`, `chubby`, `slim`, `headBig`,
  `headSmall`.
- Proportions per archetype come from `skeleton.json` (heights 0.9 / 1.05 /
  0.8; head ≈ 40 % of height, stubby limbs, mitten hands, big feet). The
  cranium sphere (face-rig anchor + head collider) is
  `archetypeHead(archetype)` in `archetypes.ts` — keep the drawn head shell
  within ~1.07× of that radius or the face planes detach visibly.
- **Fixed topology after shipping**: plan 009 stores sculpt deltas per
  vertex. Changing vertex count of a shipped mesh requires bumping
  `baseMeshVersion`.

## Anatomy parts (`parts/<part-id>.glb`)

- ≤ **2,500 triangles** per part GLB.
- Authored in **reference space** (the 1.0-tall skeleton, `skeleton.json`
  → `reference`); assembly scales parts by the archetype's `uniformScale`.
- Two attachment modes (registry: `src/core/skeleton/partRegistry.ts`):
  - **Skinned** (ears → `earL/R.1-.2`, tails → `tail.1-.4`): SkinnedMesh
    bound to the full canonical armature; weights only on the slot's chain
    bones. Assembly rebinds onto the live body skeleton by bone name.
  - **Rigid** (muzzles → `socket.muzzle`, claws → hand/foot bones, crests →
    `socket.hat`): plain meshes, **origin at the attach bone's rest
    position**, node translation 0. Multi-attach GLBs tag every mesh object
    with a custom property **`attachBone`** (exports as a glTF extra).
- Morphs where meaningful (`length`, `width` on ears/tails; `length` on
  muzzles) — names must match the registry entry.
- Beaks set `hidesMouth` in the registry (the drawn mouth plane hides);
  muzzles set `mouthOffset` (m, reference space) so the drawn mouth floats on
  the muzzle front.
- Spring behavior is **registry data**, not mesh data: `springProfile` on the
  part entry (floppy ears springier than upright). Spring-chain bones are
  never keyframed.

## Palette-mask textures (`textures/*.mask.png`)

- Channel-packed recolor mask per plan 005: **R = primary, G = secondary,
  B = belly, A = accentA**; unmasked remainder falls back to primary.
- Straight data, not color: loaded with `flipY = false` (glTF UV convention)
  and `NoColorSpace`. Author masks against the mesh's exported (glTF) UVs.
- Bodies 1024², parts 256². Albedo is currently flat white (palette does the
  work); a grayscale luminance map may be added per region later — same UVs.

## Face-atlas variants (관상 personalities)

- Generated, never hand-pixel-edited: `pnpm gen:face-atlas`
  (`scripts/generate-face-atlas.ts`). Each personality is one `FaceStyle`
  parameter block — the parameters ARE the grammar (plan 000 §2.1b).
- 1024², 4×4 grid of 256px cells; the cell layout contract in
  `src/core/face/atlas.ts` is immutable. Register new sets in
  `src/core/face/atlasRegistry.ts`.

## Regenerating everything

```
pnpm gen:skeleton-json                 # canonical.ts -> scripts/blender/build/skeleton.json
pnpm gen:assets                        # headless Blender: bodies + parts + masks (+ previews)
pnpm gen:face-atlas                    # face atlas PNG sets (v1 + personalities)
pnpm test                              # structural validation of everything above
```

Blender ≥ 4.2 (verified with 5.1). Builders live in `scripts/blender/`
(`bodies.py`, `parts.py` — add a part by adding a builder + a registry
entry + regenerating).

## Animation clips (`../clips/clips-core-v1.glb`, plan 007)

One animations-only GLB (no meshes/lights/cameras, ≤ 5 MB) authored on the
**canonical skeleton at reference proportions** and played as-is on every
archetype — one skeleton, clips authored once, never remapped between rigs.
The only proportion-dependent data is the hips translation track, which
`createClipMachine`'s `hipsRebase` rewrites at load onto the live skeleton's
hips rest offset (captured at assembly). Regenerate with:

```
pnpm gen:clips        # gen:skeleton-json + headless Blender scripts/blender/clips.py
```

`clips.py` also renders per-clip frame strips (`--no-render` to skip,
`--only clipA,clipB` for partial iteration) and prints the measured
stance-foot ground speed for walk/run — if you retune those gaits, update
`WALK_CLIP_SPEED` / `RUN_CLIP_SPEED` in `src/core/motion/locomotion.ts` to
the printed values or the feet will skate.

### Clip contract (`core-v1`) — names exact, enforced by `test/core/motion/clips.test.ts`

| Clip | Frames @ 30 fps | Loop | Notes |
|---|---|---|---|
| `idle` | 150 | yes | weight shifts + micro-moves; breath is procedural — never bake it |
| `walk` | 27 | yes | in-place, stance-foot speed ≈ 0.890 m/s at 1× (locomotion moves the root) |
| `run` | 18 | yes | in-place, ≈ 1.766 m/s at 1×, exaggerated lean + bounce |
| `sitDown` | 24 | no | ends exactly on `sitIdle`'s first frame (shared SIT_POSE) |
| `sitIdle` | 120 | yes | floor sit, hands on knees |
| `standUp` | 24 | no | starts on SIT_POSE, ends on rest |
| `talkIdle` | 90 | yes | conversational body language; the mouth is procedural |
| `gestureWave` / `gestureNod` / `gestureShrug` / `gestureCheer` | 45 / 30 / 36 / 60 | no | one-shots; start AND end on the rest pose (additive gesture layer depends on it) |

### Authoring rules (the difference between robotic and alive)

- Every key eased (bezier, auto-clamped handles); **no two body parts start
  or stop on the same frame** — spine leads, head +2, arms +1..3
  (overlapping action).
- Loop clips must close exactly: first key repeated one loop later on every
  fcurve + a CYCLES modifier (tangent continuity across the seam).
- Root translation only on `hips`; **no scale tracks anywhere**.
- One-shot gestures return every keyed channel to rest at the last frame.

### Don't-keyframe list (test-enforced)

- Spring-chain bones: `earL.*`, `earR.*`, `tail.*` — the Verlet solver owns
  them; keys would fight physics (plan 000 §2.2).
- `root`, `jaw`, every `socket.*` bone.
- Breath (chest scale), eyes/mouth (drawn-face atlas + procedural layers).

## Wardrobe items (`../wardrobe/<item-id>.glb`, plan 008)

Registry: `src/core/wardrobe/itemRegistry.ts` (zod-validated at load; entries
are plain serializable data — plan 011 exports them). Regenerate everything
with `pnpm gen:wardrobe`; builders in `scripts/blender/wardrobe.py`.

- ≤ **3,000 triangles** and ≤ **2 MB** per item GLB. Same coordinate/unit
  conventions as anatomy assets (+Y up, faces +Z, meters).
- Items are authored in **reference space** but **fitted to the biped-round
  body**: build the garment over the archetype-space biped-round shells, then
  un-map each vertex through its skin weights —
  `v_authored = Σwᵢ·pᵢ_ref + (v_target − Σwᵢ·pᵢ_arch) / u` — so linear blend
  skinning reproduces `v_target` *exactly* on biped-round after the dressing
  pass scales inverse binds by the archetype's `uniformScale` (the anatomy-
  part convention). Other archetypes wear the same GLB via shared-bone
  skinning; add an `archetypes` restriction to the registry only if an item
  visibly breaks on one.
- **Attachment** (mirrors anatomy parts):
  - *Rigid* (hats → `socket.hat`, eyewear → `socket.face`, packs →
    `socket.back`, handhelds → `socket.handL/R`): mesh origin at the socket's
    rest position, +Z forward, `attachBone` custom property on every rigid
    mesh object.
  - *Skinned* (tops, scarves): SkinnedMesh bound to the canonical armature;
    ≤ 4 influences. **Garment shells are inflated 3–5 mm** over the body
    surface and carry weights computed with the *same* analytic falloffs as
    the body (`bodies.py`) so garment and body deform in lockstep — that, not
    hiding, is the primary anti-poke-through tool.
  - *Mixed*: both in one GLB (backpack = rigid pack + skinned strap tails).
- **Body-hide regions**: tops/bottoms/outfits declare `hideBodyRegions ⊆
  {torso, hips, upperLegs}` in the registry; the dressing pass toggles the
  body submeshes tagged with the matching `bodyRegion` glTF extra (see
  "Archetype bodies" above). Garments that hide a region must fully cover
  its silhouette (closed hems).
- **Item-internal spring bones** (scarf ends, drawstrings, strap tails):
  extra bones inside the item GLB, parented under a canonical bone, named
  `[a-zA-Z0-9_]+` only (loader-sanitization-proof), globally unique across
  the registry. Declared as `springChains` registry data (never keyframed;
  plan 003 vocabulary). The dressing pass grafts them onto the live skeleton
  and merges the chains into the character's spring rig.
- **Ear modes** (headwear, AC hat-ears pattern): the registry lists the modes
  the item supports (`through` = authored rim arches/holes clear the ear
  roots; `under` = dressing flattens `earL.1`/`earR.1` to ~15 %; `replace` =
  item ships its own ears, body's skinned ear meshes hide). Never author a
  hat that requires deforming the base ears.
- **Body-follow morphs**: skinned garments covering the torso bake the
  `bellyRound` / `chubby` / `slim` body shape keys (computed with the body's
  own formulas) so the silhouette follows the spec's `bodyMorphs`.
- **Palette masks** (`../wardrobe/textures/item-<id>.mask.png`, 256²): same
  channel contract as anatomy (R/G/B/A → primary/secondary/belly/accentA);
  the registry's `paletteSlots` lists which slots the mask actually uses so
  the panel shows only meaningful override pickers.

## Known debts for a human art pass

- ~~Shell-union shoulder/hip creases~~ — addressed in the polish pass:
  limb roots are projected onto the smooth-min union surface of
  (limb, torso) SDFs (`bodies.fillet_limb_into_torso`), so arms/legs/wings
  flare tangentially into the torso like a sculpt. A hand-sculpted
  single-skin body remains the ceiling, but the junctions no longer crease.
  Keep the bone weights smooth across the elbow and knee blend bands
  (current analytic weights use ~0.16–0.18 smoothstep bands; candy-wrapper
  artifacts appear if you paint harder splits). Garment sleeves apply the
  SAME fillet over the inflated torso (`wardrobe.Fit.sleeve`) — keep them in
  lockstep or shoulders poke through sleeve tops.
- Ear-root blends: skinned ears currently blend `earL.1→earL.2` at ~t=0.4–0.5
  along the ear; root vertices are 100 % `earL.1` so the root never tears,
  but a painted falloff to the head would ground them more.
- Bird tail rest-fit: parts are authored in reference space; the bird
  archetype's tail bones sit lower/longer (offsetScales), so feather-fan
  rests ~1 cm off its authored line until the springs settle. Authoring a
  bird-specific tail variant would remove this.
- Beak/muzzle color detail (nostrils, mouth-line groove) is mask-only today.
