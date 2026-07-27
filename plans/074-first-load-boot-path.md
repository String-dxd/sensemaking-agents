# Plan 074: Shorten the first load — boot the engine without the duplicate auth gate, start downloads earlier, and get three.js off the synchronous chunk graph

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d1ba3cc9..HEAD -- src/routes/_app.tsx src/components/student-space/EngineHost.tsx src/components/StudentSpaceHost.tsx src/components/student-space/onboarding/EggHatcher.tsx src/components/student-space/onboarding/CameraTuneHud.tsx vercel.json test/components/student-space/EngineHost.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (Step 5 reshapes the client chunk graph)
- **Depends on**: none (plans 072/073 are independent)
- **Category**: perf

- **Planned at**: commit `d1ba3cc9`, 2026-07-27

## Why this matters

From navigation to the first 3D frame, the app today pays a serial chain:
download+parse ~1.3 MB raw (~370 KB gz) of JS that includes all of three.js
**before hydration**, then mount `EngineHost`, then **re-fetch the auth menu
the router already fetched** (gating `createGame` for up to 3 s on a
timeout), then dynamic-import the engine chunk, then construct the world
synchronously, and only *then* start downloading ~6.2 MB of textures and
GLBs — which arrive seconds after the island is already visible, popping in
late. Onboarding sits on the same path (the engine renders behind it), so
every second saved here is a second less of blank-sky.

This plan removes the redundant network gate, overlaps the downloads with
hydration, and moves three.js out of the synchronous chunk graph so
hydration completes without parsing a renderer nobody has called yet.

## Current state

- `src/routes/_app.tsx` — pathless layout; its `beforeLoad` (lines 17–42)
  **awaits `loadAuthMenu()`** and returns `{ authMenu }` into route
  context; `AppLayout` (lines 50–71) reads it via `Route.useRouteContext()`
  but never passes it to `<EngineHost>`:

```tsx
const { authMenu } = Route.useRouteContext() as AppRouteContext
// …
return (
  <EngineHost>
    …
```

- `src/components/student-space/EngineHost.tsx` — mounts the engine once.
  - Line 5: `import { Vector3 } from 'three'` — used only by
    `CameraTuneBridge` (lines 441–464, dev-only: rendered behind
    `import.meta.env.DEV && game` at line 355).
  - Line 28: static import of `CameraTuneHud` (which itself does
    `import { Vector3 } from 'three'` at its line 3).
  - Lines 227–251 (inside the mount `useEffect`): builds
    `authMenuPromise` from `backend.loadAuthMenu` raced against a 3 s
    `setTimeout`, then

```ts
const [engine, authMenu] = await Promise.all([
  import('~/engine/student-space/Game'),
  authMenuPromise,
])
```

    — i.e. the engine import starts only after mount, and `createGame`
    waits on a second auth-menu RPC whose result the router already has.
  - Line 253: `engine.createGame({ container, …, authMenu: authMenu ?? null, … })`.
- `src/components/StudentSpaceHost.tsx` — world-route composition. Line 7
  statically imports `WorldInteractions`; before the engine exists the
  component returns `null`; line 48 renders
  `<WorldInteractions game={game} onboardingMode={…} />`.
- `src/components/student-space/world/WorldInteractions.tsx` — line 3
  `import * as THREE from 'three'`; single named export `WorldInteractions`
  (line 200).
- `src/components/student-space/onboarding/EggHatcher.tsx` — line 17
  `import { loadGlb, MODEL_URLS } from '~/engine/student-space/Game/View/assetLoader.ts'`
  (assetLoader statically pulls three + GLTFLoader + MeshoptDecoder);
  line 495 calls `loadGlb(MODEL_URLS.character)` to warm the character GLB.
  Line 3 is a **type-only** three import (erased at build; leave it).
- Boot-critical static assets (fetched only once `View` constructs —
  `src/engine/student-space/Game/View/Island.js:77–106` for the textures,
  `Tree.js` / `Character.js` / `PlacedObjects.js` via `assetLoader.ts` for
  the GLBs):
  - `/student-space/textures/sand-soft-ripples.png` (~1.2 MB)
  - `/student-space/textures/cliff-soft-strata.png` (~1.3 MB)
  - `/student-space/textures/water-foam-cells.png` (~1.3 MB)
  - `/student-space/textures/water-short-bubbles.png` (~0.9 MB)
  - `/models/tree.glb` (~1.0 MB), `/models/character.glb` (~0.55 MB)
