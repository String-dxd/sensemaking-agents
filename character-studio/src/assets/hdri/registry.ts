// HDRI registry (plan 010, step 1/2) — resolves `StudioLook.environment.
// hdriId` to a loadable URL, same `new URL(..., import.meta.url).href`
// convention as `../face/atlasRegistry.ts` / `../../core/skeleton/
// partRegistry.ts` (Vite-friendly asset resolution from `core`-adjacent code
// without a bundler-specific import). This file lives under `src/assets/`,
// not `src/core/`, so it is exempt from the no-React-import core boundary
// test, but it still contains no React — only `LightRig.tsx` imports it.

const hdriUrl = (file: string) => new URL(`./${file}`, import.meta.url).href

export interface HdriDef {
  id: string
  label: string
  url: string
}

/** Every id a `StudioLook.environment.hdriId` may legally reference. */
export const HDRI_REGISTRY: Record<string, HdriDef> = {
  studio_small_08: { id: 'studio_small_08', label: 'Studio (soft)', url: hdriUrl('studio_small_08_1k.hdr') },
  studio_small_03: { id: 'studio_small_03', label: 'Studio (moody)', url: hdriUrl('studio_small_03_1k.hdr') },
  brown_photostudio_02: { id: 'brown_photostudio_02', label: 'Photostudio (cool)', url: hdriUrl('brown_photostudio_02_1k.hdr') },
  golden_bay: { id: 'golden_bay', label: 'Golden bay', url: hdriUrl('golden_bay_1k.hdr') },
}

export const HDRI_IDS = Object.keys(HDRI_REGISTRY)

export function getHdri(id: string): HdriDef | null {
  return HDRI_REGISTRY[id] ?? null
}
