/**
 * Step 9 — Cartographer on Managed Agents (behind `USE_MANAGED_AGENTS`).
 *
 * Three surfaces under test:
 *
 *   1. `formatCartographerContext` — the pure formatter shipped in
 *      `src/agents/context/index.ts`. Validates the inlined VIPS + ECG
 *      taxonomy prefix, the trajectory framing, the pages + timeline
 *      section, the recent-FTS section, and the deterministic task footer.
 *   2. `buildCartographerContext` — DB integration. Validates the pre-fetch
 *      pulls pages, timeline, and the unioned-FTS-by-open-question corpus
 *      slice under `withStudent` tenancy.
 *   3. `runCartographerHandler` flag routing — `USE_MANAGED_AGENTS=true`
 *      dispatches through a mocked `runManagedAgent` with a binding pulled
 *      from `MANAGED_AGENT_CARTOGRAPHER_*`. `deps.runCartographer` still
 *      wins. Schema parse + post-process validator still run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCartographerContext,
  CARTOGRAPHER_FTS_LIMIT,
  type CartographerContextPayload,
  formatCartographerContext,
} from '~/agents/context'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  insertMirrorEntry,
  insertVipsTimelineEntry,
  upsertVipsPage,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { seed } from '~/db/seed'

const STUDENT = 'demo'

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
    canonical_claim_id: 'values.self_direction',
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
        makeTimelineRow({ dimension: 'values', canonical_claim_id: 'values.self_direction' }),
      ],
    })
    expect(formatted).toContain('## VALUES')
    expect(formatted).toContain('Compiled truth: Practices self-direction.')
    expect(formatted).toContain('Open question: When does self-direction tip into stubbornness?')
    expect(formatted).toContain(
      '[values.self_direction] (medium, parallax=["school"]) "i wanted to figure it out myself"',
    )
  })

  it('ends with the deterministic task footer that pins the output schema and cluster-only ECG rule', () => {
    const formatted = formatCartographerContext(minimalPayload)
    expect(formatted).toContain('# Task')
    expect(formatted).toContain('CartographerOutputSchema')
    expect(formatted).toContain('trait_combination[].claim_id')
    expect(formatted).toContain('cluster.*')
    expect(formatted.trimEnd().endsWith('Return 2–5 pathways.')).toBe(true)
  })
})

// ── 2. buildCartographerContext (DB integration) ─────────────────────────

describe('Step 9 buildCartographerContext — DB pre-fetch', () => {
  beforeEach(() => {
    setDbForTests(openInMemoryDb())
    seed()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('renders an empty FTS block when no VIPS page carries an open_question', () => {
    // No upserts; seed leaves pages empty for the synthetic STUDENT.
    const formatted = buildCartographerContext(STUDENT)
    expect(formatted).toContain('(none)')
    expect(formatted).toContain(`# Trajectory pass for student ${STUDENT}`)
  })

  it('caps unioned FTS results at CARTOGRAPHER_FTS_LIMIT across multiple open questions, deduped by id', () => {
    // Seed a corpus that FTS-matches each open question, sharing some rows
    // across queries so the dedup pathway is exercised.
    for (let i = 0; i < CARTOGRAPHER_FTS_LIMIT + 10; i++) {
      insertMirrorEntry(STUDENT, {
        transcript: `transcript ${i}`,
        validation: '',
        inferred_meaning: '',
        story_reframe: `clockwork curiosity wiring ${i}`,
        raw_output: {},
        context_type: 'hobby',
      })
    }

    upsertVipsPage(STUDENT, {
      dimension: 'values',
      compiled_truth: '',
      open_question: 'clockwork curiosity',
    })
    upsertVipsPage(STUDENT, {
      dimension: 'interests',
      compiled_truth: '',
      open_question: 'wiring curiosity',
    })

    const formatted = buildCartographerContext(STUDENT)

    const bulletCount = formatted.match(/^- \[#\d+, score=/gm)?.length ?? 0
    expect(bulletCount).toBeLessThanOrEqual(CARTOGRAPHER_FTS_LIMIT)
    expect(bulletCount).toBeGreaterThan(0)

    // Dedup invariant: no id appears twice in the rendered bullets.
    const ids = (formatted.match(/#(\d+), score=/g) ?? []).map((s) => s)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('renders pages + timeline alongside the FTS corpus', () => {
    insertMirrorEntry(STUDENT, {
      transcript: 'pulled apart the clock',
      validation: '',
      inferred_meaning: '',
      story_reframe: 'clockwork curiosity surfaces',
      raw_output: {},
      context_type: 'hobby',
    })
    upsertVipsPage(STUDENT, {
      dimension: 'interests',
      compiled_truth: 'Drawn to disassembly.',
      open_question: 'clockwork curiosity',
    })
    insertVipsTimelineEntry(STUDENT, {
      dimension: 'interests',
      canonical_claim_id: 'interests.investigative',
      verbatim_quote: 'pulled apart the clock',
      reflection_id: 1,
      strength: 'low',
      parallax_tag: ['hobby'],
    })

    const formatted = buildCartographerContext(STUDENT)

    expect(formatted).toContain('Compiled truth: Drawn to disassembly.')
    expect(formatted).toContain('[interests.investigative] (low, parallax=["hobby"])')
  })
})

// ── 3. runCartographerHandler flag routing ───────────────────────────────

vi.mock('~/agents/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/agents/runner')>()
  return {
    ...actual,
    runManagedAgent: vi.fn(),
  }
})

describe('Step 9 runCartographerHandler — flag routing', () => {
  const SAVED_ENV = { ...process.env }

  beforeEach(async () => {
    setDbForTests(openInMemoryDb())
    seed()
    delete process.env.USE_MANAGED_AGENTS
    delete process.env.MANAGED_AGENT_CARTOGRAPHER_ID
    delete process.env.MANAGED_AGENT_CARTOGRAPHER_VERSION
    delete process.env.MANAGED_AGENT_ENV_ID
    const { runManagedAgent } = await import('~/agents/runner')
    vi.mocked(runManagedAgent).mockReset()
  })
  afterEach(() => {
    resetDbForTests()
    for (const k of Object.keys(process.env)) {
      if (!(k in SAVED_ENV)) delete process.env[k]
    }
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v !== undefined) process.env[k] = v
    }
  })

  /**
   * Seeds a single timeline entry for each pathway's `trait_combination`
   * claim ids so the handler's post-process validator (which checks each
   * claim_id against `listVipsTimelineEntries`) accepts the synthetic draft.
   */
  function seedClaims(): void {
    insertVipsTimelineEntry(STUDENT, {
      dimension: 'values',
      canonical_claim_id: 'values.contribution',
      verbatim_quote: 'i wanted to help',
      reflection_id: 1,
      strength: 'medium',
      parallax_tag: ['school'],
    })
    insertVipsTimelineEntry(STUDENT, {
      dimension: 'skills',
      canonical_claim_id: 'skills.analytical',
      verbatim_quote: 'broke it into parts',
      reflection_id: 1,
      strength: 'medium',
      parallax_tag: ['school'],
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

  it('routes to runManagedAgent when USE_MANAGED_AGENTS=true, forwarding the buildCartographerContext prompt', async () => {
    process.env.USE_MANAGED_AGENTS = 'true'
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

    const result = await runCartographerHandler({ studentId: STUDENT })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('ok')
    expect(vi.mocked(runManagedAgent)).toHaveBeenCalledOnce()
    const call = vi.mocked(runManagedAgent).mock.calls[0]?.[0]
    expect(call?.agentId).toBe('agt_carto_abc')
    expect(call?.agentVersion).toBe(4)
    expect(call?.environmentId).toBe('env_x')
    expect(call?.sessionTitle).toBe(`cartographer:${STUDENT}`)
    expect(call?.prompt).toContain('# Inlined VIPS taxonomy')
    expect(call?.prompt).toContain(`# Trajectory pass for student ${STUDENT}`)
    // Cartographer's runner timeout is bumped above the default for the
    // long-running synthesis budget (plan §10 maxDuration=800s).
    expect(call?.timeoutMs).toBeGreaterThan(120_000)
  })

  it('deps.runCartographer wins over USE_MANAGED_AGENTS=true (test injection takes priority)', async () => {
    process.env.USE_MANAGED_AGENTS = 'true'
    process.env.MANAGED_AGENT_CARTOGRAPHER_ID = 'agt_carto_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    seedClaims()
    const stubCartographer = vi.fn().mockResolvedValue(happyDraft())

    const result = await runCartographerHandler(
      { studentId: STUDENT },
      { runCartographer: stubCartographer },
    )

    expect(result.ok).toBe(true)
    expect(stubCartographer).toHaveBeenCalledOnce()
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()
  })

  it('USE_MANAGED_AGENTS=true without a binding surfaces as agent_error (handler catches the throw)', async () => {
    process.env.USE_MANAGED_AGENTS = 'true'
    // Intentionally do NOT set MANAGED_AGENT_CARTOGRAPHER_ID.

    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')
    const result = await runCartographerHandler({ studentId: STUDENT })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('agent_error')
    if (!result.ok) {
      expect(result.error).toMatch(/MANAGED_AGENT_CARTOGRAPHER_ID/)
    }
  })

  it('maps a ManagedAgentError(PARSE_ERROR) through the agent_error path', async () => {
    process.env.USE_MANAGED_AGENTS = 'true'
    process.env.MANAGED_AGENT_CARTOGRAPHER_ID = 'agt_carto_abc'
    process.env.MANAGED_AGENT_ENV_ID = 'env_x'

    const { runManagedAgent, ManagedAgentError } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    vi.mocked(runManagedAgent).mockRejectedValueOnce(
      new ManagedAgentError('non-JSON output', 'PARSE_ERROR'),
    )
    const result = await runCartographerHandler({ studentId: STUDENT })
    expect(result.ok).toBe(false)
    expect(result.status).toBe('agent_error')
  })

  it('keeps the legacy OpenAI path when USE_MANAGED_AGENTS is unset (deps.runCartographer exercises the non-managed branch end-to-end)', async () => {
    delete process.env.USE_MANAGED_AGENTS
    const { runManagedAgent } = await import('~/agents/runner')
    const { runCartographerHandler } = await import('~/server/run-cartographer.handler.server')

    seedClaims()
    const stub = vi.fn().mockResolvedValue(happyDraft())
    const result = await runCartographerHandler({ studentId: STUDENT }, { runCartographer: stub })

    expect(result.ok).toBe(true)
    expect(stub).toHaveBeenCalledOnce()
    expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()
  })
})
