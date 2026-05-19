import { z } from 'zod'
import { VipsContextTypeSchema } from '~/agents/tools/schemas'

export const confirmDiffInputSchema = z.object({
  diffId: z.number().int().positive(),
  entryId: z.string().min(1),
})
export type ConfirmDiffInput = z.output<typeof confirmDiffInputSchema>

export const counsellorBriefInputSchema = z.object({})
export type CounsellorBriefInput = z.output<typeof counsellorBriefInputSchema>

export const forgetDiffInputSchema = z.object({
  diffId: z.number().int().positive(),
  entryId: z.string().min(1),
})
export type ForgetDiffInput = z.output<typeof forgetDiffInputSchema>

export const forgetTimelineEntryInputSchema = z.object({
  entryId: z.number().int().positive(),
})
export type ForgetTimelineEntryInput = z.output<typeof forgetTimelineEntryInputSchema>

export const loadPendingReviewInputSchema = z.object({})
export type LoadPendingReviewInput = z.output<typeof loadPendingReviewInputSchema>

export const updateReviewContextInputSchema = z.object({
  diffId: z.number().int().positive(),
  context_type: VipsContextTypeSchema,
})
export type UpdateReviewContextInput = z.output<typeof updateReviewContextInputSchema>

export const loadTrajectoryInputSchema = z.object({})
export type LoadTrajectoryInput = z.output<typeof loadTrajectoryInputSchema>

export const loadVipsPagesInputSchema = z.object({})
export type LoadVipsPagesInput = z.output<typeof loadVipsPagesInputSchema>

export const loadPipelineTraceInputSchema = z.object({})
export type LoadPipelineTraceInput = z.output<typeof loadPipelineTraceInputSchema>

export const loadWikiInputSchema = z.object({})
export type LoadWikiInput = z.output<typeof loadWikiInputSchema>

export const loadWikiEntryInputSchema = z.object({
  entryId: z.number().int().positive(),
})
export type LoadWikiEntryInput = z.output<typeof loadWikiEntryInputSchema>

const MirrorReviewActionSchema = z.enum(['confirmed', 'forgotten'])

export const updateMirrorReviewInputSchema = z.object({
  entryId: z.number().int().positive(),
  status: MirrorReviewActionSchema,
})
export type UpdateMirrorReviewInput = z.output<typeof updateMirrorReviewInputSchema>

export const bulkUpdateMirrorReviewInputSchema = z.object({
  status: MirrorReviewActionSchema,
})
export type BulkUpdateMirrorReviewInput = z.output<typeof bulkUpdateMirrorReviewInputSchema>

export const runCartographerInputSchema = z.object({})
export type RunCartographerInput = z.output<typeof runCartographerInputSchema>

export const runConnectorInputSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
})
export type RunConnectorInput = z.output<typeof runConnectorInputSchema>

export const runMirrorInputSchema = z.object({
  transcript: z.string().min(1),
})
export type RunMirrorInput = z.output<typeof runMirrorInputSchema>

export const searchPastMirrorsInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
})
export type SearchPastMirrorsServerInput = z.output<typeof searchPastMirrorsInputSchema>

export const transcribeMirrorInputSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
})
export type TranscribeMirrorInput = z.output<typeof transcribeMirrorInputSchema>

// Island snapshot — wraps the engine's Sprouts.serialize() output as a JSON
// string. The server never inspects the shape; it just persists it for U5's
// hybrid reconstruction. We cap the byte size as a basic abuse guard.
export const islandSnapshotInputSchema = z.object({
  payload_json: z.string().min(1).max(1_000_000),
})
export type IslandSnapshotInput = z.output<typeof islandSnapshotInputSchema>

// Year-bucket reads — accept only realistic 4-digit calendar years so a
// typo or stale URL doesn't trigger an out-of-range Postgres timestamp
// computation.
export const growthSummaryInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
})
export type GrowthSummaryInput = z.output<typeof growthSummaryInputSchema>

export const islandStateAtInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
})
export type IslandStateAtInput = z.output<typeof islandStateAtInputSchema>
