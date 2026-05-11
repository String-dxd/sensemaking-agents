import { createServerFn } from '@tanstack/react-start'
import { forgetDiffHandler, forgetDiffInputSchema } from './forget-diff.handler.server'

export const forgetDiff = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => forgetDiffInputSchema.parse(raw))
  .handler(({ data }) => forgetDiffHandler(data))
