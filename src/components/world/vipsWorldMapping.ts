import { VIPS_TAXONOMY, type VipsDimension } from '~/data/vips-taxonomy'

export type WorldEvidenceState = 'confirmed' | 'pending' | 'forgotten'
export type WorldEvidenceStrength = 'low' | 'medium' | 'high'

export interface VipsWorldTimelineEntry {
  id: number | string
  dimension: VipsDimension
  canonical_claim_id: string
  reflection_id?: number | string | null
  strength?: WorldEvidenceStrength
  committed_at?: string | null
  forgotten_at?: string | null
  parallax_tag?: string[]
  evidence_state?: WorldEvidenceState
  related_value_id?: string
}

export interface VipsWorldRecentEntry {
  id: number | string
  review_status?: WorldEvidenceState
  context_type?: string | null
  created_at?: string | null
}

export type VipsTimelineByDimension = Partial<Record<VipsDimension, VipsWorldTimelineEntry[]>>

export interface VipsWorldSceneInput {
  timelineByDimension?: VipsTimelineByDimension
  recentEntries?: VipsWorldRecentEntry[]
  recentLimit?: number
}

export interface VipsWorldSceneModel {
  terrain: TerrainDescriptor
  trees: ValueTreeDescriptor[]
  flowers: InterestFlowerDescriptor[]
  fruit: SkillFruitDescriptor[]
  butterflies: ButterflyDescriptor[]
  summary: {
    confirmedClaims: number
    pendingClaims: number
    omittedForgottenClaims: number
    warnings: string[]
  }
}

export interface TerrainDescriptor {
  openness: number
  shelter: number
  water: number
  softness: number
  mood: 'calm' | 'open' | 'sheltered'
}

export interface ValueTreeDescriptor {
  id: string
  claimId: string
  label: string
  species: ValueTreeSpecies
  color: string
  shape: string
  strength: WorldEvidenceStrength
  evidenceState: Exclude<WorldEvidenceState, 'forgotten'>
  evidenceCount: number
  placementSeed: number
  timelineEntryIds: Array<number | string>
}

export type ValueTreeSpecies =
  | 'mangrove'
  | 'oak'
  | 'cherry'
  | 'pine'
  | 'palm'
  | 'maple'
  | 'willow'
  | 'banyan'

export interface InterestFlowerDescriptor {
  id: string
  claimId: string
  label: string
  flower: 'daisy' | 'pansy' | 'rose' | 'lily' | 'tulip' | 'hyacinth'
  color: string
  strength: WorldEvidenceStrength
  evidenceState: Exclude<WorldEvidenceState, 'forgotten'>
  count: number
  placementSeed: number
  timelineEntryIds: Array<number | string>
}

export interface SkillFruitDescriptor {
  id: string
  claimId: string
  label: string
  fruitFamily: 'round-orchard-fruit'
  color: string
  strength: WorldEvidenceStrength
  evidenceState: Exclude<WorldEvidenceState, 'forgotten'>
  count: number
  ripeness: number
  valueTreeId: string | null
  placementSeed: number
  timelineEntryIds: Array<number | string>
}

export interface ButterflyDescriptor {
  id: string
  entryId: number | string
  touchedDimension: VipsDimension
  targetClaimId: string
  targetClaimLabel: string
  evidenceState: Exclude<WorldEvidenceState, 'forgotten'>
  color: string
  recencyWeight: number
  placementSeed: number
}

const STRENGTH_RANK: Record<WorldEvidenceStrength, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

const VALUE_TREES: Record<string, { species: ValueTreeSpecies; color: string; shape: string }> = {
  'values.contribution': { species: 'mangrove', color: '#6f8f5e', shape: 'rooted-branching' },
  'values.achievement': { species: 'oak', color: '#7fa45d', shape: 'broad-canopy' },
  'values.tradition': { species: 'cherry', color: '#f08fab', shape: 'blossom-canopy' },
  'values.security': { species: 'pine', color: '#496f4a', shape: 'stable-cone' },
  'values.independence': { species: 'palm', color: '#6ea96d', shape: 'open-fronds' },
  'values.relationships': { species: 'maple', color: '#d88b4a', shape: 'cluster-canopy' },
  'values.wellbeing': { species: 'willow', color: '#8fbf85', shape: 'soft-droop' },
  'values.learning': { species: 'banyan', color: '#7b9c63', shape: 'root-complex' },
}