- `vercel.json` — `headers` array has a global security block and a
  `/share/(.*)` block; **no cache headers** for `/models` or
  `/student-space/textures`. Asset filenames are **not content-hashed**, so
  `immutable` would be wrong.
- `test/components/student-space/EngineHost.test.tsx` — covers the current
  auth-menu behavior: "passes the resolved authMenu through to createGame"
  (line 212), "boots with authMenu=null when loadAuthMenu rejects" (229),
  "boots with authMenu=null when the bridge has no loadAuthMenu method"
  (241). These must keep passing (the bridge-fetch path stays as fallback).
- Build layout fact (verified against `dist/client/assets/` built at
  d1ba3cc9): the `_app` route chunk statically imports the ~1.29 MB chunk
  containing `WebGLRenderer`/`GLTFLoader`; the `EngineHost.tsx:249` dynamic
  import only defers the ~291 KB engine State/View chunk.
- Deliberate design decisions this plan must NOT disturb (documented in
  code):
  - Terrain resolution `SEGMENTS = 512` (`islandGeometry.ts:32–40`,
    "maintainer screenshot, plan 030") — out of scope.
  - The canvas mounts once at the root and persists across routes
    (`EngineHost.tsx` doc comment, lines 37–52).
  - The engine module must not be **statically** imported by server-reachable
    code (`EngineHost.tsx:49–51`: "Static import is unsafe under SSR") —
    every early-import mechanism below must stay behind a
    `typeof window !== 'undefined'` guard.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck + lint | `pnpm check` | exit 0 (18 pre-existing warnings are normal) |
| All tests | `pnpm test`         | all pass            |
| Focused   | `pnpm test -- EngineHost` | all pass      |
| Build     | `pnpm build`        | exit 0, writes `dist/client/assets/*.js` |

## Scope

