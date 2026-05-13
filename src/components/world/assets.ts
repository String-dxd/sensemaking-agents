export interface WorldAssetEntry {
  url: string
  source: string
  usage: 'approved-student-space-asset' | 'app-owned-procedural-visual'
}

export const WORLD_ASSETS = {
  trees: {
    oak: {
      url: '/world/trees/oakTreesVisual.glb',
      source: 'student-space-v1/public/trees/oakTreesVisual.glb',
      usage: 'approved-student-space-asset',
    },
    cherry: {
      url: '/world/trees/cherryTreesVisual.glb',
      source: 'student-space-v1/public/trees/cherryTreesVisual.glb',
      usage: 'approved-student-space-asset',
    },
  },
  textures: {
    foliageSdf: {
      url: '/world/trees/foliageSDF.png',
      source: 'student-space-v1/public/trees/foliageSDF.png',
      usage: 'approved-student-space-asset',
    },
  },
} as const satisfies {
  trees: Record<string, WorldAssetEntry>
  textures: Record<string, WorldAssetEntry>
}

export const APPROVED_STUDENT_SPACE_ASSET_URLS = [
  WORLD_ASSETS.trees.oak.url,
  WORLD_ASSETS.trees.cherry.url,
  WORLD_ASSETS.textures.foliageSdf.url,
] as const
