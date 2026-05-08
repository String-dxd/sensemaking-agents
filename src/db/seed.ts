import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Database as DatabaseInstance } from 'better-sqlite3'
import { openDb } from './client'
import { insertMirrorEntry } from './queries'

interface SeedReflection {
  id: number
  transcript: string
  validation: string
  inferred_meaning: string
  story_reframe: string
  tags: string[]
}

interface SeedCorpus {
  student_id: string
  description: string
  reflections: SeedReflection[]
}

const SEED_CORPUS_PATH = resolve(process.cwd(), 'test/ablation/fixtures/seed-corpus.json')

export function loadSeedCorpus(): SeedCorpus {
  const raw = readFileSync(SEED_CORPUS_PATH, 'utf8')
  return JSON.parse(raw) as SeedCorpus
}

/**
 * Idempotent seed loader. If `mirror_entries` already has entries for the
 * student, the seed is a no-op. To rebuild: delete `app.db` first (or bump
 * `SCHEMA_VERSION` so the client drops it on next boot).
 */
export function seed(opts: { db?: DatabaseInstance } = {}): {
  inserted: number
  skipped: boolean
} {
  const db = opts.db ?? openDb()
  const corpus = loadSeedCorpus()
  const existing = db
    .prepare('SELECT COUNT(*) AS c FROM mirror_entries WHERE student_id = ?')
    .get(corpus.student_id) as { c: number }
  if (existing.c > 0) return { inserted: 0, skipped: true }

  let inserted = 0
  for (const r of corpus.reflections) {
    insertMirrorEntry(
      corpus.student_id,
      {
        transcript: r.transcript,
        validation: r.validation,
        inferred_meaning: r.inferred_meaning,
        story_reframe: r.story_reframe,
        raw_output: {
          validation: r.validation,
          inferred_meaning: r.inferred_meaning,
          story_reframe: r.story_reframe,
        },
        tags: r.tags,
      },
      { ctx: { db } },
    )
    inserted++
  }
  return { inserted, skipped: false }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = seed()
  if (result.skipped) {
    console.log('seed: skipped — corpus already loaded for student "demo"')
  } else {
    console.log(`seed: inserted ${result.inserted} reflections for student "demo"`)
  }
}