const INTEREST_FLOWERS: Record<
  string,
  { flower: InterestFlowerDescriptor['flower']; color: string }
> = {
  'interests.realistic': { flower: 'daisy', color: '#f4d35e' },
  'interests.investigative': { flower: 'pansy', color: '#8e74c9' },
  'interests.artistic': { flower: 'rose', color: '#e56b6f' },
  'interests.social': { flower: 'lily', color: '#f6bd60' },
  'interests.enterprising': { flower: 'tulip', color: '#ef8354' },
  'interests.conventional': { flower: 'hyacinth', color: '#6bb7a8' },
}

const SKILL_COLORS: Record<string, string> = {
  'skills.interpersonal': '#f3a56b',
  'skills.analytical': '#6ca6c1',
  'skills.creative': '#cc7aa8',
  'skills.practical': '#d2a34a',
  'skills.leadership': '#d56a5c',
  'skills.communication': '#8fbf77',
}

const TAXONOMY_LABELS = new Map(VIPS_TAXONOMY.map((entry) => [entry.id, entry.label]))

export function buildVipsWorldSceneModel(input: VipsWorldSceneInput = {}): VipsWorldSceneModel {
  const recentLimit = input.recentLimit ?? 5
  const entries = flattenTimeline(input.timelineByDimension)
  const activeEntries = entries.filter((entry) => getEvidenceState(entry) !== 'forgotten')
  const confirmedEntries = activeEntries.filter((entry) => getEvidenceState(entry) === 'confirmed')
  const pendingEntries = activeEntries.filter((entry) => getEvidenceState(entry) === 'pending')
  const omittedForgottenClaims = entries.length - activeEntries.length

  const valueEntries = activeEntries.filter((entry) => entry.dimension === 'values')
  const treeGroups = groupByClaim(valueEntries)
  const trees = Object.entries(treeGroups)
    .filter(([claimId]) => claimId in VALUE_TREES)
    .map(([claimId, group]) => makeTreeDescriptor(claimId, group))
    .sort(compareBySeed)

  const flowerGroups = groupByClaim(
    activeEntries.filter((entry) => entry.dimension === 'interests'),
  )
  const flowers = Object.entries(flowerGroups)
    .filter(([claimId]) => claimId in INTEREST_FLOWERS)
    .map(([claimId, group]) => makeFlowerDescriptor(claimId, group))
    .sort(compareBySeed)

  const skillGroups = groupByClaim(activeEntries.filter((entry) => entry.dimension === 'skills'))
  const fruit = Object.entries(skillGroups)
    .filter(([claimId]) => claimId in SKILL_COLORS)
    .map(([claimId, group], index) => makeFruitDescriptor(claimId, group, trees, index))
    .sort(compareBySeed)

  return {
    terrain: makeTerrainDescriptor(activeEntries),
    trees,
    flowers,
    fruit,
    butterflies: makeButterflies(activeEntries, input.recentEntries, recentLimit),
    summary: {
      confirmedClaims: confirmedEntries.length,
      pendingClaims: pendingEntries.length,
      omittedForgottenClaims,
      warnings: makeWarnings({ activeEntries, trees, flowers, fruit }),
    },
  }
}

function flattenTimeline(
  timelineByDimension: VipsTimelineByDimension = {},
): VipsWorldTimelineEntry[] {
  return Object.entries(timelineByDimension).flatMap(([dimension, entries]) =>
    (entries ?? []).map((entry) => ({
      ...entry,
      dimension: entry.dimension ?? (dimension as VipsDimension),
    })),
  )
}

function groupByClaim(entries: VipsWorldTimelineEntry[]): Record<string, VipsWorldTimelineEntry[]> {
  return entries.reduce<Record<string, VipsWorldTimelineEntry[]>>((groups, entry) => {
    const claimId = entry.canonical_claim_id
    groups[claimId] ??= []
    groups[claimId].push(entry)
    return groups
  }, {})
}

