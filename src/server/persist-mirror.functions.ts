import { createServerFn } from '@tanstack/react-start'
import { persistMirrorHandler, persistMirrorInputSchema } from './persist-mirror.handler.server'

export const persistMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => persistMirrorInputSchema.parse(raw))
  .handler(({ data }) => persistMirrorHandler(data))
