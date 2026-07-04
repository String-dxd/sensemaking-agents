# Plan 001: Scaffold the character-studio workspace with a verified render baseline

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first. Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report — do not improvise. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/ package.json pnpm-workspace.yaml`
> `character-studio/` must not exist yet. If it exists, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Recommended executor**: Sonnet 5
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

Every other plan in this suite (002–012) lands inside this workspace. The
scaffold establishes the isolation pattern that keeps the studio's modern
three.js stack from colliding with the product app's pinned `three@0.149`, the
verification gates every later executor runs, and a minimal-but-real render
baseline (lit turntable stage, placeholder capsule body, camera, resize,
stats) that Phase 1's face and motion work plugs into on day one.

## Current state

- `character-studio/` does not exist.
- The repo is a pnpm monorepo. **Two isolation patterns exist; copy
  bird-builder's, not island-editor's**:
  - `bird-builder/` is a **fully isolated pnpm root**: it has its own
    `pnpm-workspace.yaml` and its own `pnpm-lock.yaml`, is NOT listed in the
    root `pnpm-workspace.yaml#packages`, and root tooling (`biome.json`,
    `vitest.config.ts`, root `tsconfig.json` — all scoped to `src`+`test`)
    never sees it.
  - `island-editor/` is a workspace **member** (listed in root
    `pnpm-workspace.yaml#packages`), which forces repo-wide alignment of
    `@types/three` and `vite` versions. We avoid that constraint entirely by
    being a fully isolated root.
- Root `pnpm-workspace.yaml` `packages:` is exactly `['.', 'island-editor']`
  and carries TanStack `overrides:`. **Do not touch either list.**
- Root `package.json` scripts include (excerpt):
  ```json
  "check": "biome check src test && tsc --noEmit",
  "check:island-editor": "pnpm --filter island-editor typecheck && pnpm --filter island-editor test",
  "check:all": "pnpm check && pnpm check:island-editor",
  ```
- Convention for studio scripts (from `bird-builder/package.json`): `dev`,
  `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`),
  `test:watch`.
- Dev-server ports in use: 3000 (app), 5180 (island-editor). Use **5190**.

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0, creates local `pnpm-lock.yaml` |
| Typecheck | `pnpm typecheck` | exit 0 |
| Tests | `pnpm test` | all pass |
| Build | `pnpm build` | exit 0, emits `dist/` |
| Dev | `pnpm dev` | serves at `http://localhost:5190` |
| Root gates untouched | `cd .. && pnpm check` | exit 0, unaffected by studio |

## Scope

**In scope** (create only):
- `character-studio/**` (everything below)
- Root `package.json` — add two convenience scripts ONLY (step 5)

**Out of scope** (do NOT touch):
- Root `pnpm-workspace.yaml` (adding the studio as a member breaks the isolation strategy)
- `bird-builder/`, `island-editor/`, `src/`, `biome.json`, root `tsconfig.json`, `vitest.config.ts`
- Any `overrides` anywhere; any `three` version outside `character-studio/`

## Git workflow

