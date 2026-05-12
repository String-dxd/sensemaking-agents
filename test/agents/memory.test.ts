/**
 * Memory store tests — Step 10 of the managed-agents migration.
 *
 * Two layers:
 *   1. Unit tests with a fake `MemoryStoreTransport`. They exercise the
 *      append-op semantics, snapshot cadence, diagnostic-language gate, and
 *      novelty guard without touching the network. These run unconditionally.
 *   2. Integration tests gated on `DATABASE_URL`. They prove the advisory
 *      lock actually serializes concurrent writers and that RLS holds inside
 *      the new transaction. Same pattern as `test/db/rls-concurrency.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  appendIfNovel,
  appendStudentMemory,
  MEMORY_FILE_PATHS,
  type MemoryStoreTransport,
  MemoryWriteError,
  SNAPSHOT_EVERY,
} from '~/agents/memory'
import { withStudent } from '~/db/client'
import { checkMemoryWriteForDiagnosticLanguage } from '~/lib/safety'

// ---------------------------------------------------------------------------
// Fake transport — records calls so assertions can inspect them.
// ---------------------------------------------------------------------------

interface FakeMemory {
  id: string
  path: string
  content: string
  contentSha256: string
}

function buildFakeTransport(): {
  transport: MemoryStoreTransport
  state: {
    stores: { id: string; name: string }[]
    memories: Map<string, FakeMemory>
    createStoreCalls: number
    createMemoryCalls: number
    updateMemoryCalls: number
    retrieveMemoryCalls: number
  }
} {
  const state = {
    stores: [] as { id: string; name: string }[],
    memories: new Map<string, FakeMemory>(),
    createStoreCalls: 0,
    createMemoryCalls: 0,
    updateMemoryCalls: 0,
    retrieveMemoryCalls: 0,
  }
  let memSeq = 0
  let storeSeq = 0
  const transport: MemoryStoreTransport = {
    async createStore({ name }) {
      state.createStoreCalls++
      storeSeq++
      const id = `memstore_${storeSeq}`
      state.stores.push({ id, name })
      return { id }
    },
    async retrieveMemory(memoryId) {
      state.retrieveMemoryCalls++
      const found = state.memories.get(memoryId)
      if (!found) return null
      return { content: found.content, contentSha256: found.contentSha256 }
    },
    async createMemory(_storeId, { path, content }) {
      state.createMemoryCalls++
      memSeq++
      const id = `mem_${memSeq}`
      const sha = `sha-${memSeq}`
      state.memories.set(id, { id, path, content, contentSha256: sha })
      return { id, contentSha256: sha }
    },
    async updateMemory(memoryId, { content }) {
      state.updateMemoryCalls++
      const existing = state.memories.get(memoryId)
      if (!existing) {
        throw Object.assign(new Error('memory not found'), { status: 404 })
      }
      const sha = `sha-${memoryId}-${state.updateMemoryCalls}`
      state.memories.set(memoryId, { ...existing, content, contentSha256: sha })
      return { contentSha256: sha }
    },
  }
  return { transport, state }
}

// ---------------------------------------------------------------------------
// Unit-level: safety check.
// ---------------------------------------------------------------------------

describe('checkMemoryWriteForDiagnosticLanguage', () => {
  it('rejects third-person personality labels', () => {
    expect(checkMemoryWriteForDiagnosticLanguage("they're an introvert").ok).toBe(false)
    expect(checkMemoryWriteForDiagnosticLanguage('She is naturally conscientious.').ok).toBe(false)
  })

  it('rejects base second-person diagnostic labels', () => {
    expect(checkMemoryWriteForDiagnosticLanguage('You are an extrovert.').ok).toBe(false)
    expect(checkMemoryWriteForDiagnosticLanguage('Your true self is creative.').ok).toBe(false)
  })

  it('admits behavioral, non-labeling content', () => {
    expect(
      checkMemoryWriteForDiagnosticLanguage(
        'They sustain attention longer in argument-driven tasks.',
      ).ok,
    ).toBe(true)
    expect(
      checkMemoryWriteForDiagnosticLanguage('The student kept asking about urban systems.').ok,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Unit-level: appendIfNovel.
// ---------------------------------------------------------------------------

describe('appendIfNovel', () => {
  const fixedAt = new Date('2026-05-12T10:00:00Z')

  it('appends a timestamped block to empty content', () => {
    const op = appendIfNovel('first observation', { source: 'mirror#1', at: fixedAt })
    const out = op('')
    expect(out).not.toBeNull()
    expect(out).toContain('first observation')
    expect(out).toContain('2026-05-12T10:00:00.000Z')
    expect(out).toContain('mirror#1')
  })

  it('returns null when the entry is already present verbatim', () => {
    const op = appendIfNovel('already said this', { source: 'x', at: fixedAt })
    expect(op('## prior\n\nalready said this\n')).toBeNull()
  })

  it('returns null on empty entry', () => {
    const op = appendIfNovel('   ', { source: 'x', at: fixedAt })
    expect(op('anything')).toBeNull()
  })

  it('preserves existing content above the new block', () => {
    const op = appendIfNovel('new observation', { source: 's', at: fixedAt })
    const out = op('## 2026-01-01\n\nprior block') ?? ''
    expect(out.startsWith('## 2026-01-01\n\nprior block')).toBe(true)
    expect(out).toContain('new observation')
  })
})

// ---------------------------------------------------------------------------
// Integration tests — require a live Postgres so the advisory lock + RLS
// pieces actually execute. Skipped unless DATABASE_URL is set.
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.DATABASE_URL)('appendStudentMemory — integration', () => {
  const STUDENT = `memory-test-${process.pid}-${Date.now()}`
  let fake: ReturnType<typeof buildFakeTransport>

  beforeEach(() => {
    fake = buildFakeTransport()
  })

  afterEach(async () => {
    // Clean rows we inserted so re-running tests doesn't accumulate state.
    const { getDbForMemoryModule } = await import('~/db/client')
    const db = getDbForMemoryModule()
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`delete from memory_snapshots where student_id = ${STUDENT}`)
    await db.execute(sql`delete from student_memory_files where student_id = ${STUDENT}`)
    await db.execute(sql`delete from student_memory_stores where student_id = ${STUDENT}`)
  })

  it('creates an Anthropic store on first append and caches the id', async () => {
    await appendStudentMemory(
      STUDENT,
      MEMORY_FILE_PATHS.studentVoice,
      () => 'first content',
      fake.transport,
    )
    expect(fake.state.createStoreCalls).toBe(1)
    expect(fake.state.createMemoryCalls).toBe(1)
    expect(fake.state.stores).toHaveLength(1)

    // Second append reuses the cached store + memory ids.
    await appendStudentMemory(
      STUDENT,
      MEMORY_FILE_PATHS.studentVoice,
      (current) => `${current}\n\nsecond`,
      fake.transport,
    )
    expect(fake.state.createStoreCalls).toBe(1)
    expect(fake.state.createMemoryCalls).toBe(1)
    expect(fake.state.updateMemoryCalls).toBe(1)
  })

  it('writes a memory_snapshots row exactly every SNAPSHOT_EVERY ops', async () => {
    for (let i = 0; i < SNAPSHOT_EVERY * 2; i++) {
      await appendStudentMemory(
        STUDENT,
        MEMORY_FILE_PATHS.studentVoice,
        () => `op ${i + 1}`,
        fake.transport,
      )
    }
    const { getDbForMemoryModule } = await import('~/db/client')
    const db = getDbForMemoryModule()
    const { sql } = await import('drizzle-orm')
    const snapshots = await db.execute<{ version: number }>(
      sql`select version from memory_snapshots where student_id = ${STUDENT} and file_path = ${MEMORY_FILE_PATHS.studentVoice} order by version asc`,
    )
    expect(snapshots.rows.map((r) => r.version)).toEqual([SNAPSHOT_EVERY, SNAPSHOT_EVERY * 2])
  })

  it('rejects writes that contain diagnostic language without touching Anthropic', async () => {
    await expect(
      appendStudentMemory(
        STUDENT,
        MEMORY_FILE_PATHS.studentVoice,
        () => 'the student is an introvert by nature',
        fake.transport,
      ),
    ).rejects.toThrow(MemoryWriteError)
    // Store was created (idempotent setup) but no memory body was pushed.
    expect(fake.state.createMemoryCalls).toBe(0)
    expect(fake.state.updateMemoryCalls).toBe(0)
  })

  it('skipped ops still bump op_count so snapshot cadence stays stable', async () => {
    // Skip the first op, write the second. After two calls op_count = 2,
    // far from the snapshot boundary.
    await appendStudentMemory(STUDENT, MEMORY_FILE_PATHS.studentVoice, () => null, fake.transport)
    const r2 = await appendStudentMemory(
      STUDENT,
      MEMORY_FILE_PATHS.studentVoice,
      () => 'real entry',
      fake.transport,
    )
    expect(r2.opCount).toBe(2)
    expect(r2.snapshotVersion).toBeNull()
    expect(fake.state.createMemoryCalls).toBe(1)
  })

  it('serializes concurrent writers to the same file (advisory lock)', async () => {
    // Race many writers against the same file. Each appends a uniquely
    // identifiable line; if the lock works, the final content contains
    // every line. If it doesn't, lost-update means some lines drop.
    const PARALLELISM = 8
    await Promise.all(
      Array.from({ length: PARALLELISM }, (_, i) =>
        appendStudentMemory(
          STUDENT,
          MEMORY_FILE_PATHS.exploratoryThreads,
          (current) => `${current}\nLINE-${i}`,
          fake.transport,
        ),
      ),
    )
    const final = Array.from(fake.state.memories.values()).find(
      (m) => m.path === MEMORY_FILE_PATHS.exploratoryThreads,
    )
    expect(final).toBeDefined()
    for (let i = 0; i < PARALLELISM; i++) {
      expect(final?.content).toContain(`LINE-${i}`)
    }
  })

  it('runs queries inside the new transaction under tenant RLS', async () => {
    // Insert a student-memory-files row for STUDENT, then verify it cannot
    // be seen from a withStudent envelope bound to a different studentId.
    await appendStudentMemory(
      STUDENT,
      MEMORY_FILE_PATHS.studentVoice,
      () => 'isolated entry',
      fake.transport,
    )
    const otherStudent = `${STUDENT}-other`
    await withStudent(otherStudent, async (ctx) => {
      const { sql } = await import('drizzle-orm')
      const leaked = await ctx.db.execute<{ student_id: string }>(
        sql`select student_id from student_memory_files where file_path = ${MEMORY_FILE_PATHS.studentVoice}`,
      )
      expect(leaked.rows.every((r) => r.student_id === otherStudent)).toBe(true)
    })
  })
})
