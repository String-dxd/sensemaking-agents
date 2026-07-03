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

## Known debts for a human art pass

- Shell-union bodies (head/torso/limb blobs tucked into each other) — a
  single-skin sculpted body with painted weights will look better at the
  shoulder/hip transitions. Keep the bone weights smooth across the elbow
  and knee blend bands (current analytic weights use ~0.16–0.18 smoothstep
  bands; candy-wrapper artifacts appear if you paint harder splits).
- Ear-root blends: skinned ears currently blend `earL.1→earL.2` at ~t=0.4–0.5
  along the ear; root vertices are 100 % `earL.1` so the root never tears,
  but a painted falloff to the head would ground them more.
- Bird tail rest-fit: parts are authored in reference space; the bird
  archetype's tail bones sit lower/longer (offsetScales), so feather-fan
  rests ~1 cm off its authored line until the springs settle. Authoring a
  bird-specific tail variant would remove this.
- Beak/muzzle color detail (nostrils, mouth-line groove) is mask-only today.
