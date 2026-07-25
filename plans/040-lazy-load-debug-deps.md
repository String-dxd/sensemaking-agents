# Plan 040: Keep `lil-gui` and `stats.js` out of the production engine chunk

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/engine/student-space/Game/Debug/ src/engine/student-space/Game/Game.js src/engine/student-space/Game/View/Renderer.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

The engine's debug overlay (`lil-gui` control panel + `stats.js` FPS meter)
can only ever activate in dev builds with a `#debug` hash — the gate is
`import.meta.env.DEV === true && location.hash === '#debug'`. Yet both
libraries are statically imported, so they ship inside the main engine chunk
that every production visitor downloads before the world's first interactive
frame. Verified at the planned-at commit: `dist/client/assets/index-*.js`
(the ~1.3 MB main chunk) contains both the `lil-gui` marker string and
stats.js's `showPanel`. Making the imports conditional removes dead bytes
from the critical path — and because the dev gate is compile-time-false in
production, the bundler can drop the debug UI modules from the prod build
entirely.

## Current state

Relevant files:

- `src/engine/student-space/Game/Debug/Debug.js` — the singleton gatekeeper;
  holds the static imports to remove (lines 1–2).
- `src/engine/student-space/Game/Debug/UI.js` — line 1:
  `import * as dat from 'lil-gui'`; its constructor runs `new dat.GUI(...)`.
- `src/engine/student-space/Game/Debug/Stats.js` — line 1:
  `import StatsJs from 'stats.js'`; constructor runs `new StatsJs()`.
- `src/engine/student-space/Game/Game.js` — line 90: `this.debug = new Debug()`
  inside the Game constructor, immediately before `new State(...)` and
  `new View()`; line 340 clears `Debug.instance` on dispose.
- `src/engine/student-space/Game/View/Renderer.js` — a consumer that reads
  `this.debug.stats` **synchronously in its constructor** (line 99) to call
  `setRenderPanel(this.context)`, plus per-frame guards at lines 129/140.

`Debug.js` in full (52 lines; the whole file is in scope):

```js
import Stats from './Stats.js'
import UI from './UI.js'

export default class Debug
{
    static instance

    static getInstance()
    {
        return Debug.instance
    }

    constructor()
    {
        if(Debug.instance)
            return Debug.instance

        Debug.instance = this

        this.active = false

        // `typeof` guard so the module is safe to import in non-browser
        // environments (SSR, Node CLI tools). Activation still requires
        // a real browser session.
        //
        // Production gate: the `#debug` hash is a dev-only escape hatch that
        // exposes the persistence import/export/clear actions + the engine's
        // tweakable knobs. If a production build ever fails to detect
        // `import.meta.env.DEV` (env-var miss, accidentally untranspiled in
        // a server bundle, etc.), default closed — the overlay should NOT
        // ship to end users. The strict `=== true` keeps a missing/undefined
        // env from opening it.
        const isDev = typeof import.meta !== 'undefined'
            && import.meta.env
            && import.meta.env.DEV === true
        if(isDev && typeof location !== 'undefined' && location.hash === '#debug')
        {
            this.activate()
        }
    }

    activate()
    {
        if(this.active)
            return

        this.active = true
        this.ui = new UI()
        this.stats = new Stats()
    }
}
```

**The constraint that shapes the fix**: every debug consumer in the engine
reads `debug.active` and then uses `debug.ui` **synchronously during its own
construction**, e.g.:

- `src/engine/student-space/Game/State/Onboarding.js:197-199` —
  `if(!debug || !debug.active) return` … `debug.ui.getFolder('state/onboarding')`
- same shape in `State/Weather.js:159-161`, `State/Persistence.js:136-138`,
  `State/DayCycle.js:227-230`, `State/ColdStart.js:110-112`,
  `View/Tree.js:345-346`, `View/Sky.js:190-215`, `View/Grass.js:141-142`
- `View/Renderer.js:99-101` — constructor:
  `if(this.debug.stats) { this.debug.stats.setRenderPanel(this.context) }`

All of these run inside `new Game(...)`'s synchronous constructor, right
after `new Debug()`. So a naive `async activate()` that sets
`this.active = true` before the imports resolve crashes dev `#debug` mode
(`debug.ui` is undefined), and one that sets `active` only after resolution
silently loses every folder registered during boot (all of them). The fix
must keep `activate()` fully synchronous.

