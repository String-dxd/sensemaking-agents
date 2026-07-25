/**
 * Connector on Managed Agents.
 *
 * Three surfaces under test:
 *
 *   1. `formatConnectorContext` — the pure formatter shipped in
 *      `src/agents/context/index.ts`. Validates the inlined VIPS + ECG
 *      taxonomy prefix, the per-request reflection / recent-FTS / pages
 *      sections, and the deterministic task footer.
 *   2. `buildConnectorContext` — pre-fetch orchestration. Validates the
 *      builder pulls the right new reflection, FTS-matching past mirrors,
 *      and VIPS pages, all through the caller's `TenantContext`.
 *   3. `runAutoConnectorAfterMirror` dispatch — invokes a mocked
 *      `runManagedAgent` with a binding pulled from `MANAGED_AGENT_CONNECTOR_*`.
 *      `deps.runConnector` wins as a test seam. ManagedAgentError variants
 *      map onto the AutoConnectorStatus enum.
 *
 * No database — the tenancy envelope (`~/db/client`), the query surface
 * (`~/db/queries`), the agent transport (`~/agents/runner`) and the memory
 * store (`~/agents/memory`) are module mocks, so every assertion below is
 * about *orchestration*: which query ran, under which student id, with which
 * ctx, how many times, and what the handler did with the result.
 *
 * `~/agents/verifier` is deliberately NOT mocked — the deterministic
 * verifier is the hard gate before any Connector link is persisted, so the
 * dispatch tests run their canned agent output through the real thing.
 * `~/agents/schemas` and `~/lib/safety` stay real for the same reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildConnectorContext,
  CONNECTOR_FTS_LIMIT,
  type ConnectorContextPayload,
  formatConnectorContext,
} from '~/agents/context'
import type { TenantContext } from '~/db/client'
import type {
  MirrorEntryRow,
  MirrorSearchResult,
  VipsPageRow,
  VipsTimelineEntryRow,
} from '~/db/queries'

const STUDENT = 'demo'

// ── Module mocks ─────────────────────────────────────────────────────────

const withStudentMock = vi.hoisted(() => vi.fn())
const getMirrorEntryMock = vi.hoisted(() => vi.fn())
const searchMirrorsMock = vi.hoisted(() => vi.fn())
const listVipsPagesMock = vi.hoisted(() => vi.fn())
const listVipsTimelineEntriesMock = vi.hoisted(() => vi.fn())
const insertVipsTimelineEntryMock = vi.hoisted(() => vi.fn())
const upsertVipsPageMock = vi.hoisted(() => vi.fn())
const insertVipsProposedDiffMock = vi.hoisted(() => vi.fn())
const getOrCreateMemoryStoreIdMock = vi.hoisted(() => vi.fn())
const appendStudentMemoryMock = vi.hoisted(() => vi.fn())

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  getMirrorEntry: (studentId: string, id: number, opts: unknown) =>
    getMirrorEntryMock(studentId, id, opts),
  searchMirrors: (studentId: string, query: string, opts: unknown) =>
    searchMirrorsMock(studentId, query, opts),
  listVipsPages: (studentId: string, opts: unknown) => listVipsPagesMock(studentId, opts),
  listVipsTimelineEntries: (studentId: string, dim: string, opts: unknown) =>
    listVipsTimelineEntriesMock(studentId, dim, opts),
  insertVipsTimelineEntry: (studentId: string, entry: unknown, opts: unknown) =>
    insertVipsTimelineEntryMock(studentId, entry, opts),
  upsertVipsPage: (studentId: string, page: unknown, opts: unknown) =>
    upsertVipsPageMock(studentId, page, opts),
  insertVipsProposedDiff: (studentId: string, input: unknown, opts: unknown) =>
    insertVipsProposedDiffMock(studentId, input, opts),
}))

// The runner module is mocked at the test boundary so the handler's call
// to `runManagedAgent` lands on a controllable stub. `ManagedAgentError`
// stays real so the error-mapping tests throw the genuine class.
vi.mock('~/agents/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/agents/runner')>()
  return {
    ...actual,
    runManagedAgent: vi.fn(),
  }
})

// Memory-store side effects are best-effort in the handler; stubbing the two
// network-facing helpers keeps `MEMORY_FILE_PATHS`, `appendIfNovel` and
// `MemoryWriteError` real.
vi.mock('~/agents/memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/agents/memory')>()
  return {
    ...actual,
    getOrCreateMemoryStoreId: (...args: unknown[]) => getOrCreateMemoryStoreIdMock(...args),
    appendStudentMemory: (...args: unknown[]) => appendStudentMemoryMock(...args),
  }
})

/** The stand-in transaction handed to callers by the mocked `withStudent`. */
const CTX = { db: {}, studentId: STUDENT } as unknown as TenantContext

