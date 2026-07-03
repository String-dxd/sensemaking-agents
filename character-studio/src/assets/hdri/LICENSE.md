# HDRI licenses

All environment maps in this directory are **CC0** (public domain — no
attribution required) from [Poly Haven](https://polyhaven.com), downloaded at
1k resolution (sufficient for IBL ambient — plan 010 §"Current state").

| File | Source | License |
|---|---|---|
| `studio_small_08_1k.hdr` | https://polyhaven.com/a/studio_small_08 | CC0 |
| `studio_small_03_1k.hdr` | https://polyhaven.com/a/studio_small_03 | CC0 |
| `brown_photostudio_02_1k.hdr` | https://polyhaven.com/a/brown_photostudio_02 | CC0 |
| `golden_bay_1k.hdr` | https://polyhaven.com/a/golden_bay | CC0 |

Download URLs used (pattern: `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<slug>_1k.hdr`):

- https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr
- https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr
- https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr
- https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/golden_bay_1k.hdr

Each file was verified to start with the Radiance HDR magic bytes
(`#?RADIANCE`) and is under 2 MB. See `registry.ts` for how `StudioLook.
environment.hdriId` resolves to these files.