- Branch: `advisor/001-character-studio-scaffold` off `main`.
- Conventional commits, matching repo history (e.g. `feat(character-studio): scaffold isolated workspace`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the isolated workspace root

Create `character-studio/` with:

`character-studio/pnpm-workspace.yaml`:
```yaml
# character-studio is an isolated pnpm root (bird-builder pattern): own
# lockfile, own three version. Root tooling must never see this package.
packages:
  - '.'
  - 'packages/*'
```

`character-studio/package.json`:
```json
{
  "name": "character-studio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Character Studio — internal tool for authoring animated 3D animal companions (drawn-face toon aesthetic, spring-bone secondary motion). Isolated pnpm root; see plans/000-architecture-and-strategy.md.",
  "scripts": {
    "dev": "vite --port 5190",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@react-three/drei": "^10.0.0",
    "@react-three/fiber": "^9.0.0",
    "@react-three/postprocessing": "^3.0.0",
    "postprocessing": "^6.36.0",
    "n8ao": "^1.9.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.185.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/three": "^0.185.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  },
  "pnpm": { "onlyBuiltDependencies": ["esbuild"] }
}
```
If `pnpm install` reports a peer/version resolution failure for any pinned
minor above, relax that one dependency to its latest compatible minor and note
it in your report — do not downgrade `three` below 0.180 or r3f below 9.

Also create `character-studio/packages/.gitkeep` (plan 011 adds
`companion-runtime` there), `tsconfig.json` (strict, `"jsx": "react-jsx"`,
`"moduleResolution": "bundler"`, include `src`, `test`), `vite.config.ts`
(react plugin only), and `index.html` mounting `src/main.tsx`.

**Verify**: `cd character-studio && pnpm install` → exit 0, local
`pnpm-lock.yaml` created; `git status` shows no change to root `pnpm-lock.yaml`.

### Step 2: Directory skeleton + module-boundary guard

Create the layout from plan 000 §7: `src/core/{spec,skeleton,face,motion,materials,sculpt,export,commands}/`,
`src/studio/{viewport,panels,play}/`, `src/assets/`, `test/`. Each `core`
subdir gets an `index.ts` (empty exports fine).

Add `test/core-no-react.test.ts`: a vitest test that reads every file under
`src/core/**` (use `fs`+`path`, recursive) and asserts none contains
`from 'react'`, `from "react"`, or `from '@react-three`. This enforces the
plan-000 boundary mechanically for all later plans.

**Verify**: `pnpm test` → passes (1 test).

### Step 3: Render baseline — the stage

Build the minimal studio scene, WebGL2:

- `src/studio/viewport/Stage.tsx`: r3f `<Canvas shadows camera={{ fov: 35, position: [0, 1.2, 3.2] }}>`;
  a 3m-radius soft-white cylinder pedestal receiving shadows; drei
  `OrbitControls` (target `[0, 0.7, 0]`), `Environment` using `files=` with a
  self-hosted HDRI placeholder (add `src/assets/hdri/README.md` noting a CC0
  Poly Haven studio HDRI must be downloaded; until then use a drei
  `Lightformer`-free fallback: hemisphere + key `directionalLight` casting
  PCFSoft shadows, intensity 2.5, position `[2, 4, 3]`).
- `src/studio/viewport/PlaceholderBody.tsx`: a capsule (body) + sphere (head)
  group at pedestal center, `MeshToonMaterial` with a 3-step gradient map
  generated in code (DataTexture, 3×1 px). This placeholder is replaced in
  plans 002/003/006 — keep it a single component.
- `src/main.tsx` + `src/studio/App.tsx`: full-viewport canvas, `<Stats />`
  from drei behind `?stats=1`.
- WebGPU flag stub: read `?gpu=webgpu` from the URL and, for now, only
  `console.warn('WebGPU path not yet implemented (plan 000 §4.4)')` — do not
  implement it.

**Verify**: `pnpm dev` → page at `localhost:5190` shows a lit, shadowed
capsule character on a pedestal, orbitable, 60fps with `?stats=1`.
`pnpm typecheck` → exit 0.

### Step 4: Frame-loop contract

Create `src/core/motion/frameLoop.ts`: an ordered update registry —
`registerUpdate(phase: 'animation'|'physics'|'procedural'|'render', fn)` and
`runFrame(dt)` executing phases in exactly that order. Plans 003/007 depend on
this ordering (plan 000 §2.2: animation drives, physics follows). Wire it in
the Stage via `useFrame`. Unit-test the ordering in
`test/core/frameLoop.test.ts` (register out of order, assert call order).

**Verify**: `pnpm test` → all pass.

### Step 5: Root convenience scripts

In root `package.json` add (mirroring the island-editor naming):
```json
"dev:character-studio": "pnpm -C character-studio dev",
"check:character-studio": "pnpm -C character-studio typecheck && pnpm -C character-studio test"
```
Do NOT add it to `check:all` (that script is documented in CLAUDE.md as the
two existing gates; changing its meaning is out of scope).

**Verify**: from repo root: `pnpm check:character-studio` → exit 0; `pnpm
check` → exit 0 (proves root tooling still doesn't see the studio).

### Step 6: README

`character-studio/README.md`: one page — what the studio is, the plan-suite
pointer, commands, the isolation rule (never join root workspace), the port,
and the Phase-1 milestone description from plan 000 §8.

**Verify**: file exists; `pnpm build` → exit 0.

## Test plan

- `test/core-no-react.test.ts` (step 2) — boundary guard.
- `test/core/frameLoop.test.ts` (step 4) — phase ordering: registration order
  ≠ execution order; later-registered `animation` fn still runs before
  earlier-registered `physics` fn.
- Verification: `pnpm test` → all pass (≥ 2 files).

## Done criteria

- [ ] `cd character-studio && pnpm typecheck && pnpm test && pnpm build` all exit 0
- [ ] `pnpm dev` renders the placeholder character at 60fps
- [ ] Root `pnpm check` exits 0 and `git diff --name-only` shows no root-tooling files changed except `package.json` (two scripts)
- [ ] Root `pnpm-workspace.yaml` unmodified (`git diff pnpm-workspace.yaml` empty)
- [ ] `character-studio/pnpm-lock.yaml` exists (own lockfile)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `character-studio/` already exists at drift check.
- `pnpm install` cannot resolve `three@^0.185` / r3f 9 / drei 10 together after one relaxation attempt.
- Anything requires editing root `pnpm-workspace.yaml` or adding overrides.
- The dev server renders black/blank after reasonable debugging (report the console errors).

## Maintenance notes

- Plans 002+ assume this exact directory layout and the frameLoop phase
  contract — renaming either invalidates the suite; update plans/README.md if
  forced.
- Reviewer should scrutinize: no root lockfile churn; the no-react-in-core
  test actually scans recursively.
- Deferred: HDRI download (plan 010 owns lighting), WebGPU flag implementation
  (explicitly out of scope for v1).
