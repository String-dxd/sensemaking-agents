/**
 * U7 — Auto-Connector chain after `persistMirror`.
 *
 * A stub Connector (injected through the handler's own `deps.runConnector`
 * seam) proves the auto-apply behavior and the chain's failure modes. The
 * **real** deterministic verifier runs — `~/agents/verifier` is deliberately
 * NOT mocked, because it is the hard gate before any Connector link is
 * persisted and testing the chain against the genuine gate is the point.
 *
 * `~/db/client` + `~/db/queries` are replaced by a small in-memory store, and
 * the two outbound-network surfaces the chain touches on its rejection path
 * (`~/agents/memory`, `~/agents/self-critique-eval`) are mocked so the suite
 * stays hermetic even on a machine whose `.env` carries managed-agent ids.
 * No database — see plans/059.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_CONNECTOR_TIMEOUT_MS,
  runAutoConnectorAfterMirror,
} from '~/server/auto-connector.handler.server'

// ── the fake store ───────────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  mirrors: new Map<number, Record<string, unknown>>(),
  diffs: [] as Record<string, unknown>[],
  timeline: [] as Record<string, unknown>[],
  pages: new Map<string, Record<string, unknown>>(),
  seq: 0,
  reset() {
    this.mirrors.clear()
    this.diffs.length = 0
    this.timeline.length = 0
    this.pages.clear()
    this.seq = 0
  },
  next() {
    this.seq += 1
    return this.seq
  },
}))

const withStudentMock = vi.hoisted(() => vi.fn())
const appendStudentMemoryMock = vi.hoisted(() => vi.fn())

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  getMirrorEntry: async (studentId: string, id: number) => {
    const row = store.mirrors.get(id)
    if (!row || row.student_id !== studentId) return null
    return { ...row }
  },
  listVipsPages: async (studentId: string) =>
    [...store.pages.values()].filter((p) => p.student_id === studentId).map((p) => ({ ...p })),
  listVipsTimelineEntries: async (studentId: string, dimension: string) =>
    store.timeline
      .filter((e) => e.student_id === studentId && e.dimension === dimension)
      .map((e) => ({ ...e })),
  insertVipsTimelineEntry: async (studentId: string, entry: Record<string, unknown>) => {
    const row = {
      id: store.next(),
      student_id: studentId,
      ...entry,
      forgotten_at: null,
      committed_at: '2026-05-19T08:00:00.000Z',
    }
    store.timeline.push(row)
    return { ...row }
  },
  upsertVipsPage: async (studentId: string, page: Record<string, unknown>) => {
    const row = {
      student_id: studentId,
      ...page,
      updated_at: '2026-05-19T08:00:00.000Z',
    }
    store.pages.set(`${studentId}::${page.dimension}`, row)
    return { ...row }
  },
  insertVipsProposedDiff: async (studentId: string, input: Record<string, unknown>) => {
    const row = {
      id: store.next(),
      student_id: studentId,
      status: 'pending',
      created_at: '2026-05-19T08:00:00.000Z',
      reviewed_at: null,
      ...input,
    }
    store.diffs.push(row)
    return { ...row }
  },
}))

// The rejected-diff memory append reaches Anthropic's memory-store API and
// `getDbForMemoryModule()`. Neither belongs in a unit test, and now that
// `test/setup.ts` loads `.env` (plan 059 step 1) a developer machine could
// otherwise make a real call.
vi.mock('~/agents/memory', () => ({
  appendStudentMemory: (...args: unknown[]) => appendStudentMemoryMock(...args),
  appendIfNovel: (text: string, meta: unknown) => ({ kind: 'append-if-novel', text, meta }),
  getOrCreateMemoryStoreId: async () => 'memory-store-test',
  MEMORY_FILE_PATHS: { rejectedDiffPatterns: '/rejected-diff-patterns.md' },
  MemoryWriteError: class MemoryWriteError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'MemoryWriteError'
      this.code = code
    }
  },
}))

// Same reasoning: `runSelfCritiqueReviewBestEffort` short-circuits to null
// only when the managed-agent env ids are unset. Pin it so the chain never
// dispatches a real self_critique run.
vi.mock('~/agents/self-critique-eval', () => ({
  runSelfCritiqueReviewBestEffort: async () => null,
}))

// ── read helpers (direct store reads; the handler never calls these) ──────

function listVipsProposedDiffs(studentId: string, opts: { status?: string } = {}) {
  return store.diffs.filter(
    (d) => d.student_id === studentId && (opts.status === undefined || d.status === opts.status),
  )
}

function listVipsTimelineEntries(studentId: string, dimension: string) {
  return store.timeline.filter((e) => e.student_id === studentId && e.dimension === dimension)
}

function getMirrorEntry(studentId: string, id: number) {
  const row = store.mirrors.get(id)
  if (!row || row.student_id !== studentId) return null
  return { ...row } as { id: number; transcript: string }
}

// ── fixtures ─────────────────────────────────────────────────────────────

function seedMirror(): { id: number; transcript: string } {
  const id = store.next()
  const row = {
    id,
    student_id: 'demo',
    transcript: 'i hated when teacher told us exactly what to do',
    validation: 'fine',
    inferred_meaning: 'something',
    story_reframe: 'one session',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'unreviewed',
    tags: [],
    created_at: '2026-05-19T08:00:00.000Z',
  }
  store.mirrors.set(id, row)
  return { id, transcript: row.transcript }
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

const CTX = { db: {}, studentId: 'demo' }

beforeEach(() => {
  store.reset()
  withStudentMock.mockReset()
  appendStudentMemoryMock.mockReset()
  appendStudentMemoryMock.mockResolvedValue({ ok: true })
  withStudentMock.mockImplementation(async (_studentId: string, fn: (ctx: unknown) => unknown) =>
    fn(CTX),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runAutoConnectorAfterMirror — happy path', () => {
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
    // seeded transcript verbatim, so the real verifier admits it and the
    // chain auto-confirms.
    const payload = result.staged_diff?.payload as { admitted?: unknown[] } | null
    expect(payload?.admitted).toHaveLength(1)
    // The auto-applied link carried the agent's compiled-truth rewrite onto
    // the dimension's page.
    expect(store.pages.get('demo::values')?.compiled_truth).toBe(
      'Practices self-direction in school settings.',
    )
    // Everything ran inside the one tenancy envelope for this student.
    expect(withStudentMock).toHaveBeenCalledTimes(1)
    expect(withStudentMock.mock.calls[0]?.[0]).toBe('demo')
  })
})

describe('runAutoConnectorAfterMirror — legacy pending rows', () => {
  it('does not block Connector when a prior pending diff exists', async () => {
    const first = seedMirror()
    // Seed a prior pending diff manually (no chain invocation).
    store.diffs.push({
      id: store.next(),
      student_id: 'demo',
      mirror_entry_id: first.id,
      payload: { admitted: [], downgraded: [], dropped: [], diffs: emptyDiff().diffs },
      verifier_result: { admitted: [], downgraded: [], dropped: [] },
      status: 'pending',
      created_at: '2026-05-19T08:00:00.000Z',
      reviewed_at: null,
    })

    const second = seedMirror()
    const runConnector = vi.fn().mockResolvedValue(emptyDiff())
    const result = await runAutoConnectorAfterMirror('demo', second.id, { runConnector })

    expect(result.status).toBe('ok')
    expect(result.staged_diff?.status).toBe('confirmed')
    expect(runConnector).toHaveBeenCalledOnce()
    // The pre-existing pending row is untouched — the chain neither
    // resolves nor duplicates it.
    expect(listVipsProposedDiffs('demo', { status: 'pending' })).toHaveLength(1)
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
    expect(getMirrorEntry('demo', mirror.id)).not.toBeNull()
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
    // invoking the auto-connector chain. If Connector times out, the
    // student's reflection must remain in `mirror_entries`: sense-making
    // failures never cost the student their words (A11).
    const mirror = seedMirror()

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
    // The REAL verifier rejected the fabricated quote — this is the hard
    // gate doing its job, not a stub.
    expect(payload?.admitted).toHaveLength(0)
    expect(payload?.dropped).toHaveLength(1)
    // A dropped entry never becomes a timeline link.
    expect(listVipsTimelineEntries('demo', 'values')).toHaveLength(0)
  })
})
