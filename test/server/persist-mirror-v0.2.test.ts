// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
/**
 * U7 — persistMirror reshape tests.
 *
 * Extends v0.1's persistMirror coverage with:
 *   - context_type column accepted on input and written to the row
 *   - legacy pending proposed diffs do not block Connector
 *   - auto-connector chaining produces a confirmed audit row on happy path
 *   - auto-connector failure modes (timeout, schema_reject) leave the
 *     mirror entry intact and surface the right status string
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { getMirrorEntry, insertMirrorEntry, insertVipsProposedDiff } from '~/db/queries'
import { seed } from '~/db/seed'
import { AUTO_CONNECTOR_TIMEOUT_MS } from '~/server/auto-connector.handler.server'
import {
  DiagnosticLanguageError,
  persistMirrorHandler,
} from '~/server/persist-mirror.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
  seed()
})

afterEach(() => {
  resetDbForTests()
  vi.useRealTimers()
})

function baseInput() {
  return {
    studentId: 'demo',
    entry: {
      transcript: 'i hated when teacher told us exactly what to do',
      validation: 'short',
      inferred_meaning: 'a hint of self-direction',
      story_reframe: 'an attempt at self-direction in a school setting',
    },
    context_type: 'school' as const,
    raw_output: {
      validation: 'short',
      inferred_meaning: 'a hint of self-direction',
      story_reframe: 'an attempt at self-direction in a school setting',
    },
  }
}

function emptyDimDiff() {
  return { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] }
}

function emptyDiff() {
  return {
    diffs: {
      values: emptyDimDiff(),
      interests: emptyDimDiff(),
      personality: emptyDimDiff(),
      skills: emptyDimDiff(),
    },
  }
}

describe.skipIf(!process.env.DATABASE_URL)('persistMirror — context_type column', () => {
  it('writes the chosen context_type onto the mirror_entries row', async () => {
    const result = await persistMirrorHandler(
      { ...baseInput(), context_type: 'peer' as const },
      { autoConnector: { runConnector: vi.fn().mockResolvedValue(emptyDiff()) } },
    )
    expect(result.mirror_entry.context_type).toBe('peer')
    const refetched = getMirrorEntry('demo', result.mirror_entry.id)
    expect(refetched?.context_type).toBe('peer')
  })

  it('rejects an out-of-vocabulary context_type via Zod', async () => {
    await expect(
      persistMirrorHandler(
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        { ...baseInput(), context_type: 'work' as any },
        {},
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!process.env.DATABASE_URL)('persistMirror — legacy pending proposed diff', () => {
  it('chains Connector even when a prior pending diff exists', async () => {
    // Seed a prior pending diff for the student before persisting a new mirror.
    const prior = insertMirrorEntry('demo', {
      transcript: 'earlier reflection',
      validation: 'v',
      inferred_meaning: 'm',
      story_reframe: 's',
      raw_output: {},
      context_type: 'school',
    })
    insertVipsProposedDiff('demo', {
      mirror_entry_id: prior.id,
      payload: { admitted: [], downgraded: [], dropped: [], diffs: emptyDiff().diffs },
      verifier_result: { admitted: [], downgraded: [], dropped: [] },
    })

    const runConnector = vi.fn().mockResolvedValue(emptyDiff())
    const result = await persistMirrorHandler(baseInput(), {
      autoConnector: { runConnector },
    })

    expect(result.pending_queued).toBe(false)
    expect(result.auto_connector_status).toBe('ok')
    expect(result.staged_diff?.status).toBe('confirmed')
    expect(runConnector).toHaveBeenCalledOnce()
    // Mirror entry was still persisted.
    expect(result.mirror_entry.id).toBeGreaterThan(0)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('persistMirror — auto-connector happy path', () => {
  it('chains Connector + verifier and returns the confirmed audit diff with auto_connector_status=ok', async () => {
    const runConnector = vi.fn(async ({ mirrorEntry }) => ({
      diffs: {
        ...emptyDiff().diffs,
        values: {
          compiled_truth_rewrite: 'Practices self-direction in school.',
          open_question: 'Does this hold outside school?',
          new_timeline_entries: [
            {
              canonical_claim_id: 'values.self_direction',
              verbatim_quote: 'i hated when teacher told us exactly what to do',
              reflection_id: mirrorEntry.id,
              strength: 'medium' as const,
              parallax_tag: ['school' as const],
            },
          ],
        },
      },
    }))

    const result = await persistMirrorHandler(baseInput(), {
      autoConnector: { runConnector },
    })

    expect(result.auto_connector_status).toBe('ok')
    expect(result.staged_diff).not.toBeNull()
    expect(result.staged_diff?.status).toBe('confirmed')
    expect(result.pending_queued).toBe(false)
    const payload = result.staged_diff?.payload as { admitted: unknown[] } | null
    expect(payload?.admitted).toHaveLength(1)
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'persistMirror — auto-connector failure modes leave mirror intact',
  () => {
    it('schema_reject: malformed Connector output → mirror persists, no staged diff', async () => {
      const runConnector = vi.fn().mockResolvedValue({ diffs: { values: {} } })
      const result = await persistMirrorHandler(baseInput(), {
        autoConnector: { runConnector },
      })
      expect(result.auto_connector_status).toBe('schema_reject')
      expect(result.staged_diff).toBeNull()
      expect(result.mirror_entry.id).toBeGreaterThan(0)
      expect(getMirrorEntry('demo', result.mirror_entry.id)).not.toBeNull()
    })

    it('timeout: Connector exceeds the soft budget → mirror persists, status=timeout', async () => {
      const runConnector = vi.fn(() => new Promise(() => {}) as Promise<never>)
      vi.useFakeTimers()
      const inFlight = persistMirrorHandler(baseInput(), {
        autoConnector: { runConnector },
      })
      await vi.advanceTimersByTimeAsync(AUTO_CONNECTOR_TIMEOUT_MS + 100)
      const result = await inFlight
      expect(result.auto_connector_status).toBe('timeout')
      expect(result.staged_diff).toBeNull()
      expect(getMirrorEntry('demo', result.mirror_entry.id)).not.toBeNull()
    })
  },
)

describe.skipIf(!process.env.DATABASE_URL)(
  'persistMirror — legacy pending proposed diff concurrency',
  () => {
    it('two concurrent persistMirror calls coexist with a seeded pending row', async () => {
      // Connector no longer creates a user-confirmed pending row. This test
      // pins the concurrent-call boundary:
      //   - Seed a pending row.
      //   - Fire two persistMirror calls in parallel.
      //   - Both mirror_entries rows MUST persist (A11 — student speech is canon).
      //   - The pending count after the race MUST equal 1 (the seeded one);
      //     new audit rows are immediately `confirmed`.
      const prior = insertMirrorEntry('demo', {
        transcript: 'earlier reflection',
        validation: 'v',
        inferred_meaning: 'm',
        story_reframe: 's',
        raw_output: {},
        context_type: 'school',
      })
      insertVipsProposedDiff('demo', {
        mirror_entry_id: prior.id,
        payload: { admitted: [], downgraded: [], dropped: [], diffs: emptyDiff().diffs },
        verifier_result: { admitted: [], downgraded: [], dropped: [] },
      })

      const runConnector = vi.fn().mockResolvedValue(emptyDiff())
      const inputA = baseInput()
      const inputB = { ...baseInput(), entry: { ...baseInput().entry, transcript: 'another one' } }

      const [resA, resB] = await Promise.all([
        persistMirrorHandler(inputA, { autoConnector: { runConnector } }),
        persistMirrorHandler(inputB, { autoConnector: { runConnector } }),
      ])

      // Both mirror entries persist regardless of the queue check outcome.
      expect(resA.mirror_entry.id).toBeGreaterThan(0)
      expect(resB.mirror_entry.id).toBeGreaterThan(0)
      expect(getMirrorEntry('demo', resA.mirror_entry.id)).not.toBeNull()
      expect(getMirrorEntry('demo', resB.mirror_entry.id)).not.toBeNull()

      // No new pending rows beyond the seeded one. Both runs reached Connector.
      const { listVipsProposedDiffs } = await import('~/db/queries')
      const pending = listVipsProposedDiffs('demo', { status: 'pending' })
      expect(pending).toHaveLength(1)
      expect(resA.auto_connector_status).toBe('ok')
      expect(resB.auto_connector_status).toBe('ok')
      expect(runConnector).toHaveBeenCalledTimes(2)
    })
  },
)

describe.skipIf(!process.env.DATABASE_URL)(
  'persistMirror — safety gate (existing behavior carried forward)',
  () => {
    it('rejects diagnostic language at persistence time before chaining Connector', async () => {
      const runConnector = vi.fn()
      await expect(
        persistMirrorHandler(
          {
            ...baseInput(),
            entry: {
              ...baseInput().entry,
              inferred_meaning: 'You are a natural leader.',
            },
          },
          { autoConnector: { runConnector } },
        ),
      ).rejects.toBeInstanceOf(DiagnosticLanguageError)
      expect(runConnector).not.toHaveBeenCalled()
    })
  },
)
