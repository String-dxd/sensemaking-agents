import { createServerFn } from '@tanstack/react-start'
import { loadPendingReviewInputSchema } from './function-schemas'

export const loadPendingReview = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadPendingReviewInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadPendingReviewHandler } = await import('./load-pending-review.handler.server')
    return loadPendingReviewHandler(data)
  })
