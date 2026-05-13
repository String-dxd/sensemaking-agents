import { createServerFn } from '@tanstack/react-start'
import { transcribeMirrorInputSchema } from './function-schemas'

export const transcribeMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => transcribeMirrorInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { transcribeMirrorHandler } = await import('./transcribe-mirror.handler.server')
    return transcribeMirrorHandler(data)
  })
