# Plan 002: Build the drawn-face system — illustrated faces on 3D heads

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.1 is this plan's foundation). Follow steps in order, run every
> verification, honor STOP conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/face character-studio/src/studio`
> Confirm `character-studio/` exists with the plan-001 layout (`src/core/face/`
> empty except `index.ts`, `PlaceholderBody.tsx` present, `frameLoop.ts`
> present with phases `animation|physics|procedural|render`). On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (aesthetic risk — this is one of the two make-or-break quality gates)
- **Depends on**: plans/001-workspace-scaffold.md
- **Category**: direction
- **Recommended executor**: Fable 5 (novel implementation + aesthetic judgment; Opus 4.8 acceptable, expect more iteration on the atlas art)
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

The "drawn/illustrated face on a 3D body" is a hard requirement — it is what
makes Animal Crossing and Pokopia characters read as warm and characterful
instead of uncanny. This plan builds that system as reusable core modules plus
a proving scene. If this plan's result doesn't read as *drawn and alive*, the
project's premise fails — which is why it is Phase 1, before any real bodies
exist.

## Current state

- `character-studio/` exists per plan 001: placeholder capsule+sphere
  character on a lit pedestal; `src/core/face/` is empty; the frame loop
  exposes a `procedural` phase.
- No face assets exist. You will author the v1 expression atlas yourself
  (step 1) — programmatically drawn to canvas, exported to PNG. It will be
  replaced by designer art later; its *layout contract* is what's permanent.

**The researched architecture you are implementing** (inline so you need no
other source — full citations in plan 000 §2.1):

1. **Face planes, not head textures.** Eyes (L/R), brows (L/R), and mouth are
   separate, slightly curved plane meshes hovering ~1.5 mm off the head
   surface (Wind Waker pattern; the offset between layers prevents
   z-fighting). They are parented to the `head` region and conform loosely to
   its curvature (a 4×4-segment plane, vertices projected onto an
   enlarged copy of the head sphere works).
2. **Expression atlas.** One texture per face-part-kind holds a **4×4 grid of
   cells**; a part displays exactly one cell, selected by fractional UV offset
   (`uvOffset = (col * 0.25, row * 0.25)`, `uvRepeat = 0.25`). Switching
   expression = changing one uniform. (VRM/VRoid mechanic.)
3. **Two-layer eyes with masked, movable pupils.** Eye = eye-white layer
   (atlas cell, includes the eye outline/lashes) + pupil/iris layer above it.
   The pupil layer's fragment output is multiplied by the **eye-white cell's
   alpha sampled at the same face-plane UV**, so the pupil only shows inside
   the eye shape. Gaze = offsetting the pupil layer's UV within the cell
   (±0.06 of cell size max). (Wind Waker pupil mechanic.)
4. **Procedural blink** in the `procedural` frame phase: timer sampling a
   randomized interval (mean 3.5 s, jitter ±2 s, occasional double-blink
   ~15%), playing open→half→closed→half→open across ~130 ms by swapping the
   eye cell through `open / half / closed` cells.
5. **Face lighting exemption.** Face planes use an **unlit** material
   (`MeshBasicMaterial`-derived or shader) — drawn faces must not pick up
   scene shading (Hi-Fi Rush / AC precedent: faces stay clean under any
   light). Body shading comes later (plan 005); the face is always print-crisp.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/face/**` (new modules)
- `character-studio/src/studio/viewport/FaceRig.tsx` (new)
- `character-studio/src/studio/panels/FacePanel.tsx` (new, minimal)
- `character-studio/src/assets/face/**` (generated atlas PNGs + generator script)
- `character-studio/src/studio/viewport/PlaceholderBody.tsx` (attach face rig to the head)
- `character-studio/test/core/face/**`

**Out of scope**:
- Toon body shading (plan 005), real head meshes (plan 006), talk/visemes
  (plan 007 — but reserve atlas cells, step 1), any lip-sync audio code,
  student-facing UI, VRM compatibility.

## Git workflow

- Branch: `advisor/002-drawn-face-system`. Conventional commits
  (`feat(character-studio): expression atlas core`). No push/PR without operator instruction.

