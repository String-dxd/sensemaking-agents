# 013 — Specialization thesis: how Character Studio outperforms Blender & Spline

Operator directive (2026-07-05, mid-polish-pass): this is a **specialized 3D
tool for character/companion design** — modeling, rendering, and interface.
It must beat general end-to-end tools *in its niche*. This doc is the
first-principles answer: where the moats actually are, what we already have,
and the priority ladder for future sessions. It amends nothing in 000; it
sharpens the aim.

## The thesis

A specialist tool never beats a generalist at the generalist's game — Blender
will always model anything, Spline will always publish anywhere. A specialist
wins by **encoding the domain's craft as first-class operations**. Blender
gives you vertices; we must give you *charm*. Every feature should be
justifiable as: "a character designer thinks in this vocabulary, and no
general tool speaks it."

Three moats, in order of leverage:

### Moat 1 — Modeling in character-space, not vertex-space

The unit of manipulation is never the vertex; it is the *trait*:

- **Semantic controls all the way down.** bellyRound, ear length, 관상
  personality, spring floppiness — the spec vocabulary IS the modeling UI.
  (Have today.)
- **Sculptor craft as code.** The generator pipeline now encodes real
  sculpting technique — SDF smooth-union fillets at every limb junction,
  parallel-transport frames for bent forms, plumb-line spring authoring.
  Every future primitive inherits the craft. (Landed in the polish pass.)
- **Live-on-the-living-character editing** — the structural advantage no
  general DCC has: you sculpt while the character breathes, blinks, and
  watches your cursor. The judge-fix loop is milliseconds; Blender's is an
  export cycle. Protect this property in every feature (it is why
  `src/core/**` stays React-free and the frame order is contractual).

Ladder (next sessions):
1. **Single-surface SDF body** — replace shell-union bodies with one
   marching-cubes mesh over the smin field; analytic weights/UVs/channels
   re-derived per vertex. True sculpt-grade continuity; bumps
   `baseMeshVersion`, re-fits wardrobe. The big one.
2. **Silhouette-first sculpting** — a black-shape view toggle (the classic
   character-design discipline) + brushes that drag the *silhouette curve*
   rather than surface verts.
3. **Direct manipulation over sliders** — drag an ear longer, pinch a cheek,
   on the character itself; sliders remain as the precise fallback.

### Moat 2 — Rendering: one look perfectly tuned, not infinite looks untuned

Blender renders anything adequately; we render exactly one aesthetic —
soft-matte toy vinyl — better than a generalist ever will out of the box,
because every parameter is pre-aimed at it (ramp wrap bias, terminator
warmth, N8AO, four portrait presets *for this character class*).

Ladder:
1. **Eye-life pass** — catchlight follows the key light (the AC trick);
   pupil highlight parallax. Eyes are where charm lives or dies.
2. **Grounding pass** — soft contact-shadow blob + subtle floor bounce tint;
   characters read "placed", not "hovering".
3. **Per-region ramp textures** — fake-SSS warmth at ear/muzzle rims where
   thin-flesh translucency sells softness.
4. **Curved face planes** — the drawn mouth floats ahead of long muzzles in
   strong 3/4 views (known cosmetic); wrap the planes to the muzzle.

### Moat 3 — Interface: the builder flow IS the spec

The 7-tab flow mirrors how a character designer actually decides (who is it →
what shape → what does it wear → how does it feel → refine → stage → play),
and every control writes one serializable CharacterSpec — undo/roster/export
are structural, not bolted on. A general tool cannot have this property; its
document model must serve every domain.

Ladder:
1. **Personality-first onboarding** — the first question is "who is this?"
   (관상 card picker with live face preview), not "which archetype?".
2. **Variant compare** — two spec snapshots of the same character side by
   side on one stage; charm decisions are comparative, not absolute.
3. **Charm guides overlay** — non-blocking reference bounds (head ≈40% of
   height, eye-line, stance width) drawn as faint guides; the tool teaches
   the bar it enforces.
4. **Reference-image ghosting** — pin concept art translucently behind the
   stage; every character tool workflow starts from a drawing.

## The honest boundary

We do not compete on generality — ever. The GLB authored-asset lane
(ASSET-CONTRACT.md) is the official escape hatch: a pro can model in Blender
*into our contract*, and everything downstream — life, identity, wardrobe,
springs, export — is ours. Blender is a supplier, not a competitor; Spline is
a different product category (generic web-3D publishing) that cannot follow
us into living-character depth.

## Priority call (recommended execution order)

| Rank | Item | Moat | Size | Why first |
|---|---|---|---|---|
| 1 | Eye-life pass (catchlight follows key) | Render | S | Highest charm-per-line-of-code in the codebase |
| 2 | Contact-shadow grounding | Render | S | Every screenshot improves |
| 3 | Silhouette view toggle | UI/Model | S | Cheap, immediately raises design discipline |
| 4 | Single-surface SDF body | Model | XL | The modeling-quality ceiling-raiser; plan properly (needs its own plan doc: topology, UV strategy, wardrobe re-fit, baseMeshVersion migration) |
| 5 | Direct-manipulation handles | UI | M | After 4 (handles should target the final mesh) |
| 6 | Curved face planes | Render | M | Fixes the known muzzle/mouth cosmetic |

Items 1–3 fit in one session alongside review; item 4 deserves a dedicated
plan (014) with its own gates.
