import { tasks } from '@trigger.dev/sdk/v3'
import { z } from 'zod'

export const triggerCronInputSchema = z.object({
  studentId: z.string().min(1),
})

export type TriggerCronInput = z.output<typeof triggerCronInputSchema>

export interface TriggerCronResult {
  runId: string
  publicAccessToken?: string
}

/**
 * Dev-only ad-hoc trigger for the `sense-make` task. Powers the
 * "Run sense-making now" button on the wiki view. In production the
 * task fires from the per-student schedule, not from this endpoint.
 */
export async function triggerCronHandler(data: TriggerCronInput): Promise<TriggerCronResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('trigger-cron is dev-only; production runs from the schedule.')
  }
  const parsed = triggerCronInputSchema.parse(data)
  const handle = await tasks.trigger('sense-make', { studentId: parsed.studentId })
  return {
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
  }
}
