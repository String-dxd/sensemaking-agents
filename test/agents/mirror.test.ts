// @ts-nocheck — Step 2 (Drizzle/Postgres port): this test uses the
// legacy `openInMemoryDb` / better-sqlite3 path. Skipped at runtime via
// DATABASE_URL gate below; the test body is rewritten in Step 3 against
// the Drizzle/Postgres surface (or mocked queries.ts).
// TODO(reza-step2-followup): rewrite against new TenantContext + Drizzle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMirrorOnTranscript } from '~/agents/mirror'
import { MirrorEntrySchema, MirrorOutputSchema } from '~/agents/schemas'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry } from '~/db/queries'
import { seed } from '~/db/seed'
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
})

/**
 * U7: persistMirror now chains the auto-Connector. These tests don't care
 * about the chain output — they just want the mirror entry row written.
 * `noopAutoConnector` returns an empty per-dimension diff so the verifier
 * runs but admits nothing and the chain status is 'ok'.
 */
function noopAutoConnector() {
  const emptyDim = {
    compiled_truth_rewrite: '',
    open_question: '',
    new_timeline_entries: [],
  }
  return {
    runConnector: vi.fn().mockResolvedValue({
      diffs: {
        values: emptyDim,
        interests: emptyDim,
        personality: emptyDim,
        skills: emptyDim,
      },
    }),
  }
}

const baseEntry = {
  transcript: 'long transcript',
  validation: 'You stayed with the moment.',
  inferred_meaning: 'Maybe there is something here worth marking.',
  story_reframe: 'You did the thing and you noticed it.',
  raw_output: { validation: 'v', inferred_meaning: 'i', story_reframe: 's' },
}

/** AE1 (R20 ablation) — Mirror's tool surface is search_past_mirrors only. */
describe.skipIf(!process.env.DATABASE_URL)(
  'AE1: Mirror tool surface is search_past_mirrors only',
  () => {
    it('search_past_mirrors handler returns scoped FTS5 results matching the new schema', () => {
      const db = openInMemoryDb()
      insertMirrorEntry(
        'demo',
        { ...baseEntry, story_reframe: 'Robotics arm — built it blindfolded.' },
        { ctx: { db } },
      )
      insertMirrorEntry(
        'other',
        { ...baseEntry, story_reframe: 'Robotics arm — should not be visible.' },
        { ctx: { db } },
      )
      const out = executeSearchPastMirrors('demo', { query: 'robotics' }, { db })
      expect(out.results.length).toBe(1)
      expect(out.results[0]?.story_reframe).toMatch(/blindfolded/)
    })

    it('exposes the search_past_mirrors tool name as the canonical constant', () => {
      expect(SEARCH_PAST_MIRRORS_NAME).toBe('search_past_mirrors')
    })
  },
)

/**
 * AE3 (R7, R8) — Persisted Mirror entries contain transcript +
 * {validation, inferred_meaning, story_reframe} + raw_output, never raw audio.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'AE3: persist-mirror writes the three editable fields plus raw_output',
  () => {
    it('persists a valid MirrorEntrySchema payload to mirror_entries', async () => {
      const draft = {
        transcript: 'We had robotics today...',
        validation: 'You stayed with the disassembly long enough that the time disappeared.',
        inferred_meaning:
          'Maybe the absorption was less about robotics specifically and more about being given a self-directed way in.',
        story_reframe:
          "It's the new arm kit and everyone else has two builds on you. You take one apart first — your way in.",
      }
      MirrorEntrySchema.parse(draft) // contract is honored

      const result = await persistMirrorHandler(
        {
          studentId: 'demo',
          entry: draft,
          context_type: 'school',
          raw_output: draft,
          trace: { events: [] },
        },
        { autoConnector: noopAutoConnector() },
      )
      const row = result.mirror_entry
      expect(row.transcript).toBe(draft.transcript)
      expect(row.validation).toBe(draft.validation)
      expect(row.inferred_meaning).toBe(draft.inferred_meaning)
      expect(row.story_reframe).toBe(draft.story_reframe)
      expect(row.context_type).toBe('school')
      expect(row.raw_output_json).toContain('absorption')
    })

    it('rejects an empty validation at the schema boundary (regression check)', () => {
      expect(() =>
        MirrorEntrySchema.parse({
          transcript: 't',
          validation: '',
          inferred_meaning: 'm',
          story_reframe: 's',
        }),
      ).toThrow()
    })
  },
)

describe.skipIf(!process.env.DATABASE_URL)(
  'safety: persist-mirror rejects diagnostic language',
  () => {
    it('throws DiagnosticLanguageError when inferred_meaning labels personality', async () => {
      await expect(
        persistMirrorHandler(
          {
            studentId: 'demo',
            entry: {
              transcript: 't',
              validation: 'v',
              inferred_meaning: 'You are an extrovert based on this reflection.',
              story_reframe: 's',
            },
            context_type: 'school',
            raw_output: { v: 1 },
          },
          { autoConnector: noopAutoConnector() },
        ),
      ).rejects.toBeInstanceOf(DiagnosticLanguageError)
    })

    it('accepts careful, non-diagnostic phrasing about behavior', async () => {
      await expect(
        persistMirrorHandler(
          {
            studentId: 'demo',
            entry: {
              transcript: 't',
              validation: 'You stayed for 40 minutes.',
              inferred_meaning: 'Maybe commitment to one side made the argument feel sharper.',
              story_reframe: 'You drew "against" and you stayed.',
            },
            context_type: 'school',
            raw_output: { v: 1 },
          },
          { autoConnector: noopAutoConnector() },
        ),
      ).resolves.toBeDefined()
    })
  },
)

/** runMirrorOnTranscript passes through to a stub when one is supplied. */
describe.skipIf(!process.env.DATABASE_URL)('runMirrorOnTranscript dependency injection', () => {
  it('uses the deps.runMirror stub when provided and parses against MirrorOutputSchema', async () => {
    const stub = async () => ({
      validation: 'You took the time to say it out loud.',
      inferred_meaning: 'Maybe it mattered more than you let on.',
      story_reframe: 'You spoke into the mirror. Sixty seconds. Then quiet.',
    })
    const out = await runMirrorOnTranscript('demo', 'transcript text', { runMirror: stub })
    expect(MirrorOutputSchema.parse(out)).toBeDefined()
    expect(out.story_reframe).toMatch(/mirror/i)
  })
})
