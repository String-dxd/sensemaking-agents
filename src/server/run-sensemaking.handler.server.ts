import { z } from 'zod'
import { runSensemakingStreamed } from '~/agents/handoff-chain-streamed'
import type { RunSensemakingResult } from '~/agents/run-events'

export const runSensemakingInputSchema = z.object({
  studentId: z.string().min(1),
})

export type RunSensemakingInput = z.output<typeof runSensemakingInputSchema>

/**
 * Manual sense-making trigger — replaces the deleted Trigger.dev cron path.
 * Runs the Connector → Pathfinder chain in-process with SDK streaming
 * captured to a step-event log, returns the events plus persisted row IDs.
 *
 * U6 consumes the events and animates them in the wiki view's
 * AgentRunVisualizer for the demo wow factor. Real timestamps are
 * preserved so the UI can replay events at their actual cadence (or with
 * a synthetic floor to avoid bursts faster than the eye can follow).
 */
export async function runSensemakingHandler(
  data: RunSensemakingInput,
): Promise<RunSensemakingResult> {
  const parsed = runSensemakingInputSchema.parse(data)
  return runSensemakingStreamed(parsed.studentId)
}