## Steps

### Step 1: Atlas contract + generated v1 art

`src/core/face/atlas.ts`: define and export the **cell map** as a typed
constant — this layout is the permanent contract designer art must follow:

```ts
export const EYE_CELLS = {
  open: [0,0], half: [1,0], closed: [2,0], happy: [3,0],      // ^ ^ closed arcs
  wide: [0,1], squint: [1,1], sad: [2,1], angry: [3,1],
  heart: [0,2], star: [1,2], spiralDizzy: [2,2], wink: [3,2],
  // row 3 reserved for designer custom cells
} as const;
export const MOUTH_CELLS = {
  neutral: [0,0], smile: [1,0], open: [2,0], frown: [3,0],
  oh: [0,1], grin: [1,1], pout: [2,1], tongue: [3,1],
  // row 2 = talk visemes reserved for plan 007: aa, ee, oh2, mm
  vAa: [0,2], vEe: [1,2], vOh: [2,2], vMm: [3,2],
} as const;
export const BROW_CELLS = { neutral: [0,0], raised: [1,0], knit: [2,0], sadOuter: [3,0] } as const;
```

`scripts/generate-face-atlas.ts` (run with `pnpm dlx tsx` or a vite-node
script; commit the output PNGs to `src/assets/face/`): draws each atlas at
1024×1024 (4× 256px cells) using `canvas`/`OffscreenCanvas`-in-node or plain
SVG→PNG. Art direction for v1 cells — match AC's language: **thick, soft,
very dark brown (#3a2e2a, not pure black) strokes; large oval eye-whites;
rounded everything; no straight lines**. Pupil atlas: single 4×4 with a large
round iris+pupil+white catchlight variant set. Anti-aliased edges,
transparent backgrounds.

**Verify**: PNGs exist; `pnpm typecheck` exits 0; open the PNGs and confirm
cells sit exactly in their 256px grid (no bleed across cell borders — pad
strokes ≥ 8px from cell edges).

### Step 2: Face-plane geometry + unlit atlas material

`src/core/face/facePlane.ts` (pure three, no React):
- `makeFacePlaneGeometry(headRadius, angularWidth, angularHeight)` — a
  4×4-segment plane whose vertices are projected onto a sphere of
  `headRadius + 0.0015` (world units, head ≈ 0.35 r) so it hugs the head.
- `makeAtlasMaterial({ map, cell, layerOffset })` — unlit, `transparent: true`,
  `alphaTest: 0.01`, `polygonOffset` with negative factor scaled by layer
  index (extra z-fight armor), `depthWrite: false`, `side: FrontSide`. Cell
  selection via `map.offset/repeat` per-material (clone texture per part) OR a
  small `onBeforeCompile` uniform — choose one, document why, keep it swappable
  in a single function.
- `setCell(material, cell: [number, number])`, and for pupils
  `setGaze(material, x, y)` clamping to ±0.06 cell.
- Pupil masking: pupil material samples the eye-white texture at the same UV
  and multiplies alpha (`onBeforeCompile` injection or a 10-line
  ShaderMaterial — pupil shader is small; hand-rolling is fine).

Tests (`test/core/face/facePlane.test.ts`): geometry vertices all within
`[headRadius+0.001, headRadius+0.003]` of origin; `setCell` writes the exact
fractional offsets; `setGaze` clamps.

**Verify**: `pnpm test` → pass.

### Step 3: FaceRig — composition + expression state

`src/core/face/faceRig.ts`: `createFaceRig(headObject3D, config)` returns
`{ group, setExpression(name), setGaze(x,y), blink(), update(dt), dispose() }`.
- Composes: eyeWhiteL/R, pupilL/R, browL/R, mouth planes positioned by
  spherical coordinates on the head (defaults: eyes at ±20° azimuth, +5°
  elevation; brows +18° above eyes; mouth at 0°, −18°).
- **Expressions** are named presets mapping to per-part cells:
  `neutral, happy, sad, angry, surprised, sleepy, love, dizzy, wink` —
  each sets eye/brow/mouth cells together (e.g. `happy` = eyes `happy`, brows
  `raised`, mouth `grin`).
- `update(dt)` runs the blink state machine from "Current state" #4 and eases
  gaze toward a target (exponential smoothing, τ ≈ 80 ms).

`src/studio/viewport/FaceRig.tsx`: React wrapper that mounts the rig on the
placeholder head and registers `update` into the frame loop's `procedural`
phase.

Tests: expression preset table completeness (every preset names cells that
exist in the atlas maps); blink state machine reaches `closed` and returns to
`open` within 200 ms of simulated time; double-blink probability honored under
a seeded RNG (inject the RNG — no `Math.random()` directly in core; make it a
constructor arg).

**Verify**: `pnpm test` → pass; `pnpm dev` → placeholder character now has a
face: it blinks at natural random intervals, and pupils track when you call
`setGaze` from the panel (step 4).

### Step 4: Minimal Face panel + gaze-follows-cursor

`src/studio/panels/FacePanel.tsx`: fixed-position right-side panel (plain
Tailwind-free CSS or inline styles — the real shell arrives in plan 012):
expression preset buttons, blink-rate slider, "gaze follows cursor" toggle.
Gaze-follow: convert pointer NDC to `setGaze(x*0.06, y*0.06)` — the character
watches the cursor. This single feature is the fastest "it's alive" win;
implement it well (smoothed, returns to center after 2 s idle).

**Verify**: `pnpm dev` → clicking presets swaps the whole face coherently;
cursor-following eyes feel smooth, not snappy.

### Step 5: The aesthetic gate (do not skip)

Render the character head-on at 1024px and judge honestly against ALL of:
- Face reads as **drawn/printed on** the head — no visible plane edges, no
  z-fighting at any orbit angle, no lighting/shading variation on face marks.
- Blink cadence feels organic over 30 s of watching (no metronome feel).
- `happy`/`sad`/`angry` are instantly tellable apart at a glance.
- Pupils never escape the eye-white silhouette at extreme gaze.

Fix and re-judge until all four hold. If your environment cannot capture
screenshots, run the dev server, describe what verification the operator
should do, and mark the plan DONE-pending-visual in `plans/README.md`.

## Test plan

New tests in `character-studio/test/core/face/`: `facePlane.test.ts`
(geometry projection, cell math, gaze clamp), `faceRig.test.ts` (preset
completeness, blink machine with seeded RNG, gaze smoothing converges),
`atlas.test.ts` (all named cells within 4×4 bounds; no duplicate cells within
a part). Model structure after `test/core/frameLoop.test.ts` from plan 001.
`pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0 (≥ 3 new test files)
- [ ] `grep -rn "Math.random" character-studio/src/core/face/` → no matches (RNG injected)
- [ ] Dev scene: blinking, cursor-tracking, expression-switching face on the placeholder body
- [ ] Step-5 aesthetic gate passed (or explicitly reported as pending visual review)
- [ ] No files outside Scope modified; `plans/README.md` updated

## STOP conditions

- Plan-001 layout/frame-loop contract missing or renamed (drift).
- Persistent z-fighting or visible plane seams that survive `polygonOffset` +
  radial offset tuning — report with screenshots/description; the fallback
  (single full-face decal via `DecalGeometry`) is a design change the advisor
  must approve.
- Atlas generation impossible headlessly in your environment — commit the
  generator + hand-describe the needed PNGs, STOP before step 3.

## Maintenance notes

- The atlas **cell maps are a permanent contract** — designer-authored
  replacement art must land in the same grid; changing the map is a
  spec-version bump (plan 004 owns versioning).
- Plan 007 consumes the reserved viseme mouth row; plan 005 must NOT apply
  toon shading to face planes (they stay unlit); plan 006 re-anchors the rig
  from the placeholder sphere onto real head meshes via the same
  spherical-coordinate config.
- Reviewer: check the pupil mask samples the *eye-white* texture, not its own;
  check `depthWrite:false` ordering issues when hats (plan 008) overlap the face.
