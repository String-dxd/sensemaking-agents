import { schedules } from '@trigger.dev/sdk/v3'
import { z } from 'zod'

export const scheduleOnboardInputSchema = z.object({
  studentId: z.string().min(1),
  cron: z.string().min(5).default('0 3 * * *'),
})

export type ScheduleOnboardInput = z.output<typeof scheduleOnboardInputSchema>

export interface ScheduleOnboardResult {
  scheduleId: string
  externalId: string
  cron: string
}

/**
 * Imperative per-student schedule creation. Trigger.dev v3's
 * `schedules.create` upserts on `externalId`, so calling twice for the
 * same studentId is idempotent — no duplicate schedule rows are created.
 *
 * v0.1 default cadence is `'0 3 * * *'` (nightly 03:00 in the deploy
 * region). This is called as a side effect of the first reflection
 * persist; failures here log but do not block the live path.
 */
export async function scheduleOnboardHandler(
  data: ScheduleOnboardInput,
): Promise<ScheduleOnboardResult> {
  const parsed = scheduleOnboardInputSchema.parse(data)
  const result = await schedules.create({
    task: 'sense-make',
    cron: parsed.cron,
    externalId: parsed.studentId,
    deduplicationKey: `sense-make:${parsed.studentId}`,
  })
  return {
    scheduleId: result.id,
    externalId: result.externalId ?? parsed.studentId,
    cron: parsed.cron,
  }
}
