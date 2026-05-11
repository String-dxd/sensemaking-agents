import { createServerFn } from '@tanstack/react-start'
import {
  loadPendingReviewHandler,
  loadPendingReviewInputSchema,
} from './load-pending-review.handler.server'

export const loadPendingReview = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadPendingReviewInputSchema.parse(raw))
  .handler(({ data }) => loadPendingReviewHandler(data))
