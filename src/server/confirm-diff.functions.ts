import { createServerFn } from '@tanstack/react-start'
import { confirmDiffInputSchema } from './function-schemas'

export const confirmDiff = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => confirmDiffInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { confirmDiffHandler } = await import('./confirm-diff.handler.server')
    return confirmDiffHandler(data)
  })
