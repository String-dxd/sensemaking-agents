# Patches applied to the vendored engine

This file tracks every modification made to the vendored Student Space engine
relative to the upstream commit recorded in `UPSTREAM.md`. **Every upstream
sync must re-apply each patch in this list.** Without that step, the patches
are silently dropped.

If you upstream a patch (open a PR against `wondopamine/student-space`),
remove the patch from this file *after* the PR merges and you re-vendor at
or past the merge commit.

## Patch index

| # | File | Purpose | Decision date |
|---|---|---|---|
| 1 | `Game/View/Tree.js` | DRACO decoder path is host-overridable (default `/draco/`); never fetch from `gstatic.com`. | 2026-05-18 |

## Patch 1: DRACO decoder path is host-overridable

**Why.** Upstream `Game/View/Tree.js` hardcodes
`https://www.gstatic.com/draco/v1/decoders/` as the Draco decoder path. The
upstream `ENGINE.md` flags this as a portability constraint — Singapore MOE
school networks routinely whitelist-block third-party CDNs, and trees
silently fail to load when the CDN is unreachable. Our target deployment
includes those networks. We must self-host the decoder under `public/draco/`
and have `Tree.js` read from there.

**Decision.** Patch ours only; do not upstream (decision 2026-05-18). Re-apply
on every upstream sync.

**Patch shape (v1, minimal).** `Game/View/Tree.js` line 31 changed from
`dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')`
to `dracoLoader.setDecoderPath('/draco/')`. The host (sensemaking-agents)
ships the DRACO decoder under `public/draco/` (copied from
`three/examples/jsm/libs/draco/gltf/`).

This is intentionally hardcoded rather than threaded through `createGame`
config — keeping the patch surface minimal. If we need to vary the path
(multi-host deployment, CDN preference, etc.), extend later to:

- `Game/Game.js` accepts `assets` option; defaults `dracoDecoderPath` to `'/draco/'`.
- `Game/index.js` passes `opts.assets` through.
- `Game/View/Tree.js` reads from `Game.config.assets.dracoDecoderPath`.

The current hardcoded form is documented with an inline comment in
`Tree.js` so the patch is visible to whoever re-syncs.

## Why patches live in this file (not as `.patch` files)

For one or two patches a markdown index is more readable than a stack of
`.patch` files. If the patch count grows past ~5, switch to `.patch` files
under `src/engine/student-space/patches/` and a sync script that runs
`git apply` against the freshly-rsynced tree.
