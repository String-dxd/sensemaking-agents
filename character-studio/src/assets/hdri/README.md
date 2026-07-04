# HDRI environment maps

Plan 010 (lighting studio) downloaded and wired real IBL lighting here,
replacing the plan-001 hemisphere-only placeholder this README used to
describe. Four self-hosted, CC0 1k Poly Haven HDRIs — see `LICENSE.md` for
sources.

`registry.ts` maps `StudioLook.environment.hdriId` (e.g. `'studio_small_08'`)
to the file drei's `<Environment files="..." />` loads; `src/studio/viewport/
LightRig.tsx` is the only consumer. Adding a new HDRI: drop a `<slug>_1k.hdr`
file here (≤ 2 MB, verify it starts with `#?RADIANCE`), add its license row,
and register the id in `registry.ts`.