// ── Fixture helpers ───────────────────────────────────────────────────────

function makeMirrorSearchResult(over: Partial<MirrorSearchResult> = {}): MirrorSearchResult {
  return {
    id: 100,
    story_reframe: 'A previous afternoon spent rebuilding a clock just to see how it worked.',
    tags: [],
    created_at: '2026-05-01T09:00:00.000Z',
    score: -2.5,
    ...over,
  }
}

function makePageRow(over: Partial<VipsPageRow> = {}): VipsPageRow {
  return {
    student_id: STUDENT,
    dimension: 'values',
    compiled_truth: '',
    open_question: '',
    updated_at: '2026-05-01T09:00:00.000Z',
    ...over,
  }
}

function makeTimelineRow(over: Partial<VipsTimelineEntryRow> = {}): VipsTimelineEntryRow {
  return {
    id: 1,
    student_id: STUDENT,
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: 'i wanted to figure it out myself',
    reflection_id: 7,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-01T09:00:00.000Z',
    ...over,
  }
}

function makeMirrorRow(over: Partial<MirrorEntryRow> = {}): MirrorEntryRow {
  return {
    id: 42,
    student_id: STUDENT,
    transcript: 'i hated when teacher told us exactly what to do',
    validation: 'fine',
    inferred_meaning: 'something',
    story_reframe: 'one session of pushing back',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-01T09:00:00.000Z',
    ...over,
  }
}

// ── 1. formatConnectorContext (pure) ─────────────────────────────────────

describe('Step 8 formatConnectorContext — inlined-taxonomy prefix', () => {
  const minimalPayload: ConnectorContextPayload = {
    mirror: {
      id: 42,
      transcript: 'i hated when teacher told us exactly what to do',
      story_reframe: 'one session of pushing back',
      context_type: 'school',
    },
    pastMirrors: [],
    pages: [],
    timeline: [],
  }

  it('puts the closed VIPS + ECG taxonomy blocks at the top so prompt-caching has a stable prefix', () => {
    const formatted = formatConnectorContext(minimalPayload)
    expect(formatted.startsWith('# Inlined VIPS taxonomy')).toBe(true)
    const vipsIdx = formatted.indexOf('# Inlined VIPS taxonomy')
    const ecgIdx = formatted.indexOf('# Inlined ECG taxonomy')
    const newReflectionIdx = formatted.indexOf('# New Mirror reflection')
    expect(vipsIdx).toBeGreaterThanOrEqual(0)
    expect(ecgIdx).toBeGreaterThan(vipsIdx)
    expect(newReflectionIdx).toBeGreaterThan(ecgIdx)
  })

  it('includes every VIPS dimension header so the agent always sees the closed schema', () => {
    const formatted = formatConnectorContext(minimalPayload)
    for (const dim of ['values', 'interests', 'personality', 'skills']) {
      expect(formatted).toContain(`## ${dim}`)
    }
  })

  it('renders the new reflection block with id + context_type + transcript + story_reframe', () => {
    const formatted = formatConnectorContext(minimalPayload)
    expect(formatted).toContain('# New Mirror reflection #42 (context_type=school)')
    expect(formatted).toContain('i hated when teacher told us exactly what to do')
    expect(formatted).toContain("Story reframe (Mirror's reflection):")
    expect(formatted).toContain('one session of pushing back')
  })

  it('renders "(none)" when there are no past mirrors so the agent does not assume an empty list means a tool failure', () => {
    const formatted = formatConnectorContext(minimalPayload)
    expect(formatted).toContain('# Recent reflections (FTS top 5 over past mirrors)')
    expect(formatted).toContain('(none)')
  })

  it('renders the recent-reflections block as bullet lines with id, score, created_at, and excerpt', () => {
    const longExcerpt = 'a'.repeat(300)
    const payload: ConnectorContextPayload = {
      ...minimalPayload,
      pastMirrors: [makeMirrorSearchResult({ id: 11, score: -1.234, story_reframe: longExcerpt })],
    }
    const formatted = formatConnectorContext(payload)
    expect(formatted).toContain('- [#11, score=-1.234, 2026-05-01T09:00:00.000Z]')
    // Long story_reframe values get truncated to 280 chars + ellipsis.
    expect(formatted).toMatch(/a{280}…/)
  })

  it('renders existing timeline entries grouped by dimension', () => {
    const payload: ConnectorContextPayload = {
      ...minimalPayload,
      pages: [
        makePageRow({
          dimension: 'values',
          compiled_truth: 'Practices self-direction.',
          open_question: '',
        }),
      ],
      timeline: [
        makeTimelineRow({ dimension: 'values', canonical_claim_id: 'values.independence' }),
      ],
    }
    const formatted = formatConnectorContext(payload)
    expect(formatted).toContain('## VALUES')
    expect(formatted).toContain('Compiled truth: Practices self-direction.')
    expect(formatted).toContain(
      'entry_id=1 source_reflection_id=7 canonical_claim_id=values.independence strength=medium parallax=["school"] reinforces_id=null quote="i wanted to figure it out myself"',
    )
  })

  it('renders null source reflection and reinforces markers explicitly', () => {
    const payload: ConnectorContextPayload = {
      ...minimalPayload,
      timeline: [
        makeTimelineRow({
          reflection_id: null,
          reinforces_id: 9,
        }),
      ],
      pages: [],
    }
    const formatted = formatConnectorContext(payload)
    expect(formatted).toContain('entry_id=1 source_reflection_id=null')
    expect(formatted).toContain('reinforces_id=9')
  })

  it('ends with the deterministic task footer that pins the output schema and verbatim-quote constraint', () => {
    const formatted = formatConnectorContext(minimalPayload)
    expect(
      formatted
        .trimEnd()
        .endsWith(
          'Produce a ConnectorDiffSchema-shaped proposal. Cite verbatim quotes from the transcript above only. Do NOT emit `reinforces_id`, `partial_match`, `aspirational`, or `parallax_cap_reason` — those are computed by the verifier post-hoc.',
        ),
    ).toBe(true)
  })
})

