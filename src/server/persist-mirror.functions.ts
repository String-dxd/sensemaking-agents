import { createServerFn } from '@tanstack/react-start'
import { persistMirrorInputSchema } from './mirror-function-schemas'

export const persistMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => persistMirrorInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { persistMirrorHandler } = await import('./persist-mirror.handler.server')
    return persistMirrorHandler(data)
  })
