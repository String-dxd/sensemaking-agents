import { createServerFn } from '@tanstack/react-start'
import { confirmDiffHandler, confirmDiffInputSchema } from './confirm-diff.handler.server'

export const confirmDiff = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => confirmDiffInputSchema.parse(raw))
  .handler(({ data }) => confirmDiffHandler(data))
