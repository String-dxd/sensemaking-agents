import { createServerFn } from '@tanstack/react-start'
import {
  bulkUpdateMirrorReviewInputSchema,
  updateMirrorReviewInputSchema,
} from './function-schemas'

export const updateMirrorReview = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => updateMirrorReviewInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { updateMirrorReviewHandler } = await import('./update-mirror-review.handler.server')
    return updateMirrorReviewHandler(data)
  })

export const bulkUpdateMirrorReview = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => bulkUpdateMirrorReviewInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { bulkUpdateMirrorReviewHandler } = await import('./update-mirror-review.handler.server')
    return bulkUpdateMirrorReviewHandler(data)
  })
