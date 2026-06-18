---
title: Island editor — brush cursor ring in sculpt mode
type: feat
status: proposed
date: 2026-06-17
written_against_commit: b6dc287d
initiative: 2026-06-17-000-island-editor-improvements-overview.md
plan_index: 005
---

# Plan 005: Show a brush radius ring under the cursor while sculpting

> **Executor instructions**: Follow the steps; run every verification command. If a STOP condition
> occurs, stop and report. When done, update this plan's row in
> `docs/plans/2026-06-17-000-island-editor-improvements-overview.md`.
>
> **Drift check (run first)**:
> `git diff --stat b6dc287d..HEAD -- island-editor/src/scene/Terrain.tsx island-editor/src/App.tsx`
> If either changed, compare the excerpts below against the live code; on a mismatch, STOP.

## Status

- **Priority**: P3 (nice-to-have; removes "paint blind" friction)
- **Effort**: M (r3f wiring; no new logic)
- **Risk**: LOW (additive scene object; does not change sculpt math or existing handlers' behavior)
- **Depends on**: none
- **Category**: feature / editability
- **Planned at**: commit `b6dc287d`, 2026-06-17

## Why this matters

In sculpt mode there is no cursor feedback — you discover the brush radius and where a dab lands only
*after* clicking. A projected radius ring that follows the pointer (sized to the brush radius) is
standard in sculpt tools and makes aiming strokes possible instead of guess-and-check.

## Current state

- `island-editor/src/scene/Terrain.tsx` — a single `<mesh>` with sculpt pointer handlers. Painting is
  tracked by `const painting = useRef(false)` (37). The move handler only acts while painting:
  ```ts
  const handleDown = sculptActive
    ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); painting.current = true; onPaintStart?.(); onPaint?.(e.point.x, e.point.z) }
    : undefined
  const handleMove = sculptActive
    ? (e: ThreeEvent<PointerEvent>) => { if (!painting.current) return; onPaint?.(e.point.x, e.point.z) }
    : undefined
  return (
    <mesh geometry={geometry} castShadow receiveShadow onPointerDown={handleDown} onPointerMove={handleMove}>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  )
  ```
  `e.point` is the **world-space** hit point on the terrain. Terrain is mounted directly under the
  `<Canvas>` scene (`App.tsx:220`), so world coords == local coords for a sibling at scene root.
  Imports today: `useEffect/useMemo/useRef` (react), `ThreeEvent` (fiber), `buildBaseField/...`
  (no `import * as THREE`).
- `island-editor/src/App.tsx` — brush state `const [brush, setBrush] = useState<BrushParams>({ radius: 3, ... })` (34);
  `<Terrain spec={spec} sculptActive={mode === 'sculpt'} ... />` (220) does **not** pass the radius.
  `BrushParams.radius` is in world units (`brush.ts:6`).

This repo keeps hot-path updates out of React (see `CLAUDE.md` → `use-world-position.ts`: ref-callback
mutates transform per frame). Follow that: position the ring **imperatively** via a ref; only its scale
(radius) and mount (sculpt on/off) go through React.

## Commands you will need

| Purpose | Command (run from repo root) | Expected |
|---|---|---|
| Typecheck | `pnpm --dir island-editor typecheck` | exit 0 |
| Tests | `pnpm --dir island-editor test` | all pass (unchanged) |
| Manual | `pnpm --dir island-editor dev` → http://localhost:5180 | see Test plan |

## Scope

**In scope**:
- `island-editor/src/scene/Terrain.tsx` (add the ring + extend the move/out handlers)
- `island-editor/src/App.tsx` (pass `brushRadius={brush.radius}` to `Terrain`)

**Out of scope** (do NOT touch):
- `brush.ts` / the sculpt math, `onPaintStart/onPaint/onPaintEnd` semantics.
- Coastline/shape mode, the height-profile path.
- Adding a cursor for shape mode (this plan is sculpt-only).

## Git workflow

- Branch: `advisor/005-island-editor-brush-cursor`.
- Commit style: conventional commits (e.g. `feat(island-editor): brush radius cursor`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pass the brush radius into `Terrain`

In `App.tsx`, add `brushRadius={brush.radius}` to the `<Terrain .../>` props (220).

In `Terrain.tsx`, add `brushRadius?: number` to `TerrainProps` (default `3` in the destructure).

**Verify**: `pnpm --dir island-editor typecheck` → exit 0.

### Step 2: Add the ring and drive it imperatively

In `Terrain.tsx`:
1. Add `import * as THREE from 'three'` at the top.
2. Add a ring ref: `const ringRef = useRef<THREE.Mesh>(null)`.
3. Extend the handlers so the ring follows the pointer whenever sculpting (not only while painting),
   and hide it when the pointer leaves the terrain:
   ```ts
   const handleDown = sculptActive
     ? (e: ThreeEvent<PointerEvent>) => {
         e.stopPropagation()
         painting.current = true
         onPaintStart?.()
         onPaint?.(e.point.x, e.point.z)
       }
     : undefined
   const handleMove = sculptActive
     ? (e: ThreeEvent<PointerEvent>) => {
         const ring = ringRef.current
         if (ring) { ring.position.set(e.point.x, e.point.y + 0.02, e.point.z); ring.visible = true }
         if (!painting.current) return
         onPaint?.(e.point.x, e.point.z)
       }
     : undefined
   const handleOut = sculptActive
     ? () => { if (ringRef.current) ringRef.current.visible = false }
     : undefined
   ```
4. Render the terrain mesh and the ring as siblings (the ring is a unit ring scaled to the brush
   radius; lies flat in XZ; drawn on top so it reads as a cursor):
   ```tsx
   return (
     <>
       <mesh
         geometry={geometry}
         castShadow
         receiveShadow
         onPointerDown={handleDown}
         onPointerMove={handleMove}
         onPointerOut={handleOut}
       >
         <meshStandardMaterial vertexColors roughness={0.95} />
       </mesh>
       {sculptActive && (
         <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} scale={brushRadius} visible={false}>
           <ringGeometry args={[0.94, 1, 48]} />
           <meshBasicMaterial
             color="#ffd166"
             transparent
             opacity={0.9}
             side={THREE.DoubleSide}
             depthTest={false}
           />
         </mesh>
       )}
     </>
   )
   ```
   - The ring mounts only in sculpt mode (so leaving sculpt removes it). Within sculpt mode, hover
     shows it (`handleMove`) and leaving the terrain hides it (`handleOut`).
   - `scale={brushRadius}` resizes the unit ring as the radius slider changes (infrequent → React is fine).
   - Position is set imperatively in `handleMove` (hot path, no re-render), matching the repo's
     `use-world-position` ethos.

**Verify**:
- `pnpm --dir island-editor typecheck` → exit 0.
- `pnpm --dir island-editor test` → all pass (no test changes expected).

## Test plan

- Automated: `pnpm --dir island-editor typecheck` + existing tests stay green (this is pure r3f UI;
  no headless-testable logic is added).
- Manual (`pnpm --dir island-editor dev`, http://localhost:5180, **Sculpt** tab):
  1. Hover the island → a yellow ring follows the cursor.
  2. Drag the Radius slider → the ring grows/shrinks to match (ring outer radius ≈ brush radius).
  3. Move the pointer off the island (onto sea/sky) → the ring disappears.
  4. Switch to **Shape** → no ring; switch back to **Sculpt** → ring returns.
  5. Paint a stroke → the dab lands under the ring (ring center ≈ where terrain rises).

## Done criteria

ALL must hold:

- [ ] `App.tsx` passes `brushRadius={brush.radius}` to `Terrain`.
- [ ] `Terrain.tsx` renders a ring that mounts only in sculpt mode, follows the pointer, scales with the
      radius, and hides on pointer-out.
- [ ] `pnpm --dir island-editor typecheck` exits 0.
- [ ] `pnpm --dir island-editor test` exits 0 (unchanged).
- [ ] Manual checks 1–5 pass.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] Overview status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- Adding the ring as a sibling breaks the terrain's pointer events (e.g. the ring intercepts raycasts
  and blocks painting) — if so, set `raycast={() => null}` on the ring mesh (make it non-pickable)
  rather than restructuring; if that still conflicts, STOP and report.
- `ringGeometry`/`meshBasicMaterial` are not recognized as JSX elements (r3f catalog issue) — STOP;
  do not switch rendering libraries.
- The drift check shows `Terrain.tsx` already renders a cursor/ring.

## Maintenance notes

- The ring is non-interactive decoration; if it ever needs to ignore raycasts explicitly, add
  `raycast={() => null}`.
- If a shape-mode cursor is wanted later, generalize this into a small `<BrushCursor>` component rather
  than duplicating the ring.
- Reviewer should confirm: position updates are imperative (no per-move `setState`), and the ring is
  gated on `sculptActive` so it never appears in shape mode.
