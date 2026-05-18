# Student Space Engine — Upstream Tracking

This directory is a **vendored copy** of the Student Space engine. We do not
import from a sibling repo or a git submodule; the code is copied wholesale
into our tree so we have full local control over patches and build behavior.

## Source

- **Repo:** https://github.com/wondopamine/student-space
- **Path within repo:** `student-space-v1/sources/Game/` + `student-space-v1/sources/style.css`
- **Vendored at commit:** `cd30172db7de197e9fac6ef9516a797a219c03db` (2026-05-18)

## Public entry

`src/engine/student-space/Game/index.js` — exports `createGame`, `Game`,
`Persistence`, `localStorageAdapter`, `memoryAdapter`, `HOST_BODY_CLASSES`.
See `Game/index.js` JSDoc and the upstream `ENGINE.md` for the host contract.

## How to sync upstream changes

```bash
# Pull latest upstream
cd ~/Developer/student-space
git pull origin main
NEW_SHA=$(git rev-parse HEAD)

# Re-vendor
cd ~/Developer/sensemaking-agents
rsync -av --delete \
  ~/Developer/student-space/student-space-v1/sources/Game/ \
  src/engine/student-space/Game/
cp ~/Developer/student-space/student-space-v1/sources/style.css \
  src/engine/student-space/style.css

# Re-apply patches (see PATCHES.md)
# Update this file's "Vendored at commit" line to $NEW_SHA
```

After re-vendoring, run `pnpm test` and a manual smoke (open `/`) before
committing.

## Why vendored (not sibling-aliased or submodule)

Decision made 2026-05-18 (see `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`):

- Full local control over patches (DRACO self-host, future host-asset overrides).
- No tsconfig path indirection that would require all consumers to use the
  alias.
- Sync cadence is explicit and visible in git diffs.

## What's deliberately NOT vendored

- `student-space-v1/index.html` — that's their host page; we host via React.
- `student-space-v1/sources/index.js` — that's their vanilla `<script type="module">` host shim; we use `createGame` directly from React.
- `student-space-v1/public/` — only the asset files our engine fetches at runtime (`oakTreesVisual.glb`, `cherryTreesVisual.glb`, `foliageSDF.png`) live under our `public/trees/`.
- `student-space-v1/vite.config.js` — their build config; we use our own Vite config and just add the GLSL plugin.
- `student-space-v1/scripts/`, `docs/`, `DESIGN.md` — design docs and tooling not needed for the engine to run.

See upstream `ENGINE.md` for the published portability contract.
