import {
  appendIfNovel,
  appendStudentMemory as appendStudentMemoryDefault,
  MEMORY_FILE_PATHS,
  type MemoryStoreTransport,
  MemoryWriteError,
} from '~/agents/memory'
import { requireCounselorContext } from '~/auth/identity'
import { insertMirrorEntry, type MirrorEntryRow } from '~/db/queries'
import { checkPayloadForDiagnosticLanguage } from '~/lib/safety'
import { type PersistMirrorInput, persistMirrorInputSchema } from './mirror-function-schemas'

export class DiagnosticLanguageError extends Error {
  constructor(readonly matches: { text: string; pattern: string }[]) {
    super(
      `Mirror output rejected — diagnostic language detected: ${matches.map((m) => m.text).join('; ')}`,
    )
    this.name = 'DiagnosticLanguageError'
  }
}

/**
 * U7-reshaped response. The mirror entry is ALWAYS present on success; the
 * Connector is no longer invoked during persistence. Manual and scheduled
 * Connector runs process unconnected entries later.
 */
export interface PersistMirrorResult {
  mirror_entry: MirrorEntryRow
}

export interface PersistMirrorDeps {
  requireContext?: typeof requireCounselorContext
  insertMirrorEntry?: typeof insertMirrorEntry
  appendStudentMemory?: typeof appendStudentMemoryDefault
  /**
   * Override the Anthropic memory-store transport. Default lazily wraps the
   * live SDK. Tests pass an in-memory fake; production leaves unset.
   */
  memoryTransport?: MemoryStoreTransport
}

export async function persistMirrorHandler(
  data: PersistMirrorInput,
  deps: PersistMirrorDeps = {},
): Promise<PersistMirrorResult> {
  const parsed = persistMirrorInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()

  // Safety gate: reject diagnostic language at persistence time.
  const safety = checkPayloadForDiagnosticLanguage({
    validation: parsed.entry.validation,
    inferred_meaning: parsed.entry.inferred_meaning,
    story_reframe: parsed.entry.story_reframe,
  })
  if (!safety.ok) throw new DiagnosticLanguageError(safety.matches)

  // Single-call: insertMirrorEntry opens its own withStudent envelope so we
  // don't need to wrap. The auto-connector chain below opens a separate
  // transaction of its own.
  const insertMirrorEntryFn = deps.insertMirrorEntry ?? insertMirrorEntry
  const mirrorEntry = await insertMirrorEntryFn(studentId, {
    transcript: parsed.entry.transcript,
    validation: parsed.entry.validation,
    inferred_meaning: parsed.entry.inferred_meaning,
    story_reframe: parsed.entry.story_reframe,
    context_type: parsed.context_type,
    raw_output: parsed.raw_output ?? {
      validation: parsed.entry.validation,
      inferred_meaning: parsed.entry.inferred_meaning,
      story_reframe: parsed.entry.story_reframe,
    },
    trace: parsed.trace,
  })

  // ── Student-voice memory append (best-effort, non-blocking) ──
  // The Mirror output passed the diagnostic-language gate above, so the
  // inferred_meaning is voice-safe by construction. We append it as a
  // timestamped entry to `/student-voice.md` if the text isn't already
  // present verbatim in the file (cheap novelty guard against the agent
  // re-emitting the same observation across nearby reflections).
  //
  // Failure here must not block persistence — the user has already given
  // their reflection and the Mirror entry exists in Postgres. Log + move on.
  try {
    const appendStudentMemory = deps.appendStudentMemory ?? appendStudentMemoryDefault
    await appendStudentMemory(
      studentId,
      MEMORY_FILE_PATHS.studentVoice,
      appendIfNovel(parsed.entry.inferred_meaning, {
        source: `mirror#${mirrorEntry.id}`,
      }),
      deps.memoryTransport,
    )
  } catch (err) {
    if (err instanceof MemoryWriteError && err.code === 'DIAGNOSTIC_LANGUAGE') {
      // Treat diagnostic-language rejection as a hard signal worth surfacing
      // — Mirror's payload passed the gate, so a memory-write reject means
      // a phrasing only the Personality-rewrite check catches snuck in.
      // Fail the request so the user re-edits; persistence already happened
      // but the next reflection won't compound the issue.
      throw err
    }
    // eslint-disable-next-line no-console -- ops triage signal
    console.warn('[persist-mirror] student-voice memory append failed; continuing', {
      studentId,
      mirrorEntryId: mirrorEntry.id,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    })
  }

  return {
    mirror_entry: mirrorEntry,
  }
}
