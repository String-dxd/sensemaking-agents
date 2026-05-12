import { z } from 'zod'
import { MirrorEntrySchema } from '~/agents/schemas'
import { VipsContextTypeSchema } from '~/agents/tools/schemas'
import type { VipsProposedDiffRow } from '~/db/queries'
import { insertMirrorEntry, type MirrorEntryRow } from '~/db/queries'
import { checkPayloadForDiagnosticLanguage } from '~/lib/safety'
import {
  type AutoConnectorDeps,
  type AutoConnectorStatus,
  runAutoConnectorAfterMirror,
} from '~/server/auto-connector.handler.server'

export const persistMirrorInputSchema = z.object({
  studentId: z.string().min(1),
  entry: MirrorEntrySchema,
  /** U7: closed VIPS parallax context chosen by the student at Stop time. */
  context_type: VipsContextTypeSchema,
  /** Raw, un-edited Mirror agent output preserved for the R20 ablation. */
  raw_output: z.unknown(),
  trace: z.unknown().optional(),
})

export type PersistMirrorInput = z.output<typeof persistMirrorInputSchema>

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
 * auto-connector result is best-effort and may be `queued`, `timeout`, or
 * `schema_reject` — none of those block persistence (A11).
 */
export interface PersistMirrorResult {
  mirror_entry: MirrorEntryRow
  auto_connector_status: AutoConnectorStatus
  staged_diff: VipsProposedDiffRow | null
  /** R30 — true iff a prior pending diff caused this run to be queued. */
  pending_queued: boolean
}

export interface PersistMirrorDeps {
  autoConnector?: AutoConnectorDeps
}

export async function persistMirrorHandler(
  data: PersistMirrorInput,
  deps: PersistMirrorDeps = {},
): Promise<PersistMirrorResult> {
  const parsed = persistMirrorInputSchema.parse(data)

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
  const mirrorEntry = await insertMirrorEntry(parsed.studentId, {
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

  // ── Auto-Connector chain (in-process, same round trip per plan Approach) ──
  const autoResult = await runAutoConnectorAfterMirror(
    parsed.studentId,
    mirrorEntry.id,
    deps.autoConnector,
  )

  return {
    mirror_entry: mirrorEntry,
    auto_connector_status: autoResult.status,
    staged_diff: autoResult.staged_diff,
    pending_queued: autoResult.status === 'queued',
  }
}
