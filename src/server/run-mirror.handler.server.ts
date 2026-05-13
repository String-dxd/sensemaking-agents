import { getManagedAgentBinding } from '~/agents/config'
import { getOrCreateMemoryStoreId, type MemoryStoreTransport } from '~/agents/memory'
import { runManagedAgent } from '~/agents/runner'
import { type MirrorOutputDraft, MirrorOutputSchema } from '~/agents/schemas'
import { requireCounselorContext } from '~/auth/identity'
import { withStudentLegacy } from '~/server/tenancy.server'
import { type RunMirrorInput, runMirrorInputSchema } from './function-schemas'

export class MirrorAgentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MirrorAgentError'
  }
}

export interface RunMirrorHandlerDeps {
  /** Override Mirror invocation. Default: dispatch via `runManagedAgent`. */
  runMirror?: (input: { studentId: string; transcript: string }) => Promise<MirrorOutputDraft>
  /** Override the Anthropic memory-store transport for session binding. */
  memoryTransport?: MemoryStoreTransport
}

const MIRROR_USER_PROMPT_PREFIX =
  'The student spoke this transcript while looking into a webcam mirror. They are no longer present. Reflect what was said back in three parts.\n\nTranscript:\n\n'

/**
 * Run the Mirror agent against a transcript and return the parsed
 * three-part output. Caller (the UI) is responsible for posting the
 * result through persistMirror, which is the only place writes happen.
 */
export async function runMirrorHandler(data: RunMirrorInput, deps: RunMirrorHandlerDeps = {}) {
  const parsed = runMirrorInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudentLegacy(studentId, async (sid) => {
    try {
      const out = await runMirrorOnTranscript(sid, parsed.transcript, deps)
      return { output: MirrorOutputSchema.parse(out) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new MirrorAgentError(`Mirror agent failed: ${msg}`, err)
    }
  })
}

/**
 * Dispatch a Mirror run via Anthropic Managed Agents. The test seam
 * `deps.runMirror` wins over the real call path.
 *
 * Memory provisioning failure is non-blocking — Mirror can run without
 * memory access; the session just won't see prior voice samples.
 */
async function runMirrorOnTranscript(
  studentId: string,
  transcript: string,
  deps: RunMirrorHandlerDeps,
): Promise<MirrorOutputDraft> {
  if (deps.runMirror !== undefined) {
    return deps.runMirror({ studentId, transcript })
  }
  const binding = getManagedAgentBinding('mirror')
  const memoryStoreId = await safelyResolveMemoryStoreId(studentId, deps.memoryTransport)
  const result = await runManagedAgent({
    agentId: binding.agentId,
    ...(binding.agentVersion !== undefined ? { agentVersion: binding.agentVersion } : {}),
    environmentId: binding.environmentId,
    prompt: `${MIRROR_USER_PROMPT_PREFIX}${transcript}`,
    outputSchema: MirrorOutputSchema,
    sessionTitle: `mirror:${studentId}`,
    ...(memoryStoreId !== null ? { memoryStoreId } : {}),
  })
  return result.output
}

async function safelyResolveMemoryStoreId(
  studentId: string,
  transport?: MemoryStoreTransport,
): Promise<string | null> {
  try {
    return await getOrCreateMemoryStoreId(studentId, transport)
  } catch (err) {
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn('[mirror] memory store resolve failed; running without binding', {
      studentId,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
    return null
  }
}
