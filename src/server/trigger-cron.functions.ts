import { createServerFn } from '@tanstack/react-start'
import { triggerCronHandler, triggerCronInputSchema } from './trigger-cron.handler.server'

export const triggerSenseMakeNow = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => triggerCronInputSchema.parse(raw))
  .handler(({ data }) => triggerCronHandler(data))
