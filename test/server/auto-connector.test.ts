/**
 * U7 — Auto-Connector chain after `persistMirror`.
 *
 * Test-first per the plan's Execution note: a stub Connector + stub verifier
 * proves the staged-diff row shape (and the chain's failure modes) before
 * any real LLM call is wired. The real verifier is exercised in U6's tests;
 * here we only assert the chain's orchestration and persistence behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry, listVipsProposedDiffs } from '~/db/queries'
import { seed } from '~/db/seed'
import {
  AUTO_CONNECTOR_TIMEOUT_MS,
  runAutoConnectorAfterMirror,
} from '~/server/auto-connector.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
  vi.useRealTimers()
})

function seedMirror(): { id: number; transcript: string } {
  const row = insertMirrorEntry('demo', {
    transcript: 'i hated when teacher told us exactly what to do',
    validation: 'fine',
    inferred_meaning: 'something',
    story_reframe: 'one session',
    raw_output: {},
    context_type: 'school',
  })
  return { id: row.id, transcript: row.transcript }
}

function emptyDiff() {
  return {
    diffs: {
      values: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
      interests: {
        compiled_truth_rewrite: '',
        open_question: '',
        new_timeline_entries: [],
      },
      personality: {
        compiled_truth_rewrite: '',
        open_question: '',
        new_timeline_entries: [],
      },
      skills: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
    },
  }
}

describe('runAutoConnectorAfterMirror — happy path', () => {
  it('produces a staged vips_proposed_diffs row with admitted entries and ok status', async () => {
    const mirror = seedMirror()

    const runConnector = vi.fn().mockResolvedValue({
      diffs: {
        ...emptyDiff().diffs,
        values: {
          compiled_truth_rewrite: 'Practices self-direction in school settings.',
          open_question: 'Does the same pattern hold in collaborative settings?',
          new_timeline_entries: [
            {
              canonical_claim_id: 'values.self_direction',
              verbatim_quote: 'i hated when teacher told us exactly what to do',
              reflection_id: mirror.id,
              strength: 'medium' as const,
              parallax_tag: ['school' as const],
            },
          ],
        },
      },
    })

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('ok')
    expect(result.staged_diff).not.toBeNull()
    expect(result.staged_diff?.status).toBe('pending')
    expect(runConnector).toHaveBeenCalledOnce()

    const pending = listVipsProposedDiffs('demo', { status: 'pending' })
    expect(pending).toHaveLength(1)
    // Verifier annotations live on the payload — the admitted list is what
    // the U8 review surface renders. Quote matches the seeded transcript
    // verbatim, so the verifier admits it.
    const payload = pending[0]?.payload as { admitted?: unknown[] } | null
    expect(payload?.admitted).toHaveLength(1)
  })
})

describe('runAutoConnectorAfterMirror — R30 pending-queue rule', () => {
  it('skips the run and reports queued when a prior pending diff exists', async () => {
    const first = seedMirror()
    // Seed a prior pending diff manually (no chain invocation).
    const { insertVipsProposedDiff } = await import('~/db/queries')
    insertVipsProposedDiff('demo', {
      mirror_entry_id: first.id,
      payload: { admitted: [], downgraded: [], dropped: [], diffs: emptyDiff().diffs },
      verifier_result: { admitted: [], downgraded: [], dropped: [] },
    })

    const second = seedMirror()
    const runConnector = vi.fn()
    const result = await runAutoConnectorAfterMirror('demo', second.id, { runConnector })

    expect(result.status).toBe('queued')
    expect(result.staged_diff).toBeNull()
    expect(runConnector).not.toHaveBeenCalled()
  })
})

describe('runAutoConnectorAfterMirror — failure modes', () => {
  it('schema_reject: malformed Connector output → no staged diff row, mirror entry intact', async () => {
    const mirror = seedMirror()

    const runConnector = vi.fn().mockResolvedValue({
      // Missing every required dimension key.
      diffs: { values: { compiled_truth_rewrite: '' } },
    })

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('schema_reject')
    expect(result.staged_diff).toBeNull()
    expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(0)
  })

  it('schema_reject: Connector throws → no staged diff row, mirror entry intact (A11)', async () => {
    const mirror = seedMirror()

    const runConnector = vi.fn().mockRejectedValue(new Error('LLM transport error'))

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('schema_reject')
    expect(result.staged_diff).toBeNull()
    expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(0)
  })

  it('timeout: Connector hangs past the soft budget → status=timeout, mirror entry intact', async () => {
    const mirror = seedMirror()

    // Connector that never resolves on its own — we fake-advance time to
    // hit the auto-connector's race-against-timeout branch.
    const runConnector = vi.fn(() => new Promise(() => {}) as Promise<never>)

    vi.useFakeTimers()
    const inFlight = runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })
    await vi.advanceTimersByTimeAsync(AUTO_CONNECTOR_TIMEOUT_MS + 100)
    const result = await inFlight

    expect(result.status).toBe('timeout')
    expect(result.staged_diff).toBeNull()
    expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(0)
  })
})

describe('runAutoConnectorAfterMirror — verifier-drop entries', () => {
  it('a fabricated-quote entry is dropped, does not appear in admitted, but the staged row persists', async () => {
    const mirror = seedMirror()

    const runConnector = vi.fn().mockResolvedValue({
      diffs: {
        ...emptyDiff().diffs,
        values: {
          compiled_truth_rewrite: '',
          open_question: '',
          new_timeline_entries: [
            {
              canonical_claim_id: 'values.self_direction',
              // Not present in the transcript anywhere.
              verbatim_quote: 'completely fabricated quote about nothing',
              reflection_id: mirror.id,
              strength: 'medium' as const,
              parallax_tag: ['school' as const],
            },
          ],
        },
      },
    })

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('ok')
    expect(result.staged_diff?.status).toBe('pending')

    const payload = result.staged_diff?.payload as {
      admitted: unknown[]
      dropped: unknown[]
    } | null
    expect(payload?.admitted).toHaveLength(0)
    expect(payload?.dropped).toHaveLength(1)
  })
})