**The approach**: conditional dynamic import with **top-level await** in
`Debug.js`. The same dev+hash gate moves to module scope; when it's off
(all production traffic, all tests, SSR), no await happens and no debug chunk
is fetched; when it's on, module evaluation waits for the two imports, and
`activate()` stays synchronous. The async-ness is absorbed by the existing
dynamic entry point: the engine is only ever loaded via
`await import('~/engine/student-space/Game')`
(`src/components/student-space/EngineHost.tsx:228`), and `Game` is only
constructed via `createGame` (`src/engine/student-space/Game/index.js:105`).
Because `import.meta.env.DEV` is compile-time `false` in `vite build`, the
whole gated branch is dead-code-eliminated and `lil-gui`/`stats.js` should
vanish from the production bundle output entirely.

Repo conventions that apply:

- The engine is deliberately **vanilla JS** (no TS) with Allman braces and
  4-space indentation — match `Debug.js`'s existing style exactly.
- Tests that touch engine modules mock `Debug.js` where needed — see
  `test/engine/FunctionalObjects.test.ts:36-42` and
  `test/engine/Game.setRenderActive.test.ts:28` (your change must not break
  these mocks; they replace the whole module, so they won't execute the new
  top-level code).
- Build output goes to `dist/` (`dist/client/assets/*.js` are the client
  chunks; `dist/server/` is SSR). There is no `.output/` directory in this
  repo despite what older README text implies.

## Commands you will need

| Purpose          | Command                                             | Expected on success |
|------------------|-----------------------------------------------------|---------------------|
| Install          | `pnpm install`                                      | exit 0              |
| Lint + typecheck | `pnpm check`                                        | exit 0 (18 pre-existing lint warnings OK; 0 errors) |
| Engine tests     | `pnpm vitest run test/engine/`                      | all pass            |
| Full tests       | `pnpm test`                                         | no NEW failures (10 pre-existing failures in 5 files exist at the planned-at commit; plans 033/034 fix them) |
| Prod build       | `pnpm build`                                        | exit 0, chunks in `dist/client/assets/` |
| Bundle check     | `grep -rl "lil-gui" dist/client/assets` and `grep -rl "showPanel" dist/client/assets` | see Step 3 |

## Scope

**In scope** (the only files you should modify):

- `src/engine/student-space/Game/Debug/Debug.js`

**Out of scope** (do NOT touch, even though they look related):

- `Debug/UI.js`, `Debug/Stats.js` — their own imports become lazy
  automatically once nothing imports them statically.
- Every consumer listed above (`Renderer.js`, `Onboarding.js`, …) — the whole
  point of the chosen approach is that they keep working unmodified.
- `vite.config.ts` — no manualChunks tricks; a manual chunk split would still
  download the bytes eagerly.
- `package.json` — `lil-gui` and `stats.js` stay declared dependencies (dev
  mode still uses them).

## Git workflow

- Branch: `advisor/040-lazy-load-debug-deps`
- Conventional commit, e.g.
  `perf(engine): load lil-gui/stats.js only when the #debug overlay is requested`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move the gate to module scope and make the imports conditional

Rewrite the top of `Debug.js` (preserve the existing "Production gate"
comment block — move it with the gate):

```js
// (keep/relocate the existing typeof-guard + production-gate comments here)
const debugRequested = typeof import.meta !== 'undefined'
    && import.meta.env
    && import.meta.env.DEV === true
    && typeof location !== 'undefined'
    && location.hash === '#debug'

let UI = null
let Stats = null

if(debugRequested)
{
    const [uiModule, statsModule] = await Promise.all([
        import('./UI.js'),
        import('./Stats.js'),
    ])
    UI = uiModule.default
    Stats = statsModule.default
}
```

Then in the class:

- The constructor's gate becomes `if(debugRequested) { this.activate() }`
  (delete the now-duplicated inline `isDev` computation).
- `activate()` is unchanged in shape but guards on module availability:

```js
    activate()
    {
        if(this.active)
            return

        if(!UI || !Stats)
            return

        this.active = true
        this.ui = new UI()
        this.stats = new Stats()
    }
```

  The `!UI || !Stats` guard keeps `activate()` safe if some future caller
  invokes it outside the module-scope gate. Today the Debug constructor is
  the only caller of **Debug's** `activate()` — confirm with
  `grep -rn "\.activate()" src/engine/student-space --include='*.js'`, which
  returns exactly TWO hits: `Debug.js` (the constructor call) and
  `Stats.js:14`. The `Stats.js:14` hit is the Stats class calling its OWN
  unrelated `activate()` method — it is NOT a caller of Debug's activate and
  is NOT a STOP condition.

Notes:

