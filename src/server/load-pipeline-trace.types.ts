import type {
  CartographerOutputRow,
  MirrorReviewStatus,
  VipsContextType,
  VipsPageRow,
  VipsProposedDiffRow,
  VipsTimelineEntryRow,
} from '~/db/queries'

export interface PipelineMirrorRow {
  id: number
  created_at: string
  context_type: VipsContextType
  review_status: MirrorReviewStatus
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  diffs: VipsProposedDiffRow[]
  committed_timeline: VipsTimelineEntryRow[]
}

export interface PipelineTraceResult {
  activeStudentId: string
  mirrors: PipelineMirrorRow[]
  pages: VipsPageRow[]
  cartographer: CartographerOutputRow | null
  totals: {
    mirrors: number
    diffs: number
    committed_timeline: number
  }
}
