import { task } from '@trigger.dev/sdk/v3'
import { z } from 'zod'
import { runSenseMakingForStudent } from '~/agents/handoff-chain'

export const senseMakePayloadSchema = z.object({
  studentId: z.string().min(1),
})

export type SenseMakePayload = z.output<typeof senseMakePayloadSchema>

/**
 * Per-student sense-making task. The cron schedule is created at student
 * onboarding time via `schedules.create({ task, cron, externalId })` —
 * see `src/server/schedule-onboard.handler.server.ts`. The task itself
 * is thin by design: it parses the payload, calls into the Handoff chain,
 * and returns the persisted row IDs for the run trace.
 */
export const senseMakeTask = task({
  id: 'sense-make',
  maxDuration: 600,
  run: async (rawPayload: unknown) => {
    const { studentId } = senseMakePayloadSchema.parse(rawPayload)
    const result = await runSenseMakingForStudent(studentId)
    return {
      studentId,
      connectorOutputId: result.connector.id,
      pathfinderOutputId: result.pathfinder?.id ?? null,
      partial: result.partial,
    }
  },
})