- `location.hash` is now read at module-evaluation time instead of
  construction time. These happen in the same boot moment (EngineHost's
  dynamic import immediately precedes `createGame`), so behavior is
  unchanged for real usage.
- Do not add TypeScript syntax — this file is vanilla JS.

**Verify**: `pnpm check` → exit 0. `pnpm vitest run test/engine/` → all pass
(the suites that mock `Debug.js` bypass the new top-level code; the ones that
evaluate it hit `location.hash === ''` and skip the await).

### Step 2: Confirm dev behavior is preserved (manual check)

Run `pnpm dev` (default port 3000; if something else squats it, Vite picks
the next port — use whatever it prints) and open
`http://localhost:3000/#debug`:

- the lil-gui panel (title "debug") and the stats meter appear;
- reload without `#debug`: neither appears, no console errors from
  `Debug.js`.

**Verify**: both observations hold. (This is the one judgment step; the rest
of the plan is machine-checked.)

### Step 3: Prod-bundle check

Run `pnpm build`, then:

```sh
grep -rl "lil-gui" dist/client/assets
grep -rl "showPanel" dist/client/assets
```

Expected: **no output from either** — the DEV-gated branch is dead code in a
production build, so the debug modules should be eliminated outright. That is
the pass condition, full stop. (Note: in the pre-change build, `lil-gui`/
`showPanel` already sit in a *different* chunk than the one carrying
`Game/index.js` — the 1.3 MB `index-*.js` vs the `one-instance-per-page`
chunk — so "it's in a chunk with a different filename" proves nothing.) If
either grep still matches ANY chunk after the change, do not rationalize it:
treat it as the fix not working, investigate why the import survived, and if
a second attempt still matches, STOP and report which chunk and its size.

**Verify**: as above. Also record the main chunk's size before/after
(`du -h dist/client/assets/index-*.js` equivalent — the hash in the filename
changes; take the largest `assets/*.js`) in your final report.

### Step 4: Full gates

**Verify**:
- `pnpm check` → exit 0.
- `pnpm test` → no failures beyond the 10 pre-existing ones (0 if plans
  033/034 have landed).

## Test plan

No new test file. Rationale: the load-time behavior (which chunk carries
which bytes) is a build artifact property, asserted directly by Step 3's grep
gate; the runtime behavior is already covered by the existing engine suites
that construct/mock `Debug` (`test/engine/FunctionalObjects.test.ts`,
`test/engine/Game.setRenderActive.test.ts`), which must keep passing
unmodified. If you find an existing test that asserts `Debug` activates
synchronously under `#debug` in happy-dom, run it and report — do not rewrite
it without a STOP.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git diff --name-only` shows only
      `src/engine/student-space/Game/Debug/Debug.js` (plus `plans/README.md`)
- [ ] `grep -n "^import" src/engine/student-space/Game/Debug/Debug.js` → no matches
      (no static imports remain in the file)
- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/engine/` → all pass, unmodified
- [ ] `pnpm build` exits 0 AND `grep -rl "lil-gui" dist/client/assets` returns
      nothing (or only a chunk that is not the `one-instance-per-page` chunk)
- [ ] Manual `#debug` check from Step 2 done and reported
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `Debug.js` no longer matches the excerpt above (drift).
- `pnpm build` fails on the top-level await (e.g. a target that forbids TLA,
  or a chunk-format error). Do not change `vite.config.ts` build targets to
  force it through — report; the fallback design (an exported async
  `Debug.preload()` awaited by `EngineHost` before `createGame`) needs an
  advisor decision because it widens the blast radius to React-side code.
- Any engine test fails and the fix would require editing the test or a
  consumer file (both out of scope).
- You find a caller of **Debug's** `activate()` other than the `Debug`
  constructor (grep in Step 1) — the module-scope gate would not cover it.
  (`Stats.js:14` calling Stats' own `activate()` is expected and does NOT
  trigger this condition.)

## Maintenance notes

- The dev gate now lives in TWO expressions (module scope `debugRequested`
  and the constructor's use of it) — they are the same constant; anyone
  adding a new activation path (e.g. a keyboard shortcut) must route through
  `debugRequested` or accept that `activate()` no-ops when the modules were
  never fetched.
- If the engine ever gains a second entry point that constructs `Game`
  without a dynamic `import()` boundary above it, the top-level await will
  surface there (the import becomes a promise); keep `createGame` behind a
  dynamic import.
- Reviewer should scrutinize: that the relocated comment block still explains
  the default-closed production gate, and that no consumer file was touched.
