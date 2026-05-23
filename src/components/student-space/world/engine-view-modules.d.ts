// biome-ignore-all lint/suspicious/noExplicitAny: bridge declarations for legacy engine JS modules.

declare module '~/engine/student-space/Game/Data/flowerMeanings.js' {
  export function meaningForSpecies(species: string): any
}

declare module '~/engine/student-space/Game/Data/vipsTaxonomy.js' {
  export const VIPS_TAXONOMY: any[]
  export const VIPS_BY_FACET: Record<string, any[]>
  export const VIPS_BY_ID: Record<string, any>
  export const FACET_IDS: string[]
  export function claimLabel(id: string): string
  export function isCanonicalClaim(id: string): boolean
}

declare module '~/engine/student-space/Game/View/facets.js' {
  export const FACET_HEADERS: Record<string, any>
  export const FACET_THEMES: Record<string, any>
}

declare module '~/engine/student-space/Game/View/elementEvidence.js' {
  export function elementTitle(evidence: any, fallback: string): string
  export function evidenceCountText(evidence: any): string
  export function latestEvidenceLine(evidence: any, maxLength?: number): string
  export function metaphorLine(evidence: any): string
  export function resolveElementEvidence(target: any, profile?: any): any
  export function speciesIdOf(target: any): string
}

declare module '~/engine/student-space/Game/View/View.js' {
  const View: any
  export default View
}

declare module '~/engine/student-space/Game/State/State.js' {
  const State: any
  export default State
}

declare module '~/engine/student-space/Game/Game.js' {
  const Game: any
  export default Game
}

declare module '~/engine/student-space/Game/View/ThumbnailRenderer.js' {
  const ThumbnailRenderer: new () => any
  export default ThumbnailRenderer
}
