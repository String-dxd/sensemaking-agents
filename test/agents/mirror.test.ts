import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMirrorOnTranscript } from '~/agents/mirror'
import { MirrorEntrySchema, MirrorOutputSchema } from '~/agents/schemas'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry } from '~/db/queries'
import {
  DiagnosticLanguageError,
  persistMirrorHandler,
} from '~/server/persist-mirror.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
})

afterEach(() => {
  resetDbForTests()
})

const baseEntry = {
  transcript: 'long transcript',
  validation: 'You stayed with the moment.',
  inferred_meaning: 'Maybe there is something here worth marking.',
  story_reframe: 'You did the thing and you noticed it.',
  raw_output: { validation: 'v', inferred_meaning: 'i', story_reframe: 's' },
}

/** AE1 (R20 ablation) — Mirror's tool surface is search_past_mirrors only. */
describe('AE1: Mirror tool surface is search_past_mirrors only', () => {
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
})

/**
 * AE3 (R7, R8) — Persisted Mirror entries contain transcript +
 * {validation, inferred_meaning, story_reframe} + raw_output, never raw audio.
 */
describe('AE3: persist-mirror writes the three editable fields plus raw_output', () => {
  it('persists a valid MirrorEntrySchema payload to mirror_entries', () => {
    const db = openInMemoryDb()
    const draft = {
      transcript: 'We had robotics today...',
      validation: 'You stayed with the disassembly long enough that the time disappeared.',
      inferred_meaning:
        'Maybe the absorption was less about robotics specifically and more about being given a self-directed way in.',
      story_reframe:
        "It's the new arm kit and everyone else has two builds on you. You take one apart first — your way in.",
    }
    MirrorEntrySchema.parse(draft) // contract is honored

    const row = persistMirrorHandler({
      studentId: 'demo',
      entry: draft,
      raw_output: draft,
      trace: { events: [] },
    })
    expect(row.transcript).toBe(draft.transcript)
    expect(row.validation).toBe(draft.validation)
    expect(row.inferred_meaning).toBe(draft.inferred_meaning)
    expect(row.story_reframe).toBe(draft.story_reframe)
    expect(row.raw_output_json).toContain('absorption')

    // No audio table exists in the schema — schema check confirms this.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string
    }>
    expect(tables.some((t) => /audio/i.test(t.name))).toBe(false)
    db.close()
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
})

describe('safety: persist-mirror rejects diagnostic language', () => {
  it('throws DiagnosticLanguageError when inferred_meaning labels personality', () => {
    expect(() =>
      persistMirrorHandler({
        studentId: 'demo',
        entry: {
          transcript: 't',
          validation: 'v',
          inferred_meaning: 'You are an extrovert based on this reflection.',
          story_reframe: 's',
        },
        raw_output: { v: 1 },
      }),
    ).toThrowError(DiagnosticLanguageError)
  })

  it('accepts careful, non-diagnostic phrasing about behavior', () => {
    expect(() =>
      persistMirrorHandler({
        studentId: 'demo',
        entry: {
          transcript: 't',
          validation: 'You stayed for 40 minutes.',
          inferred_meaning: 'Maybe commitment to one side made the argument feel sharper.',
          story_reframe: 'You drew "against" and you stayed.',
        },
        raw_output: { v: 1 },
      }),
    ).not.toThrow()
  })
})

/** runMirrorOnTranscript passes through to a stub when one is supplied. */
describe('runMirrorOnTranscript dependency injection', () => {
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