function makeTreeDescriptor(claimId: string, group: VipsWorldTimelineEntry[]): ValueTreeDescriptor {
  const visual = VALUE_TREES[claimId]
  if (!visual) {
    throw new Error(`Unknown value tree visual for ${claimId}`)
  }
  return {
    id: `tree-${claimId}`,
    claimId,
    label: TAXONOMY_LABELS.get(claimId) ?? claimId,
    ...visual,
    strength: strongest(group),
    evidenceState: combinedState(group),
    evidenceCount: group.length,
    placementSeed: stableSeed(claimId),
    timelineEntryIds: group.map((entry) => entry.id),
  }
}

function makeFlowerDescriptor(
  claimId: string,
  group: VipsWorldTimelineEntry[],
): InterestFlowerDescriptor {
  const visual = INTEREST_FLOWERS[claimId]
  if (!visual) {
    throw new Error(`Unknown interest flower visual for ${claimId}`)
  }
  return {
    id: `flower-${claimId}`,
    claimId,
    label: TAXONOMY_LABELS.get(claimId) ?? claimId,
    ...visual,
    strength: strongest(group),
    evidenceState: combinedState(group),
    count: strengthCount(group),
    placementSeed: stableSeed(claimId),
    timelineEntryIds: group.map((entry) => entry.id),
  }
}

function makeFruitDescriptor(
  claimId: string,
  group: VipsWorldTimelineEntry[],
  trees: ValueTreeDescriptor[],
  index: number,
): SkillFruitDescriptor {
  const explicitValue = group.find((entry) => entry.related_value_id)?.related_value_id ?? null
  const tree =
    trees.find((candidate) => candidate.claimId === explicitValue) ??
    (trees.length > 0 ? trees[(stableSeed(claimId) + index) % trees.length] : null)
  return {
    id: `fruit-${claimId}`,
    claimId,
    label: TAXONOMY_LABELS.get(claimId) ?? claimId,
    fruitFamily: 'round-orchard-fruit',
    color: SKILL_COLORS[claimId] ?? '#d99a4e',
    strength: strongest(group),
    evidenceState: combinedState(group),
    count: strengthCount(group),
    ripeness: Math.min(1, 0.25 + STRENGTH_RANK[strongest(group)] * 0.22 + group.length * 0.08),
    valueTreeId: tree?.id ?? null,
    placementSeed: stableSeed(claimId),
    timelineEntryIds: group.map((entry) => entry.id),
  }
}

function makeTerrainDescriptor(entries: VipsWorldTimelineEntry[]): TerrainDescriptor {
  const personalityEntries = entries.filter((entry) => entry.dimension === 'personality')
  const extraversion = weightedCount(personalityEntries, 'personality.extraversion')
  const neuroticism = weightedCount(personalityEntries, 'personality.neuroticism')
  const openness = clamp01(0.48 + extraversion * 0.08 - neuroticism * 0.03)
  const shelter = clamp01(0.28 + neuroticism * 0.09)
  const water = clamp01(0.24 + neuroticism * 0.07)
  const softness = clamp01(0.45 + neuroticism * 0.05)
  return {
    openness,
    shelter,
    water,
    softness,
    mood: openness > 0.62 ? 'open' : shelter > 0.48 ? 'sheltered' : 'calm',
  }
}

