# HDRI placeholder

This studio's lighting rig is meant to use a self-hosted, CC0 environment map
(a Poly Haven "studio small" HDRI is a good default) loaded via drei's
`<Environment files="/hdri/studio.hdr" />`.

That file is **not checked in yet** — plan 010 owns downloading and wiring
real lighting. Until then, `src/studio/viewport/Stage.tsx` falls back to a
hemisphere + key `directionalLight` rig (no environment map dependency), so
the viewport renders correctly without this asset.

To add the real HDRI later:

1. Download a CC0 "studio small" HDRI from https://polyhaven.com/hdris.
2. Save it as `character-studio/src/assets/hdri/studio.hdr` (or `.exr`).
3. Point `<Environment files="..." />` at it in `Stage.tsx`.
