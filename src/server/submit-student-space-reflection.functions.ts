import { createServerFn } from '@tanstack/react-start'
import { submitStudentSpaceReflectionInputSchema } from './mirror-function-schemas'

export const submitStudentSpaceReflection = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => submitStudentSpaceReflectionInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { submitStudentSpaceReflectionHandler } = await import(
      './submit-student-space-reflection.handler.server'
    )
    return submitStudentSpaceReflectionHandler(data)
  })
