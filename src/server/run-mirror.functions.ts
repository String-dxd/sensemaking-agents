import { createServerFn } from '@tanstack/react-start'
import { runMirrorHandler, runMirrorInputSchema } from './run-mirror.handler.server'

export const runMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => runMirrorInputSchema.parse(raw))
  .handler(({ data }) => runMirrorHandler(data))
