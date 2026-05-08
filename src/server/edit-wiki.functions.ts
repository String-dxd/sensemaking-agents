import { createServerFn } from '@tanstack/react-start'
import { editMirrorFieldHandler, editMirrorFieldInputSchema } from './edit-wiki.handler.server'

export const editMirrorField = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => editMirrorFieldInputSchema.parse(raw))
  .handler(({ data }) => editMirrorFieldHandler(data))
