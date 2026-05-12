// Multi-student fixture loader. Seeds the v0.2 demo corpus into Neon via the
// `withStudent` RLS envelope (see src/db/client.ts).
//
// Idempotency: per-student. If a student already has any `mirror_entries`
// rows, that student is skipped — re-running after a partial seed only fills
// in the missing students.
//
// tsvector columns (`story_reframe_tsv`, `verbatim_quote_tsv`) are GENERATED
// ALWAYS AS in the schema, so they populate automatically on INSERT — no
// SQLite-FTS5 → Postgres translation step is needed in the seed itself.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'

import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { withStudent } from './client'
import { upsertVipsPage } from './queries'
import { mirrorEntries } from './schema'

export type SeedContextType = 'school' | 'family' | 'peer' | 'hobby' | 'civic'

export interface SeedReflectionFixture {
  context_type: SeedContextType
  transcript: string
  created_at: string
}

export interface SeedStudentProfile {
  name_handle: string
  year_level: string
  school_type: 'IP' | 'JC' | 'sec' | 'poly'
  values_dominance: string[]
  riasec_tilt: string[]
  skills_evident: string[]
  notes_for_review: string
}

export interface SeedStudent {
  student_id: string
  profile: SeedStudentProfile
  /** Free-form coverage matrix the reviewer fills in by hand (AE6 audit aid). */
  coverage_matrix: string
  reflections: SeedReflectionFixture[]
}

export interface MultiStudentSeedCorpus {
  description: string
  students: SeedStudent[]
}

const SEED_PATH = resolve(process.cwd(), 'test/ablation/fixtures/seed-multistudent.json')

export function loadSeedCorpus(): MultiStudentSeedCorpus {
  const raw = readFileSync(SEED_PATH, 'utf8')
  return JSON.parse(raw) as MultiStudentSeedCorpus
}

export interface SeedResult {
  inserted: number
  studentsSeeded: string[]
  studentsSkipped: string[]
  skipped: boolean
}

/**
 * Seed the multi-student fixture into Neon. Per-student idempotent: if
 * `mirror_entries` already has rows for a given student, that student is
 * skipped. Empty VIPS pages are created on first seed so the live
 * auto-Connector chain has a row to UPDATE on its first run.
 *
 * Reflections insert with explicit `created_at` from the fixture (the v0.2
 * ablation harness sorts by this column, so it must match the curated
 * timeline).
 */
export async function seed(): Promise<SeedResult> {
  const corpus = loadSeedCorpus()

  let inserted = 0
  const studentsSeeded: string[] = []
  const studentsSkipped: string[] = []

  for (const student of corpus.students) {
    const result = await withStudent(student.student_id, async (ctx) => {
      // RLS scopes this to `student.student_id`; counting all rows is fine.
      const existing = await ctx.db.execute<{ c: number }>(
        sql`select count(*)::int as c from ${mirrorEntries}`,
      )
      if ((existing.rows[0]?.c ?? 0) > 0) {
        return { skipped: true, inserted: 0 }
      }

      let count = 0
      for (const r of student.reflections) {
        // Mirror agent output fields are intentionally left empty: the v0.2
        // seed represents the raw transcript surface only; the auto-Connector
        // chain populates `vips_proposed_diffs` / VIPS pages live. The
        // ablation runner formats reflections from `story_reframe` when
        // present, so we mirror the transcript there as a graceful fallback
        // until the live Mirror output is wired back into the seed.
        const rawOutput = JSON.stringify({
          validation: '',
          inferred_meaning: '',
          story_reframe: r.transcript,
        })
        await ctx.db.insert(mirrorEntries).values({
          studentId: student.student_id,
          transcript: r.transcript,
          validation: '',
          inferredMeaning: '',
          storyReframe: r.transcript,
          rawOutputJson: rawOutput,
          contextType: r.context_type,
          createdAt: r.created_at,
        })
        count++
      }

      // Empty VIPS pages — auto-Connector populates these on the first live
      // Mirror session. Reuse `upsertVipsPage` so the row shape stays
      // consistent with the production write path.
      for (const dimension of VIPS_DIMENSIONS) {
        await upsertVipsPage(
          student.student_id,
          { dimension, compiled_truth: '', open_question: '' },
          { ctx },
        )
      }

      return { skipped: false, inserted: count }
    })

    if (result.skipped) {
      studentsSkipped.push(student.student_id)
    } else {
      studentsSeeded.push(student.student_id)
      inserted += result.inserted
    }
  }

  return {
    inserted,
    studentsSeeded,
    studentsSkipped,
    skipped: studentsSeeded.length === 0,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seed()
  if (result.skipped) {
    console.log(
      `seed: skipped — all ${result.studentsSkipped.length} student(s) already populated (${result.studentsSkipped.join(', ')})`,
    )
  } else {
    console.log(
      `seed: inserted ${result.inserted} reflection(s) across ${result.studentsSeeded.length} student(s): ${result.studentsSeeded.join(', ')}`,
    )
    if (result.studentsSkipped.length > 0) {
      console.log(
        `seed: skipped ${result.studentsSkipped.length}: ${result.studentsSkipped.join(', ')}`,
      )
    }
  }
}
