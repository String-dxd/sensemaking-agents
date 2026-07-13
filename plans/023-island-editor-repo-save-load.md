# Plan 023: Island editor — save/load island state to the repo

> **Executor instructions**: step by step, verify each step, in-scope files
> only, STOP conditions binding, skip `plans/README.md` (reviewer maintains
> the index), same report format as before.
>
> **Drift check (run first)**:
> `git diff --stat <BASE>..HEAD -- island-editor/src/ui/FileBar.tsx island-editor/src/ui/icons.tsx island-editor/src/App.tsx island-editor/vite.config.ts island-editor/src/editor`
> where `<BASE>` is the commit named in your dispatch message. Must be empty
> (or only plan-022's two files if 022 landed first — those don't overlap);
> on any overlap mismatch, STOP.

## Status

- **Priority**: P1 (maintainer feature request)
- **Effort**: M
- **Risk**: LOW-MED (new dev-server endpoint + UI wiring; no data-model change)
- **Depends on**: plan 021 merged (`9faf64b`); independent of plan 022
  (different files) — may run before or after it.
- **Category**: direction (feature)
- **Planned at**: 2026-07-12 against `9faf64b`

## Why this matters

The maintainer wants the working island to survive beyond the browser:
"save the state of the current island … a save button … a reset button to
reset to the empty island … ability to load the edited island too, store the
saved state of the island in the repo."

What already exists (do NOT rebuild):

- **Autosave** to localStorage on every edit (`src/editor/persistence.ts`,
  `STORAGE_KEY 'island-editor:spec:v1'`) — session continuity.
- **Export/Import** buttons (`FileBar`) — JSON file download / file-picker
  upload via `downloadSpec`/`importSpecFromFile` (`src/editor/specIO.ts`).