**In scope** (the only files you should modify/create):
- `src/routes/_app.tsx`
- `src/components/student-space/EngineHost.tsx`
- `src/components/student-space/CameraTuneBridge.tsx` (create — extracted dev bridge)
- `src/components/StudentSpaceHost.tsx`
- `src/components/student-space/onboarding/EggHatcher.tsx`
- `src/components/student-space/onboarding/BloomCelebrate.tsx` (amendment 1 — see Step 5.5)
- `src/components/student-space/onboarding/TermlyReveal.tsx` (amendment 1 — see Step 5.5)
- `vercel.json`
- `test/components/student-space/EngineHost.test.tsx`
- `test/components/student-space/student-space-host.test.tsx` (amendment 1 — lazy WorldInteractions requires `findBy*` queries, per the Test plan's directive)
- `scripts/check-chunk-graph.mjs` (create — verification script)

**Out of scope** (do NOT touch, even though they look related):
- `src/engine/student-space/**` — no engine changes in this plan (terrain
  resolution, Sky, Grass allocations are all deliberate or deferred).
- `src/routes/__root.tsx` — font loading strategy is deferred (see
  Maintenance notes).
- `src/components/student-space/onboarding/CameraTuneHud.tsx` — it moves
  behind the lazy boundary but its contents don't change.
- Asset files under `public/` — no recompression/format changes here.
- `src/server/auth-menu.functions.ts` / the backend bridge's `loadAuthMenu`
  — the bridge API stays; only EngineHost's use of it changes.

## Git workflow

- Branch: `advisor/074-first-load-boot-path`
- Conventional commits, e.g. `perf(boot): reuse the router's auth menu and preload world assets`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reuse the router's auth menu instead of re-fetching

1. In `EngineHost.tsx`, add an optional prop
   `authMenu?: AuthMenuState | null` (type import from
   `~/engine/student-space/Game` already exists at line 7 as
   `AuthMenuState`).
2. In the mount effect: when the prop was provided (`authMenu !== undefined`
   — capture it via a ref like the existing `onNavigateRef` pattern at
   lines 93–96 so the effect doesn't re-run), skip building
   `authMenuPromise` entirely and pass the prop value straight to
   `createGame`. When the prop is `undefined`, keep the existing
   bridge-fetch + 3 s timeout path unchanged (tests and any host that
   doesn't run under `_app` rely on it).
3. In `_app.tsx`, pass the context value in **both** branches:
   `<EngineHost authMenu={authMenu ?? null} …>`.
4. Tests: keep the three existing auth-menu tests green (they exercise the
   prop-less fallback). Add one new test, modeled on "passes the resolved
   authMenu through to createGame": render with
   `authMenu={{ status: 'signed-out' }}` AND a bridge whose `loadAuthMenu`
   is a `vi.fn()` — assert `createGame` received that menu and
   `loadAuthMenu` was **never called**.

**Verify**: `pnpm test -- EngineHost` → all pass, including the new test.

### Step 2: Start the engine chunk download at module evaluation

In `EngineHost.tsx`, hoist the dynamic import to module scope so the fetch
starts while React is still hydrating, instead of after the mount effect:

```ts
// Kick off the engine chunk download as soon as this module evaluates in
// the browser — the mount effect awaits the same promise. SSR never touches
// it (the engine assumes a browser-owned window/document at eval time).
const enginePromise =
  typeof window === 'undefined' ? null : import('~/engine/student-space/Game')
```

In the effect, replace `import('~/engine/student-space/Game')` with
`enginePromise ?? import('~/engine/student-space/Game')` (the fallback keeps
non-DOM test environments working if they evaluate the module with
`window` undefined).

**Verify**: `pnpm test -- EngineHost` → all pass. `pnpm check` → exit 0.

### Step 3: Preload the six boot-critical world assets

In `EngineHost.tsx`, add a module-scope function and call it right after
`enginePromise` is created (same `typeof window` guard):

```ts
const BOOT_ASSET_PRELOADS: Array<{ href: string; as: 'image' | 'fetch' }> = [
  { href: '/student-space/textures/sand-soft-ripples.png', as: 'image' },
  { href: '/student-space/textures/cliff-soft-strata.png', as: 'image' },
  { href: '/student-space/textures/water-foam-cells.png', as: 'image' },
  { href: '/student-space/textures/water-short-bubbles.png', as: 'image' },
  { href: '/models/tree.glb', as: 'fetch' },
  { href: '/models/character.glb', as: 'fetch' },
]

function preloadBootAssets() {
  for (const { href, as } of BOOT_ASSET_PRELOADS) {
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) continue
    const link = document.createElement('link')
    link.rel = 'preload'
    link.href = href
    link.as = as
    if (as === 'fetch') link.crossOrigin = 'anonymous'
    document.head.append(link)
  }
}
```

Notes for correctness: `as: 'fetch'` + `crossOrigin: 'anonymous'` matches
how `GLTFLoader`'s `FileLoader` fetches same-origin GLBs, so the preload is
reusable; the textures load through `Image`, so `as: 'image'` (no
crossorigin) matches. The idempotence check matters because the module can
re-evaluate under HMR.

**Verify**: `pnpm check` → exit 0. Then `pnpm build` → exit 0, and
`grep -c "preloadBootAssets" dist/client/assets/_app-*.js` → at least 1
match in exactly one chunk (confirms it shipped with the `_app` graph, not
the server bundle — if the grep finds 0, the function was tree-shaken:
ensure the call site actually executes at module scope).

### Step 4: Cache headers for the 3D assets

In `vercel.json`, append two header blocks (filenames are NOT
content-hashed — do not use `immutable`):

```json
{
  "source": "/models/(.*)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }
  ]
},
{
  "source": "/student-space/textures/(.*)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }
  ]
}
```

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"` → `ok`.

### Step 5: Move three.js out of the synchronous chunk graph

Three static import edges currently drag three.js (and
GLTFLoader/MeshoptDecoder) into the chunk graph that must parse before
hydration. Cut each one:

1. **EngineHost's dev bridge.** Create
   `src/components/student-space/CameraTuneBridge.tsx`: move the
   `CameraTuneBridge` function (currently `EngineHost.tsx:441–464`) plus
   its `Vector3` and `CameraTuneHud` / `useCameraPreset` /
   `CameraTuneTargets` imports there, exporting it as the **default**
   export. In `EngineHost.tsx`, delete the local function and both
   three-touching imports (line 5 `Vector3`, line 28 `CameraTuneHud`), and
   render it lazily:

```tsx
const LazyCameraTuneBridge = lazy(() => import('./CameraTuneBridge'))
// at the old call site (line 355):
{import.meta.env.DEV && game ? (
  <Suspense fallback={null}>
    <LazyCameraTuneBridge game={game} />
  </Suspense>
) : null}
```

   `CameraTuneTargets` is also imported by `EngineHost.tsx` for typing — if
   only used by the moved code, the import goes with it.

2. **EggHatcher's GLB warm.** Replace the static import (line 17) with a
   dynamic one at the call site (line 495). The call currently sits in a
   list of warm-up promises; replace `loadGlb(MODEL_URLS.character)` with:

```ts
import('~/engine/student-space/Game/View/assetLoader.ts').then((m) =>
  m.loadGlb(m.MODEL_URLS.character),
)
```

   Keep the surrounding error handling exactly as it is. Remove the
   now-unused static import; keep the type-only three import (line 3).

3. **WorldInteractions.** In `StudentSpaceHost.tsx`, replace the static
   import with:

```tsx
const WorldInteractions = lazy(() =>
  import('./student-space/world/WorldInteractions').then((m) => ({
    default: m.WorldInteractions,
  })),
)
```

   and wrap the single render site (line 48) in
   `<Suspense fallback={null}>`. `WorldInteractions.tsx` itself is not
   modified. Check first whether other files import `WorldInteractions`
   or its sibling exports (`grep -rn "from './student-space/world/WorldInteractions'\|world/WorldInteractions" src/`);
   if EngineHost or the sheets import anything from that module statically,
   STOP — the lazy boundary won't remove the edge.

4. **Verification script.** Create `scripts/check-chunk-graph.mjs`:

```js
// Fails if any chunk containing three.js's WebGLRenderer is statically
// imported (directly) by the _app route chunk or the entry chunk.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist/client/assets'
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
const threeChunks = files.filter((f) =>
  readFileSync(join(dir, f), 'utf8').includes('WebGLRenderer'),
)
if (threeChunks.length === 0) throw new Error('no three chunk found — build layout changed?')
const offenders = []
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8')
  const staticImports = [...src.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1])
  for (const t of threeChunks) {
    if (f !== t && staticImports.includes(t) && /(_app|^main|^client|^index)/.test(f)) {
      offenders.push(`${f} statically imports ${t}`)
    }
  }
}
console.log('three-bearing chunks:', threeChunks.join(', '))
if (offenders.length) {
  console.error(offenders.join('\n'))
  process.exit(1)
}
console.log('ok: no entry/_app chunk statically imports three')
```

**Verify**: `pnpm build && node scripts/check-chunk-graph.mjs` → prints
`ok: no entry/_app chunk statically imports three`, exit 0. If it exits 1,
inspect which chunk still has the edge (`grep -l "WebGLRenderer"
dist/client/assets/*.js`, then grep for `from"./<that file>"` across
chunks) and trace the remaining static import in `src/` — if it is a file
not listed in this plan's scope, STOP and report the file instead of
editing it.

### Step 5.5 (amendment 1, added 2026-07-27 after the first execution round): cut the onboarding Vector3 edges

The first execution correctly STOPped on a fourth static three edge the plan
missed: `EngineHost → OnboardingFlow → {BloomCelebrate, TermlyReveal}`, each
of which does `import { Vector3 } from 'three'` (their line 2) solely to
build camera positions inside async onboarding beats that run long after the
engine has loaded three. In each file: delete the static import and add
`const { Vector3 } = await import('three')` inside the async flow
immediately before the first `new Vector3(...)` (module-cache hit at
runtime; comment why). Do NOT touch `OnboardingFlow.tsx` — its edge is
harmless once the two components stop importing three statically.

Also amend the Step 5.4 script: the offender regex must be
`/^(_app-|main-|client-|index-)/` — dot-suffixed route chunks
(`_app.history-…`) are lazily imported per-route and are not boot-path
offenders (the first round's `/(_app|…)/` pattern false-positived on them).

**Verify**: `pnpm build && node scripts/check-chunk-graph.mjs` → ok line,
exit 0. `grep -rn "from 'three'" src/components/student-space/onboarding/BloomCelebrate.tsx src/components/student-space/onboarding/TermlyReveal.tsx` → no matches.

### Step 6: Full gates

**Verify**: `pnpm check` → exit 0. `pnpm test` → all pass. `pnpm build` →
exit 0. `node scripts/check-chunk-graph.mjs` → ok.

## Test plan

- `test/components/student-space/EngineHost.test.tsx`: one new test —
  provided `authMenu` prop reaches `createGame` and the bridge's
  `loadAuthMenu` is never called (Step 1.4). The three existing auth-menu
  tests keep covering the fallback path.
- The chunk-graph script (Step 5.4) is the regression test for the bundle
  shape; it runs against the build output, not vitest.
- Existing suites (`Progression.e2e.test.tsx`, capture-stack, EngineHost)
  are the guard that lazy `WorldInteractions` and the extracted
  `CameraTuneBridge` didn't break composition — `pnpm test` green is the
  gate. If a test renders `StudentSpaceHost` and asserts synchronously on
  `WorldInteractions` output, add `await` on a `findBy*` query rather than
  weakening the assertion.
- **Operator smoke (report, don't gate)**: `pnpm dev`, hard-reload `/` with
  the Network tab open — texture/GLB requests should start before the
  engine chunk finishes, and `createGame` should not wait on an
  `auth-menu` request.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0, including the new EngineHost prop test
- [ ] `pnpm build` exits 0 and `node scripts/check-chunk-graph.mjs` prints the ok line
- [ ] `grep -n "from 'three'" src/components/student-space/EngineHost.tsx` → no matches
- [ ] `grep -n "assetLoader" src/components/student-space/onboarding/EggHatcher.tsx` shows only the dynamic `import(` form
- [ ] `vercel.json` parses and contains the two new Cache-Control blocks
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- Step 5.3's grep shows other static importers of `WorldInteractions`'
  module.
- The chunk-graph script still fails after Steps 5.1–5.3 and the remaining
  static edge originates in a file outside this plan's scope.
- Any test failure that suggests the engine module evaluated during SSR
  (e.g. `window is not defined` from `enginePromise`) — the guard shape in
  Step 2 must be fixed, not the engine.
- `EggHatcher`'s GLB warm turns out to be load-bearing for the hatch
  ceremony's timing (a test asserts the model is ready synchronously).

## Maintenance notes

- Reviewer focus: Step 1's ref-capture of the `authMenu` prop (it must not
  retrigger the boot effect — the effect's dep array stays `[backend]`),
  and Step 5's Suspense fallbacks being `null` (no layout shift).
- The preload list (Step 3) must be kept in sync with
  `Island.js:_loadTextures` and `MODEL_URLS` — if a texture is renamed or
  a new boot model is added, update both. A drifted preload is harmless
  (wasted request) but silently stops helping.
- Cache headers are day-scoped because asset filenames aren't hashed. If
  assets ever move to hashed filenames (e.g. imported through Vite), switch
  to `immutable` and delete the vercel.json blocks.
- New finding from execution (unplanned, out of boot path): the
  `/history` route chunk statically imports the three-bearing chunk — i.e.
  opening History loads all of three.js even though the sheet renders no 3D.
  Lazily loaded, so it doesn't affect first paint; worth its own small
  finding if History-open latency ever matters.
- Deferred (with reasons, so they aren't re-audited):
  - **Terrain build cost** (513² bicubic sampling, ~biggest sync block) —
    resolution is a documented quality decision (plan 030); making the
    build async/worker-based is a larger engine change.
  - **Sky's dead render-target + sphere allocation** (`Sky.js:29–41`) —
    small win, but consumers may reach for `customRender.texture`; needs
    its own careful pass.
  - **PNG → WebP/KTX2 texture compression** (~6.2 MB → ~1–2 MB) — biggest
    network win available, but regenerating assets needs a visual QA pass
    the executor can't do; propose separately.
  - **Grass instance-buffer capacity** (7.3 MB allocated, ~5% used) —
    interacts with the grass-paint editor contract.
  - **Render-blocking Google Fonts stylesheet** (`__root.tsx:26–31`) and
    the **landing page paying the full world boot** for a login backdrop —
    product/design decisions, not pure perf fixes.
