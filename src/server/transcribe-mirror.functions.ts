import { createServerFn } from '@tanstack/react-start'
import {
  transcribeMirrorHandler,
  transcribeMirrorInputSchema,
} from './transcribe-mirror.handler.server'

export const transcribeMirror = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => transcribeMirrorInputSchema.parse(raw))
  .handler(({ data }) => transcribeMirrorHandler(data))
