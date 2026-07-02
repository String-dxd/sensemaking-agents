# Plan 010: Lighting studio — relight the scene to shape the character's look

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.3). Follow steps in order, verify each, honor STOP conditions,
> update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/studio/viewport character-studio/src/core/spec`
> Confirm plans 001/004/005 landed: Stage with key light + environment
> fallback, spec `studioLook` passthrough field, toon material reacting to
> scene lights. On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plans/004, 005
- **Category**: direction
- **Recommended executor**: Sonnet 5
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

Adjustable lighting is part of the brief's Spline-grade requirement: "I can
relight the scene to shape the character's look." Designers judge materials,
silhouettes, and mood under controllable light; the chosen look is saved with
the character (`studioLook`) so roster portraits are reproducible.

## Current state

- Stage (plan 001) has a hardcoded hemisphere + key directional light and an
  HDRI placeholder note (`src/assets/hdri/README.md` — HDRIs not yet
  downloaded).
- Toon material (plan 005) consumes scene lights through its ramp; ambient
  floor matters to the look (§2.3: high ambient ≈ 0.45 keeps shadows pastel).
- Spec `studioLook` is `z.unknown()` passthrough (plan 004) — this plan
  defines its real schema.
- drei `Environment` supports `files=` HDRIs; presets are non-production
  (research: GitHub-CDN dependent). Self-host 3–4 CC0 Poly Haven studio
  HDRIs (1k resolution is enough for IBL) in `src/assets/hdri/`.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/spec/lighting.ts` (new — `StudioLook` schema; replace the passthrough)
- `character-studio/src/studio/viewport/{LightRig.tsx (new), Stage.tsx (consume rig)}`
- `character-studio/src/studio/panels/LightingPanel.tsx` (new)
- `character-studio/src/assets/hdri/**` (3–4 CC0 HDRIs, ≤ 2 MB each, with LICENSE notes)
- `character-studio/test/core/spec/lighting.test.ts`

**Out of scope**:
- Post stack changes (plan 005 owns it), exporting lighting into the runtime
  GLB (product scenes light characters themselves — `studioLook` is
  studio/portrait-only; plan 011 records but does not bake it), shadows on
  face planes (faces stay unlit — plan 002 contract).

## Git workflow

- Branch: `advisor/010-lighting-studio`. Conventional commits. No push/PR
  without operator instruction.

## Steps

### Step 1: StudioLook schema (`lighting.ts`)

```ts
StudioLook = {
  version: 1,
  environment: { hdriId: string, intensity: 0..2, rotationDeg: 0..360, background: 'gradient'|'hdri'|'solid', backgroundColor?: hex },
  lights: array (1..4) of { id, type: 'key'|'fill'|'rim'|'accent',
    color: hex, intensity: 0..8, position: vec3, targetHeight: 0..1.5,
    castShadow: boolean, shadowSoftness: 0..1 },
  ambientFloor: 0..1 (default 0.45),
}
```
Wire into `CharacterSpec.studioLook` (replacing passthrough — the field was
optional-unknown, so this is additive; no spec migration needed, but add a
`lighting.test.ts` validation suite). Presets as data: `three-point-soft`
(default), `golden-hour`, `cool-studio`, `dramatic-rim`.

**Verify**: `pnpm test` — presets validate; malformed look rejected.

### Step 2: LightRig (`LightRig.tsx`)

Renders `studioLook` from the store: N `directionalLight`s (shadow config:
PCFSoft, map 2048 for key only, others no shadow by default), drei
`Environment files=` for the HDRI with rotation + intensity, ambient floor
as `hemisphereLight` intensity. Replace the Stage's hardcoded lights with
`LightRig` rendering the default preset. Background modes: CSS-gradient
(default — the soft studio backdrop), hdri, solid.

**Verify**: `pnpm dev` → default look ≈ previous look (no regression in the
plan-005 look gate); switching presets visibly changes mood at 60fps.

### Step 3: Light gizmos + panel

`LightingPanel.tsx` + in-viewport gizmos: each light gets a small billboard
handle (sphere + direction line); dragging via drei `PivotControls` moves
`position` (writes through the store; coalesce via the plan-009 command
stack if present — check `src/core/commands/`; if absent, plain store writes
with a TODO). Panel: per-light color/intensity/shadow controls, add/remove
light (max 4), HDRI picker with rotation dial, ambient floor slider,
preset buttons, "gizmos" visibility toggle (hidden in Play Mode always).

**Verify**: dragging the key light around the character sweeps the toon
terminator smoothly (this is the money interaction — ramp shading must track
light direction correctly, proving plan 005's injection uses per-light
direction, not a baked assumption); rim-light preset produces a visible
back-glow separating character from backdrop.

### Step 4: Portrait lock

"Save look with character" is automatic (it's in the spec); add a **camera
bookmark** to `studioLook.portraitCamera?: { position, target, fov }` +
"Set portrait view" / "Go to portrait view" buttons — plan 011/012 use this
for roster thumbnails.

**Verify**: save character (store serialize), reload → identical lighting +
portrait view restored. `pnpm typecheck && pnpm test` pass.

## Test plan

`test/core/spec/lighting.test.ts`: preset validation, bounds (5 lights
rejected, intensity 9 rejected), portraitCamera optional round-trip.
`pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0
- [ ] 4 presets + ≥ 3 self-hosted HDRIs (license files present) switchable live
- [ ] Key-light drag sweeps the toon terminator correctly (step 3 gate)
- [ ] `studioLook` round-trips through spec save/load including portrait camera
- [ ] Face planes remain unlit under every preset (visual check)
- [ ] `plans/README.md` updated

## STOP conditions

- Toon ramp doesn't respond per-light-direction (plan 005 injected a
  single-light assumption) — that's a plan-005 defect; report it rather than
  patching around it here.
- HDRI download impossible in your environment — commit the rig with
  hemisphere-only fallback, list exact Poly Haven URLs for the operator, mark
  `BLOCKED (HDRIs pending)`.

## Maintenance notes

- Plan 011 records `studioLook` in the export extension (for re-edit
  fidelity) but the runtime never applies it — product lighting is the
  product's job. Plan 012 uses `portraitCamera` for roster thumbnails.
- Reviewer: shadow-map count (only key casts by default — 4 shadow maps
  would eat the frame budget), Environment texture disposal on HDRI switch.
