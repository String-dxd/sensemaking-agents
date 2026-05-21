import { createServerFn } from '@tanstack/react-start'
import { forgetDiffInputSchema } from './function-schemas'

export const forgetDiff = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => forgetDiffInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { forgetDiffHandler } = await import('./forget-diff.handler.server')
    return forgetDiffHandler(data)
  })