function makeButterflies(
  entries: VipsWorldTimelineEntry[],
  recentEntries: VipsWorldRecentEntry[] | undefined,
  recentLimit: number,
): ButterflyDescriptor[] {
  if (recentEntries) {
    return [...recentEntries]
      .filter((entry) => getRecentEvidenceState(entry) !== 'forgotten')
      .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
      .slice(0, Math.max(0, recentLimit))
      .map((entry, index) => {
        const touched = entries.find((candidate) => candidate.reflection_id === entry.id)
        const touchedDimension = touched?.dimension ?? dimensionForRecentEntry(entry)
        const evidenceState = getRecentEvidenceState(entry) === 'pending' ? 'pending' : 'confirmed'
        return {
          id: `butterfly-${entry.id}`,
          entryId: entry.id,
          touchedDimension,
          targetClaimId: touched?.canonical_claim_id ?? `recent-entry-${entry.id}`,
          targetClaimLabel: touched
            ? (TAXONOMY_LABELS.get(touched.canonical_claim_id) ?? touched.canonical_claim_id)
            : 'Recorded thought',
          evidenceState,
          color: evidenceState === 'pending' ? '#c8bddb' : butterflyColor(touchedDimension),
          recencyWeight: 1 - index / Math.max(1, recentLimit),
          placementSeed: stableSeed(
            `${touchedDimension}-${touched?.canonical_claim_id ?? 'entry'}-${entry.id}`,
          ),
        }
      })
  }

  return [...entries]
    .sort((a, b) => timestamp(b.committed_at) - timestamp(a.committed_at))
    .slice(0, Math.max(0, recentLimit))
    .map((entry, index) => ({
      id: `butterfly-${entry.id}`,
      entryId: entry.id,
      touchedDimension: entry.dimension,
      targetClaimId: entry.canonical_claim_id,
      targetClaimLabel: TAXONOMY_LABELS.get(entry.canonical_claim_id) ?? entry.canonical_claim_id,
      evidenceState: getEvidenceState(entry) === 'pending' ? 'pending' : 'confirmed',
      color: getEvidenceState(entry) === 'pending' ? '#c8bddb' : butterflyColor(entry.dimension),
      recencyWeight: 1 - index / Math.max(1, recentLimit),
      placementSeed: stableSeed(`${entry.dimension}-${entry.canonical_claim_id}-${entry.id}`),
    }))
}

function strongest(entries: VipsWorldTimelineEntry[]): WorldEvidenceStrength {
  return entries.reduce<WorldEvidenceStrength>((best, entry) => {
    const strength = entry.strength ?? 'low'
    return STRENGTH_RANK[strength] > STRENGTH_RANK[best] ? strength : best
  }, 'low')
}

function combinedState(
  entries: VipsWorldTimelineEntry[],
): Exclude<WorldEvidenceState, 'forgotten'> {
  return entries.some((entry) => getEvidenceState(entry) === 'confirmed') ? 'confirmed' : 'pending'
}

function getEvidenceState(entry: VipsWorldTimelineEntry): WorldEvidenceState {
  if (entry.forgotten_at || entry.evidence_state === 'forgotten') return 'forgotten'
  return entry.evidence_state ?? 'confirmed'
}

function getRecentEvidenceState(entry: VipsWorldRecentEntry): WorldEvidenceState {
  return entry.review_status ?? 'confirmed'
}

function dimensionForRecentEntry(entry: VipsWorldRecentEntry): VipsDimension {
  if (entry.context_type === 'family' || entry.context_type === 'civic') return 'values'
  if (entry.context_type === 'peer' || entry.context_type === 'hobby') return 'interests'
  return 'skills'
}

function strengthCount(entries: VipsWorldTimelineEntry[]): number {
  return entries.reduce((sum, entry) => sum + STRENGTH_RANK[entry.strength ?? 'low'], 0)
}

function weightedCount(entries: VipsWorldTimelineEntry[], claimId: string): number {
  return entries
    .filter((entry) => entry.canonical_claim_id === claimId)
    .reduce((sum, entry) => sum + STRENGTH_RANK[entry.strength ?? 'low'], 0)
}

function makeWarnings({
  activeEntries,
  trees,
  flowers,
  fruit,
}: {
  activeEntries: VipsWorldTimelineEntry[]
  trees: ValueTreeDescriptor[]
  flowers: InterestFlowerDescriptor[]
  fruit: SkillFruitDescriptor[]
}): string[] {
  const rendered = trees.length + flowers.length + fruit.length
  if (activeEntries.length === 0) return ['No confirmed VIPS evidence yet; rendering calm island.']
  if (rendered === 0) return ['VIPS evidence exists but no visual taxonomy match was found.']
  return []
}

function compareBySeed<T extends { placementSeed: number }>(a: T, b: T): number {
  return a.placementSeed - b.placementSeed
}

function stableSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 9973
  }
  return hash
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function butterflyColor(dimension: VipsDimension): string {
  if (dimension === 'values') return '#f08a7e'
  if (dimension === 'interests') return '#b491d6'
  if (dimension === 'personality') return '#8fb7d9'
  return '#e6b85c'
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
