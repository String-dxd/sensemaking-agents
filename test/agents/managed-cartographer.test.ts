/**
 * Cartographer on Managed Agents.
 *
 * Three surfaces under test:
 *
 *   1. `formatCartographerContext` — the pure formatter shipped in
 *      `src/agents/context/index.ts`. Validates the inlined VIPS + ECG
 *      taxonomy prefix, the trajectory framing, the pages + timeline
 *      section, the recent-FTS section, and the deterministic task footer.
 *   2. `buildCartographerContext` — pre-fetch orchestration. Validates the
 *      builder pulls pages, timeline, and the unioned-FTS-by-open-question
 *      corpus slice through the caller's `TenantContext`.
 *   3. `runCartographerHandler` dispatch — invokes a mocked
 *      `runManagedAgent` with a binding pulled from
 *      `MANAGED_AGENT_CARTOGRAPHER_*`. `deps.runCartographer` wins as a
 *      test seam. Schema parse + post-process validator still run.
 *
 * No database — the tenancy envelope (`~/db/client`), the query surface
 * (`~/db/queries`), the counselor context (`~/auth/identity`), the agent
 * transport (`~/agents/runner`) and the memory store (`~/agents/memory`) are
 * module mocks. Every assertion is about *orchestration*: which query ran,
 * under which student id, with which ctx, how many times, and what the
 * handler did with the result.
 *
 * `~/agents/schemas` (hard-fail parse) and the handler's post-process
 * structural validator stay real — they are the gate that decides whether a
 * Trajectory row is written at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCartographerContext,
  CARTOGRAPHER_FTS_LIMIT,
  type CartographerContextPayload,
  formatCartographerContext,
} from '~/agents/context'
import type { TenantContext } from '~/db/client'
import type { MirrorSearchResult, VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'

const STUDENT = 'demo'

// ── Module mocks ─────────────────────────────────────────────────────────

const requireCounselorContextMock = vi.hoisted(() => vi.fn())
const withStudentMock = vi.hoisted(() => vi.fn())
const searchMirrorsMock = vi.hoisted(() => vi.fn())
const listVipsPagesMock = vi.hoisted(() => vi.fn())
const listVipsTimelineEntriesMock = vi.hoisted(() => vi.fn())
const insertCartographerOutputMock = vi.hoisted(() => vi.fn())
const getOrCreateMemoryStoreIdMock = vi.hoisted(() => vi.fn())
const appendStudentMemoryMock = vi.hoisted(() => vi.fn())

vi.mock('~/auth/identity', () => ({
  requireCounselorContext: () => requireCounselorContextMock(),
}))

vi.mock('~/db/client', () => ({
  withStudent: (studentId: string, fn: (ctx: unknown) => unknown) => withStudentMock(studentId, fn),
}))

vi.mock('~/db/queries', () => ({
  searchMirrors: (studentId: string, query: string, opts: unknown) =>
    searchMirrorsMock(studentId, query, opts),
  listVipsPages: (studentId: string, opts: unknown) => listVipsPagesMock(studentId, opts),
  listVipsTimelineEntries: (studentId: string, dim: string, opts: unknown) =>
    listVipsTimelineEntriesMock(studentId, dim, opts),
  insertCartographerOutput: (studentId: string, input: unknown, opts: unknown) =>
    insertCartographerOutputMock(studentId, input, opts),
}))

vi.mock('~/agents/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/agents/runner')>()
  return {
    ...actual,
    runManagedAgent: vi.fn(),
  }
})

// Memory-store side effects are best-effort and fire post-persist; stubbing
// the two network-facing helpers keeps `MEMORY_FILE_PATHS`, `appendIfNovel`
// and `MemoryWriteError` real.
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

function makeMirrorSearchResult(over: Partial<MirrorSearchResult> = {}): MirrorSearchResult {
  return {
    id: 100,
    story_reframe: 'clockwork curiosity wiring',
    tags: [],
    created_at: '2026-05-01T09:00:00.000Z',
    score: -2.5,
    ...over,
  }
}

// ── 1. formatCartographerContext (pure) ──────────────────────────────────

describe('Step 9 formatCartographerContext — inlined-taxonomy prefix', () => {
  const minimalPayload: CartographerContextPayload = {
    studentId: STUDENT,
    pages: [],
    timeline: [],
    pastMirrors: [],
  }

  it('puts the closed VIPS + ECG taxonomy blocks at the top so prompt-caching has a stable prefix', () => {
    const formatted = formatCartographerContext(minimalPayload)
    expect(formatted.startsWith('# Inlined VIPS taxonomy')).toBe(true)
    const vipsIdx = formatted.indexOf('# Inlined VIPS taxonomy')
    const ecgIdx = formatted.indexOf('# Inlined ECG taxonomy')
    const trajectoryIdx = formatted.indexOf('# Trajectory pass for student')
    expect(vipsIdx).toBeGreaterThanOrEqual(0)
    expect(ecgIdx).toBeGreaterThan(vipsIdx)
    expect(trajectoryIdx).toBeGreaterThan(ecgIdx)
  })

  it('includes every VIPS dimension header so the agent always sees the closed schema', () => {
    const formatted = formatCartographerContext(minimalPayload)
    for (const dim of ['values', 'interests', 'personality', 'skills']) {
      expect(formatted).toContain(`## ${dim}`)
    }
  })

  it('renders the studentId in the trajectory framing header', () => {
    const formatted = formatCartographerContext(minimalPayload)
    expect(formatted).toContain(`# Trajectory pass for student ${STUDENT}`)
  })

  it('renders the recent-reflections block with the Cartographer-specific heading', () => {
    const formatted = formatCartographerContext(minimalPayload)
    expect(formatted).toContain(
      `# Recent reflections (FTS top ${CARTOGRAPHER_FTS_LIMIT} over past mirrors, queried by VIPS open questions)`,
    )
    expect(formatted).toContain('(none)')
  })

  it('renders pages + timeline entries grouped by dimension', () => {
    const formatted = formatCartographerContext({
      ...minimalPayload,
      pages: [
        makePageRow({
          dimension: 'values',
          compiled_truth: 'Practices self-direction.',
          open_question: 'When does self-direction tip into stubbornness?',
        }),
      ],
      timeline: [
        makeTimelineRow({ dimension: 'values', canonical_claim_id: 'values.independence' }),
      ],
    })
    expect(formatted).toContain('## VALUES')
    expect(formatted).toContain('Compiled truth: Practices self-direction.')
    expect(formatted).toContain('Open question: When does self-direction tip into stubbornness?')
    expect(formatted).toContain(
      'entry_id=1 source_reflection_id=7 canonical_claim_id=values.independence strength=medium parallax=["school"] reinforces_id=null quote="i wanted to figure it out myself"',
    )
  })

  it('renders explicit provenance for null source reflection and reinforcement pointers', () => {
    const formatted = formatCartographerContext({
      ...minimalPayload,
      timeline: [makeTimelineRow({ reflection_id: null, reinforces_id: 9 })],
    })
    expect(formatted).toContain('entry_id=1 source_reflection_id=null')
    expect(formatted).toContain('reinforces_id=9')
  })

  it('ends with the deterministic task footer that pins the output schema and cluster-only ECG rule', () => {
    const formatted = formatCartographerContext(minimalPayload)
    expect(formatted).toContain('# Task')
    expect(formatted).toContain('CartographerOutputSchema')
    expect(formatted).toContain('trait_combination[].claim_id')
    expect(formatted).toContain('trait_combination[].timeline_entry_id')
    expect(formatted).toContain('cluster.*')
    expect(formatted.trimEnd().endsWith('Return 2–5 pathways.')).toBe(true)
  })
})

// ── 2. buildCartographerContext (pre-fetch orchestration) ────────────────

describe('Step 9 buildCartographerContext — DB pre-fetch', () => {
  beforeEach(() => {
    searchMirrorsMock.mockReset()
    listVipsPagesMock.mockReset()
    listVipsTimelineEntriesMock.mockReset()
    searchMirrorsMock.mockResolvedValue([])
    listVipsPagesMock.mockResolvedValue([])
    listVipsTimelineEntriesMock.mockResolvedValue([])
  })

  it('renders an empty FTS block when no VIPS page carries an open_question', async () => {
    // Pages exist but carry no open_question — there is no FTS signal to
    // query with, so the corpus slice must stay empty rather than firing a
    // blank search.
    listVipsPagesMock.mockResolvedValue([
      makePageRow({ dimension: 'values', open_question: '' }),
      makePageRow({ dimension: 'interests', open_question: '   ' }),
    ])

    const formatted = await buildCartographerContext(CTX)

    expect(formatted).toContain('(none)')
    expect(formatted).toContain(`# Trajectory pass for student ${STUDENT}`)

    // Orchestration: pages + timeline still read on the caller's ctx, but no
    // FTS query is issued at all.
    expect(searchMirrorsMock).not.toHaveBeenCalled()
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

  it('caps unioned FTS results at CARTOGRAPHER_FTS_LIMIT across multiple open questions, deduped by id', async () => {
    listVipsPagesMock.mockResolvedValue([
      makePageRow({ dimension: 'values', open_question: 'clockwork curiosity' }),
      makePageRow({ dimension: 'interests', open_question: 'wiring curiosity' }),
    ])

    // Two overlapping result sets so both the union AND the dedup pathway
    // are exercised: ids 1..12 from the first query, ids 8..19 from the
    // second → 19 unique ids, capped back down to CARTOGRAPHER_FTS_LIMIT.
    searchMirrorsMock.mockImplementation(async (_sid: string, query: string) => {
      const first = query === 'clockwork curiosity'
      const startId = first ? 1 : 8
      return Array.from({ length: CARTOGRAPHER_FTS_LIMIT }, (_v, i) =>
        makeMirrorSearchResult({
          id: startId + i,
          score: -10 + i * 0.5,
          story_reframe: `clockwork curiosity wiring ${startId + i}`,
        }),
      )
    })

    const formatted = await buildCartographerContext(CTX)

    const bulletCount = formatted.match(/^- \[#\d+, score=/gm)?.length ?? 0
    expect(bulletCount).toBe(CARTOGRAPHER_FTS_LIMIT)
    expect(bulletCount).toBeGreaterThan(0)

    // Dedup invariant: no id appears twice in the rendered bullets.
    const ids = (formatted.match(/#(\d+), score=/g) ?? []).map((s) => s)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)

    // Orchestration: exactly one FTS query per non-empty open_question, each
    // asking for the full cap and sharing the caller's transaction.
    expect(searchMirrorsMock).toHaveBeenCalledTimes(2)
    expect(searchMirrorsMock.mock.calls.map((c) => c[1])).toEqual([
      'clockwork curiosity',
      'wiring curiosity',
    ])
    for (const call of searchMirrorsMock.mock.calls) {
      expect(call[0]).toBe(STUDENT)
      expect(call[2]).toEqual({ limit: CARTOGRAPHER_FTS_LIMIT, ctx: CTX })
    }
  })

  it('renders pages + timeline alongside the FTS corpus', async () => {
    listVipsPagesMock.mockResolvedValue([
      makePageRow({
        dimension: 'interests',
        compiled_truth: 'Drawn to disassembly.',
        open_question: 'clockwork curiosity',
      }),
    ])
    listVipsTimelineEntriesMock.mockImplementation(async (_sid: string, dim: string) =>
      dim === 'interests'
        ? [
            makeTimelineRow({
              id: 4,
              dimension: 'interests',
              canonical_claim_id: 'interests.investigative',
              verbatim_quote: 'pulled apart the clock',
              reflection_id: 1,
              strength: 'low',
              parallax_tag: ['hobby'],
            }),
          ]
        : [],
    )
    searchMirrorsMock.mockResolvedValue([
      makeMirrorSearchResult({ id: 55, story_reframe: 'clockwork curiosity surfaces', score: -3 }),
    ])

    const formatted = await buildCartographerContext(CTX)

    expect(formatted).toContain('Compiled truth: Drawn to disassembly.')
    expect(formatted).toContain(
      'entry_id=4 source_reflection_id=1 canonical_claim_id=interests.investigative strength=low parallax=["hobby"] reinforces_id=null quote="pulled apart the clock"',
    )
    // The FTS corpus row rendered alongside them.
    expect(formatted).toContain('- [#55, score=-3.000, 2026-05-01T09:00:00.000Z]')
    expect(searchMirrorsMock).toHaveBeenCalledWith(STUDENT, 'clockwork curiosity', {
      limit: CARTOGRAPHER_FTS_LIMIT,
      ctx: CTX,
    })
  })
})

// ── 3. runCartographerHandler flag routing ───────────────────────────────

describe('runCartographerHandler — managed dispatch', () => {
  const SAVED_ENV = { ...process.env }

  beforeEach(async () => {
    requireCounselorContextMock.mockReset()
    withStudentMock.mockReset()
    searchMirrorsMock.mockReset()
    listVipsPagesMock.mockReset()
    listVipsTimelineEntriesMock.mockReset()
    insertCartographerOutputMock.mockReset()
    getOrCreateMemoryStoreIdMock.mockReset()
    appendStudentMemoryMock.mockReset()

    requireCounselorContextMock.mockResolvedValue({
      counselorId: 'demo-counselor',
      studentId: STUDENT,
    })
    withStudentMock.mockImplementation(async (_sid: string, fn: (ctx: unknown) => unknown) =>
      fn(CTX),
    )
    searchMirrorsMock.mockResolvedValue([])
    listVipsPagesMock.mockResolvedValue([])
    listVipsTimelineEntriesMock.mockResolvedValue([])
    insertCartographerOutputMock.mockImplementation(async (sid: string, input: object) => ({
      id: 11,
      student_id: sid,
      ...input,
      raw_output_json: '{}',
      created_at: '2026-05-01T09:00:00.000Z',
    }))
    getOrCreateMemoryStoreIdMock.mockResolvedValue('memstore_test')
    appendStudentMemoryMock.mockResolvedValue(undefined)

    delete process.env.MANAGED_AGENT_CARTOGRAPHER_ID
    delete process.env.MANAGED_AGENT_CARTOGRAPHER_VERSION
    delete process.env.MANAGED_AGENT_ENV_ID
    // Keeps `runSelfCritiqueReviewBestEffort` a no-op so the only
    // `runManagedAgent` call in each test is the Cartographer dispatch.
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

  /**
   * Point `listVipsTimelineEntries` at one committed entry per pathway
   * `trait_combination` claim id, so the handler's post-process validator
   * (which checks each claim_id against the read-back timeline) accepts the
   * synthetic draft.
   */
  function seedClaims(): void {
    listVipsTimelineEntriesMock.mockImplementation(async (_sid: string, dim: string) => {
      if (dim === 'values') {
        return [
          makeTimelineRow({
            id: 1,
            dimension: 'values',
            canonical_claim_id: 'values.contribution',
            verbatim_quote: 'i wanted to help',
            reflection_id: 1,
          }),
        ]
      }
      if (dim === 'skills') {
        return [
          makeTimelineRow({
            id: 2,
            dimension: 'skills',
            canonical_claim_id: 'skills.analytical',
            verbatim_quote: 'broke it into parts',
            reflection_id: 1,
          }),
        ]
      }
      return []
    })
  }

  function happyDraft() {
    const pathway = (label: string) => ({
      label,
      trait_combination: [
        { claim_id: 'values.contribution', dimension: 'values' as const },
        { claim_id: 'skills.analytical', dimension: 'skills' as const },
      ],
      ecg_region_tags: ['cluster.engineering'],
      risks_tradeoffs:
        'JC track delays hands-on workshop time by two years; poly preserves it but routes through different unis.',
      exploration_prompt: 'What would a Friday workshop visit look like before subject choices?',
    })
    return {
      trajectory_paragraph:
        'Your reflections point toward applied, hands-on engineering — your CCA energy and your maths/physics fluency are reinforcing each other.',
      pathways: [pathway('A'), pathway('B')],
      open_questions: [],
      disclaimer: 'These are paths the pattern points toward, not careers to choose.',
    }
  }

  it('dispatches to runManagedAgent, forwarding the buildCartographerContext prompt', async () => {
    process.env.MANAGED_AGENT_CARTOGRAPHER_ID = 'agt_carto_abc'
    process.env.MANAGED_AGENT_CARTOGRAPHER_VERSION = '4'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    seedClaims()
    vi.mocked(runManagedAgent).mockResolvedValueOnce({
      output: happyDraft(),
      sessionId: 'sesn_test',
      rawText: '',
      usage: {
        inputTokens: 200,
        outputTokens: 80,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    })

    const result = await runCartographerHandler({})

    expect(result.ok).toBe(true)
    expect(result.status).toBe('ok')
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    const call = vi.mocked(runManagedAgent).mock.calls[0]?.[0]
    expect(call?.agentId).toBe('agt_carto_abc')
    expect(call?.agentVersion).toBe(4)
    expect(call?.environmentId).toBe('env_x')
    expect(call?.sessionTitle).toBe(`cartographer:${STUDENT}`)
    expect(call?.memoryStoreId).toBe('memstore_test')
    expect(call?.prompt).toContain('# Inlined VIPS taxonomy')
    expect(call?.prompt).toContain(`# Trajectory pass for student ${STUDENT}`)
    // The prompt carries the timeline the validator will check against.
    expect(call?.prompt).toContain('canonical_claim_id=values.contribution')
    expect(call?.prompt).toContain('canonical_claim_id=skills.analytical')
    // Cartographer's runner timeout is bumped above the default for the
    // long-running synthesis budget (plan §10 maxDuration=800s).
    expect(call?.timeoutMs).toBeGreaterThan(120_000)

    // Orchestration: one tenancy envelope, taken from the counselor context,
    // and every read shares that transaction.
    expect(withStudentMock).toHaveBeenCalledTimes(1)
    expect(withStudentMock.mock.calls[0]?.[0]).toBe(STUDENT)
    expect(listVipsPagesMock).toHaveBeenCalledWith(STUDENT, { ctx: CTX })
    for (const c of listVipsTimelineEntriesMock.mock.calls) {
      expect(c[0]).toBe(STUDENT)
      expect(c[2]).toEqual({ includeForgotten: false, ctx: CTX })
    }

    // Both pathways survived the post-process validator and were persisted
    // through the same ctx.
    expect(insertCartographerOutputMock).toHaveBeenCalledTimes(1)
    const [sid, payload, opts] = insertCartographerOutputMock.mock.calls[0] as [
      string,
      { trajectory_text: string; pathways: unknown[]; disclaimer: string },
      unknown,
    ]
    expect(sid).toBe(STUDENT)
    expect(opts).toEqual({ ctx: CTX })
    expect(payload.pathways).toHaveLength(2)
    expect(payload.trajectory_text).toContain('applied, hands-on engineering')
    if (result.ok) {
      expect(result.cartographer_output_id).toBe(11)
      expect(result.trajectory.pathways).toHaveLength(2)
      expect(result.warnings).toEqual([])
    }
  })

  it('deps.runCartographer takes priority over the managed runner', async () => {
    process.env.MANAGED_AGENT_CARTOGRAPHER_ID = 'agt_carto_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    seedClaims()
    const pages = [makePageRow({ dimension: 'values', compiled_truth: 'Prior truth.' })]
    listVipsPagesMock.mockResolvedValue(pages)
    const stubCartographer = vi.fn().mockResolvedValue(happyDraft())

    const result = await runCartographerHandler({}, { runCartographer: stubCartographer })

    expect(result.ok).toBe(true)
    expect(stubCartographer).toHaveBeenCalledOnce()
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()

    // The seam receives the already-read context plus the event emitter.
    const seamInput = stubCartographer.mock.calls[0]?.[0] as {
      studentId: string
      pages: unknown[]
      timeline: { canonical_claim_id: string }[]
      emit: unknown
    }
    expect(seamInput.studentId).toBe(STUDENT)
    expect(seamInput.pages).toBe(pages)
    expect(seamInput.timeline.map((e) => e.canonical_claim_id)).toEqual([
      'values.contribution',
      'skills.analytical',
    ])
    expect(typeof seamInput.emit).toBe('function')
    // No managed dispatch means no prompt build and no memory-store resolve.
    expect(searchMirrorsMock).not.toHaveBeenCalled()
    expect(getOrCreateMemoryStoreIdMock).not.toHaveBeenCalled()
    // The validated payload is still persisted.
    expect(insertCartographerOutputMock).toHaveBeenCalledTimes(1)
  })

  it('missing cartographer binding surfaces as agent_error (handler catches the throw)', async () => {
    // Intentionally do NOT set MANAGED_AGENT_CARTOGRAPHER_ID.

    const { runManagedAgent } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')
    const result = await runCartographerHandler({})

    expect(result.ok).toBe(false)
    expect(result.status).toBe('agent_error')
    if (!result.ok) {
      expect(result.error).toMatch(/MANAGED_AGENT_CARTOGRAPHER_ID/)
    }
    // `getManagedAgentBinding` throws before the transport is reached, and
    // no Trajectory row is written on a failed run.
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()
    expect(insertCartographerOutputMock).not.toHaveBeenCalled()
  })

  it('maps a ManagedAgentError(PARSE_ERROR) through the agent_error path', async () => {
    process.env.MANAGED_AGENT_CARTOGRAPHER_ID = 'agt_carto_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent, ManagedAgentError } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    vi.mocked(runManagedAgent).mockRejectedValueOnce(
      new ManagedAgentError('non-JSON output', 'PARSE_ERROR'),
    )
    const result = await runCartographerHandler({})
    expect(result.ok).toBe(false)
    expect(result.status).toBe('agent_error')
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    expect(insertCartographerOutputMock).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error).toBe('non-JSON output')
      // The failure is surfaced as an ordered event pair, not a silent null.
      expect(result.events.map((e) => e.type)).toEqual(['agent_started', 'error', 'run_completed'])
    }
  })
})
