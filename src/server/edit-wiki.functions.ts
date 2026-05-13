import { createServerFn } from '@tanstack/react-start'
import { editMirrorFieldInputSchema } from './mirror-function-schemas'

export const editMirrorField = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => editMirrorFieldInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { editMirrorFieldHandler } = await import('./edit-wiki.handler.server')
    return editMirrorFieldHandler(data)
  })