// ── 2. buildConnectorContext (pre-fetch orchestration) ───────────────────

describe('Step 8 buildConnectorContext — DB pre-fetch', () => {
  beforeEach(() => {
    getMirrorEntryMock.mockReset()
    searchMirrorsMock.mockReset()
    listVipsPagesMock.mockReset()
    listVipsTimelineEntriesMock.mockReset()
    searchMirrorsMock.mockResolvedValue([])
    listVipsPagesMock.mockResolvedValue([])
    listVipsTimelineEntriesMock.mockResolvedValue([])
  })

  it('throws a clear error if the mirror entry is not visible under the student', async () => {
    getMirrorEntryMock.mockResolvedValue(null)

    await expect(buildConnectorContext(CTX, 999_999)).rejects.toThrow(
      /buildConnectorContext: mirror entry 999999 is not visible/,
    )

    // The read that decided "not visible" was tenant-scoped and shared the
    // caller's transaction.
    expect(getMirrorEntryMock).toHaveBeenCalledWith(STUDENT, 999_999, { ctx: CTX })
    // Nothing further is pre-fetched once the mirror is missing.
    expect(searchMirrorsMock).not.toHaveBeenCalled()
    expect(listVipsPagesMock).not.toHaveBeenCalled()
  })

  it('caps recent reflections at CONNECTOR_FTS_LIMIT and excludes the new reflection itself', async () => {
    const fresh = makeMirrorRow({
      id: 500,
      transcript: 'i pulled apart the clock again last night',
      story_reframe: 'clockwork curiosity surfaces once more',
      context_type: 'hobby',
    })
    getMirrorEntryMock.mockResolvedValue(fresh)

    // The FTS surface returns more rows than the cap AND includes the fresh
    // reflection itself — the builder must filter then slice.
    searchMirrorsMock.mockResolvedValue([
      makeMirrorSearchResult({
        id: fresh.id,
        story_reframe: 'clockwork curiosity surfaces once more',
      }),
      ...Array.from({ length: CONNECTOR_FTS_LIMIT + 3 }, (_v, i) =>
        makeMirrorSearchResult({ id: i + 1, story_reframe: `clockwork curiosity ${i}` }),
      ),
    ])
    listVipsPagesMock.mockResolvedValue([
      makePageRow({
        dimension: 'interests',
        compiled_truth: 'Drawn to disassembly.',
        open_question: 'Where does this curiosity stop?',
      }),
    ])
    listVipsTimelineEntriesMock.mockImplementation(async (_sid: string, dim: string) =>
      dim === 'interests'
        ? [
            makeTimelineRow({
              id: 3,
              dimension: 'interests',
              canonical_claim_id: 'interests.investigative',
              verbatim_quote: 'pulled apart the clock',
              reflection_id: fresh.id,
              strength: 'low',
              parallax_tag: ['hobby'],
            }),
          ]
        : [],
    )

    const formatted = await buildConnectorContext(CTX, fresh.id)

    // The fresh reflection itself never appears in the recent-FTS block.
    expect(formatted).not.toContain(`[#${fresh.id}, score=`)

    // At most CONNECTOR_FTS_LIMIT past-mirror bullets land in the block.
    const bulletCount = formatted.match(/^- \[#\d+, score=/gm)?.length ?? 0
    expect(bulletCount).toBe(CONNECTOR_FTS_LIMIT)

    // The page + timeline entry are visible.
    expect(formatted).toContain('Compiled truth: Drawn to disassembly.')
    expect(formatted).toContain(
      'entry_id=3 source_reflection_id=500 canonical_claim_id=interests.investigative strength=low parallax=["hobby"] reinforces_id=null quote="pulled apart the clock"',
    )

    // Orchestration: FTS is keyed off the new reflection's story_reframe and
    // over-fetches by one so the self-match can be dropped without shrinking
    // the window.
    expect(searchMirrorsMock).toHaveBeenCalledTimes(1)
    expect(searchMirrorsMock).toHaveBeenCalledWith(
      STUDENT,
      'clockwork curiosity surfaces once more',
      {
        limit: CONNECTOR_FTS_LIMIT + 1,
        ctx: CTX,
      },
    )
    // Pages once, timeline once per VIPS dimension, all on the caller's ctx
    // and all excluding forgotten rows (R19).
    expect(listVipsPagesMock).toHaveBeenCalledWith(STUDENT, { ctx: CTX })
    expect(listVipsTimelineEntriesMock.mock.calls.map((c) => c[1])).toEqual([
      'values',
      'interests',
      'personality',
      'skills',
    ])
    for (const call of listVipsTimelineEntriesMock.mock.calls) {
      expect(call[0]).toBe(STUDENT)
      expect(call[2]).toEqual({ includeForgotten: false, ctx: CTX })
    }
  })
})

// ── 3. runAutoConnectorAfterMirror flag routing ──────────────────────────

describe('runAutoConnectorAfterMirror — managed runner dispatch', () => {
  const SAVED_ENV = { ...process.env }

  beforeEach(async () => {
    withStudentMock.mockReset()
    getMirrorEntryMock.mockReset()
    searchMirrorsMock.mockReset()
    listVipsPagesMock.mockReset()
    listVipsTimelineEntriesMock.mockReset()
    insertVipsTimelineEntryMock.mockReset()
    upsertVipsPageMock.mockReset()
    insertVipsProposedDiffMock.mockReset()
    getOrCreateMemoryStoreIdMock.mockReset()
    appendStudentMemoryMock.mockReset()

    withStudentMock.mockImplementation(async (_sid: string, fn: (ctx: unknown) => unknown) =>
      fn(CTX),
    )
    getMirrorEntryMock.mockResolvedValue(makeMirrorRow())
    searchMirrorsMock.mockResolvedValue([])
    listVipsPagesMock.mockResolvedValue([])
    listVipsTimelineEntriesMock.mockResolvedValue([])
    insertVipsTimelineEntryMock.mockImplementation(async (sid: string, entry: object) => ({
      id: 900,
      student_id: sid,
      ...entry,
    }))
    upsertVipsPageMock.mockImplementation(async (sid: string, page: object) => ({
      student_id: sid,
      ...page,
      updated_at: '2026-05-01T09:00:00.000Z',
    }))
    insertVipsProposedDiffMock.mockImplementation(async (sid: string, input: object) => ({
      id: 7,
      student_id: sid,
      ...input,
      created_at: '2026-05-01T09:00:00.000Z',
      reviewed_at: '2026-05-01T09:00:00.000Z',
    }))
    getOrCreateMemoryStoreIdMock.mockResolvedValue('memstore_test')
    appendStudentMemoryMock.mockResolvedValue(undefined)

    delete process.env.MANAGED_AGENT_CONNECTOR_ID
    delete process.env.MANAGED_AGENT_CONNECTOR_VERSION
    delete process.env.MANAGED_AGENT_ENV_ID
    // Keeps `runSelfCritiqueReviewBestEffort` a no-op so the only
    // `runManagedAgent` call in each test is the Connector dispatch.
    delete process.env.MANAGED_AGENT_SELF_CRITIQUE_ID
    const { runManagedAgent } = await import('~/agents/runner')
    vi.mocked(runManagedAgent).mockReset()
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in SAVED_ENV)) delete process.env[k]
    }
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v !== undefined) process.env[k] = v
    }
  })

  /** The mirror row the handler reads back for every dispatch test. */
  function seedFreshMirror(): { id: number } {
    const row = makeMirrorRow({ id: 42 })
    getMirrorEntryMock.mockResolvedValue(row)
    return { id: row.id }
  }

  function happyDraft(reflectionId: number) {
    return {
      diffs: {
        values: {
          compiled_truth_rewrite: 'Practices self-direction in school settings.',
          open_question: '',
          new_timeline_entries: [
            {
              canonical_claim_id: 'values.independence',
              verbatim_quote: 'i hated when teacher told us exactly what to do',
              reflection_id: reflectionId,
              strength: 'medium' as const,
              parallax_tag: ['school' as const],
            },
          ],
        },
        interests: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
        personality: {
          compiled_truth_rewrite: '',
          open_question: '',
          new_timeline_entries: [],
        },
        skills: { compiled_truth_rewrite: '', open_question: '', new_timeline_entries: [] },
      },
    }
  }

  it('dispatches to runManagedAgent, forwarding the buildConnectorContext prompt', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_CONNECTOR_VERSION = '3'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

    const mirror = seedFreshMirror()
    vi.mocked(runManagedAgent).mockResolvedValueOnce({
      output: happyDraft(mirror.id),
      sessionId: 'sesn_test',
      rawText: '',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    })

    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)

    expect(result.status).toBe('ok')
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    const call = vi.mocked(runManagedAgent).mock.calls[0]?.[0]
    expect(call?.agentId).toBe('agt_connector_abc')
    expect(call?.agentVersion).toBe(3)
    expect(call?.environmentId).toBe('env_x')
    expect(call?.sessionTitle).toBe(`connector:${STUDENT}`)
    expect(call?.memoryStoreId).toBe('memstore_test')
    expect(call?.prompt).toContain('# Inlined VIPS taxonomy')
    expect(call?.prompt).toContain(`# New Mirror reflection #${mirror.id} (context_type=school)`)

    // The whole chain ran inside ONE tenancy envelope, and every read/write
    // reused that transaction rather than opening a nested checkout.
    expect(withStudentMock).toHaveBeenCalledTimes(1)
    expect(withStudentMock.mock.calls[0]?.[0]).toBe(STUDENT)
    expect(getMirrorEntryMock).toHaveBeenCalledWith(STUDENT, mirror.id, { ctx: CTX })

    // The REAL verifier admitted the single entry (quote is verbatim in the
    // transcript, reflection_id matches, canonical id is in the taxonomy), so
    // it was applied to the timeline and the page compiled truth was written.
    expect(insertVipsTimelineEntryMock).toHaveBeenCalledTimes(1)
    expect(insertVipsTimelineEntryMock.mock.calls[0]?.[0]).toBe(STUDENT)
    expect(insertVipsTimelineEntryMock.mock.calls[0]?.[1]).toMatchObject({
      dimension: 'values',
      canonical_claim_id: 'values.independence',
      verbatim_quote: 'i hated when teacher told us exactly what to do',
      reflection_id: mirror.id,
      strength: 'medium',
      reinforces_id: null,
    })
    expect(insertVipsTimelineEntryMock.mock.calls[0]?.[2]).toEqual({ ctx: CTX })
    expect(upsertVipsPageMock).toHaveBeenCalledTimes(1)
    expect(upsertVipsPageMock.mock.calls[0]?.[1]).toMatchObject({
      dimension: 'values',
      compiled_truth: 'Practices self-direction in school settings.',
    })

    // The audit row is written last, already `confirmed`, carrying the
    // verifier partitions.
    expect(insertVipsProposedDiffMock).toHaveBeenCalledTimes(1)
    const audit = insertVipsProposedDiffMock.mock.calls[0]?.[1] as {
      mirror_entry_id: number
      status: string
      verifier_result: { admitted: unknown[]; downgraded: unknown[]; dropped: unknown[] }
    }
    expect(audit.mirror_entry_id).toBe(mirror.id)
    expect(audit.status).toBe('confirmed')
    expect(audit.verifier_result.admitted).toHaveLength(1)
    expect(audit.verifier_result.downgraded).toHaveLength(0)
    expect(audit.verifier_result.dropped).toHaveLength(0)
    // Nothing was dropped/downgraded, so no rejected-diff memory append.
    expect(appendStudentMemoryMock).not.toHaveBeenCalled()
  })

  it('deps.runConnector takes priority over the managed runner', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

    const mirror = seedFreshMirror()
    const pages = [makePageRow({ dimension: 'values', compiled_truth: 'Prior truth.' })]
    listVipsPagesMock.mockResolvedValue(pages)
    const stubConnector = vi.fn().mockResolvedValue(happyDraft(mirror.id))

    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id, {
      runConnector: stubConnector,
    })

    expect(result.status).toBe('ok')
    expect(stubConnector).toHaveBeenCalledOnce()
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()

    // The seam receives the pre-read context, not a promise of one — the
    // handler already resolved pages + timeline under the tenancy envelope.
    expect(stubConnector.mock.calls[0]?.[0]).toMatchObject({
      studentId: STUDENT,
      mirrorEntry: {
        id: mirror.id,
        transcript: 'i hated when teacher told us exactly what to do',
        context_type: 'school',
      },
      pages,
      timeline: [],
    })
    // No managed dispatch means no prompt build and no memory-store resolve.
    expect(searchMirrorsMock).not.toHaveBeenCalled()
    expect(getOrCreateMemoryStoreIdMock).not.toHaveBeenCalled()
    // The verifier + apply chain still ran on the stubbed draft.
    expect(insertVipsTimelineEntryMock).toHaveBeenCalledTimes(1)
    expect(insertVipsProposedDiffMock).toHaveBeenCalledTimes(1)
  })

  it('missing connector binding surfaces as `unknown` (Error has no recognized status field)', async () => {
    // Intentionally do NOT set MANAGED_AGENT_CONNECTOR_ID.

    const { runManagedAgent } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')
    const mirror = seedFreshMirror()
    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)

    expect(result.status).toBe('unknown')
    expect(result.staged_diff).toBeNull()
    // `getManagedAgentBinding` throws before the transport is reached, and
    // nothing is persisted on a failed run.
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()
    expect(insertVipsTimelineEntryMock).not.toHaveBeenCalled()
    expect(insertVipsProposedDiffMock).not.toHaveBeenCalled()
  })

  it('maps ManagedAgentError(PARSE_ERROR) to schema_reject', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent, ManagedAgentError } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

    vi.mocked(runManagedAgent).mockRejectedValueOnce(
      new ManagedAgentError('non-JSON output', 'PARSE_ERROR'),
    )
    const mirror = seedFreshMirror()
    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)
    expect(result.status).toBe('schema_reject')
    expect(result.staged_diff).toBeNull()
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    expect(insertVipsProposedDiffMock).not.toHaveBeenCalled()
  })

  it('maps ManagedAgentError(NO_API_KEY) to auth_error', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent, ManagedAgentError } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

    vi.mocked(runManagedAgent).mockRejectedValueOnce(
      new ManagedAgentError('ANTHROPIC_API_KEY missing', 'NO_API_KEY'),
    )
    const mirror = seedFreshMirror()
    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)
    expect(result.status).toBe('auth_error')
    expect(result.staged_diff).toBeNull()
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    expect(insertVipsProposedDiffMock).not.toHaveBeenCalled()
  })

  it('maps ManagedAgentError(STREAM_ERROR) to transport_error', async () => {
    process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent, ManagedAgentError } = await import('~/agents/runner')
    const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

    vi.mocked(runManagedAgent).mockRejectedValueOnce(
      new ManagedAgentError('session.error: 5xx', 'STREAM_ERROR'),
    )
    const mirror = seedFreshMirror()
    const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)
    expect(result.status).toBe('transport_error')
    expect(result.staged_diff).toBeNull()
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    expect(insertVipsProposedDiffMock).not.toHaveBeenCalled()
  })
})