- **Reset** button — already resets to `seedIsland()` (the pristine starter
  island: terraced silhouette, no grass paint, no objects — i.e. "the empty
  island"). Reset needs NO behavior change; it just stays in the bar.

What's missing: the browser cannot write into the repo. The dev server can —
so a tiny Vite dev middleware persists the spec to a git-tracked file:

- `POST /api/island/save` → validate + write `island-editor/saves/island.json`
- `GET  /api/island/load` → return that file (404 if never saved)

This is a dev-only studio (vite dev at :5180); the middleware pattern
(`configureServer`) is the standard Vite lane for exactly this.

## Current state (verified at `9faf64b`)

- `island-editor/vite.config.ts` — plain `defineConfig({ plugins: [react()],
  server: { port: 5180 }, test: { environment: 'node', include:
  ['test/**/*.test.ts'] } })`, imported from `vitest/config`.
- `src/ui/FileBar.tsx` — three `IconButton`s (`title="Export" tipSide="left"`,
  Import, Reset+`danger`), icons from `./icons`.
- `src/ui/icons.tsx` — `ExportIcon`/`ImportIcon`/`ResetIcon` are small
  stroke-based 24×24 SVG FCs; `IconButton` renders `aria-label={title}` and a
  tooltip; follow this style for new icons.
- `src/App.tsx:367-373` reset handler (keep as-is); `:381-396` the import
  apply path — THE pattern Load must reuse:

```ts
        specRef.current = await importSpecFromFile(file)
        setGridTick((t) => t + 1)
        stack.clear() // never let undo resurrect pre-import state
        bumpStack()
      } catch (err) {
        alert(`Could not import island: ${err instanceof Error ? err.message : String(err)}`)
```

- `src/editor/specIO.ts` — `serializeSpec(spec): string` (pretty JSON),
  `validateSpecObject(parsed): IslandSpec` (accepts v1–v5, migrates),
  `deserializeSpec(json): IslandSpec`. NO three imports. Reuse these; do not
  add another serializer.
- Gate: `pnpm check:island-editor` (repo root), green (198 tests at 9faf64b;
  199 if plan 022 landed first).

## Scope

**In scope**:

- `island-editor/server/islandSavePlugin.ts` (create — node-side Vite plugin)
- `island-editor/vite.config.ts` (register the plugin)
- `island-editor/src/editor/repoStore.ts` (create — browser client)
- `island-editor/src/ui/icons.tsx` (add `SaveIcon`, `LoadIcon`)
- `island-editor/src/ui/FileBar.tsx` (add Save/Load buttons + props)
- `island-editor/src/App.tsx` (two handlers + FileBar wiring only)
- `island-editor/saves/README.md` (create — explains the tracked save file)
- `island-editor/test/islandSavePlugin.test.ts`,
  `island-editor/test/repoStore.test.ts` (create)

**Out of scope**: `persistence.ts` (localStorage autosave), `specIO.ts`,
`seed.ts`, the reset behavior, gridCodec/spec versions, everything else.

## Git workflow

Branch `advisor/023-repo-save-load` off the current `feat/island-editor-v2`
tip named in your dispatch message. Commit:
`feat(island-editor): save/load island state to a repo-tracked file`.
Do NOT push.

## Steps

### Step 1: The dev-server plugin

Create `island-editor/server/islandSavePlugin.ts` (node context — `node:fs`,
`node:path` allowed; NO browser/react imports). Export:

```ts
export const SAVE_FILE = 'saves/island.json'
export function islandSavePlugin(root = process.cwd()): Plugin
```

(`Plugin` type from `'vite'`.) `configureServer(server)` registers one
middleware handling exactly two routes:

- `POST /api/island/save`: collect body chunks (cap at 2 MB — respond 413
  beyond), `JSON.parse` it and check `typeof parsed.version === 'number'`
  (respond 400 with a message on parse/shape failure — full validation
  already happened client-side), then `mkdirSync(dirname, { recursive:
  true })` + write the RAW received text to `<root>/<SAVE_FILE>`, respond
  204. Never derive the path from the request.
- `GET /api/island/load`: if the file exists, respond 200
  `application/json` with its contents; else 404.
- Anything else: `next()`.

Extract the handler logic as a testable function, e.g.
`export function handleIslandRoute(req, res, next, root)` used by
`configureServer` — the unit tests drive it with minimal fake req/res
objects (an EventEmitter-ish req with `method`/`url` and `data`/`end`
events; a res capturing `statusCode`/`end` payload).

**Verify**: `cd island-editor && npx tsc --noEmit` → exit 0.

### Step 2: Register in vite.config.ts

```ts
import { islandSavePlugin } from './server/islandSavePlugin'
...
  plugins: [react(), islandSavePlugin()],
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: The browser client

Create `src/editor/repoStore.ts` (NO three imports; follow specIO's header
style). Exports, with `fetch` injectable for tests
(`fetchImpl: typeof fetch = fetch`):

```ts
export async function saveSpecToRepo(spec: IslandSpec, fetchImpl?): Promise<void>
export async function loadSpecFromRepo(fetchImpl?): Promise<IslandSpec>
```

- `saveSpecToRepo`: `POST /api/island/save` with `serializeSpec(spec)` body,
  `Content-Type: application/json`; non-2xx → throw with the response text.
- `loadSpecFromRepo`: `GET /api/island/load`; 404 → throw
  `new Error('No island saved in the repo yet — press Save first.')`;
  other non-2xx → throw; 200 → `validateSpecObject(JSON.parse(text))`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Icons + FileBar

1. `icons.tsx`: add `SaveIcon` (bookmark/floppy silhouette) and `LoadIcon`
   (open-folder silhouette), same 24×24 stroke style as ExportIcon.
2. `FileBar.tsx`: props gain `onSave: () => void` and `onLoad: () => void`;
   render order Save, Load, Export, Import, Reset (Reset keeps `danger`).
   Titles exactly `"Save"` / `"Load"` (they become aria-labels).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: App wiring

In `App.tsx`, next to the existing reset/export/import handlers:

- `saveToRepo`: `saveSpecToRepo(specRef.current)` in a try/catch —
  `alert('Could not save island: …')` on failure (match the import alert
  pattern); silent on success.
- `loadFromRepo`: `loadSpecFromRepo()` then apply EXACTLY like the import
  path (`specRef.current = spec; setGridTick(t => t + 1); stack.clear();
  bumpStack()`); alert on failure with the thrown message.
- Pass both to `<FileBar onSave={…} onLoad={…} … />`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: saves/README.md

Two or three lines: `island.json` here is the repo-saved island written by
the editor's Save button through the dev-server middleware
(`server/islandSavePlugin.ts`); it is meant to be committed. Do NOT create
an initial `island.json` — Load reports "no saved island yet" until the
first Save.

### Step 7: Tests

- `test/islandSavePlugin.test.ts` (node): drive `handleIslandRoute` with a
  temp dir (`fs.mkdtempSync(os.tmpdir() + …)`) as root — save-then-load
  round-trip (POST body lands byte-identical in `saves/island.json`, GET
  returns it), GET-before-save → 404, invalid JSON POST → 400, non-API URL
  → `next()` called.
- `test/repoStore.test.ts` (node): stub `fetchImpl` — save POSTs the
  serialized spec to the right URL and resolves on 204 / throws on 500;
  load resolves a valid spec JSON (use `seedIsland()` serialized), throws
  the friendly message on 404, and throws on malformed body (validation).

**Verify**: `cd island-editor && pnpm test` → all pass.

### Step 8: Gate + manual smoke note

`pnpm check:island-editor` (repo root) → exit 0; report exact count. State
in your report that the live save→file→load loop needs the reviewer's
browser pass (headless executors don't run the dev server).

## Done criteria

- [ ] `pnpm check:island-editor` exits 0
- [ ] `grep -n "islandSavePlugin" island-editor/vite.config.ts` → import + use
- [ ] `grep -n "onSave\|onLoad" island-editor/src/ui/FileBar.tsx` → props + buttons
- [ ] `grep -n "saveSpecToRepo\|loadSpecFromRepo" island-editor/src/App.tsx` → both wired
- [ ] `island-editor/saves/README.md` exists; NO `saves/island.json` committed
- [ ] `git status` — no files outside the in-scope list

## STOP conditions

- Vite's `Plugin` type or middleware API doesn't match this shape on vite 7
  (check `server.middlewares.use` exists) — report, don't invent a different
  server.
- You find yourself modifying `specIO.ts`, `persistence.ts`, or reset
  behavior — out of scope.
- The save endpoint would need to write outside `island-editor/saves/` —
  report; the path is fixed by design.

## Maintenance notes

- The middleware exists ONLY under `vite dev` — a future static/preview
  deployment loses Save/Load silently; FileBar could probe the endpoint and
  disable the buttons if that ever matters.
- Multiple named save slots = query param on the same endpoint + a picker;
  the fixed-path design deliberately defers that.
- Reset already returns the pristine starter island (`seedIsland()`), which
  satisfies "reset to the empty island" — no change was made there.
