import { z } from 'zod'
import { runSensemakingStreamed } from '~/agents/handoff-chain-streamed'
import type { RunSensemakingResult } from '~/agents/run-events'
import { requireCounselorContext } from '~/auth/identity'

export const runSensemakingInputSchema = z.object({})

export type RunSensemakingInput = z.output<typeof runSensemakingInputSchema>

/**
 * Manual sense-making trigger — replaces the deleted Trigger.dev cron path.
 * Runs the Connector → Cartographer chain in-process with SDK streaming
 * captured to a step-event log, returns the events plus persisted row IDs.
 *
 * v0.2 passthrough: U10 renamed the chain's Pathfinder role to Cartographer
 * but kept this handler as a thin passthrough so the library "Run sense-making"
 * button keeps working through the cutover. U11 replaces this file with
 * `run-cartographer.*` and removes the Connector-leg from this entry point.
 *
 * U6 consumes the events and animates them in the library view's
 * AgentRunVisualizer for the demo wow factor. Real timestamps are
 * preserved so the UI can replay events at their actual cadence (or with
 * a synthetic floor to avoid bursts faster than the eye can follow).
 */
export async function runSensemakingHandler(
  data: RunSensemakingInput,
): Promise<RunSensemakingResult> {
  runSensemakingInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return runSensemakingStreamed(studentId)
}
