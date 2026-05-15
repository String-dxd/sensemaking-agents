export interface WorldAssetEntry {
  url: string
  source: string
  usage: 'approved-student-space-asset' | 'app-owned-procedural-visual'
}

export interface WorldRecipeEntry {
  source: string
  usage: 'adapted-student-space-recipe'
  adapts: string
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
  recipes: {
    foliageCluster: {
      source: 'student-space-v1/sources/Game/View/Tree.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'billboard foliage cluster, leaf material constants, GLB body texture sampling, wind shader, and sun-facing canopy shading',
    },
    island: {
      source: 'student-space-v1/sources/Game/View/Island.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'curved island geometry, plateau/sand/cliff materials, terrain data texture, TinySkies ocean caustics, sparkles, shore foam, and rain-coupled waves',
    },
    grass: {
      source:
        'student-space-v1/sources/Game/View/Grass.js; student-space-v1/sources/Game/View/Materials/shaders/grass/vertex.glsl',
      usage: 'adapted-student-space-recipe',
      adapts:
        'Bruno grass geometry, terrain texture binding, shader uniforms, source wind speed/amplitude defaults, and Fresnel material constants',
    },
    butterflies: {
      source: 'student-space-v1/sources/Game/View/Butterflies.js',
      usage: 'adapted-student-space-recipe',
      adapts: 'articulated butterfly body, lobed wings, and dusk firefly fold',
    },
    fruitBushes: {
      source: 'student-space-v1/sources/Game/View/Fruits.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'tree leaf-cloud shrub bodies, berry materials, berry clusters, and fruit-bush host strategy for skills',
    },
    residentBird: {
      source: 'student-space-v1/sources/Game/View/Kira.js',
      usage: 'adapted-student-space-recipe',
      adapts: 'calmer resident-bird silhouette and walking motion',
    },
    ambientEffects: {
      source:
        'student-space-v1/sources/Game/View/Aurora.js; student-space-v1/sources/Game/View/Particles.js',
      usage: 'adapted-student-space-recipe',
      adapts: 'twilight aurora ribbons and sparse ambient motes',
    },
    weatherScene: {
      source:
        'student-space-v1/sources/Game/State/DayCycle.js; student-space-v1/sources/style.css; student-space-v1/sources/Game/View/HourHud.js; student-space-v1/sources/Game/View/Rainbow.js; student-space-v1/sources/Game/View/Rain.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'exact day-cycle sky/light keys, HourHud styling, haze rays, rainbow arc, rain overlay, and source weather desaturation',
    },
    cameraControls: {
      source:
        'student-space-v1/sources/Game/View/Camera.js; student-space-v1/sources/Game/View/ZoomHud.js; student-space-v1/sources/Game/View/HoverProbe.js; student-space-v1/sources/Game/View/KiraNarrator.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'OrbitControls default framing, smootherstep reset, discrete zoom, keyboard shortcuts, hover ground ring, touch pick guard, camera focus/restore, and narrated hotspot handoff',
    },
    mailbox: {
      source:
        'student-space-v1/sources/Game/View/Mailbox.js; student-space-v1/sources/Game/View/LettersSheet.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'red mailbox + flag silhouette and backend seam to Cartographer-backed counsellor brief status',
    },
    moodPins: {
      source:
        'student-space-v1/sources/Game/State/MoodPins.js; student-space-v1/sources/Game/View/MoodHud.js; student-space-v1/sources/Game/View/MoodSheet.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'on-island mood markers driven by recent user-tagged Mirror captures persisted as mood tags',
    },
    stars: {
      source:
        'student-space-v1/sources/Game/View/Materials/StarsMaterial.js; student-space-v1/sources/Game/View/Sky.js',
      usage: 'adapted-student-space-recipe',
      adapts: 'twinkling night stars hemisphere with twilight fade-in',
    },
    ambientFireflies: {
      source: 'student-space-v1/sources/Game/View/Fireflies.js',
      usage: 'adapted-student-space-recipe',
      adapts: 'ambient nighttime firefly motes separate from the recent-entry butterflies',
    },
    excludedProductLayers: {
      source:
        'student-space-v1/sources/Game/View/Sound.js; student-space-v1/sources/Game/View/TrackPicker.js; student-space-v1/sources/Game/State/State.js; student-space-v1/sources/Game/View/View.js',
      usage: 'adapted-student-space-recipe',
      adapts:
        'documents excluded layers only: ask/reframe, Sound, TrackPicker, sheets, schema, and Student Space runtime singletons stay out of this app',
    },
  },
} as const satisfies {
  trees: Record<string, WorldAssetEntry>
  textures: Record<string, WorldAssetEntry>
  recipes: Record<string, WorldRecipeEntry>
}

export const APPROVED_STUDENT_SPACE_ASSET_URLS = [
  WORLD_ASSETS.trees.oak.url,
  WORLD_ASSETS.trees.cherry.url,
  WORLD_ASSETS.textures.foliageSdf.url,
] as const
