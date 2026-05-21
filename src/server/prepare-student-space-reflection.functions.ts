import { createServerFn } from '@tanstack/react-start'
import { prepareStudentSpaceReflectionInputSchema } from './mirror-function-schemas'

export const prepareStudentSpaceReflection = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => prepareStudentSpaceReflectionInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { prepareStudentSpaceReflectionHandler } = await import(
      './prepare-student-space-reflection.handler.server'
    )
    return prepareStudentSpaceReflectionHandler(data)
  })
