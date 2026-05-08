import { createServerFn } from '@tanstack/react-start'
import {
  mintMirrorSessionHandler,
  mintMirrorSessionInputSchema,
} from './mirror-session.handler.server'

export const mintMirrorSession = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => mintMirrorSessionInputSchema.parse(raw))
  .handler(({ data }) => mintMirrorSessionHandler(data))
