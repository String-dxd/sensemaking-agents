import { z } from 'zod'

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

export const loadTrajectoryInputSchema = z.object({})
export type LoadTrajectoryInput = z.output<typeof loadTrajectoryInputSchema>

export const loadVipsPagesInputSchema = z.object({})
export type LoadVipsPagesInput = z.output<typeof loadVipsPagesInputSchema>

export const loadWikiInputSchema = z.object({})
export type LoadWikiInput = z.output<typeof loadWikiInputSchema>

export const loadWikiEntryInputSchema = z.object({
  entryId: z.number().int().positive(),
})
export type LoadWikiEntryInput = z.output<typeof loadWikiEntryInputSchema>

export const runCartographerInputSchema = z.object({})
export type RunCartographerInput = z.output<typeof runCartographerInputSchema>

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
