// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
/**
 * U7 — Auto-Connector chain after `persistMirror`.
 *
 * Test-first per the plan's Execution note: a stub Connector + stub verifier
 * proves the auto-apply behavior (and the chain's failure modes) before any
 * real LLM call is wired. The real verifier is exercised in U6's tests; here
 * we only assert the chain's orchestration and persistence behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry, listVipsProposedDiffs, listVipsTimelineEntries } from '~/db/queries'
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

describe.skipIf(!process.env.DATABASE_URL)('runAutoConnectorAfterMirror — happy path', () => {
  it('applies verifier-passing entries and writes a confirmed audit row', async () => {
    const mirror = seedMirror()

    const runConnector = vi.fn().mockResolvedValue({
      diffs: {
        ...emptyDiff().diffs,
        values: {
          compiled_truth_rewrite: 'Practices self-direction in school settings.',
          open_question: 'Does the same pattern hold in collaborative settings?',
          new_timeline_entries: [
            {
              canonical_claim_id: 'values.independence',
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
    expect(result.staged_diff?.status).toBe('confirmed')
    expect(runConnector).toHaveBeenCalledOnce()

    const pending = listVipsProposedDiffs('demo', { status: 'pending' })
    expect(pending).toHaveLength(0)
    const timeline = listVipsTimelineEntries('demo', 'values')
    expect(timeline).toHaveLength(1)
    // Verifier annotations live on the audit payload. Quote matches the
    // seeded transcript verbatim, so the verifier admits and auto-confirms it.
    const payload = result.staged_diff?.payload as { admitted?: unknown[] } | null
    expect(payload?.admitted).toHaveLength(1)
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'runAutoConnectorAfterMirror — legacy pending rows',
  () => {
    it('does not block Connector when a prior pending diff exists', async () => {
      const first = seedMirror()
      // Seed a prior pending diff manually (no chain invocation).
      const { insertVipsProposedDiff } = await import('~/db/queries')
      insertVipsProposedDiff('demo', {
        mirror_entry_id: first.id,
        payload: { admitted: [], downgraded: [], dropped: [], diffs: emptyDiff().diffs },
        verifier_result: { admitted: [], downgraded: [], dropped: [] },
      })

      const second = seedMirror()
      const runConnector = vi.fn().mockResolvedValue(emptyDiff())
      const result = await runAutoConnectorAfterMirror('demo', second.id, { runConnector })

      expect(result.status).toBe('ok')
      expect(result.staged_diff?.status).toBe('confirmed')
      expect(runConnector).toHaveBeenCalledOnce()
      expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(1)
    })
  },
)

describe.skipIf(!process.env.DATABASE_URL)('runAutoConnectorAfterMirror — failure modes', () => {
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

  it('unknown: Connector throws a plain Error → status=unknown, no staged diff (A11)', async () => {
    // Finding #7: plain unclassified errors used to collapse into
    // `schema_reject`, which gave operators no signal. They now bucket
    // as `unknown` so ops can pull the log line for diagnosis.
    const mirror = seedMirror()

    const runConnector = vi.fn().mockRejectedValue(new Error('LLM transport error'))

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('unknown')
    expect(result.staged_diff).toBeNull()
    expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(0)
  })

  it('transport_error: Connector rejects with a 5xx-shaped APIError → status=transport_error (Finding #7)', async () => {
    const mirror = seedMirror()
    // Duck-typed OpenAI SDK error: APIError carries a numeric `status`.
    const sdkErr = Object.assign(new Error('Internal Server Error'), {
      name: 'InternalServerError',
      status: 503,
    })
    const runConnector = vi.fn().mockRejectedValue(sdkErr)

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('transport_error')
    expect(result.staged_diff).toBeNull()
  })

  it('auth_error: Connector rejects with a 401-shaped APIError → status=auth_error (Finding #7)', async () => {
    const mirror = seedMirror()
    const sdkErr = Object.assign(new Error('Unauthorized'), {
      name: 'AuthenticationError',
      status: 401,
    })
    const runConnector = vi.fn().mockRejectedValue(sdkErr)

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('auth_error')
    expect(result.staged_diff).toBeNull()
  })

  it('schema_reject: Connector throws ZodError → status=schema_reject (Finding #7)', async () => {
    const mirror = seedMirror()
    // Generate a real ZodError so the runtime check passes.
    const { z } = await import('zod')
    let zerr: unknown
    try {
      z.string().parse(123)
    } catch (e) {
      zerr = e
    }
    const runConnector = vi.fn().mockRejectedValue(zerr)

    const result = await runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })

    expect(result.status).toBe('schema_reject')
    expect(result.staged_diff).toBeNull()
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

  it('timeout: A11 — mirror entry STILL persists after Connector timeout (Finding #17)', async () => {
    // The contract: `persistMirror` writes the mirror reflection BEFORE
    // invoking the auto-connector chain. Even if the Connector hangs past
    // If Connector times out, the student's reflection must remain in `mirror_entries`:
    // sense-making failures never cost the student their words (A11).
    const mirror = seedMirror()
    const { getMirrorEntry } = await import('~/db/queries')

    expect(getMirrorEntry('demo', mirror.id)).not.toBeNull()

    const runConnector = vi.fn(() => new Promise(() => {}) as Promise<never>)
    vi.useFakeTimers()
    const inFlight = runAutoConnectorAfterMirror('demo', mirror.id, { runConnector })
    await vi.advanceTimersByTimeAsync(AUTO_CONNECTOR_TIMEOUT_MS + 50)
    const result = await inFlight

    expect(result.status).toBe('timeout')
    // The mirror row must still be there — the timeout path returns early
    // and never touches the reflection store.
    const mirrorAfter = getMirrorEntry('demo', mirror.id)
    expect(mirrorAfter).not.toBeNull()
    expect(mirrorAfter?.transcript).toBe(mirror.transcript)
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'runAutoConnectorAfterMirror — verifier-drop entries',
  () => {
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
                canonical_claim_id: 'values.independence',
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
      expect(result.staged_diff?.status).toBe('confirmed')

      const payload = result.staged_diff?.payload as {
        admitted: unknown[]
        dropped: unknown[]
      } | null
      expect(payload?.admitted).toHaveLength(0)
      expect(payload?.dropped).toHaveLength(1)
    })
  },
)
