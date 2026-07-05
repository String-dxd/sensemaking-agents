// Face-atlas registry (plan 006 step 3b) — atlasId → the four atlas texture
// URLs the face rig consumes. All sets share the immutable 4×4 cell contract
// (./atlas.ts); per-personality sets differ only in drawn style (the 관상
// grammar lives in scripts/generate-face-atlas.ts as FaceStyle blocks).

export interface AtlasUrlSet {
  eye: string
  pupil: string
  brow: string
  mouth: string
}

export const ATLAS_REGISTRY: Record<string, AtlasUrlSet> = {
  'face-v1': {
    eye: new URL('../../assets/face/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/mouth-atlas.png', import.meta.url).href,
  },
  'face-gentle': {
    eye: new URL('../../assets/face/gentle/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/gentle/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/gentle/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/gentle/mouth-atlas.png', import.meta.url).href,
  },
  'face-cheerful': {
    eye: new URL('../../assets/face/cheerful/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/cheerful/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/cheerful/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/cheerful/mouth-atlas.png', import.meta.url).href,
  },
  'face-proud': {
    eye: new URL('../../assets/face/proud/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/proud/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/proud/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/proud/mouth-atlas.png', import.meta.url).href,
  },
  'face-gruff': {
    eye: new URL('../../assets/face/gruff/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/gruff/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/gruff/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/gruff/mouth-atlas.png', import.meta.url).href,
  },
  'face-calm': {
    eye: new URL('../../assets/face/calm/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/calm/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/calm/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/calm/mouth-atlas.png', import.meta.url).href,
  },
  'face-mischievous': {
    eye: new URL('../../assets/face/mischievous/eye-atlas.png', import.meta.url).href,
    pupil: new URL('../../assets/face/mischievous/pupil-atlas.png', import.meta.url).href,
    brow: new URL('../../assets/face/mischievous/brow-atlas.png', import.meta.url).href,
    mouth: new URL('../../assets/face/mischievous/mouth-atlas.png', import.meta.url).href,
  },
}

/**
 * Interim aliases for personalities whose dedicated art is not yet authored
 * (plan 000 §2.1b let calm/mischievous alias grammar-nearest sets until the
 * aesthetic polish pass authored them). Kept as the resolution mechanism for
 * any future not-yet-authored personality; currently empty.
 */
export const ATLAS_ALIASES: Record<string, string> = {}

/** Resolve a spec atlasId to a registered atlas (unknown ids → face-v1). */
export function resolveAtlasUrls(atlasId: string): AtlasUrlSet {
  return ATLAS_REGISTRY[atlasId] ?? ATLAS_REGISTRY[ATLAS_ALIASES[atlasId] ?? 'face-v1'] ?? ATLAS_REGISTRY['face-v1']
}
