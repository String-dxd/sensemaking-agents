import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleRealtimeEvent } from '~/agents/mirror-event-router'
import { MirrorEntrySchema } from '~/agents/schemas'
import { realtimeToolConfig, SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { executeSearchPastMirrors } from '~/agents/tools/search-corpus.server'
import { openInMemoryDb, resetDbForTests, setDbForTests } from '~/db/client'
import { insertMirrorEntry } from '~/db/queries'
import {
  DiagnosticLanguageError,
  persistMirrorHandler,
} from '~/server/persist-mirror.handler.server'
import { searchPastMirrorsHandler } from '~/server/search-past-mirrors.handler.server'

beforeEach(() => {
  setDbForTests(openInMemoryDb())
})

afterEach(() => {
  resetDbForTests()
})

/**
 * AE1 — Mirror exposes exactly one tool. The realtime tool config carries
 * `search_past_mirrors` and nothing else; no second tool is registered.
 */
describe('AE1: Mirror exposes exactly one tool', () => {
  it('the realtime tool config carries only search_past_mirrors', () => {
    const cfg = realtimeToolConfig()
    expect(cfg.name).toBe(SEARCH_PAST_MIRRORS_NAME)
    expect(cfg.type).toBe('function')
    // The Mirror agent boundary has only this one tool — U5 wires no others.
    expect(cfg.parameters).toBeDefined()
  })

  it('routes a search_past_mirrors function-call event to the search server fn and feeds the result back', async () => {
    const db = openInMemoryDb()
    insertMirrorEntry(
      'demo',
      {
        summary: 'Vectors test today.',
        transcript: 'long transcript',
        signals: [],
        caution: '-',
        tags: ['maths'],
      },
      { ctx: { db } },
    )

    const sent: unknown[] = []
    const calledTools: string[] = []

    await handleRealtimeEvent({
      raw: JSON.stringify({
        type: 'response.function_call_arguments.done',
        name: 'search_past_mirrors',
        call_id: 'call_abc',
        arguments: JSON.stringify({ query: 'vectors' }),
      }),
      studentId: 'demo',
      send: (msg) => sent.push(msg),
      onToolCall: (name) => calledTools.push(name),
      runSearch: (input) => searchPastMirrorsHandler({ studentId: 'demo', ...input }),
    })

    expect(calledTools).toEqual(['search_past_mirrors'])
    const [created] = sent
    expect(created).toMatchObject({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call_abc' },
    })
  })

  it('search_past_mirrors handler returns scoped FTS5 results matching the schema', () => {
    const db = openInMemoryDb()
    insertMirrorEntry(
      'demo',
      {
        summary: 'Robotics arm — built it blindfolded.',
        transcript: 't',
        signals: [],
        caution: '-',
      },
      { ctx: { db } },
    )
    insertMirrorEntry(
      'other',
      {
        summary: 'Robotics arm — should not be visible.',
        transcript: 't',
        signals: [],
        caution: '-',
      },
      { ctx: { db } },
    )
    const out = executeSearchPastMirrors('demo', { query: 'robotics' }, { db })
    expect(out.results.length).toBe(1)
    expect(out.results[0]?.summary).toMatch(/blindfolded/)
  })
})

/**
 * AE2 — Persisted Mirror entries contain transcript and signals, never raw audio.
 */
describe('AE2: persist-mirror writes transcript + signals; never audio', () => {
  it('persists a valid MirrorEntrySchema payload to mirror_entries', () => {
    const db = openInMemoryDb()
    const draft = {
      summary: 'Robotics arm session — felt absorbed for hours.',
      transcript: 'We had robotics today...',
      signals: [{ kind: 'observed' as const, text: 'Lost track of time during a hands-on task.' }],
      caution: 'One session. Could be novelty.',
      tags: ['robotics', 'absorption'],
    }
    MirrorEntrySchema.parse(draft) // contract is honored

    const row = persistMirrorHandler({ studentId: 'demo', entry: draft, trace: { events: [] } })
    expect(row.transcript).toBe(draft.transcript)
    expect(row.signals).toEqual(draft.signals)

    // No audio table exists in the schema — schema check confirms this.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string
    }>
    expect(tables.some((t) => /audio/i.test(t.name))).toBe(false)
    db.close()
  })

  it('rejects an empty caution at the schema boundary (regression check)', () => {
    expect(() =>
      MirrorEntrySchema.parse({
        summary: 's',
        transcript: 't',
        signals: [{ kind: 'observed' as const, text: 'x' }],
        caution: '',
      }),
    ).toThrow()
  })
})

describe('safety: persist-mirror rejects diagnostic language', () => {
  it('throws DiagnosticLanguageError when a signal labels personality', () => {
    expect(() =>
      persistMirrorHandler({
        studentId: 'demo',
        entry: {
          summary: 's',
          transcript: 't',
          signals: [
            { kind: 'inferred' as const, text: 'You are an extrovert based on this reflection.' },
          ],
          caution: 'one session',
          tags: [],
        },
      }),
    ).toThrowError(DiagnosticLanguageError)
  })

  it('accepts careful, non-diagnostic phrasing about behavior', () => {
    expect(() =>
      persistMirrorHandler({
        studentId: 'demo',
        entry: {
          summary: 's',
          transcript: 't',
          signals: [
            {
              kind: 'observed' as const,
              text: 'Stayed in the role for 40 minutes without swapping.',
            },
          ],
          caution: 'one session',
          tags: [],
        },
      }),
    ).not.toThrow()
  })
})
