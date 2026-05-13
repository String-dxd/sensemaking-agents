import { createServerFn } from '@tanstack/react-start'
import { updateReviewContextInputSchema } from './function-schemas'

export const updateReviewContext = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => updateReviewContextInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { updateReviewContextHandler } = await import('./update-review-context.handler.server')
    return updateReviewContextHandler(data)
  })
