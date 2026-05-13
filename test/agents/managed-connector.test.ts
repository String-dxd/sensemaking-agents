// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
/**
 * Connector on Managed Agents.
 *
 * Three surfaces under test:
 *
 *   1. `formatConnectorContext` — the pure formatter shipped in
 *      `src/agents/context/index.ts`. Validates the inlined VIPS + ECG
 *      taxonomy prefix, the per-request reflection / recent-FTS / pages
 *      sections, and the deterministic task footer.
 *   2. `buildConnectorContext` — DB integration. Validates the pre-fetch
 *      pulls the right new reflection, FTS-matching past mirrors, and
 *      VIPS pages under `withStudent` tenancy.
 *   3. `runAutoConnectorAfterMirror` dispatch — invokes a mocked
 *      `runManagedAgent` with a binding pulled from `MANAGED_AGENT_CONNECTOR_*`.
 *      `deps.runConnector` wins as a test seam. ManagedAgentError variants
 *      map onto the AutoConnectorStatus enum.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildConnectorContext,
  CONNECTOR_FTS_LIMIT,
  type ConnectorContextPayload,
  formatConnectorContext,
} from '~/agents/context'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import {
  insertMirrorEntry,
  insertVipsTimelineEntry,
  type MirrorSearchResult,
  upsertVipsPage,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { seed } from '~/db/seed'

const STUDENT = 'demo'

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

// ── 1. formatConnectorContext (pure) ─────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)(
  'Step 8 formatConnectorContext — inlined-taxonomy prefix',
  () => {
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
        pastMirrors: [
          makeMirrorSearchResult({ id: 11, score: -1.234, story_reframe: longExcerpt }),
        ],
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
          makeTimelineRow({ dimension: 'values', canonical_claim_id: 'values.self_direction' }),
        ],
      }
      const formatted = formatConnectorContext(payload)
      expect(formatted).toContain('## VALUES')
      expect(formatted).toContain('Compiled truth: Practices self-direction.')
      expect(formatted).toContain(
        '[values.self_direction] (medium, parallax=["school"]) "i wanted to figure it out myself"',
      )
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
  },
)

// ── 2. buildConnectorContext (DB integration) ────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)('Step 8 buildConnectorContext — DB pre-fetch', () => {
  beforeEach(() => {
    setDbForTests(openInMemoryDb())
    seed()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('throws a clear error if the mirror entry is not visible under the student', () => {
    expect(() => buildConnectorContext(STUDENT, 999_999)).toThrow(
      /buildConnectorContext: mirror entry 999999 is not visible/,
    )
  })

  it('caps recent reflections at CONNECTOR_FTS_LIMIT and excludes the new reflection itself', () => {
    // Insert a number of synthetic past mirrors that share an FTS keyword
    // with the new reflection's story_reframe, then a brand-new reflection.
    for (let i = 0; i < CONNECTOR_FTS_LIMIT + 3; i++) {
      insertMirrorEntry(STUDENT, {
        transcript: `prior transcript ${i}`,
        validation: '',
        inferred_meaning: '',
        story_reframe: `clockwork curiosity ${i}`,
        raw_output: {},
        context_type: 'hobby',
      })
    }
    const fresh = insertMirrorEntry(STUDENT, {
      transcript: 'i pulled apart the clock again last night',
      validation: '',
      inferred_meaning: '',
      story_reframe: 'clockwork curiosity surfaces once more',
      raw_output: {},
      context_type: 'hobby',
    })

    // Upsert a page + timeline entry so the integration covers the joined view.
    upsertVipsPage(STUDENT, {
      dimension: 'interests',
      compiled_truth: 'Drawn to disassembly.',
      open_question: 'Where does this curiosity stop?',
    })
    insertVipsTimelineEntry(STUDENT, {
      dimension: 'interests',
      canonical_claim_id: 'interests.investigative',
      verbatim_quote: 'pulled apart the clock',
      reflection_id: fresh.id,
      strength: 'low',
      parallax_tag: ['hobby'],
    })

    const formatted = buildConnectorContext(STUDENT, fresh.id)

    // The fresh reflection itself never appears in the recent-FTS block.
    expect(formatted).not.toContain(`[#${fresh.id}, score=`)

    // At most CONNECTOR_FTS_LIMIT past-mirror bullets land in the block.
    const bulletCount = formatted.match(/^- \[#\d+, score=/gm)?.length ?? 0
    expect(bulletCount).toBeLessThanOrEqual(CONNECTOR_FTS_LIMIT)

    // The upserted page + timeline entry are visible.
    expect(formatted).toContain('Compiled truth: Drawn to disassembly.')
    expect(formatted).toContain('[interests.investigative] (low, parallax=["hobby"])')
  })
})

// ── 3. runAutoConnectorAfterMirror flag routing ──────────────────────────

// The runner module is mocked at the test boundary so the handler's call
// to `runManagedAgent` lands on a controllable stub. The test seeds an
// in-memory DB, sets the managed-agent env vars, flips the flag, and
// asserts both the routing decision AND the prompt that flowed through.
vi.mock('~/agents/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/agents/runner')>()
  return {
    ...actual,
    runManagedAgent: vi.fn(),
  }
})

describe.skipIf(!process.env.DATABASE_URL)(
  'runAutoConnectorAfterMirror — managed runner dispatch',
  () => {
    const SAVED_ENV = { ...process.env }

    beforeEach(async () => {
      setDbForTests(openInMemoryDb())
      seed()
      delete process.env.MANAGED_AGENT_CONNECTOR_ID
      delete process.env.MANAGED_AGENT_CONNECTOR_VERSION
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

    function seedFreshMirror(): { id: number } {
      const row = insertMirrorEntry(STUDENT, {
        transcript: 'i hated when teacher told us exactly what to do',
        validation: 'fine',
        inferred_meaning: 'something',
        story_reframe: 'one session of pushing back',
        raw_output: {},
        context_type: 'school',
      })
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
                canonical_claim_id: 'values.self_direction',
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
      expect(call?.prompt).toContain('# Inlined VIPS taxonomy')
      expect(call?.prompt).toContain(`# New Mirror reflection #${mirror.id} (context_type=school)`)
    })

    it('deps.runConnector takes priority over the managed runner', async () => {
      process.env.MANAGED_AGENT_CONNECTOR_ID = 'agt_connector_abc'
      process.env.MANAGED_AGENT_ENV_ID = 'env_x'

      const { runManagedAgent } = await import('~/agents/runner')
      const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')

      const mirror = seedFreshMirror()
      const stubConnector = vi.fn().mockResolvedValue(happyDraft(mirror.id))

      const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id, {
        runConnector: stubConnector,
      })

      expect(result.status).toBe('ok')
      expect(stubConnector).toHaveBeenCalledOnce()
      expect(vi.mocked(runManagedAgent)).not.toHaveBeenCalled()
    })

    it('missing connector binding surfaces as `unknown` (Error has no recognized status field)', async () => {
      // Intentionally do NOT set MANAGED_AGENT_CONNECTOR_ID.

      const { runAutoConnectorAfterMirror } = await import('~/server/auto-connector.handler.server')
      const mirror = seedFreshMirror()
      const result = await runAutoConnectorAfterMirror(STUDENT, mirror.id)

      expect(result.status).toBe('unknown')
      expect(result.staged_diff).toBeNull()
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
    })
  },
)
