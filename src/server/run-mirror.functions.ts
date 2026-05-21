import { createServerFn } from '@tanstack/react-start'
import { runMirrorInputSchema } from './function-schemas'

export const runMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => runMirrorInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { runMirrorHandler } = await import('./run-mirror.handler.server')
    return runMirrorHandler(data)
  })
