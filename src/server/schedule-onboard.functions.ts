import { createServerFn } from '@tanstack/react-start'
import {
  scheduleOnboardHandler,
  scheduleOnboardInputSchema,
} from './schedule-onboard.handler.server'

export const scheduleOnboard = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => scheduleOnboardInputSchema.parse(raw))
  .handler(({ data }) => scheduleOnboardHandler(data))
